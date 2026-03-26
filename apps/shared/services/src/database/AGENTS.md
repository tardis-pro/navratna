# database — @uaip/shared-services/database

Database access layer. TypeORM repository classes for all 57+ entities, Drizzle two-plane schema, base classes, and seed scripts.

## STRUCTURE

```
database/
├── base/
│   ├── base_repository.ts      # BaseRepository<T> — findById, findAll, save, delete
│   └── repository_factory.ts   # RepositoryFactory — get typed repo by entity name
├── repositories/               # 23 TypeORM repository classes (one per entity)
├── drizzle/
│   ├── schemas/
│   │   ├── intelligence_schema.ts  # PC-A: agents, personas, discussions, messages, artifacts...
│   │   └── control_schema.ts       # PC-B: users, sessions, tokens, tools, operations, projects...
│   ├── clients/                # Drizzle pg client setup
│   └── index.ts
├── seeders/                    # 13 seed files (idempotent — safe to re-run)
├── toolDatabase.ts             # Raw SQL bootstrap for tool definitions (12k lines)
├── toolGraphDatabase.ts        # Neo4j graph data for tool relationships (32k lines)
└── index.ts
```

## REPOSITORIES

All extend `BaseRepository<Entity>`. Access via `RepositoryFactory`, not `new`:

```typescript
import { RepositoryFactory } from '@uaip/shared-services';
const agentRepo = RepositoryFactory.getRepository(AgentEntity);
```

| Repository | Entity | Key Methods |
|-----------|--------|-------------|
| `AgentRepository` | Agent | findByStatus, findWithPersona, findActive |
| `UserRepository` | User | findByEmail, findWithPreferences |
| `DiscussionRepository` | Discussion | findActive, findByParticipant |
| `ArtifactRepository` | Artifact | findByType, findByDiscussion |
| `ToolRepository` | Tool | findByCategory, search, findEnabled |
| `OperationRepository` | Operation | findByStatus, findPending |
| `KnowledgeRepository` | KnowledgeItem | findByType, semanticSearch |
| `AuditRepository` | AuditLog | findByUser, findByEvent |
| `CapabilityRepository` | Capability | findByType, findAvailable |
| `SecurityRepository` | SecurityPolicy | findByLevel |
| `LLMProviderRepository` | LLMProvider | findActive, findDefault |
| `CachedLLMProviderRepository` | LLMProvider | Redis-cached wrapper |
| `UserLLMPreferenceRepository` | UserLLMPreference | findByUser, findByProvider |
| `UserLLMProviderRepository` | UserLLMProvider | findByUser |
| `CachedUserLLMProviderRepository` | UserLLMProvider | Redis-cached wrapper |
| `OAuthRepository` | OAuthToken | findByProvider, findByUser |
| `AgentLLMPreferenceRepository` | AgentLLMPreference | findByAgent |
| `ArtifactDeploymentRepository` | ArtifactDeployment | findByArtifact |
| `UserContactRepository` | UserContact | findByUser |
| `UserMessageRepository` | UserMessage | findByDiscussion |
| `UserPreferencesRepository` | UserPreferences | findByUser |
| `UserPresenceRepository` | UserPresence | findOnline |

## DRIZZLE TWO-PLANE SCHEMA

No DB-level FKs between planes. Use `CrossPlaneGuard` before any cross-plane write.

| Plane | File | Tables |
|-------|------|--------|
| **Intelligence (PC-A)** | `intelligence_schema.ts` | agents, personas, discussions, messages, knowledge_items, artifacts, llm_providers, llm_models, short_links |
| **Control (PC-B)** | `control_schema.ts` | users, sessions, tokens, mfa_configs, oauth_tokens, tools, mcp_servers, operations, tasks, projects, security_policies, audit_events |

```typescript
import { getIntelligenceDb, getControlDb, CrossPlaneGuard } from '@uaip/shared-services';

// Query intelligence plane
const db = getIntelligenceDb();
const agents = await db.select().from(schema.agents).where(...);

// Cross-plane write: verify first
await CrossPlaneGuard.verify(pool, 'agents', agentId, 'Agent');
```

## SEEDERS

All seed files extend `BaseSeed` and are idempotent (UUID-check before insert):

| Seeder | Seeds |
|--------|-------|
| `user_seed.ts` | Default admin user (`admin/admin` in dev) |
| `persona_seed.ts` | Default persona templates |
| `agent_seed.ts` | Default agents |
| `tool_definition_seed.ts` | Built-in tool definitions |
| `security_policy_seed.ts` | Default RBAC policies |
| `project_seed.ts` | Default project |
| `l_l_m_preferences_seed.ts` | Default LLM routing config |
| `user_l_l_m_provider_seed.ts` | Default LLM provider per user |

Run all seeders:
```bash
pnpm --filter @uaip/shared-services run seed   # if script exists
# or: node -e "require('./src/database/seedDatabase').seedDatabase()"
```

## ANTI-PATTERNS

- `new AgentRepository()` — use `RepositoryFactory.getRepository()`
- Direct SQL that bypasses Drizzle schema — use `getIntelligenceDb()` / `getControlDb()`
- Cross-plane FK joins in SQL — planes are separate; use `CrossPlaneGuard` + application-level join
- Editing `toolDatabase.ts` or `toolGraphDatabase.ts` directly — these are bootstrap fixtures, changes should go through seed scripts
- TypeORM `@Entity()` decorators in new files — legacy pattern; new tables go in Drizzle schema files
