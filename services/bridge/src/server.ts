import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import { ResolvedAddressSchema, calculateRoadRouteFromResolved, resolveUsAddress } from '@moving-day/contracts';
import { catalogDomainGroups, classifyMoveRelevantMessage, type ProviderDefinition } from './provider-catalog.js';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import express from 'express';
import type { Request, Response } from 'express';

const app = express();
app.use(express.json({ limit: '128kb' }));

const sessionPattern = /^[A-Za-z0-9-]{33,100}$/;
const limits = new Map<string, { count: number; resetAt: number }>();
const tokenCookie = 'moving_google_token';
const stateCookie = 'moving_google_state';

type GoogleToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
};

type OAuthState = { state: string; verifier: string; returnMode?: 'popup' | 'redirect' };
type MoveAddress = { line1: string; city: string; region: string; postalCode: string; country: string };
type GmailSearchQuery = { label: string; query: string; priority: number };

function consumeRateLimit(key: string) {
  const now = Date.now();
  const current = limits.get(key);
  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 12;
}

function cookieMap(request: Request) {
  return Object.fromEntries(String(request.headers.cookie ?? '').split(';').flatMap((entry) => {
    const index = entry.indexOf('=');
    return index > 0 ? [[entry.slice(0, index).trim(), decodeURIComponent(entry.slice(index + 1))]] : [];
  }));
}

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return createHash('sha256').update(secret).digest();
}

function seal(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function unseal<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')) as T;
  } catch {
    return null;
  }
}

function setSecureCookie(response: Response, name: string, value: string, maxAgeSeconds: number) {
  response.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

function clearCookie(response: Response, name: string) {
  response.append('Set-Cookie', `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

export function isAllowedGoogleEmail(email: string | undefined, allowedEmail = process.env.GOOGLE_ALLOWED_EMAIL) {
  const normalizedAllowed = allowedEmail?.trim().toLowerCase();
  return Boolean(normalizedAllowed && email?.trim().toLowerCase() === normalizedAllowed);
}

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'https://moving-day-autopilot.vercel.app/api/auth/google/callback';
  const allowedEmail = process.env.GOOGLE_ALLOWED_EMAIL?.trim().toLowerCase();
  if (!clientId || !clientSecret || !allowedEmail) throw new Error('Google OAuth is not configured');
  return { clientId, clientSecret, redirectUri, allowedEmail };
}

function finishGoogleOAuth(response: Response, status: 'connected' | 'forbidden' | 'error', returnMode: OAuthState['returnMode'], redirectUri: string) {
  if (returnMode !== 'popup') return response.redirect(`/?gmail=${status}`);
  const origin = new URL(redirectUri).origin;
  return response.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Gmail connection</title></head><body style="font-family:Arial,sans-serif;background:#f5f2ea;color:#17353c;display:grid;place-items:center;min-height:100vh;margin:0"><main style="text-align:center;padding:32px"><h2>${status === 'connected' ? 'Gmail connected' : 'Gmail connection failed'}</h2><p>This window will close automatically.</p></main><script>if(window.opener){window.opener.postMessage({type:'moving-day-gmail-oauth',status:${JSON.stringify(status)}},${JSON.stringify(origin)});}window.close();</script></body></html>`);
}

async function refreshGoogleToken(token: GoogleToken, response: Response) {
  if (token.expiresAt > Date.now() + 60_000) return token;
  if (!token.refreshToken) throw new Error('Google session expired. Reconnect Gmail.');
  const { clientId, clientSecret } = oauthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refreshToken,
    grant_type: 'refresh_token',
  });
  const refreshed = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!refreshed.ok) throw new Error('Google token refresh failed');
  const data = await refreshed.json() as { access_token: string; expires_in: number };
  const next = { ...token, accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  setSecureCookie(response, tokenCookie, seal(next), 7 * 24 * 60 * 60);
  return next;
}

function decodeBase64Url(value: string | undefined) {
  if (!value) return '';
  return Buffer.from(value, 'base64url').toString('utf8');
}

function messageText(payload: { mimeType?: string; body?: { data?: string }; parts?: Array<unknown> } | undefined): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    const text = messageText(part as typeof payload);
    if (text) return text;
  }
  return decodeBase64Url(payload.body?.data);
}

function readableMessageText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

type GmailPayloadPart = {
  filename?: string;
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPayloadPart[];
};

function gmailPhrase(value: string) {
  return value.replace(/["{}]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isHouseholdBillCandidate(from: string, subject: string, body: string) {
  return classifyMoveRelevantMessage(from, subject, body).accepted;
}

function relationshipKind(provider: ProviderDefinition) {
  if (provider.category === 'electricity') return 'electricity';
  if (provider.category === 'gas-water') return 'water';
  if (provider.category === 'banking' || provider.category === 'housing') return 'financial';
  if (provider.category === 'insurance' || provider.category === 'medical') return 'insurance';
  if (provider.category === 'vehicle') return 'delivery';
  if (/t-mobile|verizon|mint|metro|google fi/i.test(provider.name)) return 'mobile';
  return 'internet';
}

export function mergeCatalogRelationshipCandidates(
  state: { accounts: Array<Record<string, unknown>> },
  providers: ProviderDefinition[],
  oldAddress: MoveAddress,
) {
  const existing = new Set(state.accounts.map((account) => String(account.provider ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')));
  const added: string[] = [];
  for (const provider of providers) {
    const normalized = provider.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (existing.has(normalized)) continue;
    const id = `relationship-${provider.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    state.accounts.push({
      id,
      provider: provider.name,
      kind: relationshipKind(provider),
      accountReference: '••••SHIP',
      monthlyCost: 0,
      address: oldAddress,
      state: 'discovered',
      source: `gmail://catalog-relationship/${id}`,
    });
    existing.add(normalized);
    added.push(provider.name);
  }
  return added;
}

export function buildGmailSearchQueries(address: MoveAddress): GmailSearchQuery[] {
  const street = gmailPhrase(address.line1);
  const postalCode = gmailPhrase(address.postalCode);
  const billingSubjects = '{subject:bill subject:statement subject:invoice subject:"amount due" subject:"payment due" subject:autopay subject:"payment received" subject:policy subject:premium subject:mortgage}';
  const catalogQueries = catalogDomainGroups(6).map((domains, index) => ({
    label: `move-provider-catalog-${index + 1}`,
    query: `newer_than:6m {${domains.map((domain) => `from:${domain}`).join(' ')}}`,
    priority: 200,
  }));
  return [
    { label: 'sunpass-and-florida-turnpike', query: 'newer_than:6m {from:sunpass from:floridasturnpike.com from:fdot.gov subject:sunpass "SunPass" "Florida Turnpike"}', priority: 300 },
    { label: 'account-at-old-address', query: `newer_than:6m "${street}"`, priority: 120 },
    { label: 'account-at-old-postal-code', query: `newer_than:6m "${postalCode}"`, priority: 110 },
    ...catalogQueries,
    { label: 'billing-pdf-attachments', query: `newer_than:6m has:attachment filename:pdf ${billingSubjects}`, priority: 60 },
    { label: 'recent-billing-messages', query: `newer_than:6m ${billingSubjects}`, priority: 50 },
  ];
}

function isMoveAddress(value: unknown): value is MoveAddress {
  if (!value || typeof value !== 'object') return false;
  const address = value as Partial<MoveAddress>;
  return [address.line1, address.city, address.region, address.postalCode, address.country]
    .every((part) => typeof part === 'string' && part.trim().length > 0);
}

export function decodeAgentCoreResponse(raw: string) {
  const content = raw.split(/\r?\n/).map((line) => {
    if (!line.startsWith('data:')) return line;
    const value = line.slice(5).trimStart();
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed === 'object' && 'data' in parsed) return String((parsed as { data: unknown }).data);
    } catch {
      return value;
    }
    return value;
  }).join('');

  const marker = content.lastIndexOf('__MOVE_STATE__');
  if (marker < 0) throw new Error('Agent response did not include authoritative state');
  const text = content.slice(0, marker).trim();
  const encoded = content.slice(marker + '__MOVE_STATE__'.length).trim();
  const state = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
  return { text, state };
}

async function invokeAgentCore(prompt: string, sessionId: string) {
  const runtimeArn = process.env.AGENTCORE_RUNTIME_ARN;
  const roleArn = process.env.AWS_ROLE_ARN;
  if (!runtimeArn || !roleArn) throw new Error('AgentCore bridge is not configured');
  const client = new BedrockAgentCoreClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: awsCredentialsProvider({ roleArn }),
  });
  const result = await client.send(new InvokeAgentRuntimeCommand({
    agentRuntimeArn: runtimeArn,
    runtimeSessionId: sessionId,
    contentType: 'application/json',
    accept: 'text/event-stream',
    payload: Buffer.from(JSON.stringify({ prompt })),
  }));
  if (!result.response) throw new Error('AgentCore returned an empty response body');
  const raw = await result.response.transformToString();
  return { ...decodeAgentCoreResponse(raw), sessionId: result.runtimeSessionId ?? sessionId };
}

app.get('/api/health', (_request, response) => response.json({
  status: 'ok',
  bridge: 'agentcore',
  gmailConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_ALLOWED_EMAIL && process.env.SESSION_SECRET),
  routeProvider: process.env.GOOGLE_MAPS_API_KEY ? 'google-routes' : 'census-osrm',
}));

app.post('/api/address-resolve', async (request, response) => {
  const query = typeof (request.body as { query?: unknown })?.query === 'string' ? (request.body as { query: string }).query.trim() : '';
  const client = String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
  if (!consumeRateLimit(`address:${client}`)) return response.status(429).json({ error: 'Too many address requests. Try again in one minute.' });
  if (query.length < 5 || query.length > 300) return response.status(400).json({ error: 'Enter a street number and street name under 300 characters.' });
  try {
    return response.json(await resolveUsAddress(query));
  } catch (error) {
    return response.status(422).json({ error: error instanceof Error ? error.message : 'Address could not be resolved.' });
  }
});

app.post('/api/route-distance', async (request, response) => {
  const client = String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
  if (!consumeRateLimit(`route:${client}`)) return response.status(429).json({ error: 'Too many route requests. Try again in one minute.' });
  const body = request.body as { origin?: unknown; destination?: unknown };
  const origin = ResolvedAddressSchema.safeParse(body?.origin);
  const destination = ResolvedAddressSchema.safeParse(body?.destination);
  if (!origin.success || !destination.success) return response.status(400).json({ error: 'Resolved origin and destination addresses are required.' });
  try {
    return response.json(await calculateRoadRouteFromResolved(origin.data, destination.data, { googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }));
  } catch (error) {
    return response.status(422).json({ error: error instanceof Error ? error.message : 'Driving route could not be calculated.' });
  }
});

app.get('/api/auth/google/start', (request, response) => {
  try {
    const { clientId, redirectUri, allowedEmail } = oauthConfig();
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const returnMode: OAuthState['returnMode'] = request.query.mode === 'popup' ? 'popup' : 'redirect';
    setSecureCookie(response, stateCookie, seal({ state, verifier, returnMode } satisfies OAuthState), 10 * 60);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      login_hint: allowedEmail,
      include_granted_scopes: 'true',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } catch (error) {
    return response.status(503).json({ error: error instanceof Error ? error.message : 'Google OAuth is unavailable' });
  }
});

app.get('/api/auth/google/callback', async (request, response) => {
  const saved = unseal<OAuthState>(cookieMap(request)[stateCookie]);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'https://moving-day-autopilot.vercel.app/api/auth/google/callback';
  try {
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    const returnedState = typeof request.query.state === 'string' ? request.query.state : '';
    if (!code || !saved || returnedState !== saved.state) throw new Error('Invalid OAuth state');
    const config = oauthConfig();
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: saved.verifier,
      grant_type: 'authorization_code',
    });
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!tokenResponse.ok) throw new Error('Google authorization-code exchange failed');
    const data = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number };
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${data.access_token}` } });
    const profile = profileResponse.ok ? await profileResponse.json() as { emailAddress?: string } : {};
    if (!isAllowedGoogleEmail(profile.emailAddress, config.allowedEmail)) {
      clearCookie(response, tokenCookie);
      clearCookie(response, stateCookie);
      return finishGoogleOAuth(response, 'forbidden', saved.returnMode, config.redirectUri);
    }
    const token: GoogleToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email: profile.emailAddress,
    };
    setSecureCookie(response, tokenCookie, seal(token), 7 * 24 * 60 * 60);
    clearCookie(response, stateCookie);
    return finishGoogleOAuth(response, 'connected', saved.returnMode, config.redirectUri);
  } catch (error) {
    console.error('Google callback failed', error instanceof Error ? error.message : error);
    clearCookie(response, stateCookie);
    return finishGoogleOAuth(response, 'error', saved?.returnMode, redirectUri);
  }
});

app.get('/api/gmail/status', (request, response) => {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_ALLOWED_EMAIL && process.env.SESSION_SECRET);
  const token = configured ? unseal<GoogleToken>(cookieMap(request)[tokenCookie]) : null;
  const connected = Boolean(token && isAllowedGoogleEmail(token.email));
  return response.json({ configured, connected, email: connected ? token?.email ?? null : null });
});

app.post('/api/gmail/disconnect', (_request, response) => {
  clearCookie(response, tokenCookie);
  return response.json({ connected: false });
});

app.post('/api/gmail/scan', async (request, response) => {
  const sessionId = typeof request.body?.sessionId === 'string' ? request.body.sessionId : '';
  if (!sessionPattern.test(sessionId)) return response.status(400).json({ error: 'Invalid session ID.' });
  try {
    const saved = unseal<GoogleToken>(cookieMap(request)[tokenCookie]);
    if (!saved) return response.status(401).json({ error: 'Connect Gmail first.' });
    if (!isAllowedGoogleEmail(saved.email)) {
      clearCookie(response, tokenCookie);
      return response.status(403).json({ error: 'This Gmail account is not authorized.' });
    }
    const token = await refreshGoogleToken(saved, response);
    const current = await invokeAgentCore('Call get_move_state and return the current case without changing anything.', sessionId);
    const oldAddress = (current.state as { moveCase?: { oldAddress?: unknown } }).moveCase?.oldAddress;
    if (!isMoveAddress(oldAddress)) throw new Error('The move case does not contain a valid old address');

    const searches = buildGmailSearchQueries(oldAddress);
    const candidates = new Map<string, { id: string; matchedBy: Set<string>; score: number }>();
    for (const search of searches) {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('maxResults', '100');
      url.searchParams.set('q', search.query);
      const listResponse = await fetch(url, { headers: { authorization: `Bearer ${token.accessToken}` } });
      if (!listResponse.ok) continue;
      const list = await listResponse.json() as { messages?: Array<{ id: string }> };
      for (const item of list.messages ?? []) {
        const existing = candidates.get(item.id);
        if (existing) {
          existing.matchedBy.add(search.label);
          existing.score += search.priority;
        } else {
          candidates.set(item.id, { id: item.id, matchedBy: new Set([search.label]), score: search.priority });
        }
      }
    }

    const documents: Array<{ name: string; text: string }> = [];
    const selectedProviderKeys = new Set<string>();
    const catalogRelationships = new Map<string, ProviderDefinition>();
    let evidenceCharacters = 0;
    const rankedCandidates = [...candidates.values()].sort((left, right) => right.score - left.score).slice(0, 80);
    const freshnessCutoff = Date.now() - 183 * 24 * 60 * 60 * 1000;
    for (const item of rankedCandidates) {
      const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, { headers: { authorization: `Bearer ${token.accessToken}` } });
      if (!messageResponse.ok) continue;
      const message = await messageResponse.json() as { internalDate?: string; snippet?: string; payload?: GmailPayloadPart };
      if (!message.internalDate || Number(message.internalDate) < freshnessCutoff) continue;
      const headers = Object.fromEntries((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
      const bodyText = readableMessageText(messageText(message.payload) || message.snippet || '');
      const classification = classifyMoveRelevantMessage(headers.from ?? '', headers.subject ?? '', bodyText);
      if (!classification.accepted) continue;
      if (classification.provider) catalogRelationships.set(classification.provider.name, classification.provider);
      const senderAddress = (headers.from ?? '').match(/@([a-z0-9.-]+)/i)?.[1]?.toLowerCase();
      const providerKey = classification.provider
        ? `${classification.provider.category}:${classification.provider.name}`
        : senderAddress ?? (headers.from ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (selectedProviderKeys.has(providerKey)) continue;
      selectedProviderKeys.add(providerKey);
      const text = [
        `Matched Gmail searches: ${[...item.matchedBy].join(', ')}`,
        `Catalog match: ${classification.provider ? `${classification.provider.name} (${classification.provider.category})` : 'unknown provider; infer from sender'}`,
        `Classification: ${classification.reason}`,
        `From: ${headers.from ?? ''}`,
        `Subject: ${headers.subject ?? ''}`,
        `Date: ${headers.date ?? ''}`,
        '',
        bodyText,
      ].join('\n').slice(0, 1200);
      const document = { name: `${headers.subject ?? 'message'}-${item.id}.eml`, text };
      const documentCharacters = JSON.stringify(document).length;
      if (evidenceCharacters + documentCharacters > 11_000) continue;
      documents.push(document);
      evidenceCharacters += documentCharacters;
      if (documents.length >= 12) break;
    }
    if (documents.length === 0) return response.status(404).json({ error: 'No billing or household-service messages were found.' });

    const oldAddressText = `${oldAddress.line1}, ${oldAddress.city}, ${oldAddress.region} ${oldAddress.postalCode}`;
    const prompt = `The configured old address is ${oldAddressText}. Discover active move-relevant household, financial, insurance, housing and medical accounts from these recent messages selected by address matches, billing signals and a provider-domain catalog. Multiple messages from the same provider are evidence for one service account: use only the newest and return exactly one account per provider and service type. Infer the provider from catalog match, sender domain, sender name, subject and body. A document marked account-at-old-address may use that Gmail match as address evidence. A catalog provider classified as account-relationship evidence may still be staged even when the email is not a bill: use serviceAddress=${oldAddressText}, accountReference=RELATIONSHIP and monthlyCost=0 as explicit unknown-value sentinels, and preserve a sourceName beginning relationship-candidate-. Human checkbox confirmation is mandatory before planning. Include electricity, water, sewer, internet, cable, mobile, gas, insurance, waste, security and HOA accounts, banks and credit cards, medical accounts and mortgages. Never ingest movers, truck rentals, Taskrabbit, OfferUp, Craigslist, HireAHelper, U-Haul Moving Help, one-time bookings, generic purchases, portable subscriptions, software receipts, investment accounts or retirement accounts. Ignore prior or future addresses. Never invent non-sentinel references, costs, addresses or sources. Call ingest_service_evidence once with all accepted accounts and explain rejected candidates. Documents: ${JSON.stringify(documents)}`;
    const result = await invokeAgentCore(prompt, sessionId);
    const resultState = result.state as { accounts: Array<Record<string, unknown>> };
    const relationshipCandidates = mergeCatalogRelationshipCandidates(resultState, [...catalogRelationships.values()], oldAddress);
    return response.json({
      ...result,
      state: resultState,
      text: `Gmail discovery reviewed ${documents.length} prioritized messages from ${searches.length} address/provider searches and added ${relationshipCandidates.length} catalog relationship candidate${relationshipCandidates.length === 1 ? '' : 's'} for human confirmation. ${result.text}`,
    });
  } catch (error) {
    console.error('Gmail scan failed', error instanceof Error ? error.message : error);
    return response.status(502).json({ error: 'Gmail scan failed. Reconnect and retry.' });
  }
});

app.post('/api/agent', async (request, response) => {
  const ip = String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
  if (!consumeRateLimit(ip)) return response.status(429).json({ error: 'Public rate limit reached. Try again in one minute.' });
  const prompt = typeof request.body?.prompt === 'string' ? request.body.prompt.trim() : '';
  const sessionId = typeof request.body?.sessionId === 'string' ? request.body.sessionId : '';
  if (!prompt || prompt.length > 12_000) return response.status(400).json({ error: 'Prompt must contain 1–12000 characters.' });
  if (!sessionPattern.test(sessionId)) return response.status(400).json({ error: 'Invalid session ID.' });
  try {
    return response.json(await invokeAgentCore(prompt, sessionId));
  } catch (error) {
    console.error('AgentCore invocation failed', error instanceof Error ? error.message : error);
    return response.status(502).json({ error: 'Cloud agent invocation failed. Please retry.' });
  }
});

export default app;
