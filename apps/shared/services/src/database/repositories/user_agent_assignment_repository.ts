import { and, eq } from 'drizzle-orm';
import {
  CrossPlaneGuard,
  getControlDb,
  getIntelligencePool,
} from '../drizzle/clients/index';
import { userAgentAssignments } from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';

type UserAgentAssignmentRow = typeof userAgentAssignments.$inferSelect;
type NewUserAgentAssignment = typeof userAgentAssignments.$inferInsert;

/**
 * Grants written by the pre-scoping backfill. They hand out the whole roster so
 * existing users are not stranded, and are revoked once onboarding picks a real
 * one — so this string must match the source the backfill writes.
 */
export const PROVISIONAL_ASSIGNMENT_SOURCE = 'backfill';

export interface AssignManyParams {
  userId: string;
  organizationId: string;
  agentIds: string[];
  assignedBy?: string;
  source?: string;
}

/**
 * Control-plane repository for per-user agent grants.
 *
 * THE ASSIGNMENT ROW IS THE GRANT: authorization is decided by the existence
 * of a (userId, agentId) row here, never by comparing organization ids.
 *
 * `agentId` references intelligence-plane `agents.id` with no DB-level FK —
 * the planes may live on different Postgres hosts, so no SQL statement here
 * may ever reference the `agents` table. Referential integrity is enforced
 * at the application level via CrossPlaneGuard before writes.
 */
export class UserAgentAssignmentRepository {
  private get db() {
    return getControlDb();
  }

  /** Hot path: agent ids granted to a user, called on every agent list request. */
  async findAgentIdsForUser(userId: string, organizationId: string): Promise<string[]> {
    try {
      const rows = await this.db
        .select({ agentId: userAgentAssignments.agentId })
        .from(userAgentAssignments)
        .where(
          and(
            eq(userAgentAssignments.userId, userId),
            eq(userAgentAssignments.organizationId, organizationId)
          )
        );
      return rows.map((row) => row.agentId);
    } catch (error: unknown) {
      logger.error('UserAgentAssignmentRepository.findAgentIdsForUser failed', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Authorization primitive: does a grant row exist for this user, agent AND
   * organization? The org predicate is not redundant — a user who moves tenants
   * (or a grant written under a previous org) must not keep authorizing access
   * in the new one. Authorization is per-tenant, so the lookup is too.
   */
  async hasAssignment(
    userId: string,
    agentId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      const rows = await this.db
        .select({ agentId: userAgentAssignments.agentId })
        .from(userAgentAssignments)
        .where(
          and(
            eq(userAgentAssignments.userId, userId),
            eq(userAgentAssignments.agentId, agentId),
            eq(userAgentAssignments.organizationId, organizationId)
          )
        )
        .limit(1);
      return rows.length > 0;
    } catch (error: unknown) {
      logger.error('UserAgentAssignmentRepository.hasAssignment failed', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Full rows for admin/debug surfaces. */
  async findByUser(userId: string, organizationId: string): Promise<UserAgentAssignmentRow[]> {
    try {
      return await this.db
        .select()
        .from(userAgentAssignments)
        .where(
          and(
            eq(userAgentAssignments.userId, userId),
            eq(userAgentAssignments.organizationId, organizationId)
          )
        );
    } catch (error: unknown) {
      logger.error('UserAgentAssignmentRepository.findByUser failed', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Bulk-grant agents to a user. Idempotent — re-running with the same ids is
   * a no-op thanks to onConflictDoNothing on the (userId, agentId) unique index.
   *
   * Verifies every agent id against the intelligence plane BEFORE inserting;
   * a missing agent throws CROSS_PLANE_FK_VIOLATION and nothing is written.
   */
  async assignMany(params: AssignManyParams): Promise<UserAgentAssignmentRow[]> {
    const { userId, organizationId, agentIds, assignedBy, source } = params;
    if (agentIds.length === 0) return [];

    const uniqueAgentIds = [...new Set(agentIds)];

    try {
      await CrossPlaneGuard.verifyMany(getIntelligencePool(), 'agents', uniqueAgentIds, 'agent');

      const values: NewUserAgentAssignment[] = uniqueAgentIds.map((agentId) => ({
        userId,
        agentId,
        organizationId,
        ...(assignedBy !== undefined ? { assignedBy } : {}),
        ...(source !== undefined ? { source } : {}),
      }));

      return await this.db
        .insert(userAgentAssignments)
        .values(values)
        .onConflictDoNothing({
          target: [userAgentAssignments.userId, userAgentAssignments.agentId],
        })
        .returning();
    } catch (error: unknown) {
      logger.error('UserAgentAssignmentRepository.assignMany failed', {
        userId,
        organizationId,
        agentCount: uniqueAgentIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Install the onboarding-chosen roster and retire the provisional grants.
   *
   * The backfill grants every pre-existing user the FULL roster so nobody is
   * left with an empty list when visibility scoping ships. Onboarding is what
   * narrows it — but assignMany only ever adds, so a user who finished the
   * interview kept all their backfill rows and still saw every agent.
   *
   * Both steps run in one transaction: deleting first would leave the user with
   * no agents at all if the insert then failed.
   *
   * Recommended agents are re-sourced rather than skipped, because a backfill
   * row already exists for most of them — without the update, the delete below
   * would revoke an agent onboarding just chose.
   */
  async replaceProvisionalAssignments(params: AssignManyParams): Promise<UserAgentAssignmentRow[]> {
    const { userId, organizationId, agentIds, assignedBy, source } = params;
    const uniqueAgentIds = [...new Set(agentIds)];
    const grantSource = source ?? 'onboarding';

    try {
      if (uniqueAgentIds.length > 0) {
        await CrossPlaneGuard.verifyMany(getIntelligencePool(), 'agents', uniqueAgentIds, 'agent');
      }

      return await this.db.transaction(async (tx) => {
        let granted: UserAgentAssignmentRow[] = [];

        if (uniqueAgentIds.length > 0) {
          granted = await tx
            .insert(userAgentAssignments)
            .values(
              uniqueAgentIds.map((agentId) => ({
                userId,
                agentId,
                organizationId,
                ...(assignedBy !== undefined ? { assignedBy } : {}),
                source: grantSource,
              }))
            )
            .onConflictDoUpdate({
              target: [userAgentAssignments.userId, userAgentAssignments.agentId],
              set: { source: grantSource },
            })
            .returning();
        }

        await tx
          .delete(userAgentAssignments)
          .where(
            and(
              eq(userAgentAssignments.userId, userId),
              eq(userAgentAssignments.organizationId, organizationId),
              eq(userAgentAssignments.source, PROVISIONAL_ASSIGNMENT_SOURCE)
            )
          );

        return granted;
      });
    } catch (error: unknown) {
      logger.error('UserAgentAssignmentRepository.replaceProvisionalAssignments failed', {
        userId,
        organizationId,
        agentCount: uniqueAgentIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Revoke a single grant. Returns whether a row was removed. */
  async revoke(userId: string, agentId: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(userAgentAssignments)
        .where(
          and(
            eq(userAgentAssignments.userId, userId),
            eq(userAgentAssignments.agentId, agentId)
          )
        );
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('UserAgentAssignmentRepository.revoke failed', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
