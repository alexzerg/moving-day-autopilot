import type { Address, DecisionRequest, EvidenceDocument, MoveCase, MoveReceipt, MoveState, PhysicalMoveProfile, ProviderAccount, ResolvedAddress, RouteDistance } from '@moving-day/contracts';

const API_BASE = import.meta.env.VITE_AGENT_API_URL ?? 'http://127.0.0.1:8787';
const CLOUD_MODE = import.meta.env.VITE_AGENT_MODE === 'cloud';
const SESSION_KEY = 'moving-day-agentcore-session';
export const AGENT_RESPONSE_EVENT = 'moving-day-agent-response';
let latestCloudState: MoveState | null = null;

export function readLatestCloudState() {
  return latestCloudState;
}

function createSessionId() {
  return `moving-day-web-${crypto.randomUUID().replaceAll('-', '')}`;
}

function sessionId() {
  const current = localStorage.getItem(SESSION_KEY);
  if (current) return current;
  const created = createSessionId();
  localStorage.setItem(SESSION_KEY, created);
  return created;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function invokeCloud(prompt: string, publishResponse = true) {
  const response = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, sessionId: sessionId() }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Cloud agent failed: ${response.status}`);
  }
  const result = await response.json() as { text: string; state: MoveState; sessionId: string };
  latestCloudState = result.state;
  if (publishResponse) window.dispatchEvent(new CustomEvent(AGENT_RESPONSE_EVENT, { detail: result.text }));
  return result;
}

async function cloudState(prompt: string, publishResponse = true) {
  return (await invokeCloud(prompt, publishResponse)).state;
}

async function bridgeRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Bridge request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const moveApi = CLOUD_MODE ? {
  state: () => cloudState('Call get_move_state and return the current case without changing anything.', false),
  configure: async (input: { moveDate: string; oldAddress: Address; newAddress: Address }) => {
    const state = await cloudState(`Configure the move case with this exact JSON, then return the untouched configured state: ${JSON.stringify(input)}`);
    return state.moveCase;
  },
  resolveAddress: (query: string) => bridgeRequest<ResolvedAddress>('/api/address-resolve', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
  }),
  routeDistance: (input: { origin: ResolvedAddress; destination: ResolvedAddress }) => bridgeRequest<RouteDistance>('/api/route-distance', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }),
  estimatePhysical: async (input: PhysicalMoveProfile) => {
    const state = await cloudState(`Call estimate_move_requirements with this exact household and inventory profile, then summarize volume, weight, truck and labor: ${JSON.stringify(input)}`);
    return state.moveEstimate;
  },
  reset: () => {
    localStorage.setItem(SESSION_KEY, createSessionId());
    return cloudState('Call get_move_state and return the new untouched move case without changing anything.');
  },
  gmailStatus: () => bridgeRequest<{ configured: boolean; connected: boolean; email: string | null }>('/api/gmail/status'),
  gmailDisconnect: () => bridgeRequest<{ connected: boolean }>('/api/gmail/disconnect', { method: 'POST' }),
  gmailScan: async () => {
    const result = await bridgeRequest<{ text: string; state: MoveState; sessionId: string }>('/api/gmail/scan', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: sessionId() }),
    });
    latestCloudState = result.state;
    window.dispatchEvent(new CustomEvent(AGENT_RESPONSE_EVENT, { detail: result.text }));
    return { discovered: result.state.accounts.length };
  },
  ingestEvidence: async (documents: EvidenceDocument[]) => {
    const state = await cloudState(`Call get_move_state first. Extract only explicit service-account facts whose service address matches the configured old address, then call ingest_service_evidence. Ignore other addresses and do not invent missing values. Evidence: ${JSON.stringify(documents)}`);
    return { discovered: state.accounts.length };
  },
  confirmProviders: async (accounts: ProviderAccount[]) => {
    const confirmedEvidence = accounts.map((account) => ({ provider: account.provider, kind: account.kind, accountReference: account.accountReference, serviceAddress: `${account.address.line1}, ${account.address.city}, ${account.address.region} ${account.address.postalCode}`, monthlyCost: account.monthlyCost, sourceName: 'human-provider-review' }));
    const state = await cloudState(`The human explicitly confirmed exactly these provider accounts: ${JSON.stringify(confirmedEvidence)}. Call ingest_service_evidence once with sourceName human-provider-review, sourceType document and exactly this accounts array. This replaces unconfirmed candidates. Do not discover, plan or execute anything yet.`);
    return { confirmed: state.accounts.length };
  },
  discover: async () => {
    const state = await cloudState('Discover all address-linked household services. Do not build the plan yet.');
    return { discovered: state.accounts.length };
  },
  plan: async () => {
    const state = await cloudState('Build the dependency-safe Florida move plan. Do not choose the internet trade-off and do not execute anything.');
    return { actions: state.actions, decisions: state.decisions };
  },
  autopilot: async () => {
    const state = await cloudState('Advance this move autonomously as far as safely possible. Inspect the current state and jurisdiction, choose and call the necessary Strands tools yourself, build the dependency-safe plan if missing, execute reversible authorized work when permitted, and verify provider state. Do not discover sandbox accounts when no evidence exists. Stop only for an unresolved bounded human decision or identity-only task. Explain the tools you selected and why. Return the full authoritative state.');
    return { actions: state.actions, decisions: state.decisions, receipt: state.receipt };
  },
  decide: async (decisionId: string, optionId: string) => {
    const state = await cloudState(`Record my exact decision: decisionId=${decisionId}, optionId=${optionId}. Do not execute the plan yet.`);
    const decision = state.decisions.find((item) => item.id === decisionId);
    if (!decision) throw new Error('Cloud agent did not record the decision.');
    return decision;
  },
  continueAutopilot: async (decisionId: string, optionId: string) => {
    const state = await cloudState(`The human selected this exact bounded decision: decisionId=${decisionId}, optionId=${optionId}. Record it, then autonomously choose and call every Strands tool needed to advance all safely authorized branches, verify provider state, and stop at identity-only work. Explain the tools you selected and why. Never fabricate identity completion. Return the full authoritative state.`);
    return { actions: state.actions, decisions: state.decisions, receipt: state.receipt };
  },
  completeIdentity: async (actionId: string) => {
    const before = await cloudState('Call get_move_state only. Do not mutate any action.');
    const target = before.actions.find((action) => action.id === actionId && action.risk === 'identity');
    if (!target) throw new Error(`Identity action ${actionId} is not available.`);
    const otherIdentityStatuses = new Map(before.actions.filter((action) => action.risk === 'identity' && action.id !== actionId).map((action) => [action.id, action.status]));
    const recorded = await cloudState(`The human explicitly completed only identity actionId=${actionId}. Call record_identity_completion exactly once with actionId=${actionId} and evidence=UI-CONFIRMED-${actionId}. Do not call record_identity_completion for any other action. Do not call verify_move_completion in this turn. Return the state.`);
    const updatedTarget = recorded.actions.find((action) => action.id === actionId);
    if (!updatedTarget || !['executed', 'verified'].includes(updatedTarget.status)) throw new Error(`Identity action ${actionId} was not recorded.`);
    for (const [otherId, previousStatus] of otherIdentityStatuses) {
      const currentStatus = recorded.actions.find((action) => action.id === otherId)?.status;
      if (currentStatus !== previousStatus) throw new Error(`Identity boundary violation: ${otherId} changed while completing ${actionId}.`);
    }
    const verified = await cloudState('Call verify_move_completion exactly once. Do not call record_identity_completion for any action. Return the state and receipt.');
    if (!verified.receipt) throw new Error('Cloud agent did not update the execution receipt.');
    return verified.receipt;
  },
  execute: async () => {
    const state = await cloudState('Execute every authorized action using the recorded approval token, then verify completion. Report blocked and failed actions separately.');
    return { status: state.receipt ? 'verified' : 'executed' };
  },
  verify: async () => {
    const state = await cloudState('Call verify_move_completion and return the current execution receipt.');
    if (!state.receipt) throw new Error('Cloud agent did not produce a verification receipt.');
    return state.receipt;
  },
} : {
  state: () => request<MoveState>('/api/sandbox/state'),
  configure: (input: { moveDate: string; oldAddress: Address; newAddress: Address }) => request<MoveCase>('/api/sandbox/case', {
    method: 'POST', body: JSON.stringify(input),
  }),
  resolveAddress: (query: string) => request<ResolvedAddress>('/api/sandbox/address-resolve', {
    method: 'POST', body: JSON.stringify({ query }),
  }),
  routeDistance: (input: { origin: ResolvedAddress; destination: ResolvedAddress }) => request<RouteDistance>('/api/sandbox/route', {
    method: 'POST', body: JSON.stringify(input),
  }),
  estimatePhysical: (input: PhysicalMoveProfile) => request<{ estimate: MoveState['moveEstimate'] }>('/api/sandbox/physical', {
    method: 'POST', body: JSON.stringify(input),
  }).then((result) => result.estimate),
  reset: () => request<MoveState>('/api/sandbox/reset', { method: 'POST' }),
  gmailStatus: async () => ({ configured: false, connected: false, email: null }),
  gmailDisconnect: async () => ({ connected: false }),
  gmailScan: async () => { throw new Error('Gmail connection is available in the production application.'); },
  ingestEvidence: (documents: EvidenceDocument[]) => request<{ discovered: number }>('/api/sandbox/evidence', {
    method: 'POST', body: JSON.stringify({ documents }),
  }),
  confirmProviders: (accounts: ProviderAccount[]) => request<{ confirmed: number }>('/api/sandbox/providers/confirm', {
    method: 'POST', body: JSON.stringify({ accountIds: accounts.map((account) => account.id) }),
  }),
  discover: () => request<{ discovered: number }>('/api/sandbox/discover', { method: 'POST' }),
  plan: () => request<{ actions: MoveState['actions']; decisions: DecisionRequest[] }>('/api/sandbox/plan', { method: 'POST' }),
  autopilot: () => request<{ actions: MoveState['actions']; decisions: DecisionRequest[] }>('/api/sandbox/plan', { method: 'POST' }),
  decide: (decisionId: string, optionId: string) => request<DecisionRequest>('/api/sandbox/decision', {
    method: 'POST', body: JSON.stringify({ decisionId, optionId }),
  }),
  continueAutopilot: async (decisionId: string, optionId: string) => {
    const decision = await request<DecisionRequest>('/api/sandbox/decision', { method: 'POST', body: JSON.stringify({ decisionId, optionId }) });
    await request<{ status: string; reason?: string }>('/api/sandbox/execute', { method: 'POST', body: JSON.stringify({ approvalToken: decision.approvalToken }) });
    return request<MoveReceipt>('/api/sandbox/verify', { method: 'POST' });
  },
  completeIdentity: (actionId: string) => request<{ action: MoveState['actions'][number]; receipt: MoveReceipt }>('/api/sandbox/identity', {
    method: 'POST', body: JSON.stringify({ actionId, evidence: `UI-CONFIRMED-${actionId}` }),
  }),
  execute: (approvalToken: string | null) => request<{ status: string; reason?: string }>('/api/sandbox/execute', {
    method: 'POST', body: JSON.stringify({ approvalToken }),
  }),
  verify: () => request<MoveReceipt>('/api/sandbox/verify', { method: 'POST' }),
};
