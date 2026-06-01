import { getControlDb } from '../drizzle/clients/index';
import { organizations } from '../../database/drizzle/schemas/control_schema';
import { ADMIN_ORG_ID, ADMIN_ORG_SLUG, ADMIN_ORG_NAME } from '../drizzle/constants';
import { logger } from '@uaip/utils';

export class OrganizationSeed {
  static async seed(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: OrganizationSeed cannot run in production');
    }
    const db = getControlDb();
    await db
      .insert(organizations)
      .values({
        id: ADMIN_ORG_ID,
        name: ADMIN_ORG_NAME,
        slug: ADMIN_ORG_SLUG,
        plan: 'enterprise',
        isActive: true,
      })
      .onConflictDoNothing();
    logger.info('Organization seed complete', { orgId: ADMIN_ORG_ID });
  }
}
