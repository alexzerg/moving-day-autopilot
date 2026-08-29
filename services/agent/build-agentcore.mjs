import { build } from 'esbuild';

await build({
  entryPoints: ['src/agentcore.ts'],
  outfile: 'dist/agentcore.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['@strands-agents/sdk', 'bedrock-agentcore', 'zod'],
});
