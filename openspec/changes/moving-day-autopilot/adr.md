# ADR: Split Vercel UI from Strands Agent Runtime

## Decision
Use Vercel for the static operator UI and package the TypeScript Strands service for AWS AgentCore Runtime. Provider systems are deterministic stateful demo adapters.

## Rationale
The submission needs a frictionless public interface and substantial Strands orchestration. Separating the browser from the agent runtime preserves secrets, supports background execution, and provides a credible production integration boundary.

## Consequences
A personal AWS account with Bedrock model access is required before cloud deployment. Local development uses the same tool contracts with a deterministic provider fixture layer.
