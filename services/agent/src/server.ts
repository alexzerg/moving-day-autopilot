import cors from '@fastify/cors';
import type { Address, EvidenceAccount, EvidenceDocument, ServiceKind } from '@moving-day/contracts';
import Fastify from 'fastify';
import { createMovingAgent } from './agent.js';
import { moveStore } from './store.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const serviceKinds = new Set<ServiceKind>([
  'electricity', 'water', 'internet', 'insurance', 'postal',
  'employer', 'financial', 'mobile', 'subscription', 'delivery',
]);

function parseEvidenceDocuments(documents: EvidenceDocument[]): EvidenceAccount[] {
  return documents.flatMap((document) => document.text.split(/\n\s*---+\s*\n/).flatMap((block) => {
    const field = (name: string) => block.match(new RegExp(`^${name}\\s*:\\s*(.+)$`, 'im'))?.[1]?.trim();
    const provider = field('Provider');
    const kind = field('Service') as ServiceKind | undefined;
    const accountReference = field('Account');
    const monthlyCost = Number(field('Monthly Cost')?.replace(/[^0-9.]/g, ''));
    if (!provider || !kind || !serviceKinds.has(kind) || !accountReference || !Number.isFinite(monthlyCost)) return [];
    return [{ provider, kind, accountReference, monthlyCost, sourceName: document.name }];
  }));
}

app.get('/health', async () => ({ status: 'ok', runtime: 'strands-typescript', tools: 10 }));
app.get('/api/demo/state', async () => moveStore.snapshot());
app.post('/api/demo/reset', async () => moveStore.reset());
app.post<{ Body: { moveDate: string; oldAddress: Address; newAddress: Address } }>('/api/demo/case', async (request) => moveStore.configureMoveCase(request.body));
app.post<{ Body: { documents: EvidenceDocument[] } }>('/api/demo/evidence', async (request) => moveStore.ingestServiceEvidence(parseEvidenceDocuments(request.body.documents)));
app.post('/api/demo/discover', async () => moveStore.discoverServices());
app.post('/api/demo/plan', async () => moveStore.buildPlan());
app.post<{ Body: { decisionId: string; optionId: string } }>('/api/demo/decision', async (request) => moveStore.approveDecision(request.body.decisionId, request.body.optionId));
app.post<{ Body: { approvalToken: string | null } }>('/api/demo/execute', async (request) => moveStore.executePlan(request.body.approvalToken));
app.post<{ Body: { actionId: string; evidence: string } }>('/api/demo/identity', async (request) => {
  const action = moveStore.completeIdentityAction(request.body.actionId, request.body.evidence);
  return { action, receipt: moveStore.verifyMove() };
});
app.post('/api/demo/verify', async () => moveStore.verifyMove());
app.post<{ Body: { prompt: string } }>('/api/agent', async (request, reply) => {
  if (process.env.ENABLE_LLM !== 'true') {
    return reply.code(503).send({ error: 'LLM invocation is disabled. Set ENABLE_LLM=true with a configured Strands model provider.' });
  }
  const agent = createMovingAgent();
  const result = await agent.invoke(request.body.prompt);
  return { result: String(result) };
});

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: '0.0.0.0' });
