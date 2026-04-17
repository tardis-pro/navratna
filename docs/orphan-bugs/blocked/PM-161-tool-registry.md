# PM-161 BLOCKED: tool_registry.ts — 8 knowledge-graph methods return empty arrays

## Status: BLOCKED — Do Not Implement

## Reason

Per `apps/shared/services/AGENTS.md`:

> "Do not fill these stubs without coordinating with the domain service migration plan."
> `toolRegistry.ts` stubs return `[]` for Neo4j-backed recommendation methods — known TODO, do not re-implement.

`capability-registry/src/services/toolRegistryService.ts` knowledge-graph methods (e.g., `getRecommendedTools`, `findRelatedTools`) are explicitly marked as "known TODO" in the AGENTS.md. They require Neo4j to be running and the tool graph to be populated via `IntegrationService`.

## What Would Be Needed

1. Neo4j running with populated tool relationship graph
2. Coordination with capability-registry domain migration plan

## Next Steps

These will become functional once `IntegrationService` has run its PG↔Neo4j sync cycle and Neo4j is available in the deployment.
