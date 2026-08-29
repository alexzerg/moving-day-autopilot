import { describe, expect, it } from 'vitest';
import { decodeAgentCoreResponse } from './server.js';

describe('AgentCore bridge decoding', () => {
  it('separates agent prose from authoritative state', () => {
    const state = { moveCase: { id: 'move-fl-001' }, accounts: [{ id: 'electric' }] };
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
    const decoded = decodeAgentCoreResponse([
      'data: "I found 11 services."',
      `data: "\\n__MOVE_STATE__${encoded}"`,
      '',
    ].join('\n'));

    expect(decoded.text).toBe('I found 11 services.');
    expect(decoded.state).toEqual(state);
  });
});
