import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { MoveStore, moveStore } from './store.js';

export function createMovingTools(store: MoveStore) {
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

  const verifyMoveCompletion = tool({
    name: 'verify_move_completion',
    description: 'Read provider state after execution, verify confirmations, count service gaps, and issue the move execution receipt.',
    inputSchema: z.object({}),
    callback: () => JSON.stringify(store.verifyMove()),
  });

  return [discoverMoveServices, buildMovePlan, getMoveState, approveMoveDecision, executeMovePlan, verifyMoveCompletion];
}

export const movingTools = createMovingTools(moveStore);
