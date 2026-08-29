import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { AddressSchema, floridaJurisdictionPack } from '@moving-day/contracts';
import { MoveStore, moveStore } from './store.js';

export function createMovingTools(store: MoveStore) {
  const getJurisdictionPack = tool({
    name: 'get_jurisdiction_pack',
    description: 'Read the active jurisdiction pack, version, supported service categories, official sources, and human-identity boundaries.',
    inputSchema: z.object({}),
    callback: () => JSON.stringify(floridaJurisdictionPack),
  });

  const configureMoveCase = tool({
    name: 'configure_move_case',
    description: 'Set the household move date, old address, and new address before discovery. The current MVP accepts Florida-to-Florida moves only.',
    inputSchema: z.object({ moveDate: z.string().date(), oldAddress: AddressSchema, newAddress: AddressSchema }),
    callback: (input) => JSON.stringify(store.configureMoveCase(input)),
  });

  const discoverMoveServices = tool({
    name: 'discover_move_services',
    description: 'Discover address-linked household services from the deterministic demo inbox and account registry.',
    inputSchema: z.object({}),
    callback: () => JSON.stringify(store.discoverServices()),
  });

  const buildMovePlan = tool({
    name: 'build_move_plan',
    description: 'Build a dependency-safe Florida move plan and identify the bounded human decisions that block execution.',
    inputSchema: z.object({}),
    callback: () => JSON.stringify(store.buildPlan()),
  });

  const getMoveState = tool({
    name: 'get_move_state',
    description: 'Read the current move case, discovered services, action plan, decisions, and verification receipt.',
    inputSchema: z.object({}),
    callback: () => JSON.stringify(store.snapshot()),
  });

  const approveMoveDecision = tool({
    name: 'record_move_decision',
    description: 'Record an explicit human provider choice and return the exact approval token required for execution.',
    inputSchema: z.object({ decisionId: z.string(), optionId: z.string() }),
    callback: ({ decisionId, optionId }) => JSON.stringify(store.approveDecision(decisionId, optionId)),
  });

  const executeMovePlan = tool({
    name: 'execute_move_plan',
    description: 'Execute approved provider actions. Rejects execution when the exact human approval token is missing or stale.',
    inputSchema: z.object({ approvalToken: z.string().nullable() }),
    callback: ({ approvalToken }) => JSON.stringify(store.executePlan(approvalToken)),
  });

  const recordIdentityCompletion = tool({
    name: 'record_identity_completion',
    description: 'Record an identity-required task only after the human explicitly confirms completion and provides evidence. The agent may never invent this confirmation.',
    inputSchema: z.object({ actionId: z.string(), evidence: z.string().min(8) }),
    callback: ({ actionId, evidence }) => JSON.stringify(store.completeIdentityAction(actionId, evidence)),
  });

  const verifyMoveCompletion = tool({
    name: 'verify_move_completion',
    description: 'Read provider state after execution, verify confirmations, count service gaps, and issue the move execution receipt.',
    inputSchema: z.object({}),
    callback: () => JSON.stringify(store.verifyMove()),
  });

  return [getJurisdictionPack, configureMoveCase, discoverMoveServices, buildMovePlan, getMoveState, approveMoveDecision, executeMovePlan, recordIdentityCompletion, verifyMoveCompletion];
}

export const movingTools = createMovingTools(moveStore);
