# Moving-Day Autopilot

A jurisdiction-aware Strands agent that completes the administrative cutover of a household move across utilities, internet, insurance, address records, appointments, deposits, and final bills.

Working repository for the Agents for Humans Hackathon. Product name is provisional.

## Planned architecture

- `apps/web` — React/Vite operator console, deployed to Vercel.
- `services/agent` — Strands Agents SDK orchestration service, packaged for AgentCore Runtime.
- `packages/contracts` — shared move-case, jurisdiction-pack, provider-action, and verification schemas.
- `infra` — AgentCore/AWS deployment configuration.
- `openspec/changes/moving-day-autopilot` — requirements, architecture, plan, and test evidence.

## License

MIT
