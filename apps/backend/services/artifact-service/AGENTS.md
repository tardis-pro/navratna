# artifact-service — @uaip/artifact-service

**Port**: 3006 | **Entry**: `src/index.ts` | **Status**: 🔄 Legacy (consolidating into navratna-core)

AI-powered artifact generation from conversation context. Generates code, tests, PRDs, documentation. Event-triggered by discussion completion. Only service using **Drizzle ORM** (not TypeORM).

## STRUCTURE

```
src/
├── index.ts                     # ArtifactServiceApp extends BaseService
├── routes/
│   ├── artifactRoutes.ts        # Analyze/generate/validate/status endpoints
│   └── shortLinkRoutes.ts       # Short URL + QR code generation
├── services/
│   ├── ArtifactFactory.ts       # Orchestrates all generators
│   └── [supporting services]
├── generators/
│   ├── code_generator.ts        # Code — generateFunction(signature, desc, lang) (PM-228) via LLM + TemplateManager
│   ├── test_generator.ts        # Tests — generateUnitTest(), generateMock() (PM-230/231)
│   ├── p_r_d_generator.ts       # Product Requirements Doc generation
│   └── documentation_generator.ts
├── analysis/
│   └── ConversationAnalyzer.ts  # Extracts decisions/action items/artifacts from transcripts
├── security/
│   └── SecurityManager.ts       # Scans generated artifacts for vulnerabilities
├── templates/
│   └── template_manager.ts      # TemplateManager (PM-232) — loadTemplate(), substituteVariables(), validateOutput()
├── validation/                  # Zod validation schemas
├── interfaces/                  # TypeScript interfaces for generators
└── types/                       # Local type definitions
```

## ENDPOINTS

| Method   | Path                         | Purpose                                         |
| -------- | ---------------------------- | ----------------------------------------------- |
| POST     | `/api/v1/artifacts/analyze`  | Analyze conversation for artifact opportunities |
| POST     | `/api/v1/artifacts/generate` | Generate artifact from conversation context     |
| GET      | `/api/v1/artifacts/types`    | List available generators with capabilities     |
| POST     | `/api/v1/artifacts/validate` | Validate artifact quality and security          |
| GET      | `/api/v1/artifacts/status`   | Service health + generator metrics              |
| GET/POST | `/api/v1/shortlinks`         | Short URL + QR code for sharing                 |

## EVENT BUS

| Topic                        | Direction | Handler                                                |
| ---------------------------- | --------- | ------------------------------------------------------ |
| `discussion.completed`       | subscribe | Auto-generate artifact from discussion, publish result |
| `artifact.generated`         | publish   | Successful generation with artifact data               |
| `artifact.generation.failed` | publish   | Generation failure with error details                  |

Auto-generation flow: `discussion.completed` event → `ConversationAnalyzer` extracts context → `ArtifactFactory` selects appropriate generator → `SecurityManager` scans output → `artifact.generated` published.

## DRIZZLE ORM

All services use Drizzle ORM (TypeORM removed). Schema files in `@uaip/shared-services/src/database/drizzle/schemas/`:

- `control_schema.ts` — operational tables
- `intelligence_schema.ts` — knowledge/agent tables

```typescript
import { drizzleService } from '@uaip/shared-services';
const db = drizzleService.getDb();
```

## GENERATORS

Each generator receives `ArtifactContext` (conversation messages, decisions, participants) and returns structured artifacts. Templates in `src/templates/` control output format via `TemplateManager`.

`TemplateManager` (`src/templates/template_manager.ts`, PM-232) — `loadTemplate(id)`, `substituteVariables(template, vars)`, `validateOutput(content, type)`. Used by `CodeGenerator` to apply language/framework-specific templates before LLM generation.

`CodeGenerator.generateFunction(signature, desc, lang)` (PM-228) and `TestGenerator.generateUnitTest() / generateMock()` (PM-230/231) are the primary programmatic entrypoints for single-artifact generation — distinct from the event-triggered batch flow.

After generation, `SecurityManager` scans for: hardcoded secrets, SQL injection patterns, XSS vectors, insecure dependencies in generated code.

## COMMANDS

```bash
pnpm --filter @uaip/artifact-service dev
pnpm --filter @uaip/artifact-service build
pnpm test:artifacts                            # Demo scripts (root workspace)
pnpm test:artifacts:prd                        # PRD-specific demo
pnpm test:artifacts:code                       # Code-specific demo
```

## NOTES

- Short links call security-gateway HTTP API (`/api/v1/artifacts/:id/share`) — HTTP not event bus
- v3.0 target: routes imported by `navratna-core`
