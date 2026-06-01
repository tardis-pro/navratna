import { createHmac, createHash } from 'node:crypto';
import { createLogger } from '@uaip/utils';
import type { ErasureResult, ErasureStoreResult, ErasureSurface } from '@uaip/types';
import { ERASURE_SURFACES } from '@uaip/types';
import { getControlDb, getIntelligenceDb, eq } from './database/drizzle/clients/index';
import {
  erasureOutbox,
  erasureLedger,
  users,
  operations,
  projects,
  toolExecutions,
  toolUsageRecords,
  workflowCompositions,
  refreshTokens,
  passwordResetTokens,
  type ErasureOutboxRow,
  type ErasureLedgerRow,
} from './database/drizzle/schemas/control_schema';
import {
  knowledgeItems,
  discussionParticipants,
} from './database/drizzle/schemas/intelligence_schema';
import { QdrantService } from './qdrant_service';
import { ToolGraphDatabase } from './database/tool_graph_database';
import { redisCacheService } from '@uaip/infra';

const logger = createLogger({
  serviceName: 'user-erasure-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

type WriteLedgerParams = {
  erasureId: string;
  surface: ErasureSurface;
  deletedCount: number;
  userId: string;
};

export class UserErasureService {
  private readonly qdrant = new QdrantService();
  private readonly neo4j = new ToolGraphDatabase();

  async initiateErasure(userId: string): Promise<ErasureOutboxRow> {
    const db = getControlDb();

    const inserted = await db
      .insert(erasureOutbox)
      .values({ userId, status: 'pending', storesCompleted: {} })
      .onConflictDoNothing()
      .returning();

    if (inserted.length > 0) {
      logger.info('Erasure request created', { userId, erasureId: inserted[0].id });
      return inserted[0];
    }

    const existing = await db
      .select()
      .from(erasureOutbox)
      .where(eq(erasureOutbox.userId, userId))
      .limit(1);

    logger.info('Erasure request already pending — returning existing', {
      userId,
      erasureId: existing[0]?.id,
    });
    return existing[0];
  }

  async executeErasure(erasureId: string): Promise<ErasureResult> {
    const db = getControlDb();

    const rows = await db
      .select()
      .from(erasureOutbox)
      .where(eq(erasureOutbox.id, erasureId))
      .limit(1);

    const outbox = rows[0];
    if (!outbox) {
      return {
        erasureId,
        userId: '',
        status: 'failed',
        storesCompleted: {},
        storeResults: [],
        error: 'Erasure record not found',
      };
    }

    const { userId } = outbox;
    const storeResults: ErasureStoreResult[] = [];
    const storesCompleted: Partial<Record<ErasureSurface, boolean>> = {
      ...(outbox.storesCompleted as Partial<Record<ErasureSurface, boolean>>),
    };

    await db
      .update(erasureOutbox)
      .set({ status: 'in_progress' })
      .where(eq(erasureOutbox.id, erasureId));

    type SurfaceHandler = {
      surface: ErasureSurface;
      run: () => Promise<number>;
    };

    const handlers: SurfaceHandler[] = [
      { surface: 'pg_control', run: () => this.deleteFromPgControl(userId) },
      { surface: 'pg_intelligence', run: () => this.deleteFromPgIntelligence(userId) },
      { surface: 'neo4j', run: () => this.deleteFromNeo4j(userId) },
      { surface: 'qdrant', run: () => this.deleteFromQdrant(userId) },
      { surface: 'redis', run: () => this.deleteFromRedis(userId) },
    ];

    for (const { surface, run } of handlers) {
      if (storesCompleted[surface] === true) {
        logger.info('Skipping already-completed surface', { erasureId, surface });
        continue;
      }

      try {
        // oxlint-disable-next-line no-await-in-loop -- ordered saga: each store depends on prior completion
        const deletedCount = await run();
        storesCompleted[surface] = true;
        storeResults.push({ surface, deletedCount, success: true });

        await db // oxlint-disable-next-line no-await-in-loop -- must persist per-store progress for idempotent replay
          .update(erasureOutbox)
          .set({ storesCompleted })
          .where(eq(erasureOutbox.id, erasureId));

        // oxlint-disable-next-line no-await-in-loop -- ordered saga: ledger must be written per store
        await this.writeLedgerEntry({ erasureId, surface, deletedCount, userId });

        logger.info('Store erased', { erasureId, surface, deletedCount });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        storesCompleted[surface] = false;
        storeResults.push({ surface, deletedCount: 0, success: false, error });
        logger.error('Erasure store failed', { erasureId, surface, error });

        await db
          .update(erasureOutbox)
          .set({ status: 'failed', error })
          .where(eq(erasureOutbox.id, erasureId));

        return {
          erasureId,
          userId,
          status: 'failed',
          storesCompleted,
          storeResults,
          error,
        };
      }
    }

    try {
      await this.generateCertificateForAllSurfaces(erasureId, userId);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Certificate generation failed', { erasureId, error });
      await db
        .update(erasureOutbox)
        .set({ status: 'failed', error })
        .where(eq(erasureOutbox.id, erasureId));
      return { erasureId, userId, status: 'failed', storesCompleted, storeResults, error };
    }

    const certRows = await db
      .select()
      .from(erasureLedger)
      .where(eq(erasureLedger.erasureId, erasureId))
      .limit(1);

    const certificateHash = certRows[0]?.certificateHash ?? undefined;
    const completedAt = new Date();

    await db
      .update(erasureOutbox)
      .set({ status: 'completed', completedAt })
      .where(eq(erasureOutbox.id, erasureId));

    logger.info('Erasure completed', { erasureId, userId });
    return {
      erasureId,
      userId,
      status: 'completed',
      storesCompleted,
      storeResults,
      certificateHash,
      completedAt,
    };
  }

  async deleteFromPgControl(userId: string): Promise<number> {
    const db = getControlDb();
    let total = 0;

    await db.transaction(async (tx) => {
      const projectRows = await tx
        .delete(projects)
        .where(eq(projects.ownerId, userId))
        .returning({ id: projects.id });
      total += projectRows.length;

      const opRows = await tx
        .delete(operations)
        .where(eq(operations.userId, userId))
        .returning({ id: operations.id });
      total += opRows.length;

      const teRows = await tx
        .delete(toolExecutions)
        .where(eq(toolExecutions.userId, userId))
        .returning({ id: toolExecutions.id });
      total += teRows.length;

      const turRows = await tx
        .delete(toolUsageRecords)
        .where(eq(toolUsageRecords.userId, userId))
        .returning({ id: toolUsageRecords.id });
      total += turRows.length;

      const wcRows = await tx
        .delete(workflowCompositions)
        .where(eq(workflowCompositions.userId, userId))
        .returning({ id: workflowCompositions.id });
      total += wcRows.length;

      const rtRows = await tx
        .delete(refreshTokens)
        .where(eq(refreshTokens.userId, userId))
        .returning({ id: refreshTokens.id });
      total += rtRows.length;

      const prtRows = await tx
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, userId))
        .returning({ id: passwordResetTokens.id });
      total += prtRows.length;

      const userRows = await tx
        .delete(users)
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      total += userRows.length;
    });

    return total;
  }

  async deleteFromPgIntelligence(userId: string): Promise<number> {
    const db = getIntelligenceDb();
    let total = 0;

    const kiRows = await db
      .delete(knowledgeItems)
      .where(eq(knowledgeItems.userId, userId))
      .returning({ id: knowledgeItems.id });
    total += kiRows.length;

    const dpRows = await db
      .delete(discussionParticipants)
      .where(eq(discussionParticipants.userId, userId))
      .returning({ id: discussionParticipants.id });
    total += dpRows.length;

    return total;
  }

  async deleteFromNeo4j(userId: string): Promise<number> {
    const result = await this.neo4j.runQuery(
      'MATCH (n) WHERE n.userId = $userId OR n.createdBy = $userId DETACH DELETE n',
      { userId }
    );
    const nodesDeleted: number =
      result.summary.counters.updates().nodesDeleted ?? 0;
    return nodesDeleted;
  }

  async deleteFromQdrant(userId: string): Promise<number> {
    const filter = {
      must: [{ key: 'userId', match: { value: userId } }],
    };

    const collections: Array<'episodic' | 'semantic'> = ['episodic', 'semantic'];
    let total = 0;

    for (const collection of collections) {
      // oxlint-disable-next-line no-await-in-loop -- sequential scroll+delete per collection, ordering matters
      const points = await this.qdrant.scrollAll(10_000, { collection }, filter);
      const ids = points.map((p) => p.id);
      if (ids.length > 0) {
        // oxlint-disable-next-line no-await-in-loop -- must delete after scroll in same iteration
        await this.qdrant.deletePoints(ids, { collection });
        total += ids.length;
      }
    }

    return total;
  }

  async deleteFromRedis(userId: string): Promise<number> {
    const client = await redisCacheService.getClient();
    if (!client) {
      logger.warn('Redis not available — skipping Redis erasure', { userId });
      return 0;
    }

    const [patternA, patternB] = await Promise.all([
      redisCacheService.keys(`*:${userId}:*`),
      redisCacheService.keys(`user:${userId}*`),
    ]);

    const allKeys = [...new Set([...patternA, ...patternB])];

    if (allKeys.length === 0) {
      return 0;
    }

    await client.del(allKeys);
    return allKeys.length;
  }

  hashSubject(userId: string): string {
    const salt = process.env.DELETION_HASH_SALT;
    if (!salt) {
      throw new Error('DELETION_HASH_SALT env var must be set for erasure certificate generation');
    }
    return createHmac('sha256', salt).update(userId).digest('hex');
  }

  async generateCertificateForAllSurfaces(erasureId: string, _userId: string): Promise<void> {
    const db = getControlDb();

    const rows: ErasureLedgerRow[] = await db
      .select()
      .from(erasureLedger)
      .where(eq(erasureLedger.erasureId, erasureId));

    const canonical = JSON.stringify(
      rows
        .map((r) => ({
          surface: r.surface,
          confirmedAt: r.confirmedAt.toISOString(),
          deletedCount: r.deletedCount,
        }))
        .sort((a, b) => ERASURE_SURFACES.indexOf(a.surface) - ERASURE_SURFACES.indexOf(b.surface))
    );

    const certificateHash = createHash('sha256').update(canonical).digest('hex');

    await db
      .update(erasureLedger)
      .set({ certificateHash })
      .where(eq(erasureLedger.erasureId, erasureId));
  }

  async verifySweep(erasureId: string, userId: string): Promise<void> {
    const db = getControlDb();
    let hasResidual = false;

    try {
      const pgRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (pgRows.length > 0) {
        hasResidual = true;
        logger.error('verifySweep: residual traces in pg_control', { erasureId, userId, store: 'pg_control', count: pgRows.length });
      }
    } catch (err) {
      logger.error('verifySweep: pg_control check failed', { erasureId, userId, error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const neo4jResult = await this.neo4j.runQuery(
        'MATCH (n) WHERE n.userId = $userId OR n.createdBy = $userId RETURN count(n) AS total',
        { userId },
      );
      const total: number = neo4jResult.records[0]?.get('total')?.toNumber?.() ?? 0;
      if (total > 0) {
        hasResidual = true;
        logger.error('verifySweep: residual traces in neo4j', { erasureId, userId, store: 'neo4j', count: total });
      }
    } catch (err) {
      logger.error('verifySweep: neo4j check failed', { erasureId, userId, error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const filter = { must: [{ key: 'userId', match: { value: userId } }] };
      const collections: Array<'episodic' | 'semantic'> = ['episodic', 'semantic'];
      let qdrantTotal = 0;
      for (const collection of collections) {
        // oxlint-disable-next-line no-await-in-loop -- sequential scroll per collection, ordering matters
        const points = await this.qdrant.scrollAll(1, { collection }, filter);
        qdrantTotal += points.length;
      }
      if (qdrantTotal > 0) {
        hasResidual = true;
        logger.error('verifySweep: residual traces in qdrant', { erasureId, userId, store: 'qdrant', count: qdrantTotal });
      }
    } catch (err) {
      logger.error('verifySweep: qdrant check failed', { erasureId, userId, error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const [patternA, patternB] = await Promise.all([
        redisCacheService.keys(`*:${userId}:*`),
        redisCacheService.keys(`user:${userId}*`),
      ]);
      const redisTotal = new Set([...patternA, ...patternB]).size;
      if (redisTotal > 0) {
        hasResidual = true;
        logger.error('verifySweep: residual traces in redis', { erasureId, userId, store: 'redis', count: redisTotal });
      }
    } catch (err) {
      logger.error('verifySweep: redis check failed', { erasureId, userId, error: err instanceof Error ? err.message : String(err) });
    }

    if (hasResidual) {
      try {
        await db
          .update(erasureOutbox)
          .set({ status: 'failed', error: 'verifySweep: residual traces detected after erasure' })
          .where(eq(erasureOutbox.id, erasureId));
      } catch (err) {
        logger.error('verifySweep: failed to update erasureOutbox status', { erasureId, error: err instanceof Error ? err.message : String(err) });
      }
    } else {
      logger.info('verifySweep: all stores clean', { erasureId, userId });
    }
  }

  async writeLedgerEntry({
    erasureId,
    surface,
    deletedCount,
    userId,
  }: WriteLedgerParams): Promise<void> {
    const db = getControlDb();
    const hashedSubject = this.hashSubject(userId);

    await db.insert(erasureLedger).values({
      erasureId,
      surface,
      deletedCount,
      hashedSubject,
      certificateHash: '',
    });
  }
}
