# PM-160 BLOCKED: enterprise_database.ts — Neo4j/Qdrant/Redis connections throw not-implemented

## Status: BLOCKED — Infrastructure Dependency

## Reason

`apps/shared/services/src/enterprise/enterprise_database.ts` has `throw new Error('Neo4j/Qdrant/Redis connections not yet implemented')` at lines 230, 244, 258. These are in the enterprise multi-tenant database access matrix.

This is part of the enterprise compliance layer (`EnterpriseDatabase extends DatabaseService`) which provides audited, tenant-scoped database access. The Neo4j, Qdrant, and Redis paths are not implemented because:

1. Enterprise database access matrix is a newer abstraction layer
2. Multi-tenant connection string routing requires infrastructure config not yet defined
3. The non-enterprise `ToolGraphDatabase`, `QdrantService`, `RedisCacheService` from `@uaip/infra` ARE fully implemented and used in production

## Impact

Low — `EnterpriseDatabase` is used by enterprise compliance mode only (BullMQ `complianceMode: true`). The standard database access path (via `@uaip/infra` services directly) works correctly.

## What Would Be Needed

1. Enterprise multi-tenant infrastructure configuration
2. Connection pooling strategy for multi-tenant Neo4j/Qdrant/Redis
3. Enterprise team coordination

## Next Steps

File under "Enterprise Database Multi-Tenancy" epic.
