import { EventBusService } from '../event_bus_service';
import { logger } from '@uaip/utils';
import type { ExecutionGate, ConfidenceProfile, DomainConfidenceProfile } from '@uaip/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_THRESHOLD = 0.5;
const TRUSTED_THRESHOLD = 0.35;
const UNRELIABLE_THRESHOLD = 0.7;
const HIGH_STAKES_BOOST = 0.15;
const MIN_THRESHOLD = 0.2;
const MAX_THRESHOLD = 0.95;
const TRUSTED_ACCURACY_MIN = 0.9;
const TRUSTED_SAMPLE_MIN = 20;
const UNRELIABLE_ACCURACY_MAX = 0.6;
const EMA_ALPHA = 0.15; // Exponential moving average smoothing factor

/**
 * Task types considered high-stakes, requiring elevated confidence.
 */
const HIGH_STAKES_TASK_TYPES = new Set([
  'deploy',
  'deployment',
  'delete',
  'deletion',
  'financial',
  'payment',
  'security',
  'production',
  'infrastructure',
  'migration',
  'rollback',
]);

/**
 * Domains considered high-stakes. Workflows in these domains always require
 * human approval regardless of the agent's confidence score.
 */
export const HIGH_STAKES_DOMAINS = new Set([
  'finance',
  'security',
  'deploy',
  'payment',
  'legal',
  'hr',
]);

// ---------------------------------------------------------------------------
// Database helpers (lazy-loaded to avoid circular imports at module load)
// ---------------------------------------------------------------------------

type ControlDB = import('../database/drizzle/clients/index').ControlDB;

let _controlDb: ControlDB | null = null;

async function getDb(): Promise<ControlDB | null> {
  if (_controlDb) return _controlDb;
  try {
    const { getControlDb } = await import('../database/drizzle/clients/index.js');
    _controlDb = getControlDb();
    return _controlDb;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ConfidenceGatedExecutionService replaces the static 0.5 confidence minimum
 * with dynamic thresholds based on each agent's historical performance per
 * task type. Trusted agents get lower thresholds; unreliable agents get
 * higher ones; high-stakes tasks raise the bar for everyone.
 *
 * PM-256: Profiles are now scoped by domain in addition to agentId + taskType.
 * Each combination of (agentId, taskType, domain) maintains a separate EMA.
 * High-stakes domains always require approval regardless of confidence.
 * Profiles are persisted to the `domain_confidence_profiles` table.
 */
export class ConfidenceGatedExecutionService {
  private static instance: ConfidenceGatedExecutionService;
  private eventBus: EventBusService;

  /** In-memory profiles keyed by `${agentId}::${taskType}::${domain}` */
  private profiles: Map<string, DomainConfidenceProfile> = new Map();

  /** Whether profiles have been loaded from DB */
  private dbLoaded = false;

  constructor(eventBus?: EventBusService) {
    this.eventBus = eventBus ?? EventBusService.getInstance();
  }

  static getInstance(): ConfidenceGatedExecutionService {
    if (!ConfidenceGatedExecutionService.instance) {
      ConfidenceGatedExecutionService.instance = new ConfidenceGatedExecutionService();
    }
    return ConfidenceGatedExecutionService.instance;
  }

  // -------------------------------------------------------------------------
  // DB Persistence — Load & Write-Through
  // -------------------------------------------------------------------------

  /**
   * Load all domain confidence profiles from DB into memory.
   * Safe to call multiple times — only loads once.
   */
  async loadProfilesFromDb(): Promise<void> {
    if (this.dbLoaded) return;

    const db = await getDb();
    if (!db) {
      logger.warn('Control DB not available — skipping profile load from DB');
      return;
    }

    try {
      const { domainConfidenceProfiles } = await import(
        '../database/drizzle/schemas/control_schema'
      );
      const rows = await db.select().from(domainConfidenceProfiles);

      for (const row of rows) {
        const profile: DomainConfidenceProfile = {
          agentId: row.agentId,
          taskType: row.domain, // domain is the scoping dimension
          domain: row.domain,
          historicalAccuracy: parseFloat(row.accuracy),
          sampleSize: row.sampleSize,
          dynamicThreshold: BASE_THRESHOLD,
          lastUpdated: row.updatedAt,
          lastComposedAt: row.lastComposedAt ?? undefined,
        };
        profile.dynamicThreshold = this.computeDynamicThreshold(profile);
        const key = this.profileKey(row.agentId, row.domain, row.domain);
        this.profiles.set(key, profile);
      }

      this.dbLoaded = true;
      logger.info('Domain confidence profiles loaded from DB', { count: rows.length });
    } catch (error) {
      logger.warn('Failed to load domain confidence profiles from DB', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Write-through: persist a single profile to DB.
   */
  private async persistProfile(profile: DomainConfidenceProfile): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const { domainConfidenceProfiles } = await import(
        '../database/drizzle/schemas/control_schema'
      );
      const { eq, and } = await import('drizzle-orm');

      // Upsert: try update first, insert if not found
      const existing = await db
        .select({ id: domainConfidenceProfiles.id })
        .from(domainConfidenceProfiles)
        .where(
          and(
            eq(domainConfidenceProfiles.agentId, profile.agentId),
            eq(domainConfidenceProfiles.domain, profile.domain)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(domainConfidenceProfiles)
          .set({
            accuracy: String(profile.historicalAccuracy),
            sampleSize: profile.sampleSize,
            lastComposedAt: profile.lastComposedAt ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(domainConfidenceProfiles.agentId, profile.agentId),
              eq(domainConfidenceProfiles.domain, profile.domain)
            )
          );
      } else {
        await db.insert(domainConfidenceProfiles).values({
          agentId: profile.agentId,
          domain: profile.domain,
          accuracy: String(profile.historicalAccuracy),
          sampleSize: profile.sampleSize,
          lastComposedAt: profile.lastComposedAt ?? null,
        });
      }
    } catch (error) {
      logger.warn('Failed to persist domain confidence profile', {
        agentId: profile.agentId,
        domain: profile.domain,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Gate Check
  // -------------------------------------------------------------------------

  /**
   * Check whether the agent's confidence passes the dynamic execution gate
   * for the given task type and domain.
   *
   * If the domain is high-stakes, the gate always fails (requires approval).
   */
  async checkGate(
    agentId: string,
    taskType: string,
    confidence: number,
    domain: string = 'general'
  ): Promise<ExecutionGate> {
    const profile = this.getProfile(agentId, taskType, domain);
    const requiredConfidence = this.computeDynamicThreshold(profile);

    // Update the stored threshold on the profile
    profile.dynamicThreshold = requiredConfidence;

    // High-stakes domains always require approval — gate never passes autonomously
    const isHighStakesDomain = HIGH_STAKES_DOMAINS.has(domain.toLowerCase());
    const passed = isHighStakesDomain ? false : confidence >= requiredConfidence;

    const reason = this.buildGateReason(
      passed,
      confidence,
      requiredConfidence,
      profile,
      taskType,
      domain
    );

    const gate: ExecutionGate = {
      agentId,
      taskType,
      requiredConfidence,
      actualConfidence: confidence,
      passed,
      reason,
    };

    logger.info('Confidence gate checked', {
      agentId,
      taskType,
      domain,
      confidence,
      requiredConfidence,
      passed,
      isHighStakesDomain,
    });

    // Publish gate result for observability
    try {
      await this.eventBus.publish('confidence.gate.checked', {
        gate,
        domain,
        profile: {
          historicalAccuracy: profile.historicalAccuracy,
          sampleSize: profile.sampleSize,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.warn('Failed to publish confidence gate event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return gate;
  }

  // -------------------------------------------------------------------------
  // Dynamic Threshold Computation
  // -------------------------------------------------------------------------

  /**
   * Compute a dynamic confidence threshold based on the agent's history.
   *
   * Formula:
   * - Base: 0.5
   * - Trusted agent (accuracy > 0.9 AND sampleSize > 20): lower to 0.35
   * - Unreliable agent (accuracy < 0.6): raise to 0.7
   * - High-stakes task: raise by 0.15
   * - Clamp to [0.2, 0.95]
   */
  computeDynamicThreshold(profile: ConfidenceProfile): number {
    let threshold = BASE_THRESHOLD;

    // Adjust based on historical performance
    if (
      profile.historicalAccuracy >= TRUSTED_ACCURACY_MIN &&
      profile.sampleSize >= TRUSTED_SAMPLE_MIN
    ) {
      // Trusted agent — lower the threshold
      threshold = TRUSTED_THRESHOLD;
    } else if (profile.historicalAccuracy < UNRELIABLE_ACCURACY_MAX && profile.sampleSize > 0) {
      // Unreliable agent — raise the threshold
      threshold = UNRELIABLE_THRESHOLD;
    }

    // High-stakes tasks raise the bar
    if (this.isHighStakes(profile.taskType)) {
      threshold += HIGH_STAKES_BOOST;
    }

    // Clamp to valid range
    threshold = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, threshold));

    return threshold;
  }

  // -------------------------------------------------------------------------
  // Profile Management
  // -------------------------------------------------------------------------

  /**
   * Update the agent's confidence profile after task completion using
   * exponential moving average for the accuracy metric.
   */
  async updateProfile(
    agentId: string,
    taskType: string,
    wasCorrect: boolean,
    domain: string = 'general'
  ): Promise<void> {
    const profile = this.getProfile(agentId, taskType, domain);
    const outcome = wasCorrect ? 1 : 0;

    if (profile.sampleSize === 0) {
      // First observation — use it directly
      profile.historicalAccuracy = outcome;
    } else {
      // Exponential moving average update
      profile.historicalAccuracy =
        EMA_ALPHA * outcome + (1 - EMA_ALPHA) * profile.historicalAccuracy;
    }

    profile.sampleSize += 1;
    profile.dynamicThreshold = this.computeDynamicThreshold(profile);
    profile.lastUpdated = new Date();
    profile.lastComposedAt = new Date();

    const key = this.profileKey(agentId, taskType, domain);
    this.profiles.set(key, profile);

    logger.info('Confidence profile updated', {
      agentId,
      taskType,
      domain,
      wasCorrect,
      newAccuracy: profile.historicalAccuracy,
      sampleSize: profile.sampleSize,
      dynamicThreshold: profile.dynamicThreshold,
    });

    // Write-through to DB
    await this.persistProfile(profile);

    // Persist via event bus for downstream consumers
    try {
      await this.eventBus.publish('confidence.profile.updated', {
        profile: { ...profile },
        domain,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.warn('Failed to publish confidence profile update', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get an agent's confidence profile for a specific task type and domain.
   * Returns a default profile if none exists.
   */
  getProfile(agentId: string, taskType: string, domain: string = 'general'): DomainConfidenceProfile {
    const key = this.profileKey(agentId, taskType, domain);
    const existing = this.profiles.get(key);

    if (existing) {
      return existing;
    }

    // Create default profile for unknown agent/task/domain combinations
    const defaultProfile: DomainConfidenceProfile = {
      agentId,
      taskType,
      domain,
      historicalAccuracy: 0.5, // Neutral starting point
      sampleSize: 0,
      dynamicThreshold: this.isHighStakes(taskType)
        ? BASE_THRESHOLD + HIGH_STAKES_BOOST
        : BASE_THRESHOLD,
      lastUpdated: new Date(),
    };

    this.profiles.set(key, defaultProfile);
    return defaultProfile;
  }

  /**
   * Get all profiles for a specific agent across all task types and domains.
   */
  getAgentProfiles(agentId: string): DomainConfidenceProfile[] {
    const result: DomainConfidenceProfile[] = [];

    for (const [key, profile] of this.profiles) {
      if (key.startsWith(`${agentId}::`)) {
        result.push({ ...profile });
      }
    }

    return result;
  }

  /**
   * Get all profiles for a specific agent filtered by domain.
   */
  getAgentDomainProfiles(agentId: string, domain: string): DomainConfidenceProfile[] {
    const result: DomainConfidenceProfile[] = [];

    for (const [, profile] of this.profiles) {
      if (profile.agentId === agentId && profile.domain === domain) {
        result.push({ ...profile });
      }
    }

    return result;
  }

  /**
   * Get all profiles across all agents and task types.
   */
  getAllProfiles(): DomainConfidenceProfile[] {
    return Array.from(this.profiles.values()).map((p) => ({ ...p }));
  }

  /**
   * Reset an agent's profile for a specific task type and domain.
   */
  resetProfile(agentId: string, taskType: string, domain: string = 'general'): void {
    const key = this.profileKey(agentId, taskType, domain);
    this.profiles.delete(key);

    logger.info('Confidence profile reset', { agentId, taskType, domain });
  }

  /**
   * Clear all profiles.
   */
  clearAllProfiles(): void {
    this.profiles.clear();
    this.dbLoaded = false;
    logger.info('All confidence profiles cleared');
  }

  /**
   * Check whether a domain is classified as high-stakes.
   */
  isHighStakesDomain(domain: string): boolean {
    return HIGH_STAKES_DOMAINS.has(domain.toLowerCase());
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Generate a composite key for the profiles map.
   * Key format: `${agentId}::${taskType}::${domain}`
   */
  private profileKey(agentId: string, taskType: string, domain: string): string {
    return `${agentId}::${taskType}::${domain}`;
  }

  /**
   * Determine whether a task type is high-stakes.
   */
  private isHighStakes(taskType: string): boolean {
    return HIGH_STAKES_TASK_TYPES.has(taskType.toLowerCase());
  }

  /**
   * Build a human-readable reason for the gate decision.
   */
  private buildGateReason(
    passed: boolean,
    actual: number,
    required: number,
    profile: ConfidenceProfile,
    taskType: string,
    domain: string
  ): string {
    const parts: string[] = [];

    // High-stakes domain override
    if (HIGH_STAKES_DOMAINS.has(domain.toLowerCase())) {
      parts.push(
        `Domain "${domain}" is high-stakes — human approval required regardless of confidence.`
      );
    }

    if (passed) {
      parts.push(
        `Confidence ${actual.toFixed(2)} meets the dynamic threshold of ${required.toFixed(2)}.`
      );
    } else if (!HIGH_STAKES_DOMAINS.has(domain.toLowerCase())) {
      parts.push(
        `Confidence ${actual.toFixed(2)} is below the dynamic threshold of ${required.toFixed(2)}.`
      );
    }

    if (profile.sampleSize === 0) {
      parts.push('No historical data available; using default threshold.');
    } else if (
      profile.historicalAccuracy >= TRUSTED_ACCURACY_MIN &&
      profile.sampleSize >= TRUSTED_SAMPLE_MIN
    ) {
      parts.push(
        `Agent is trusted (accuracy: ${(profile.historicalAccuracy * 100).toFixed(1)}%, samples: ${profile.sampleSize}). Threshold lowered.`
      );
    } else if (profile.historicalAccuracy < UNRELIABLE_ACCURACY_MAX) {
      parts.push(
        `Agent has low accuracy (${(profile.historicalAccuracy * 100).toFixed(1)}%). Threshold raised.`
      );
    }

    if (this.isHighStakes(taskType)) {
      parts.push(`High-stakes task type "${taskType}" adds +${HIGH_STAKES_BOOST} to threshold.`);
    }

    return parts.join(' ');
  }
}
