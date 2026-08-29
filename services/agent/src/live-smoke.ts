import { createMovingAgent } from './agent.js';
import { moveStore } from './store.js';

moveStore.reset();
const agent = createMovingAgent();

const planning = await agent.invoke(
  'Start the demo Florida move. Discover all household services, build the dependency-safe plan, and report only the bounded decision that requires human input. Do not choose or execute anything.',
);
console.log('\n--- PLANNING TURN ---\n');
console.log(String(planning));

const execution = await agent.invoke(
  'I choose cable-overlap. Record that exact decision, execute every authorized action, then verify completion. Report verified, blocked, failed, and service gaps separately. Do not call the move complete while blocked work remains.',
);
console.log('\n--- EXECUTION TURN ---\n');
console.log(String(execution));

const executionState = moveStore.snapshot();
if (!executionState.receipt) throw new Error('Agent did not produce a verification receipt');
if (executionState.receipt.failedActions !== 0 || executionState.receipt.serviceGaps !== 0 || executionState.receipt.blockedActions !== 2) {
  throw new Error(`Unexpected execution receipt: ${JSON.stringify(executionState.receipt)}`);
}

const completion = await agent.invoke(
  'I explicitly completed update-postal with evidence USPS-ID-VERIFIED and update-bank with evidence BANK-ID-VERIFIED. Record both human completions, verify the move again, and report the final state.',
);
console.log('\n--- HOUSEHOLD COMPLETION TURN ---\n');
console.log(String(completion));

const finalState = moveStore.snapshot();
if (!finalState.receipt) throw new Error('Agent did not produce the final receipt');
if (finalState.receipt.verifiedActions !== 14 || finalState.receipt.blockedActions !== 0 || finalState.receipt.failedActions !== 0 || finalState.receipt.serviceGaps !== 0) {
  throw new Error(`Unexpected final receipt: ${JSON.stringify(finalState.receipt)}`);
}
console.log('\n--- FINAL VERIFIED STATE ---\n');
console.log(JSON.stringify({
  discoveredServices: finalState.receipt.discoveredServices,
  verifiedActions: finalState.receipt.verifiedActions,
  blockedActions: finalState.receipt.blockedActions,
  failedActions: finalState.receipt.failedActions,
  serviceGaps: finalState.receipt.serviceGaps,
}, null, 2));
