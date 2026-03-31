# security-gateway — @uaip/security-gateway

**Port**: 3004 | **Entry**: `src/index.ts` | **Status**: 🔄 Legacy (consolidating into navratna-gateway)

Auth, authorization, JWT + MFA + OAuth, approval workflows, audit logs, LLM provider management, knowledge access control. All HTTP handlers use Elysia (`.elysia.ts` files). Critical security path — 70% coverage threshold.

## STRUCTURE

```
src/
├── index.ts                     # SecurityGatewayServer extends BaseService
├── http/                        # All Elysia route handlers (52 files)
│   ├── auth.elysia.ts           # login, register, logout, validate, refresh, MFA
│   ├── users.elysia.ts          # User CRUD + profile + password change
│   ├── approval.elysia.ts       # Approval workflow CRUD + resolution
│   ├── audit.elysia.ts          # Audit log query
│   ├── security.elysia.ts       # Security policy, RBAC
│   ├── oauth.elysia.ts          # OAuth flows: Jira, Confluence, GitHub, Slack
│   ├── providers.elysia.ts      # LLM provider CRUD (OpenAI, Anthropic, etc.)
│   ├── knowledge.elysia.ts      # Knowledge graph (personal CRUD + search)
│   ├── persona.elysia.ts        # Persona management (security-scoped)
│   ├── tool-preferences.elysia.ts  # Per-user tool preferences
│   ├── contacts.elysia.ts       # Contact management
│   ├── projects.elysia.ts       # Project management
│   └── [others]
├── routes/
│   └── llmAgentProviderRoutes.ts # Agent-specific LLM provider assignment
├── services/                    # 43 service files
│   ├── auditService.ts          # Audit trail writes
│   ├── approvalWorkflowService.ts  # Approval lifecycle + cron jobs
│   ├── enhancedAuthService.ts   # JWT validation + refresh
│   ├── oauthProviderService.ts  # OAuth adapter orchestration
│   └── LLMProviderManagementService.ts  # Provider CRUD + key encryption
└── __tests__/
    ├── unit/                    # 3 unit tests
    ├── integration/             # 4 integration tests (oauth-flow, security-validation)
    ├── utils/testHelpers.ts     # createTestDataSource, createTestJWT, entity factories
    └── types/jest.d.ts          # Custom matcher: toBeOneOf()
```

## ENDPOINTS

| Handler               | Key Routes                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------- | ------- |
| `auth.elysia.ts`      | `POST /login`, `/register`, `/logout`, `/validate`, `/refresh`, `/mfa/setup`, `/mfa/verify` |
| `users.elysia.ts`     | `GET/POST/PUT/DELETE /users`, `PUT /users/:id/password`                                     |
| `approval.elysia.ts`  | `GET/POST /approvals`, `PUT /approvals/:id/approve                                          | reject` |
| `audit.elysia.ts`     | `GET /audit-logs` (filterable)                                                              |
| `oauth.elysia.ts`     | `GET /oauth/:provider/auth`, `GET /oauth/:provider/callback`                                |
| `providers.elysia.ts` | `GET/POST/PUT/DELETE /llm-providers`                                                        |
| `knowledge.elysia.ts` | `GET/POST/PUT/DELETE /knowledge`, `GET /knowledge/search`                                   |

## EVENT BUS

| Topic                           | Direction | Handler                                         |
| ------------------------------- | --------- | ----------------------------------------------- |
| `security.auth.validate`        | subscribe | Validate JWT → publish `security.auth.response` |
| `security.enterprise.audit.log` | subscribe | Write compliance audit records                  |
| `security.auth.response`        | publish   | Correlation-ID-based response to auth requests  |

## AUTH PATTERN (Elysia)

```typescript
import { withRequiredAuth } from '@uaip/middleware';
// In route handlers accessing middleware-injected user:
// @ts-expect-error -- Elysia middleware injects user but TS can't infer through nested groups
const user = context.user as UserContext;
```

## KEY PATTERNS

- **Dual event bus**: standard BullMQ + enterprise BullMQ queue (with `complianceMode: true`, `auditTrail: true`; RabbitMQ removed)
- **MFA**: `speakeasy` TOTP + `qrcode` for setup QR codes
- **Password hashing**: `bcrypt`
- **OAuth**: adapters in `src/services/` for Jira, Confluence, GitHub, Slack (4 providers)
- **API key encryption**: `ApiKeyDecryptionHandler` for stored provider keys
- **Approval cron**: `ApprovalWorkflowService` has background jobs for expiry

## TESTING

```bash
pnpm --filter @uaip/security-gateway test    # 70% coverage threshold, 10s timeout
```

Integration tests need Docker: `docker-compose -f infrastructure/docker-compose.test.yml up -d` (postgres:5433, redis:6380, rabbitmq:5673).

## COMMANDS

```bash
pnpm --filter @uaip/security-gateway dev     # bun --hot src/index.ts
pnpm --filter @uaip/security-gateway build
```

## NOTES

- CORS is NOT configured here — nginx handles CORS at port 8081
- Services trust nginx-forwarded `X-User-ID`, `X-User-Email`, `X-User-Role` headers downstream
- **Never add CORS headers** in Elysia routes
- v3.0 target: all `src/http/` handlers imported by `navratna-gateway`
