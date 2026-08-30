# Requirements

## Outcome
Build an end-to-end agent that discovers address-linked services, plans a dependency-safe household move, executes approved provider actions, and verifies completion.

## Functional requirements
1. Use Strands Agents SDK as the primary orchestration runtime.
2. Support one complete jurisdiction pack: United States / Florida.
3. Discover at least ten synthetic address-linked services from an inbox/account dataset.
4. Build a dependency graph covering activation, overlap, cancellation, appointments, deposits, and final bills.
5. Automatically execute reversible actions through provider tools.
6. Require human approval for payment, identity attestation, irreversible cancellation, or provider trade-offs.
7. Verify provider state after execution and produce a move completion receipt.
8. Expose a live operator UI with an end-to-end application requiring no judge credentials.
9. Keep jurisdiction rules versioned, sourced, and isolated from universal workflow logic.
10. Never claim that synthetic provider actions affected real services.

## Non-functional requirements
- Public HTTPS application before submission.
- Public MIT repository before submission.
- No secrets in client code or repository.
- Deterministic judge path under three minutes.
- Responsive UI and automated tests.
