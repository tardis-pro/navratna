# marketplace-service — @uaip/marketplace-service

**Port**: 3008 | **Status**: ⚠️ SCHEDULED FOR REMOVAL in v3.0

Agent and persona marketplace. Do not add features. Do not fix bugs. Migrate any required functionality to navratna-core or navratna-gateway.

## REMOVAL PLAN

- `ToolsIntegrationsPortal` in the frontend is a deprecated shim pointing to `UnifiedToolPortal` — remove from `portal_registry.tsx` when ready
- Any marketplace concepts (ratings, installs, revenue-share) are deferred to Phase 2 (PM-38)

## COMMANDS

```bash
# Do not run in production. Legacy only.
pnpm --filter @uaip/marketplace-service dev
```
