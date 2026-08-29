import type { DecisionRequest, MoveReceipt, MoveState } from '@moving-day/contracts';

const API_BASE = import.meta.env.VITE_AGENT_API_URL ?? 'http://127.0.0.1:8787';
const CLOUD_MODE = import.meta.env.VITE_AGENT_MODE === 'cloud';
const SESSION_KEY = 'moving-day-agentcore-session';
export const AGENT_RESPONSE_EVENT = 'moving-day-agent-response';

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
  if (publishResponse) window.dispatchEvent(new CustomEvent(AGENT_RESPONSE_EVENT, { detail: result.text }));
  return result;
}

async function cloudState(prompt: string, publishResponse = true) {
  return (await invokeCloud(prompt, publishResponse)).state;
}

export const moveApi = CLOUD_MODE ? {
  state: () => cloudState('Call get_move_state and return the current case without changing anything.', false),
  reset: () => {
    localStorage.setItem(SESSION_KEY, createSessionId());
    return cloudState('Call get_move_state and return the new untouched demo case without changing anything.');
  },
  discover: async () => {
    const state = await cloudState('Discover all address-linked household services. Do not build the plan yet.');
    return { discovered: state.accounts.length };
  },
  plan: async () => {
    const state = await cloudState('Build the dependency-safe Florida move plan. Do not choose the internet trade-off and do not execute anything.');
    return { actions: state.actions, decisions: state.decisions };
  },
  decide: async (decisionId: string, optionId: string) => {
    const state = await cloudState(`Record my exact decision: decisionId=${decisionId}, optionId=${optionId}. Do not execute the plan yet.`);
    const decision = state.decisions.find((item) => item.id === decisionId);
    if (!decision) throw new Error('Cloud agent did not record the decision.');
    return decision;
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
  state: () => request<MoveState>('/api/demo/state'),
  reset: () => request<MoveState>('/api/demo/reset', { method: 'POST' }),
  discover: () => request<{ discovered: number }>('/api/demo/discover', { method: 'POST' }),
  plan: () => request<{ actions: MoveState['actions']; decisions: DecisionRequest[] }>('/api/demo/plan', { method: 'POST' }),
  decide: (decisionId: string, optionId: string) => request<DecisionRequest>('/api/demo/decision', {
    method: 'POST', body: JSON.stringify({ decisionId, optionId }),
  }),
  execute: (approvalToken: string | null) => request<{ status: string; reason?: string }>('/api/demo/execute', {
    method: 'POST', body: JSON.stringify({ approvalToken }),
  }),
  verify: () => request<MoveReceipt>('/api/demo/verify', { method: 'POST' }),
};
