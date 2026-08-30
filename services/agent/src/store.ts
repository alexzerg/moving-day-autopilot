import { floridaJurisdictionPack, MoveCaseSchema } from '@moving-day/contracts';
import type { Address, DecisionRequest, EvidenceAccount, MoveAction, MoveCase, MoveReceipt, MoveState } from '@moving-day/contracts';
import { demoAccounts, demoCase } from './fixtures.js';

function offsetDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MoveStore {
  private state: MoveState;
  private configuredCase: MoveCase;

  constructor(moveCase: MoveCase = demoCase) {
    this.configuredCase = clone(moveCase);
    this.state = this.initialState();
  }

  private initialState(): MoveState {
    return { moveCase: clone(this.configuredCase), accounts: [], actions: [], decisions: [], receipt: null };
  }

  reset() {
    this.state = this.initialState();
    return this.snapshot();
  }

  snapshot(): MoveState {
    return clone(this.state);
  }

  configureMoveCase(input: { moveDate: string; oldAddress: Address; newAddress: Address }) {
    if (input.oldAddress.country !== 'US' || input.newAddress.country !== 'US' || input.oldAddress.region !== 'FL' || input.newAddress.region !== 'FL') {
      throw new Error('The MVP supports moves within the United States / Florida jurisdiction pack only');
    }
    const configured = MoveCaseSchema.parse({
      ...this.state.moveCase,
      moveDate: input.moveDate,
      oldAddress: input.oldAddress,
      newAddress: input.newAddress,
      jurisdiction: floridaJurisdictionPack.id,
    });
    this.configuredCase = clone(configured);
    this.state = this.initialState();
    return clone(configured);
  }

  ingestServiceEvidence(evidence: EvidenceAccount[]) {
    if (evidence.length === 0) throw new Error('No service accounts were extracted from the supplied evidence');
    const used = new Set<string>();
    this.state.accounts = evidence.map((item, index) => {
      const base = item.provider.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `service-${index + 1}`;
      let id = base;
      while (used.has(id)) id = `${base}-${index + 1}`;
      used.add(id);
      return {
        id,
        provider: item.provider,
        kind: item.kind,
        accountReference: `••••${item.accountReference.replace(/\D/g, '').slice(-4) || item.accountReference.slice(-4)}`,
        address: clone(this.state.moveCase.oldAddress),
        monthlyCost: item.monthlyCost,
        state: 'active-old' as const,
        source: `https://evidence.invalid/${encodeURIComponent(item.sourceName)}`,
      };
    });
    this.state.actions = [];
    this.state.decisions = [];
    this.state.receipt = null;
    return { discovered: this.state.accounts.length, accounts: clone(this.state.accounts) };
  }

  discoverServices() {
    if (this.state.accounts.length === 0) {
      this.state.accounts = clone(demoAccounts).map((account) => ({ ...account, address: clone(this.state.moveCase.oldAddress) }));
    }
    return { discovered: this.state.accounts.length, accounts: this.snapshot().accounts };
  }

  buildPlan() {
    if (this.state.accounts.length === 0) this.discoverServices();
    const moveDate = this.state.moveCase.moveDate;
    const actions: MoveAction[] = [];

    for (const account of this.state.accounts) {
      const risk = account.kind === 'postal' || account.kind === 'financial' ? 'identity' : 'automatic';
      actions.push({
        id: `update-${account.id}`,
        accountId: account.id,
        label: `Update ${account.provider} for the new address`,
        kind: account.kind === 'electricity' || account.kind === 'water' ? 'activate' : account.kind === 'internet' ? 'schedule' : 'update-address',
        scheduledFor: account.kind === 'electricity' || account.kind === 'water' ? offsetDate(moveDate, -1) : moveDate,
        dependencies: [],
        risk: account.kind === 'internet' ? 'approval' : risk,
        status: account.kind === 'internet' ? 'blocked' : 'planned',
        confirmation: null,
      });
      if (account.kind === 'electricity' || account.kind === 'water' || account.kind === 'internet') {
        actions.push({
          id: `close-${account.id}`,
          accountId: account.id,
          label: `Close old ${account.provider} service after cutover`,
          kind: 'cancel',
          scheduledFor: offsetDate(moveDate, account.kind === 'internet' ? this.state.moveCase.preferences.internetOverlapDays : 1),
          dependencies: [`update-${account.id}`],
          risk: 'approval',
          status: 'blocked',
          confirmation: null,
        });
      }
    }

    const decision: DecisionRequest = {
      id: 'internet-provider',
      question: 'Which internet cutover should the agent schedule?',
      options: [
        { id: 'cable-overlap', label: 'Keep CableNet with two-day overlap', setupDate: offsetDate(moveDate, -1), monthlyCost: 79, setupCost: 0, consequence: 'No connectivity gap; existing provider retained.' },
        { id: 'fiber-switch', label: 'Switch to Miami Fiber', setupDate: offsetDate(moveDate, 1), monthlyCost: 59, setupCost: 99, consequence: 'Saves $20/month but creates a one-day connectivity gap.' },
      ],
      selectedOption: null,
      approvalToken: null,
    };

    this.state.actions = actions;
    this.state.decisions = [decision];
    this.state.receipt = null;
    return { actions: clone(actions), decisions: clone(this.state.decisions), jurisdictionPack: floridaJurisdictionPack.id };
  }

  approveDecision(decisionId: string, optionId: string) {
    const decision = this.state.decisions.find((item) => item.id === decisionId);
    const option = decision?.options.find((item) => item.id === optionId);
    if (!decision || !option) throw new Error('Unknown decision or option');
    decision.selectedOption = optionId;
    decision.approvalToken = `APPROVED-${decisionId}-${optionId}`;
    return clone(decision);
  }

  completeIdentityAction(actionId: string, evidence: string) {
    const action = this.state.actions.find((item) => item.id === actionId);
    if (!action || action.risk !== 'identity') throw new Error('Unknown identity action');
    if (action.status !== 'blocked') throw new Error('Identity action is not waiting for the household');
    if (evidence.trim().length < 8) throw new Error('Human completion evidence is required');
    action.status = 'executed';
    action.confirmation = `HUMAN-${action.id.toUpperCase()}-${evidence.trim()}`;
    const account = this.state.accounts.find((item) => item.id === action.accountId);
    if (account) {
      account.state = 'scheduled-new';
      account.address = clone(this.state.moveCase.newAddress);
    }
    this.state.receipt = null;
    return clone(action);
  }

  executePlan(approvalToken: string | null) {
    if (this.state.actions.length === 0) throw new Error('Plan must be built before execution');
    const decision = this.state.decisions[0];
    if (!decision?.selectedOption || decision.approvalToken !== approvalToken) {
      return { status: 'blocked', reason: 'The internet trade-off requires exact human approval.', actions: clone(this.state.actions) };
    }

    for (const action of this.state.actions) {
      if (action.risk === 'identity') {
        action.status = 'blocked';
        action.confirmation = 'Prepared for identity verification by the household.';
        continue;
      }
      action.status = 'executed';
      action.confirmation = `CONF-${action.id.toUpperCase()}-${action.scheduledFor}`;
      const account = this.state.accounts.find((item) => item.id === action.accountId);
      if (!account) continue;
      if (action.kind === 'cancel') account.state = 'closed';
      else if (action.kind === 'activate' || action.kind === 'schedule') account.state = 'active-new';
      else account.state = 'scheduled-new';
      account.address = clone(this.state.moveCase.newAddress);
    }
    return { status: 'executed', actions: clone(this.state.actions), accounts: clone(this.state.accounts) };
  }

  verifyMove(): MoveReceipt {
    for (const action of this.state.actions) {
      if (action.status === 'executed' && action.confirmation) action.status = 'verified';
    }
    const verified = this.state.actions.filter((action) => action.status === 'verified');
    const failed = this.state.actions.filter((action) => action.status === 'failed');
    const blocked = this.state.actions.filter((action) => action.status === 'blocked');
    const selected = this.state.decisions.filter((decision) => decision.selectedOption);
    const selectedInternet = selected.find((decision) => decision.id === 'internet-provider')?.selectedOption;
    const receipt: MoveReceipt = {
      schemaVersion: 'moving-day.receipt.v1',
      caseId: this.state.moveCase.id,
      generatedAt: new Date().toISOString(),
      jurisdictionPack: floridaJurisdictionPack.id,
      discoveredServices: this.state.accounts.length,
      executedActions: verified.length,
      verifiedActions: verified.length,
      failedActions: failed.length,
      blockedActions: blocked.length,
      serviceGaps: selectedInternet === 'fiber-switch' ? 1 : 0,
      decisions: selected.map((decision) => ({ id: decision.id, selectedOption: decision.selectedOption! })),
      confirmations: verified.map((action) => ({ actionId: action.id, confirmation: action.confirmation! })),
    };
    this.state.receipt = receipt;
    return clone(receipt);
  }
}

export const moveStore = new MoveStore();
