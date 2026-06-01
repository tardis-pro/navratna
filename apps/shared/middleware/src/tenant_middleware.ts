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

async function resolveControlDb(): Promise<DbWithTransaction> {
  const mod = await import('@uaip/shared-services');
  return (mod as unknown as { getControlDb: () => DbWithTransaction }).getControlDb();
}

async function executeTenantSet(tx: DbTransactionCtx, tenantId: string): Promise<void> {
  const { sql } = await import('drizzle-orm');
  await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
}

type ContextWithUser = { user?: { organizationId?: string } | null };

export const tenantMiddlewarePlugin = new Elysia({ name: 'tenant-middleware' }).derive(
  // @ts-expect-error -- Elysia middleware injects user but TS cannot infer through derive generics
  (context: ContextWithUser) => {
    const setTenantContext = async <T>(fn: TenantFn<T>): Promise<T> => {
      const tenantId = context.user?.organizationId;
      if (!tenantId) {
        logger.warn(TENANT_CONTEXT_MISSING, { hasUser: !!context.user });
        return fn();
      }
      return withTenant(tenantId, fn);
    };
    return { setTenantContext };
  }
);

export async function withTenant<T>(tenantId: string, fn: TenantFn<T>): Promise<T> {
  const db = await resolveControlDb();
  return db.transaction(async (tx) => {
    await executeTenantSet(tx, tenantId);
    return fn();
  });
}
