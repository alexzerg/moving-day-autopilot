import type { DecisionRequest, MoveReceipt, MoveState } from '@moving-day/contracts';

const API_BASE = import.meta.env.VITE_AGENT_API_URL ?? 'http://127.0.0.1:8787';

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

export const moveApi = {
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
