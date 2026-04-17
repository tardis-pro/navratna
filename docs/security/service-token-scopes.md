# Service Token Scope Matrix

## Overview
Internal service tokens carry a `scopes` claim that restricts which event topics and API routes a service can access. Scopes are defined per service API key and enforced at the event bus level.

## Scope Format
Scopes use dot-notation matching against event topics:
- `agent.chat` — matches `agent.chat.request`, `agent.chat.response`
- `security.auth` — matches `security.auth.validate`, `security.auth.response`
- `*` — wildcard (admin only)

## Service Scope Whitelist

| Service | Scopes | Justification |
|---------|--------|---------------|
| agent-intelligence | `agent.chat`, `conversation.enhancement`, `discussion.agent`, `agent.operation` | Cognitive engine — chat, discussions, operations |
| security-gateway | `security.auth`, `security.enterprise` | Auth validation, audit logging |
| orchestration-pipeline | `workflow.definition`, `agent.operation`, `security.auth` | Workflow execution, operation management |
| capability-registry | `tool.registry`, `mcp.server` | Tool and MCP server management |
| discussion-orchestration | `discussion.agent`, `conversation.enhancement`, `agent.chat` | Discussion lifecycle |
| artifact-service | `artifact.generation`, `agent.chat` | Artifact creation |
| llm-service | `llm.completion`, `agent.chat` | LLM routing |

## Token Lifecycle
1. Service starts → reads `INTERNAL_SERVICE_TOKEN` from env
2. Token issued via `POST /api/v1/auth/internal-token` with service API key
3. Token expires after 1 hour — service must refresh
4. Scope-denied calls logged as security warnings

## TODO
- [ ] Enable issuer/audience enforcement after all services rotate tokens
- [ ] Add scope enforcement to HTTP middleware for service-to-service API calls
- [ ] Automated token rotation via cron
