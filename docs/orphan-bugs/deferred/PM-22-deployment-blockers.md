# PM-22 Deployment Blockers

**Story**: Canva integration — design asset generation via Canva Connect API  
**Status**: Scaffold implemented. The following items must be resolved before ACs can be signed off.

---

## Blocker 1 — Real Canva Developer App (MANUAL)

**What**: The implementation reads `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` from env.
These are empty strings in dev and staging until a real Canva Developer app is registered.

**User action required**:
1. Create an app at [developer.canva.com](https://www.canva.com/developers/)
2. Set `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI` in `.env` (and in your deployment secrets manager)
3. See `docs/integrations/canva-setup.md` for full setup steps

---

## Blocker 2 — Live OAuth Callback URL on Staging

**What**: Canva's OAuth flow requires a publicly accessible redirect URI.
`localhost:3002` is rejected by Canva during OAuth unless using their local dev proxy.

**User action required**:
1. Deploy `navratna-gateway` to a staging environment with a public URL
2. Register that URL (`https://staging.your-domain.com/api/v1/canva/oauth/callback`) in the Canva Developer Portal under your app's Redirect URIs
3. Update `CANVA_REDIRECT_URI` in staging env

---

## Blocker 3 — Real Template IDs

**What**: `docs/integrations/canva-template-catalog.md` contains placeholder template IDs (`REPLACE_AFTER_CANVA_CONNECT`).
The PixelAgent persona (PM-21) will try to use these IDs to create designs — they will fail until replaced with real IDs from a connected Canva account.

**User action required**:
1. Complete Blockers 1 and 2
2. Call `GET /api/v1/canva/tools/list-templates` with a valid Canva access token
3. Copy the returned template IDs into `docs/integrations/canva-template-catalog.md`

---

## Blocker 4 — PixelAgent Persona Wiring (PM-21 scope)

**What**: The Canva MCP tools are registered but not yet wired to any agent persona.
PM-21 (PixelAgent) is the intended consumer.

**User action required**:
1. Complete PM-21 (PixelAgent persona definition)
2. Add `canva_create_design`, `canva_list_templates`, `canva_export_design`, `canva_update_brand_kit` to PixelAgent's tool allowlist
3. Test end-to-end: user prompt → PixelAgent → Canva tool call → artifact saved with `type: 'canva-design'`

---

## Blocker 5 — Token Storage per User/Agent

**What**: The current implementation accepts the Canva access token via `X-Canva-Access-Token` header on each request.
Long-term, tokens should be stored in the security-gateway OAuth tokens table (keyed by `userId`/`agentId` + provider) so agents can auto-retrieve them without user re-authentication.

**What's already done**: The security-gateway's `OAuthService` and `AgentOAuthConnection` model support this pattern.
The `OAuthProviderType` enum in `@uaip/types` needs `CANVA` added, and a seeded provider record needs to be inserted.

**User action required (once real creds exist)**:
1. Add `CANVA = 'canva'` to `OAuthProviderType` enum in `apps/packages/shared-types/src/security.ts`
2. Seed a Canva provider record via `OAuthProviderService.createProvider()` (one-time migration)
3. Update canva routes to retrieve stored tokens from OAuthService instead of requiring the header

---

## Implementation Summary

What PM-22 delivered (code complete, no live credentials required):

| Deliverable | Location | Status |
|---|---|---|
| `CanvaAdapter` class | `capability-registry/src/adapters/canva_adapter.ts` | ✅ Done |
| MCP tool definitions (4 tools) | Same file, `setupOperations()` | ✅ Done |
| OAuth routes (authorize + callback) | `capability-registry/src/routes/canva_routes.ts` | ✅ Done |
| MCP tool execution routes (4 routes) | Same file | ✅ Done |
| `navratna-gateway` route registration | `navratna-gateway/src/app.ts` | ✅ Done |
| `ArtifactType` extended with `canva-design` | `shared-types/src/artifact.ts` | ✅ Done |
| `CanvaDesignArtifactMetadata` interface | `shared-types/src/artifact.ts` | ✅ Done |
| `CanvaAdapterConfig` type | `shared-types/src/integrations.ts` | ✅ Done |
| `CanvaConfig` in `@uaip/config` | `shared/config/src/config.ts` | ✅ Done |
| Unit tests (mock fetch, all 4 tools) | `capability-registry/src/__tests__/unit/canva_adapter.test.ts` | ✅ Done |
| Setup guide | `docs/integrations/canva-setup.md` | ✅ Done |
| Template catalog | `docs/integrations/canva-template-catalog.md` | ✅ Done |
