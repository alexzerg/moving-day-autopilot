# Test Cases

## Scenario: successful Florida move cutover
Given a household moving between two Florida addresses
And eleven discovered address-linked services
When the agent plans the cutover
Then electricity, water, insurance, internet, postal, employer, and subscription tasks are ordered by dependency
And no service gap is introduced

## Scenario: human decision is required
Given two internet installation offers with different date and cost trade-offs
When the agent reaches the provider-selection step
Then it pauses only that branch
And presents a bounded comparison to the operator

## Scenario: protected action cannot execute without approval
Given an irreversible cancellation or payment action
When no approval token exists
Then the provider tool rejects execution

## Scenario: completion is verified
Given approved actions were executed
When the verifier reads provider state
Then every action is classified as verified, failed, or blocked
And a move completion receipt records confirmations and unresolved items

## Scenario: unsupported jurisdiction
Given a move outside a configured jurisdiction pack
When the agent plans the move
Then it does not reuse Florida-specific requirements
And creates sourced guided tasks instead of fabricating rules
