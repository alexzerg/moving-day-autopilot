import cors from '@fastify/cors';
import { calculateRoadRouteFromResolved, resolveUsAddress } from '@moving-day/contracts';
import type { Address, EvidenceAccount, EvidenceDocument, PhysicalMoveProfile, ResolvedAddress, ServiceKind } from '@moving-day/contracts';
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
    const serviceAddress = field('Service Address');
    const monthlyCost = Number(field('Monthly Cost')?.replace(/[^0-9.]/g, ''));
    if (!provider || !kind || !serviceKinds.has(kind) || !accountReference || !serviceAddress || !Number.isFinite(monthlyCost)) return [];
    return [{ provider, kind, accountReference, monthlyCost, serviceAddress, sourceName: document.name }];
  }));
}

app.get('/health', async () => ({ status: 'ok', runtime: 'strands-typescript', tools: 11 }));
app.get('/api/sandbox/state', async () => moveStore.snapshot());
app.post('/api/sandbox/reset', async () => moveStore.reset());
app.post<{ Body: { moveDate: string; oldAddress: Address; newAddress: Address } }>('/api/sandbox/case', async (request) => moveStore.configureMoveCase(request.body));
app.post<{ Body: { query: string } }>('/api/sandbox/address-resolve', async (request) => resolveUsAddress(request.body.query));
app.post<{ Body: PhysicalMoveProfile }>('/api/sandbox/physical', async (request) => moveStore.configurePhysicalMove(request.body));
app.post<{ Body: { origin: ResolvedAddress; destination: ResolvedAddress } }>('/api/sandbox/route', async (request) => calculateRoadRouteFromResolved(request.body.origin, request.body.destination, { googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }));
app.post<{ Body: { documents: EvidenceDocument[] } }>('/api/sandbox/evidence', async (request) => moveStore.ingestServiceEvidence(parseEvidenceDocuments(request.body.documents)));
app.post<{ Body: { accountIds: string[] } }>('/api/sandbox/providers/confirm', async (request) => moveStore.confirmProviderAccounts(request.body.accountIds));
app.post('/api/sandbox/discover', async () => moveStore.discoverServices());
app.post('/api/sandbox/plan', async () => moveStore.buildPlan());
app.post<{ Body: { decisionId: string; optionId: string } }>('/api/sandbox/decision', async (request) => moveStore.approveDecision(request.body.decisionId, request.body.optionId));
app.post<{ Body: { approvalToken: string | null } }>('/api/sandbox/execute', async (request) => moveStore.executePlan(request.body.approvalToken));
app.post<{ Body: { actionId: string; evidence: string } }>('/api/sandbox/identity', async (request) => {
  const action = moveStore.completeIdentityAction(request.body.actionId, request.body.evidence);
  return { action, receipt: moveStore.verifyMove() };
});
app.post('/api/sandbox/verify', async () => moveStore.verifyMove());
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
