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
    expect(receipt.blockedActions).toBe(3);

    store.completeIdentityAction('update-postal', 'USPS-ID-VERIFIED');
    expect(store.verifyMove().blockedActions).toBe(2);
    store.completeIdentityAction('update-bank', 'BANK-ID-VERIFIED');
    expect(store.verifyMove().blockedActions).toBe(1);
    store.completeIdentityAction('update-mortgage', 'MORTGAGE-ID-VERIFIED');
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
      { provider: 'Test Electric', kind: 'electricity', accountReference: '123456789', monthlyCost: 121.5, sourceName: 'electric-bill.eml', serviceAddress: '100 Harbor Lane, Hollywood, FL 33020' },
      { provider: 'Test Fiber', kind: 'internet', accountReference: 'ABC-9988', monthlyCost: 65, sourceName: 'fiber.csv', serviceAddress: '100 Harbor Lane, Hollywood, FL 33020' },
      { provider: 'Old Address Electric', kind: 'electricity', accountReference: '44556677', monthlyCost: 88, sourceName: 'old-bill.eml', serviceAddress: '55 Previous Street, Miami, FL 33101' },
    ]);
    expect(result.discovered).toBe(2);
    expect(result.rejectedAddressMismatches).toBe(1);
    expect(result.accounts[0].accountReference).toBe('••••6789');
    expect(result.accounts[1].source).toContain('fiber.csv');
  });

  it('completes exactly one selected identity action', () => {
    store.ingestServiceEvidence([
      { provider: 'Bank of America', kind: 'financial', accountReference: '11112222', monthlyCost: 0, sourceName: 'boa-statement.eml', serviceAddress: '100 Harbor Lane, Hollywood, FL 33020' },
      { provider: 'Chase', kind: 'financial', accountReference: '33334444', monthlyCost: 0, sourceName: 'chase-statement.eml', serviceAddress: '100 Harbor Lane, Hollywood, FL 33020' },
    ]);
    store.buildPlan();
    const decision = store.approveDecision('internet-provider', 'cable-overlap');
    store.executePlan(decision.approvalToken);
    const identityActions = store.snapshot().actions.filter((action) => action.risk === 'identity');
    expect(identityActions).toHaveLength(2);

    store.completeIdentityAction(identityActions[0].id, 'UI-CONFIRMED-FIRST-BANK');
    const receipt = store.verifyMove();
    const state = store.snapshot();

    expect(state.actions.find((action) => action.id === identityActions[0].id)?.status).toBe('verified');
    expect(state.actions.find((action) => action.id === identityActions[1].id)?.status).toBe('blocked');
    expect(receipt.blockedActions).toBe(1);
  });

  it('records the connectivity consequence of the cheaper provider', () => {
    store.discoverServices();
    store.buildPlan();
    const decision = store.approveDecision('internet-provider', 'fiber-switch');
    store.executePlan(decision.approvalToken);
    expect(store.verifyMove().serviceGaps).toBe(1);
  });
});
