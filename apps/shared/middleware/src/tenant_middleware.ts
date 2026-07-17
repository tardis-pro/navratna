import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';

const TENANT_CONTEXT_MISSING = 'withTenant called without tenant context';

type TenantFn<T> = () => Promise<T>;

type DbTransactionCtx = {
  execute: (query: unknown) => Promise<unknown>;
};

type DbWithTransaction = {
  transaction: <T>(fn: (tx: DbTransactionCtx) => Promise<T>) => Promise<T>;
};

type ContextWithUser = { user?: { organizationId?: string } | null };

/**
 * Injected tenant-transaction runner. In production this is
 * `runInTenantTransaction` from @uaip/shared-services, which opens a single
 * intelligence-plane transaction, sets `app.tenant_id`, and binds it into
 * AsyncLocalStorage so every getIntelligenceDb() call inside `fn` uses that
 * connection (so RLS sees the tenant). It is injected rather than imported to
 * avoid a build cycle (@uaip/middleware must not import @uaip/shared-services).
 */
export type TenantRunner = <T>(tenantId: string, fn: TenantFn<T>) => Promise<T>;

async function executeTenantSet(tx: DbTransactionCtx, tenantId: string): Promise<void> {
  const { sql } = await import('drizzle-orm');
  await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
}

/**
 * Low-level helper: run `fn` inside a transaction on the given db with
 * `app.tenant_id` set. Correct only when `fn`'s queries run on `db`'s
 * transaction connection — prefer the AsyncLocalStorage-based
 * `runInTenantTransaction` (shared-services) for request handlers, which routes
 * getIntelligenceDb() automatically.
 */
export async function withTenant<T>(
  db: DbWithTransaction,
  tenantId: string,
  fn: TenantFn<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await executeTenantSet(tx, tenantId);
    return fn();
  });
}

export function createTenantMiddlewarePlugin(runInTenant: TenantRunner): Elysia {
  return new Elysia({ name: 'tenant-middleware' }).derive(
    // @ts-expect-error -- Elysia middleware injects user but TS cannot infer through derive generics
    (context: ContextWithUser) => {
      const setTenantContext = async <T>(fn: TenantFn<T>): Promise<T> => {
        const tenantId = context.user?.organizationId;
        if (!tenantId) {
          logger.warn(TENANT_CONTEXT_MISSING, { hasUser: !!context.user });
          return fn();
        }
        return runInTenant(tenantId, fn);
      };
      return { setTenantContext };
    }
  );
}
