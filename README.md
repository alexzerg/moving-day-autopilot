# Moving-Day Autopilot

**Move the household, not the administrative burden.**

[Live application](https://moving-day-autopilot.vercel.app) · Built for the [Agents for Humans Hackathon](https://agentsforhumans.devpost.com/)

Moving-Day Autopilot is a jurisdiction-aware Strands agent that completes the administrative cutover of a household move across utilities, internet, insurance, address records, appointments, deposits, and final bills.

The agent runs the repetitive work in the background and interrupts the household only when a decision materially affects cost, service continuity, identity, or an irreversible cancellation. Owner mode uses explicit read-only Gmail OAuth to discover billing and service messages automatically; judges can use the preloaded sandbox inbox without credentials. Nova must find an explicit service address matching the configured old address, so historical accounts at prior addresses are excluded. Account references are masked before entering move state. The agent never marks blocked work as complete.

## Reference outcome

The deterministic Florida scenario produces a measurable result:

```text
11 address-linked services discovered
14 dependency-aware actions planned
 1 bounded human decision
12 provider actions executed automatically
 2 identity-required tasks completed by the household
14 total actions independently verified
 0 blocked actions remaining
 0 failed actions
 0 service gaps
```

## Architecture

![Moving-Day Autopilot architecture](docs/architecture.svg)

The public application uses two Vercel services behind one domain:

- **Web:** React/Vite operator console.
- **Bridge:** Express service that invokes AgentCore using short-lived Vercel OIDC credentials.

The bridge has no AWS access keys. Its IAM role can invoke only the exact Moving-Day AgentCore runtime. The runtime hosts a session-isolated Strands agent backed by Amazon Nova 2 Lite and deterministic stateful provider adapters.

## Physical move planning

Before administrative cutover, the household selects a visual family profile and records bedrooms, access constraints, crew size, furniture, appliances, and boxes. A shared calculator used by both the UI and Strands produces:

- expected and P90 volume;
- weight range;
- recommended truck capacity with buffer risk;
- server-calculated US driving distance and duration from the entered origin and destination addresses;
- U-Haul and Penske vehicle recommendations;
- loading and unloading ranges by crew and building access;
- a modeled total-cost range covering truck, real route mileage, fuel, coverage, equipment and labor;
- selectable labor discovery across U-Haul Moving Help, HireAHelper, Taskrabbit, OfferUp and Craigslist.

Household composition seeds the box estimate; actual furniture drives the majority of volume. Changing inventory can therefore change the recommended vehicle and total-cost range. The calculation is explicitly a planning range, not a guaranteed quote. Truck capacities are based on the published provider fleets. The UI lets the household select U-Haul or Penske and hands the calculated vehicle, route, and move date to the provider's official live quote flow; it never presents a synthetic rental price or availability result. Labor cards link to real marketplace searches while clearly separating reviewed marketplaces from higher-risk community listings.

Route calculation prefers Google Routes when `GOOGLE_MAPS_API_KEY` is configured. Without a key it uses U.S. Census normalization with a bounded OpenStreetMap fallback, then OSRM driving routing. The application sends addresses only when the user explicitly applies the route, derives city/state/ZIP automatically, and allows evidence scanning after address verification even if the driving router is temporarily unavailable.

## Agent lifecycle

1. Read the versioned jurisdiction pack and official sources.
2. Configure household composition and inventory, then estimate volume, weight, truck and labor.
3. Discover bill and statement candidates whose evidence address matches the configured old address.
4. Require the household to confirm exactly which provider accounts belong in the move.
5. Build a dependency-aware cutover plan from confirmed accounts only.
6. Continue automatic branches while surfacing one bounded provider decision.
7. Reject approval-gated actions without the exact human decision token.
8. Execute authorized provider actions.
9. Read provider state back and classify every action as verified, blocked, or failed.
10. Prepare identity-only tasks for explicit household completion.
11. Record human evidence, verify again, and produce a final move receipt with no hidden work.
12. Export one phone-friendly PDF execution report.

## Tangible household output

After verification, the browser generates one PDF containing:

- normalized route, road mileage and duration;
- selected truck, return plan, fuel estimate and modeled total cost;
- selected labor source;
- recorded human decisions;
- verified provider work and confirmation references;
- remaining household checklist;
- final execution receipt.

## Provider discovery and actionable handoff

Gmail discovery searches six months of address matches, billing language, PDF candidates, and a move-relevant catalog covering Florida utilities, telecom providers, major banks, insurers, medical accounts, mortgages, and SunPass. Portable subscriptions and moving marketplaces are excluded. One newest candidate per provider/category is staged for explicit checkbox confirmation.

Households can also upload up to six PDF, TXT, EML, or HTML bills. PDF.js extracts text locally in the browser; original files are not stored or uploaded. Extracted evidence enters the same address-matching and human-confirmation flow.

Confirmed provider cards show a provider-specific action guide: the official account or moving URL when verified, navigation steps, the new address, move date, and whether the handoff is an official verified path or a generic guided fallback. The application never claims that a real provider changed an account until provider or household evidence confirms completion.

The UI separates two execution modes. Sandbox evidence enables `Run AI Autopilot`, where Strands tools execute deterministic provider adapters and verify their state. Gmail and uploaded evidence enable `Real account guided mode`, where Nova builds the ordered action plan but does not execute or verify external providers. Human decisions update the plan only; the household completes each official provider flow. Future AgentCore Browser assistance may navigate and prefill forms, but login, MFA, CAPTCHA, policy review, and final submission remain human-controlled.

## Strands tool surface

| Tool | Responsibility |
|---|---|
| `get_jurisdiction_pack` | Read versioned rules, sources, supported services, and identity boundaries |
| `configure_move_case` | Set the household's move date and Florida addresses |
| `estimate_move_requirements` | Calculate P50/P90 volume, weight, truck capacity and labor |
| `ingest_service_evidence` | Stage address-matched candidates, then replace them with the exact human-confirmed account subset |
| `discover_move_services` | Discover the preloaded sandbox services when no evidence is supplied |
| `build_move_plan` | Build the dependency-safe administrative cutover |
| `get_move_state` | Read the authoritative session state |
| `record_move_decision` | Record the exact human provider choice and issue an approval token |
| `execute_move_plan` | Execute authorized work and reject missing or stale approval |
| `record_identity_completion` | Record an identity task only after explicit human evidence |
| `verify_move_completion` | Read providers back and issue the execution receipt |

## Source-aware jurisdiction packs

The MVP implements **United States / Florida** completely. Jurisdiction rules are isolated from universal move orchestration and carry:

- version and last-checked date;
- official source URL;
- required, recommended, or provider-specific classification;
- explicit human-identity boundary;
- supported service categories.

If a jurisdiction pack is unavailable, the agent must create a sourced guided task instead of applying Florida rules elsewhere.

## Security boundaries

- Browser clients never receive AWS credentials.
- Vercel federates to AWS through short-lived OIDC tokens.
- The Vercel role is scoped to one AgentCore runtime endpoint.
- AgentCore sessions receive separate MoveStore instances; every page load rotates to a clean move session, and the Reset move control does the same without disconnecting Gmail.
- Gmail OAuth is fail-closed to the server-configured owner email, and status and scan routes re-check the allowlist before using a token.
- Payments, identity actions, and irreversible cancellations remain human-gated.
- The public bridge validates session IDs, limits prompt size, and applies a best-effort rate limit.
- AWS budget alerts are configured independently of the application.

## Repository layout

```text
apps/web             React/Vite operator console
services/agent       Strands SDK service and AgentCore HTTP runtime
services/bridge      Vercel OIDC → AgentCore invoke bridge
packages/contracts   Shared schemas and Florida jurisdiction pack
agentcore             AgentCore/CDK runtime configuration
openspec/changes     Requirements, ADR, plan, and verification artifacts
docs                  Architecture and submission assets
```

## Local development

Requirements: Node.js 22+, npm, Docker, and an AWS profile with Bedrock access for live model tests.

```bash
npm install
npm run dev:agent
npm run dev --workspace @moving-day/web -- --host 127.0.0.1
```

The local UI uses deterministic REST endpoints. Production sets `VITE_AGENT_MODE=cloud` and drives the same shared state through the AgentCore runtime.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
AWS_PROFILE=moving-day AWS_REGION=us-east-1 npm run test:agent-live
```

The test suite covers contracts, jurisdiction-pack validation, approval gating, zero-gap and one-gap provider choices, AgentCore state decoding, responsive browser flow, and live Strands tool orchestration.

## Execution boundaries

Owner mode can read billing and service messages from a connected Gmail account. OAuth tokens are encrypted in an HttpOnly cookie and Gmail access is read-only. Provider execution remains a stateful sandbox adapter layer: the agent does not contact real utilities, banks, or government systems.

## License

[MIT](LICENSE)
