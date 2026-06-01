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

type ControlDbProvider = () => DbWithTransaction;

type ContextWithUser = { user?: { organizationId?: string } | null };

async function executeTenantSet(tx: DbTransactionCtx, tenantId: string): Promise<void> {
  const { sql } = await import('drizzle-orm');
  await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
}

/**
 * Wrap a function in a tenant-scoped transaction that sets `app.tenant_id`
 * (consumed by Postgres RLS policies) for the duration of the callback.
 *
 * The control DB is injected (dependency inversion) so that `@uaip/middleware`
 * never imports `@uaip/shared-services` — that edge would create a build cycle
 * since shared-services already depends on middleware.
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

export function createTenantMiddlewarePlugin(getControlDb: ControlDbProvider): Elysia {
  return new Elysia({ name: 'tenant-middleware' }).derive(
    // @ts-expect-error -- Elysia middleware injects user but TS cannot infer through derive generics
    (context: ContextWithUser) => {
      const setTenantContext = async <T>(fn: TenantFn<T>): Promise<T> => {
        const tenantId = context.user?.organizationId;
        if (!tenantId) {
          logger.warn(TENANT_CONTEXT_MISSING, { hasUser: !!context.user });
          return fn();
        }
        return withTenant(getControlDb(), tenantId, fn);
      };
      return { setTenantContext };
    }
  );
}
