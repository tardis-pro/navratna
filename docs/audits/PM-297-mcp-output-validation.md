# PM-297 Audit: MCP Output Validation

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: FIXED

## Current State (Pre-Fix)

| Component | Status |
|-----------|--------|
| `MCPOutputValidator` service | ✅ Exists — full schema stripping + injection scanning |
| Exported from `@uaip/shared-services` | ✅ |
| Called from `MCPClientService.executeTool()` | ❌ Zero callers |
| Raw MCP responses returned to callers | ❌ No sanitization |

## Gaps Found

### CRITICAL: `MCPOutputValidator` never invoked on execution path
`MCPOutputValidator.sanitizeOutput()` existed but was not called anywhere in the production execution path. Every `executeTool()` call returned the raw, untrusted MCP response directly to callers without:
1. Field stripping (undeclared fields silently exfiltrated)
2. Injection scanning (prompt injection payloads passed through)

## Fixes Implemented

### `mcp_client_service.ts`
- Added `MCPOutputValidator` import from `@uaip/shared-services`
- Added `mcpOutputValidator` singleton field, initialized in constructor
- In `executeTool()`, after receiving raw MCP response:
  - Looks up declared output schema from tool definition (falls back to `{}` if not declared)
  - Calls `sanitizeOutput(toolName, outputSchema, response)` — strips undeclared fields, scans for injection
  - Logs warning when injection flags detected
  - Uses sanitized response (`sanitized.sanitized`) for DB persistence, event publishing, and return value
  - Propagates `strippedFields` and `injectionFlags` in `mcp.tool.executed` event payload

## Risk Assessment

| Gap | Risk | Action |
|-----|------|--------|
| No injection scanning | HIGH — prompt injection from malicious MCP servers | Fixed |
| No field stripping | HIGH — data exfiltration via undeclared response fields | Fixed |

## Limitations

- MCP protocol does not mandate output schemas at the tool definition level. Most deployed tools will not have `outputSchema`. In this case, field stripping is skipped but injection scanning still runs.
- When injection is detected, the call is not blocked — only logged. Blocking on injection would require policy-level configuration (reject vs. quarantine vs. log). Follow-up ticket recommended.
- The injected `strippedFields`/`injectionFlags` in the event payload enables downstream audit consumers to track sanitization statistics.
