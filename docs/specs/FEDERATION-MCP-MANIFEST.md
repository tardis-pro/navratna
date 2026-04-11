# Federation MCP Manifest Specification

**Version**: 1.0.0
**Status**: Active
**Last Updated**: 2026-04-11

## Overview

Every TARDIS subdomain app exposes a `.well-known/mcp.json` manifest at its root. The Federation Registry on `tardis.digital` crawls these manifests to discover, track, and expose federated MCP tools to agents across the platform.

## Manifest Location

```
https://{subdomain}.tardis.digital/.well-known/mcp.json
```

## Schema

```json
{
  "$schema": "https://tardis.digital/schemas/mcp-manifest/v1",
  "name": "chess",
  "description": "Chess game engine and analysis",
  "version": "1.0.0",
  "subdomain": "chess.tardis.digital",
  "mcp": {
    "url": "https://chess.tardis.digital/mcp",
    "transport": "streamable-http",
    "auth": {
      "type": "tardis-jwt",
      "jwks_url": "https://tardis.digital/.well-known/jwks.json"
    }
  },
  "tools": [
    {
      "name": "start_game",
      "description": "Start a new chess game",
      "inputSchema": {
        "type": "object",
        "properties": {
          "opponent": { "type": "string" }
        }
      }
    }
  ],
  "health": "https://chess.tardis.digital/health",
  "icon": "https://chess.tardis.digital/icon.png",
  "category": "gaming",
  "tags": ["chess", "games", "ai"]
}
```

## Field Definitions

### Top-Level Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | string | Yes | Schema identifier. Must be `https://tardis.digital/schemas/mcp-manifest/v1` |
| `name` | string | Yes | Short machine-friendly name (lowercase, alphanumeric + hyphens) |
| `description` | string | Yes | Human-readable description of the subdomain app |
| `version` | string | Yes | SemVer version of the manifest (not the app) |
| `subdomain` | string | Yes | Full subdomain hostname (e.g., `chess.tardis.digital`) |
| `mcp` | object | Yes | MCP server connection details |
| `tools` | array | Yes | List of tools exposed by this subdomain |
| `health` | string | Yes | URL of the health check endpoint (must return HTTP 200 when healthy) |
| `icon` | string | No | URL to the subdomain icon (PNG or SVG, 128x128 recommended) |
| `category` | string | No | Primary category for grouping |
| `tags` | string[] | No | Searchable tags for discovery |

### `mcp` Object

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | Full URL to the MCP server endpoint |
| `transport` | string | Yes | Transport protocol. One of: `streamable-http`, `sse`, `stdio` |
| `auth` | object | Yes | Authentication configuration |

### `mcp.auth` Object

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | Auth type. One of: `tardis-jwt`, `bearer`, `api-key`, `none` |
| `jwks_url` | string | Conditional | JWKS URL for JWT validation (required when `type` is `tardis-jwt`) |
| `header` | string | No | Custom header name for API key auth (default: `Authorization`) |

### `tools[]` Array Items

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Tool name (must be unique within the subdomain) |
| `description` | string | Yes | Human-readable description of what the tool does |
| `inputSchema` | object | Yes | JSON Schema describing the tool's input parameters |

## Validation Rules

1. `name` must match `/^[a-z0-9][a-z0-9-]*$/` (lowercase, starts with alphanumeric)
2. `subdomain` must end with `.tardis.digital`
3. `mcp.url` must be HTTPS in production
4. `mcp.transport` must be one of the allowed values
5. Each tool `name` must be unique within the manifest
6. `inputSchema` must have `"type": "object"` at the root
7. `version` must be valid SemVer

## Discovery Flow

1. Federation Registry maintains a list of known subdomains
2. A BullMQ repeatable job crawls `https://{subdomain}/.well-known/mcp.json` on a schedule
3. Manifest is validated against this spec
4. Tools are extracted and stored in `federated_tools` table
5. Subdomain health is checked via the `health` endpoint
6. Tools are registered in the ToolRegistry with `source: 'federation'`
7. Agents can discover and invoke federated tools through the unified tool interface

## Health Check Contract

The `health` endpoint must:
- Return HTTP 200 with a JSON body when healthy
- Return any non-200 status when unhealthy
- Respond within 5 seconds

Example healthy response:
```json
{
  "status": "ok",
  "service": "chess",
  "version": "2.1.0"
}
```

## Categories

Recommended categories (extensible):
- `gaming` - Games and entertainment
- `productivity` - Productivity and workflow tools
- `ai` - AI/ML services
- `data` - Data processing and analytics
- `communication` - Messaging and collaboration
- `development` - Developer tools
- `finance` - Financial services
- `media` - Media and content
- `education` - Learning and education
- `infrastructure` - Platform infrastructure

## Security

- All manifest URLs must use HTTPS in production
- The `tardis-jwt` auth type validates tokens against the central JWKS endpoint
- Subdomain MCP servers must validate incoming JWTs before executing tools
- The Federation Registry never stores or forwards auth credentials
