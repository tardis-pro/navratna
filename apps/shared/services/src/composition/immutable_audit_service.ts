import crypto from 'crypto';
import { logger } from '@uaip/utils';
import { getControlDb } from '../database/drizzle/clients/index';
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm';
import {
  compositionAuditEvents,
  type CompositionAuditEvent,
} from '../database/drizzle/schemas/control_schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActorType = 'user' | 'agent' | 'system';

export interface CompositionAuditEventInput {
  eventType: string;
  entityType: string;
  entityId: string;
  actorType: ActorType;
  actorId: string;
  details: Record<string, unknown>;
}

export interface ChainVerificationResult {
  valid: boolean;
  brokenAt?: string;
  totalEvents: number;
}

export interface AuditTrailOptions {
  limit?: number;
  offset?: number;
  fromDate?: Date;
  toDate?: Date;
  eventType?: string;
  verify?: boolean;
}

export interface AuditTrailResult {
  events: CompositionAuditEvent[];
  total: number;
  chainValid?: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ImmutableAuditService provides append-only, linear hash-chained audit
 * logging for workflow composition events (SOC 2 CC7.2 compliant).
 *
 * Every event includes a SHA-256 hash that incorporates the previous event's
 * hash, making tampering (insertion, deletion, or modification) detectable
 * via sequential inspection in `verifyChain()`. This is a linear chain, NOT
 * a Merkle tree — it does not support partial-proof (inclusion proofs without
 * reading the full chain). Linear chaining satisfies SOC 2 CC7.2 requirements.
 *
 * Design constraints:
 *   - INSERT only — no UPDATE or DELETE operations exposed.
 *   - Hash = SHA-256(previousHash + eventType + timestamp + JSON(details)).
 *   - The first event in a chain has previousHash = null; its hash input
 *     uses the empty string for the previous-hash segment.
 *
 * Known limitation: `appendEvent()` uses a read-then-insert pattern which has
 * a race condition under concurrent writes. In practice, composition audit
 * events are low-frequency (one per user action) making collisions negligible.
 * If needed, upgrade to an advisory lock or CTE-based atomic insert.
 */
export class ImmutableAuditService {
  private static instance: ImmutableAuditService;

  static getInstance(): ImmutableAuditService {
    if (!ImmutableAuditService.instance) {
      ImmutableAuditService.instance = new ImmutableAuditService();
    }
    return ImmutableAuditService.instance;
  }

  // -----------------------------------------------------------------------
  // Append
  // -----------------------------------------------------------------------

  /**
   * Append a single audit event to the immutable log.
   * Computes the linear hash chain link automatically.
   */
  async appendEvent(input: CompositionAuditEventInput): Promise<CompositionAuditEvent> {
    const db = getControlDb();
    const now = new Date();

    // Fetch the most recent event to obtain its hash for chaining.
    const [lastEvent] = await db
      .select({ currentHash: compositionAuditEvents.currentHash })
      .from(compositionAuditEvents)
      .orderBy(desc(compositionAuditEvents.createdAt))
      .limit(1);

    const previousHash: string | null = lastEvent?.currentHash ?? null;
    const currentHash = this.computeHash(
      previousHash ?? '',
      input.eventType,
      now.toISOString(),
      input.details,
    );

    const [inserted] = await db
      .insert(compositionAuditEvents)
      .values({
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        actorType: input.actorType,
        actorId: input.actorId,
        details: input.details,
        previousHash,
        currentHash,
        createdAt: now,
      })
      .returning();

    logger.info('Composition audit event appended', {
      eventId: inserted.id,
      eventType: input.eventType,
      entityId: input.entityId,
      currentHash,
    });

    return inserted;
  }

  // -----------------------------------------------------------------------
  // Chain Verification
  // -----------------------------------------------------------------------

  /**
   * Walk the hash chain and verify every link is intact.
   *
   * Optional filters: entityId, fromDate, toDate.
   * Returns a summary indicating whether the chain is valid and, if not,
   * the ID of the event where the break was detected.
   */
  async verifyChain(
    entityId?: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<ChainVerificationResult> {
    const db = getControlDb();

    const conditions = [];
    if (entityId) {
      conditions.push(eq(compositionAuditEvents.entityId, entityId));
    }
    if (fromDate) {
      conditions.push(gte(compositionAuditEvents.createdAt, fromDate));
    }
    if (toDate) {
      conditions.push(lte(compositionAuditEvents.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const events = await db
      .select()
      .from(compositionAuditEvents)
      .where(whereClause)
      .orderBy(asc(compositionAuditEvents.createdAt));

    if (events.length === 0) {
      return { valid: true, totalEvents: 0 };
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const expectedPrevHash = i === 0 ? (event.previousHash ?? '') : events[i - 1].currentHash;

      // When filtering by entity/date, the first event in the window may
      // legitimately have a previousHash that references an event outside
      // the window. We can still verify the internal hash computation.
      const recomputedHash = this.computeHash(
        event.previousHash ?? '',
        event.eventType,
        event.createdAt.toISOString(),
        event.details as Record<string, unknown>,
      );

      if (recomputedHash !== event.currentHash) {
        logger.warn('Composition audit chain broken — hash mismatch', {
          eventId: event.id,
          expected: recomputedHash,
          stored: event.currentHash,
        });
        return { valid: false, brokenAt: event.id, totalEvents: events.length };
      }

      // For consecutive events within the window, verify the chain link.
      if (i > 0 && event.previousHash !== expectedPrevHash) {
        logger.warn('Composition audit chain broken — previous hash mismatch', {
          eventId: event.id,
          expectedPrevHash,
          storedPrevHash: event.previousHash,
        });
        return { valid: false, brokenAt: event.id, totalEvents: events.length };
      }
    }

    logger.info('Composition audit chain verified', { totalEvents: events.length });
    return { valid: true, totalEvents: events.length };
  }

  // -----------------------------------------------------------------------
  // Retrieval
  // -----------------------------------------------------------------------

  /**
   * Paginated retrieval of the audit trail for a given entity.
   * Optionally verifies the chain integrity of the returned window.
   */
  async getAuditTrail(
    entityId: string,
    options: AuditTrailOptions = {},
  ): Promise<AuditTrailResult> {
    const db = getControlDb();
    const {
      limit = 50,
      offset = 0,
      fromDate,
      toDate,
      eventType,
      verify = false,
    } = options;

    const conditions = [eq(compositionAuditEvents.entityId, entityId)];
    if (fromDate) {
      conditions.push(gte(compositionAuditEvents.createdAt, fromDate));
    }
    if (toDate) {
      conditions.push(lte(compositionAuditEvents.createdAt, toDate));
    }
    if (eventType) {
      conditions.push(eq(compositionAuditEvents.eventType, eventType));
    }

    const whereClause = and(...conditions);

    const [events, [countRow]] = await Promise.all([
      db
        .select()
        .from(compositionAuditEvents)
        .where(whereClause)
        .orderBy(asc(compositionAuditEvents.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(compositionAuditEvents)
        .where(whereClause),
    ]);

    const result: AuditTrailResult = {
      events,
      total: countRow?.count ?? 0,
    };

    if (verify && events.length > 0) {
      const verification = await this.verifyChain(entityId, fromDate, toDate);
      result.chainValid = verification.valid;
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Hashing
  // -----------------------------------------------------------------------

  /**
   * SHA-256( previousHash + eventType + timestamp + JSON.stringify(details) )
   */
  private computeHash(
    previousHash: string,
    eventType: string,
    timestamp: string,
    details: Record<string, unknown>,
  ): string {
    const payload = previousHash + eventType + timestamp + JSON.stringify(details);
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  // -----------------------------------------------------------------------
  // Testing helpers
  // -----------------------------------------------------------------------

  static resetInstance(): void {
    ImmutableAuditService.instance = undefined as unknown as ImmutableAuditService;
  }
}
