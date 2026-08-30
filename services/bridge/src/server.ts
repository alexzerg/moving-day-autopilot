import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
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

type OAuthState = { state: string; verifier: string };

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

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'https://moving-day-autopilot.vercel.app/api/auth/google/callback';
  if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured');
  return { clientId, clientSecret, redirectUri };
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
  gmailConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SESSION_SECRET),
}));

app.get('/api/auth/google/start', (_request, response) => {
  try {
    const { clientId, redirectUri } = oauthConfig();
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    setSecureCookie(response, stateCookie, seal({ state, verifier } satisfies OAuthState), 10 * 60);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
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
  try {
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    const returnedState = typeof request.query.state === 'string' ? request.query.state : '';
    const saved = unseal<OAuthState>(cookieMap(request)[stateCookie]);
    if (!code || !saved || returnedState !== saved.state) throw new Error('Invalid OAuth state');
    const { clientId, clientSecret, redirectUri } = oauthConfig();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: saved.verifier,
      grant_type: 'authorization_code',
    });
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!tokenResponse.ok) throw new Error('Google authorization-code exchange failed');
    const data = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number };
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${data.access_token}` } });
    const profile = profileResponse.ok ? await profileResponse.json() as { emailAddress?: string } : {};
    const token: GoogleToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email: profile.emailAddress,
    };
    setSecureCookie(response, tokenCookie, seal(token), 7 * 24 * 60 * 60);
    clearCookie(response, stateCookie);
    return response.redirect('/?gmail=connected');
  } catch (error) {
    console.error('Google callback failed', error instanceof Error ? error.message : error);
    return response.redirect('/?gmail=error');
  }
});

app.get('/api/gmail/status', (request, response) => {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SESSION_SECRET);
  const token = configured ? unseal<GoogleToken>(cookieMap(request)[tokenCookie]) : null;
  return response.json({ configured, connected: Boolean(token), email: token?.email ?? null });
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
    const token = await refreshGoogleToken(saved, response);
    const query = encodeURIComponent('newer_than:18m (subject:(bill OR statement OR payment OR service OR renewal) OR category:purchases)');
    const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=${query}`, { headers: { authorization: `Bearer ${token.accessToken}` } });
    if (!listResponse.ok) throw new Error('Gmail message search failed');
    const list = await listResponse.json() as { messages?: Array<{ id: string }> };
    const documents: Array<{ name: string; text: string }> = [];
    for (const item of (list.messages ?? []).slice(0, 20)) {
      const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, { headers: { authorization: `Bearer ${token.accessToken}` } });
      if (!messageResponse.ok) continue;
      const message = await messageResponse.json() as {
        snippet?: string;
        payload?: { headers?: Array<{ name: string; value: string }>; mimeType?: string; body?: { data?: string }; parts?: Array<unknown> };
      };
      const headers = Object.fromEntries((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
      const text = [`From: ${headers.from ?? ''}`, `Subject: ${headers.subject ?? ''}`, `Date: ${headers.date ?? ''}`, '', messageText(message.payload) || message.snippet || ''].join('\n').slice(0, 1800);
      documents.push({ name: `${headers.subject ?? 'message'}-${item.id}.eml`, text });
    }
    if (documents.length === 0) return response.status(404).json({ error: 'No billing or service messages were found.' });
    const prompt = `Call get_move_state first. Extract only explicit household service accounts from these Gmail messages whose service address matches the configured old address. Ignore prior or future addresses even when the provider name is the same. Require an explicit service address, and do not invent missing providers, references, types, costs or addresses. Preserve each source name, then call ingest_service_evidence. Documents: ${JSON.stringify(documents)}`.slice(0, 12_000);
    return response.json(await invokeAgentCore(prompt, sessionId));
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
