# Docker Debug Learnings

## Issue: @uaip/infra module not found in Docker containers

### Root Cause

When building `uaip-backend-base` Docker image, the pnpm workspace symlinks for `@uaip/*` packages in `backend/shared/infra` and other shared packages were not being created properly. The `COPY` commands in the Dockerfile were overwriting the node_modules symlinks with actual directories.

### Key Discovery

- Docker containers use **hot reload** with `bun --hot src/index.ts`
- **No need to rebuild the image** for code changes - just restart the container
- The image only needs rebuilding when Dockerfile changes or when shared package builds change

### Solution Applied

1. **Dockerfile.base entrypoint fix** - Create `@uaip/infra` symlink at runtime:

```bash
if [ ! -e "/app/node_modules/@uaip/infra" ]; then
  mkdir -p /app/node_modules/@uaip
  ln -sf /app/backend/shared/infra/dist /app/node_modules/@uaip/infra
  echo "Created @uaip/infra symlink"
fi
```

2. **UnifiedToolRegistry constructor fix** - Pass `eventBusService` from BaseService:

```typescript
constructor(eventBusService: EventBusService) {
  this.databaseService = DatabaseService.getInstance();
  this.eventBusService = eventBusService;
}
```

3. **capability-registry/src/index.ts** - Pass `this.eventBusService` to UnifiedToolRegistry:

```typescript
this.unifiedToolRegistry = new UnifiedToolRegistry(this.eventBusService);
```

4. **tsconfig.json fix** - Use barrel export instead of src paths:

```json
"@uaip/infra": ["shared/infra/dist"]  // was: ["shared/infra/src"]
// Removed @uaip/infra/* path to let package.json exports work
```

### Commands to Rebuild Backend (when needed)

```bash
# Clean rebuild (removes containers, rebuilds with --no-cache)
./dev-start.sh rebuild-backend --clean

# Quick rebuild (uses cache)
./dev-start.sh rebuild-backend

# Just restart containers with existing image
docker-compose restart security-gateway capability-registry
```

### Environment Variables That Work

```bash
RABBITMQ_URL=amqp://uaip_user:uaip_password@localhost:5672
OPENAI_API_URL=http://192.168.29.70:1234/v1
OPENAI_API_KEY=dummy-key-for-local-inference
POSTGRES_USER=uaip_user
POSTGRES_PASSWORD=uaip_password
REDIS_PASSWORD=uaip_redis_password
```

### Current Service Status (5/7 healthy)

| Service                  | Port | Status                            |
| ------------------------ | ---- | --------------------------------- |
| agent-intelligence       | 3001 | ✅ Healthy                        |
| orchestration-pipeline   | 3002 | ✅ Healthy                        |
| capability-registry      | 3003 | ❌ Fails (tools property missing) |
| security-gateway         | 3004 | ✅ Healthy                        |
| discussion-orchestration | 3005 | ✅ Healthy                        |
| artifact-service         | 3006 | ✅ Healthy                        |
| llm-service              | 3007 | ✅ Healthy                        |

### Known Issues

1. **capability-registry fails to start**
   - Error: `Property 'tools' does not exist on type 'DatabaseService'`
   - The UnifiedToolRegistry expects a `tools` repository on DatabaseService
   - This is a deeper architectural mismatch between @uaip/infra.DatabaseService and what capability-registry expects
   - Workaround: The service is not required for basic auth/agent/orchestration/discussion functionality

### Files Modified

- `Dockerfile.base` - Symlink creation in entrypoint
- `dev-start.sh` - Added `--clean` flag for clean rebuilds
- `backend/tsconfig.json` - Changed @uaip/infra path from src to dist
- `backend/services/capability-registry/tsconfig.json` - Removed @uaip/infra/\* paths
- `backend/services/capability-registry/src/services/unified-tool-registry.ts` - Fixed constructor
- `backend/services/capability-registry/src/index.ts` - Pass eventBusService dependency
- `packages/contracts/tsconfig.json` - Created missing config
