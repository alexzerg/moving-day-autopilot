import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { moveStore } from './store.js';

export const discoverMoveServices = tool({
  name: 'discover_move_services',
  description: 'Discover address-linked household services from the deterministic demo inbox and account registry.',
  inputSchema: z.object({}),
  callback: () => JSON.stringify(moveStore.discoverServices()),
});

export const buildMovePlan = tool({
  name: 'build_move_plan',
  description: 'Build a dependency-safe Florida move plan and identify the bounded human decisions that block execution.',
  inputSchema: z.object({}),
  callback: () => JSON.stringify(moveStore.buildPlan()),
});

export const getMoveState = tool({
  name: 'get_move_state',
  description: 'Read the current move case, discovered services, action plan, decisions, and verification receipt.',
  inputSchema: z.object({}),
  callback: () => JSON.stringify(moveStore.snapshot()),
});

export const approveMoveDecision = tool({
  name: 'record_move_decision',
  description: 'Record an explicit human provider choice and return the exact approval token required for execution.',
  inputSchema: z.object({ decisionId: z.string(), optionId: z.string() }),
  callback: ({ decisionId, optionId }) => JSON.stringify(moveStore.approveDecision(decisionId, optionId)),
});

export const executeMovePlan = tool({
  name: 'execute_move_plan',
  description: 'Execute approved provider actions. Rejects execution when the exact human approval token is missing or stale.',
  inputSchema: z.object({ approvalToken: z.string().nullable() }),
  callback: ({ approvalToken }) => JSON.stringify(moveStore.executePlan(approvalToken)),
});

export const verifyMoveCompletion = tool({
  name: 'verify_move_completion',
  description: 'Read provider state after execution, verify confirmations, count service gaps, and issue the move completion receipt.',
  inputSchema: z.object({}),
  callback: () => JSON.stringify(moveStore.verifyMove()),
});

export const movingTools = [
  discoverMoveServices,
  buildMovePlan,
  getMoveState,
  approveMoveDecision,
  executeMovePlan,
  verifyMoveCompletion,
];
