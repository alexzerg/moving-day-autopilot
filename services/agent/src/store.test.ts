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

    store.completeIdentityAction('update-postal', 'USPS-ID-VERIFIED');
    expect(store.verifyMove().blockedActions).toBe(1);
    store.completeIdentityAction('update-bank', 'BANK-ID-VERIFIED');
    const finalReceipt = store.verifyMove();
    expect(finalReceipt.verifiedActions).toBe(14);
    expect(finalReceipt.blockedActions).toBe(0);
    expect(finalReceipt.confirmations).toHaveLength(14);
  });

  it('rejects invented identity completion', () => {
    store.discoverServices();
    store.buildPlan();
    const decision = store.approveDecision('internet-provider', 'cable-overlap');
    store.executePlan(decision.approvalToken);
    expect(() => store.completeIdentityAction('update-postal', 'short')).toThrow('Human completion evidence is required');
  });

  it('ingests real service evidence and masks account references', () => {
    const result = store.ingestServiceEvidence([
      { provider: 'Example Electric', kind: 'electricity', accountReference: '123456789', monthlyCost: 121.5, sourceName: 'electric-bill.eml' },
      { provider: 'Example Fiber', kind: 'internet', accountReference: 'ABC-9988', monthlyCost: 65, sourceName: 'fiber.csv' },
    ]);
    expect(result.discovered).toBe(2);
    expect(result.accounts[0].accountReference).toBe('••••6789');
    expect(result.accounts[1].source).toContain('fiber.csv');
  });

  it('records the connectivity consequence of the cheaper provider', () => {
    store.discoverServices();
    store.buildPlan();
    const decision = store.approveDecision('internet-provider', 'fiber-switch');
    store.executePlan(decision.approvalToken);
    expect(store.verifyMove().serviceGaps).toBe(1);
  });
});
