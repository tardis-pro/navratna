---
# Replacement Specification — Navratna v3.0

## Document Control
- **Version**: 1.0
- **Date**: 2026-03-21
- **Purpose**: Detail every technology swap, migration path, and rollback strategy

## Replacement 1: TypeORM → Drizzle ORM

### Rationale
TypeORM is the #1 performance bottleneck:
- N+1 query problems in PersonaService (30,856 LoC) and DiscussionService
- No query result caching at repository level
- Heavy runtime overhead from decorators and metadata reflection
- Poor tree-shaking increases bundle size
- Drizzle: 0 runtime overhead, queries compile to SQL at build time, 10x faster benchmarks

### Migration Strategy

**Approach**: Parallel implementation with feature flag

**Step 1: Schema Definition** (2-3 days)
Convert TypeORM entities to Drizzle schema:

```typescript
// BEFORE (TypeORM)
@Entity()
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('jsonb')
  config: AgentConfig;

  @ManyToOne(() => User)
  owner: User;
}

// AFTER (Drizzle)
export const agents = pgTable('agent_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  config: jsonb('config').$type<AgentConfig>().notNull(),
  ownerId: uuid('owner_id').references(() => users.id),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
```

**Step 2: Repository Migration** (1-2 weeks)
Migrate service-by-service, starting with least-coupled:

Migration order:
1. Artifact Service (simplest, fewest relations)
2. LLM Service (isolated config storage)
3. Capability Registry (tool definitions)
4. Agent Intelligence (complex but well-tested)
5. Discussion Orchestration (WebSocket-critical, test heavily)
6. Orchestration Pipeline (state management, most complex)
7. Security Gateway (auth-critical, migrate last)

**Step 3: Query Optimization** (3-5 days)
Replace N+1 patterns with Drizzle's relational queries:

```typescript
// BEFORE (TypeORM N+1)
const discussions = await repo.find();
for (const d of discussions) {
  d.participants = await participantRepo.find({ discussionId: d.id });
}

// AFTER (Drizzle single query)
const discussions = await db.query.discussions.findMany({
  with: {
    participants: true,
    messages: { limit: 50, orderBy: desc(messages.createdAt) }
  }
});
```

**Step 4: Add Missing Indexes** (1 day)
```sql
CREATE INDEX idx_agent_definitions_owner ON agent_definitions(owner_id);
CREATE INDEX idx_discussions_agent ON discussions(agent_id);
CREATE INDEX idx_messages_discussion ON messages(discussion_id);
CREATE INDEX idx_operations_status ON operations(status);
CREATE INDEX idx_knowledge_user ON knowledge_items(user_id);
CREATE INDEX idx_knowledge_created ON knowledge_items(created_at);
```

### Rollback Strategy
- Feature flag: `USE_DRIZZLE=true|false` in .env
- TypeORM entities preserved (not deleted) during migration
- Both ORMs can coexist reading same tables
- Rollback = flip flag, restart service

### Validation
- Run existing test suites against Drizzle implementation
- Query performance benchmarks: every Drizzle query must be faster than TypeORM equivalent
- Zero data loss verification: count rows before/after switch

---

## Replacement 2: RabbitMQ → BullMQ on Redis Streams

### Rationale
RabbitMQ consumes 512MB RAM for simple pub/sub that Redis can handle. Redis is already running. BullMQ provides: priority queues, retries, delayed jobs, cron scheduling, rate limiting — all features needed for agent orchestration.

### Current EventBus Architecture
```typescript
// Current: backend/shared/infra/src/event-bus.ts
class EventBus {
  private connection: amqp.Connection;

  async publish(exchange: string, routingKey: string, payload: object): Promise<void>;
  async subscribe(queue: string, handler: (msg: object) => Promise<void>): Promise<void>;
}
```

### Target Architecture
```typescript
// New: backend/shared/infra/src/event-bus.ts
import { Queue, Worker, QueueEvents } from 'bullmq';

class EventBus {
  private redis: Redis;
  private queues: Map<string, Queue>;
  private workers: Map<string, Worker>;

  async publish(topic: string, payload: object, opts?: {
    priority?: number;     // 1-10, higher = more urgent
    delay?: number;        // ms delay before processing
    attempts?: number;     // retry count
    backoff?: { type: 'exponential' | 'fixed'; delay: number };
  }): Promise<void>;

  async subscribe(topic: string, handler: (payload: object) => Promise<void>, opts?: {
    concurrency?: number;  // parallel processing
    limiter?: { max: number; duration: number };  // rate limiting
  }): Promise<void>;

  // NEW: Scheduled events (replaces cron jobs)
  async schedule(name: string, cron: string, payload: object): Promise<void>;
}
```

### Migration Steps

**Step 1: Install BullMQ** (1 hour)
```bash
cd backend && pnpm add bullmq
```

**Step 2: Create BullMQ EventBus** (2-3 days)
- New file: `backend/shared/infra/src/event-bus-bullmq.ts`
- Same interface as current EventBus
- Feature flag: `EVENT_BUS_BACKEND=rabbitmq|bullmq`

**Step 3: Migrate Consumers** (3-5 days)
Each service subscribes to events. Migrate one service at a time:
1. Artifact Service (simplest consumer)
2. LLM Service
3. Agent Intelligence
4. Discussion Orchestration
5. Capability Registry
6. Orchestration Pipeline
7. Security Gateway

**Step 4: Migrate Scheduled Jobs** (2-3 days)
Convert 21 OpenClaw cron jobs to BullMQ repeatable jobs:
```typescript
// Karna morning hunt - 10AM IST daily
await eventBus.schedule('karna-morning-hunt', '0 10 * * * Asia/Kolkata', {
  agent: 'karna',
  task: 'lead_hunt',
  mode: 'morning',
});
```

**Step 5: Remove RabbitMQ** (1 hour)
- Remove `rabbitmq` from docker-compose.yml
- Remove `amqplib` from package.json
- Delete old EventBus implementation
- Remove RabbitMQ config from .env

### Rollback Strategy
- Feature flag: `EVENT_BUS_BACKEND=rabbitmq` restores RabbitMQ
- RabbitMQ container stays in compose (commented out) for 2 weeks
- Both backends can process same events during transition

---

## Replacement 3: 7 Microservices → 2 Consolidated Services

### Rationale
7 services × 512MB each = 3.5GB RAM just for backend. On modest consumer hardware (8-16GB total), this is unsustainable. Services that share data constantly (Agent Intelligence ↔ Discussion Orchestration ↔ LLM Service) add network latency for no benefit at single-user scale.

### Consolidation Map

**Service A: NAVRATNA-CORE** (Port 3001)
```
Merges:
  - Agent Intelligence (3001) — agent CRUD, personas, knowledge
  - Discussion Orchestration (3005) — WebSocket, turn management
  - Artifact Service (3006) — artifact generation
  - LLM Service (3007) — model routing, provider management

Why together: These services share constant data flow.
Agent discussions use LLM, produce artifacts, need agent context.
Co-locating them eliminates 80% of inter-service RabbitMQ traffic.

Entry point: backend/services/navratna-core/src/index.ts
  - Mounts all route groups on single Elysia instance
  - Shared database connections (1 pool instead of 4)
  - Direct function calls instead of event bus for internal ops
  - EventBus still used for cross-service communication to Gateway
```

**Service B: NAVRATNA-GATEWAY** (Port 3002)
```
Merges:
  - Security Gateway (3004) — auth, RBAC, approval workflows
  - Orchestration Pipeline (3002) — workflow execution, task management
  - Capability Registry (3003) — tool registry, MCP, OpenShell integration

Why together: These services are the control plane.
Auth checks precede every orchestration. Tool execution needs auth context.
Co-locating eliminates auth token round-trips.

Entry point: backend/services/navratna-gateway/src/index.ts
  - Mounts security routes first (auth middleware)
  - Orchestration routes use security context directly
  - Capability routes have inline auth validation
  - EventBus for communication with Core service
```

### Migration Steps

**Step 1: Create consolidated entry points** (2-3 days)
```typescript
// navratna-core/src/index.ts
const app = new Elysia()
  .use(agentIntelligenceRoutes)
  .use(discussionOrchestrationRoutes)
  .use(artifactRoutes)
  .use(llmRoutes)
  .listen(3001);
```

**Step 2: Merge database connections** (1-2 days)
- Single TypeORM/Drizzle connection pool per consolidated service
- Single Redis connection per service
- Single EventBus instance per service

**Step 3: Replace inter-service calls with direct imports** (3-5 days)
```typescript
// BEFORE: Agent Intelligence calls LLM Service via RabbitMQ
await eventBus.publish('llm.request', { model: 'claude-sonnet-4-6', prompt });

// AFTER: Direct import (same process)
import { llmService } from '../llm/service';
const response = await llmService.complete({ model: 'claude-sonnet-4-6', prompt });
```

**Step 4: Update Docker Compose** (1 day)
```yaml
services:
  navratna-core:
    build: { context: ., dockerfile: Dockerfile.base }
    command: ["bun", "run", "backend/services/navratna-core/dist/index.js"]
    ports: ["3001:3001"]

  navratna-gateway:
    build: { context: ., dockerfile: Dockerfile.base }
    command: ["bun", "run", "backend/services/navratna-gateway/dist/index.js"]
    ports: ["3002:3002"]
```

**Step 5: Update Nginx routing** (1 hour)
```nginx
upstream navratna_core {
    server navratna-core:3001;
}
upstream navratna_gateway {
    server navratna-gateway:3002;
}

# All agent/discussion/artifact/llm routes → core
location /api/v1/agents { proxy_pass http://navratna_core; }
location /api/v1/discussions { proxy_pass http://navratna_core; }
location /api/v1/artifacts { proxy_pass http://navratna_core; }
location /api/v1/llm { proxy_pass http://navratna_core; }

# All security/orchestration/capability routes → gateway
location /api/v1/auth { proxy_pass http://navratna_gateway; }
location /api/v1/operations { proxy_pass http://navratna_gateway; }
location /api/v1/tools { proxy_pass http://navratna_gateway; }
location /api/v1/mcp { proxy_pass http://navratna_gateway; }
```

### Rollback Strategy
- Old service directories preserved (not deleted)
- Docker compose profiles: `docker compose --profile=microservices up` restores 7-service mode
- Nginx config has both upstream blocks (comment/uncomment to switch)

---

## Replacement 4: DesktopUnified → TelescopeSurface

### Rationale
DesktopUnified (1,927 lines) implements a window-manager metaphor: drag, resize, minimize, maximize, Z-index layering, taskbar, app launcher. The Telescope vision eliminates all of this. There are no windows. There is no navigation. There is one surface that responds to intent.

### What Transfers to Telescope
| DesktopUnified Feature | Telescope Equivalent |
|---|---|
| 27 portal components | Wrapped as MaterializableBlocks (portal code unchanged) |
| Design tokens (colors, spacing, etc.) | Kept and extended with microexpression tokens |
| Weather widget data | Becomes ambient atmosphere in Telescope |
| User preferences hook | Extended for Telescope preferences |
| Auth/security context | Unchanged |

### What Dies
- Window management (drag, resize, minimize, maximize)
- Taskbar component
- App launcher grid
- Z-index layering system
- Desktop shortcuts
- Sticky notes system
- Window state tracking

### Migration: Feature-Flagged Transition
```typescript
// In DesktopApp.tsx
const TelescopeEnabled = () => {
  const { enableTelescope } = useUserPreferences();

  if (enableTelescope) {
    return <TelescopeSurface />;
  }
  return <DesktopUnified />;  // Legacy fallback
};
```

### TelescopeSurface Architecture
See brainstorming session (88 ideas) and 04-TELESCOPE-SPEC.md for full specification.

---

## Replacement 5: Framer Motion (Basic → Advanced)

### Current State
Framer Motion is used for basic fade/scale transitions only:
```typescript
// Current usage pattern (throughout codebase)
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
/>
```

### Target State
Full Framer Motion capabilities for Telescope:
- Layout animations (layoutId for shared element transitions)
- Physics-based springs (useSpring for gravitational relevance)
- Gesture recognition (drag, pan, hover with physics)
- Variants system (7 microexpression states as Framer variants)
- AnimatePresence for crystallization/dissolution
- useMotionValue for continuous relevance-driven positioning

### No Code Migration Needed
This is an enhancement, not a replacement. Existing fade/scale animations continue to work. New Telescope components use advanced patterns.

---

## Replacement 6: Code Splitting (None → Full)

### Current State
Zero code splitting. All 27 portals (500KB+) loaded upfront. No React.lazy(), no Suspense boundaries, no route-based splitting.

### Target State
```typescript
// Lazy-loaded portal imports
const AgentManagerPortal = lazy(() => import('./portals/AgentManagerPortal'));
const DiscussionPortal = lazy(() => import('./portals/DiscussionPortal'));
const KnowledgePortal = lazy(() => import('./portals/KnowledgePortal'));
// ... all 27 portals

// Suspense wrapper in MaterializableBlock
const MaterializableBlock = ({ portalId, ...props }) => {
  const Portal = portalMap[portalId];
  return (
    <Suspense fallback={<BlockCrystallizing />}>
      <Portal {...props} />
    </Suspense>
  );
};
```

### Vite Config Updates
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-framer': ['framer-motion'],
          'vendor-radix': ['@radix-ui/react-dialog', ...],
          'vendor-socket': ['socket.io-client'],
        }
      }
    }
  }
});
```

### Expected Impact
- Initial bundle: 500KB+ → ~150KB (70% reduction)
- Time to Interactive: ~3s → ~1s
- Portal loads on-demand as MaterializableBlocks crystallize

---

## Replacement 7: Auth Token Storage

### Current State
Auth tokens stored in localStorage (XSS vulnerable):
```typescript
// client.ts comment: "SECURITY TODO: Migrate token storage to httpOnly cookies"
localStorage.setItem('auth_token', token);
```

### Target State
httpOnly cookies set by Security Gateway:
```typescript
// Security Gateway sets cookie on login
res.cookie('auth_token', token, {
  httpOnly: true,    // JavaScript cannot read
  secure: true,      // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 3600000,   // 1 hour
  path: '/api',
});

// Frontend: no token management needed
// Cookies sent automatically with every /api request
// CSRF token still needed (double-submit cookie pattern)
```

### Migration
1. Update Security Gateway login/refresh endpoints to set cookies
2. Update API client to stop sending Authorization header
3. Remove localStorage token management from AuthContext
4. Keep CSRF token mechanism (already implemented)
5. Update Nginx to forward cookies

---

## Replacement Summary

| # | What | From | To | Effort | Risk |
|---|---|---|---|---|---|
| 1 | ORM | TypeORM | Drizzle | 2-3 weeks | High (feature-flagged) |
| 2 | Message Bus | RabbitMQ | BullMQ/Redis | 1-2 weeks | Medium (feature-flagged) |
| 3 | Services | 7 microservices | 2 consolidated | 2-3 weeks | Medium (profile-switchable) |
| 4 | UI Shell | DesktopUnified | TelescopeSurface | 4-6 weeks | Medium (feature-flagged) |
| 5 | Animations | Basic Framer | Advanced Framer | Incremental | Low (additive) |
| 6 | Bundle | Monolithic | Code-split | 2-3 days | Low |
| 7 | Auth tokens | localStorage | httpOnly cookies | 1 day | Low |

All replacements are feature-flagged or profile-switchable. No big-bang migrations. Every change can be rolled back.

---
