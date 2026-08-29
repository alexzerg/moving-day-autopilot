import { Agent } from '@strands-agents/sdk';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { z } from 'zod';
import { createMovingAgent } from './agent.js';
import { MoveStore } from './store.js';

const requestSchema = z.object({ prompt: z.string().min(1) });
const sessions = new Map<string, { agent: Agent; store: MoveStore }>();
const sessionLimit = 128;

function session(id: string) {
  const existing = sessions.get(id);
  if (existing) {
    sessions.delete(id);
    sessions.set(id, existing);
    return existing;
  }
  if (sessions.size >= sessionLimit) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
  const store = new MoveStore();
  const created = { store, agent: createMovingAgent(store) };
  sessions.set(id, created);
  return created;
}

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema,
    async *process(payload, context) {
      const active = session(context?.sessionId ?? 'default-session');
      const snapshot = active.agent.takeSnapshot({ include: ['messages'] });
      try {
        for await (const event of active.agent.stream(payload.prompt)) {
          if (
            event.type === 'modelStreamUpdateEvent' &&
            event.event?.type === 'modelContentBlockDeltaEvent' &&
            event.event.delta?.type === 'textDelta'
          ) {
            yield { data: event.event.delta.text };
          }
        }
        const encodedState = Buffer.from(JSON.stringify(active.store.snapshot())).toString('base64url');
        yield { data: `\n__MOVE_STATE__${encodedState}` };
      } catch (error) {
        active.agent.loadSnapshot(snapshot);
        throw error;
      }
    },
  },
});

app.run({ port: Number(process.env.PORT ?? 8080) });
