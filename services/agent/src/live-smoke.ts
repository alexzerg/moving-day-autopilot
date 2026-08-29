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

const state = moveStore.snapshot();
if (!state.receipt) throw new Error('Agent did not produce a verification receipt');
if (state.receipt.failedActions !== 0 || state.receipt.serviceGaps !== 0) {
  throw new Error(`Unexpected receipt: ${JSON.stringify(state.receipt)}`);
}
console.log('\n--- VERIFIED STATE ---\n');
console.log(JSON.stringify({
  discoveredServices: state.receipt.discoveredServices,
  verifiedActions: state.receipt.verifiedActions,
  blockedActions: state.receipt.blockedActions,
  failedActions: state.receipt.failedActions,
  serviceGaps: state.receipt.serviceGaps,
}, null, 2));
