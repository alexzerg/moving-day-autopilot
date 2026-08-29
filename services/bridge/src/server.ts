import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import express from 'express';

const app = express();
app.use(express.json({ limit: '16kb' }));

const sessionPattern = /^[A-Za-z0-9-]{33,100}$/;
const limits = new Map<string, { count: number; resetAt: number }>();

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

app.get('/api/health', (_request, response) => response.json({ status: 'ok', bridge: 'agentcore' }));
app.post('/api/agent', async (request, response) => {
  const ip = String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
  if (!consumeRateLimit(ip)) return response.status(429).json({ error: 'Demo rate limit reached. Try again in one minute.' });

  const prompt = typeof request.body?.prompt === 'string' ? request.body.prompt.trim() : '';
  const sessionId = typeof request.body?.sessionId === 'string' ? request.body.sessionId : '';
  if (!prompt || prompt.length > 2400) return response.status(400).json({ error: 'Prompt must contain 1–2400 characters.' });
  if (!sessionPattern.test(sessionId)) return response.status(400).json({ error: 'Invalid session ID.' });

  const runtimeArn = process.env.AGENTCORE_RUNTIME_ARN;
  if (!runtimeArn) return response.status(503).json({ error: 'Agent runtime is not configured.' });

  try {
    const roleArn = process.env.AWS_ROLE_ARN;
    if (!roleArn) throw new Error('AWS_ROLE_ARN is not configured');
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
    return response.json({ ...decodeAgentCoreResponse(raw), sessionId: result.runtimeSessionId ?? sessionId });
  } catch (error) {
    console.error('AgentCore invocation failed', error instanceof Error ? error.message : error);
    return response.status(502).json({ error: 'Cloud agent invocation failed. Please retry.' });
  }
});

export default app;
