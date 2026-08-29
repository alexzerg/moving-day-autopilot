import { beforeEach, describe, expect, it } from 'vitest';
import { MoveStore } from './store.js';

describe('move lifecycle', () => {
  let store: MoveStore;
  beforeEach(() => { store = new MoveStore(); });

  it('discovers, plans, gates, executes, and verifies a zero-gap move', () => {
    expect(store.discoverServices().discovered).toBe(11);
    const plan = store.buildPlan();
    expect(plan.actions.length).toBeGreaterThan(11);
    expect(plan.decisions).toHaveLength(1);

    const blocked = store.executePlan(null);
    expect(blocked.status).toBe('blocked');

    const decision = store.approveDecision('internet-provider', 'cable-overlap');
    const executed = store.executePlan(decision.approvalToken);
    expect(executed.status).toBe('executed');

    const receipt = store.verifyMove();
    expect(receipt.discoveredServices).toBe(11);
    expect(receipt.verifiedActions).toBeGreaterThan(10);
    expect(receipt.failedActions).toBe(0);
    expect(receipt.serviceGaps).toBe(0);
    expect(receipt.blockedActions).toBe(2);
  });

  it('records the connectivity consequence of the cheaper provider', () => {
    store.discoverServices();
    store.buildPlan();
    const decision = store.approveDecision('internet-provider', 'fiber-switch');
    store.executePlan(decision.approvalToken);
    expect(store.verifyMove().serviceGaps).toBe(1);
  });
});
