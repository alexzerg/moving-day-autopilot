# Verification Plan

- `npm run typecheck` exits 0.
- `npm run lint` exits 0.
- `npm test` exits 0.
- `npm run build` exits 0.
- Browser E2E proves discover → plan → decision → execute → verify → receipt.
- Agent tests prove Strands invokes provider tools and rejects protected actions without approval.
- Repository secret scan returns clean.
- Public live URL works without credentials.
