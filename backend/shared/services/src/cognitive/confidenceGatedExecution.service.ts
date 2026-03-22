import { EventBusService } from '../eventBusService';
import { logger } from '@uaip/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionGate {
  agentId: string;
  taskType: string;
  requiredConfidence: number; // dynamic threshold
  actualConfidence: number;
  passed: boolean;
  reason: string;
}

export interface ConfidenceProfile {
  agentId: string;
  taskType: string;
  historicalAccuracy: number; // 0-1
  sampleSize: number;
  dynamicThreshold: number;
  lastUpdated: Date;
}

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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ConfidenceGatedExecutionService replaces the static 0.5 confidence minimum
 * with dynamic thresholds based on each agent's historical performance per
 * task type. Trusted agents get lower thresholds; unreliable agents get
 * higher ones; high-stakes tasks raise the bar for everyone.
 */
export class ConfidenceGatedExecutionService {
  private static instance: ConfidenceGatedExecutionService;
  private eventBus: EventBusService;

  /** In-memory profiles keyed by `${agentId}::${taskType}` */
  private profiles: Map<string, ConfidenceProfile> = new Map();

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
  // Gate Check
  // -------------------------------------------------------------------------

  /**
   * Check whether the agent's confidence passes the dynamic execution gate
   * for the given task type.
   */
  async checkGate(agentId: string, taskType: string, confidence: number): Promise<ExecutionGate> {
    const profile = this.getProfile(agentId, taskType);
    const requiredConfidence = this.computeDynamicThreshold(profile);

    // Update the stored threshold on the profile
    profile.dynamicThreshold = requiredConfidence;

    const passed = confidence >= requiredConfidence;

    const reason = this.buildGateReason(passed, confidence, requiredConfidence, profile, taskType);

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
      confidence,
      requiredConfidence,
      passed,
    });

    // Publish gate result for observability
    try {
      await this.eventBus.publish('confidence.gate.checked', {
        gate,
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
  async updateProfile(agentId: string, taskType: string, wasCorrect: boolean): Promise<void> {
    const profile = this.getProfile(agentId, taskType);
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

    const key = this.profileKey(agentId, taskType);
    this.profiles.set(key, profile);

    logger.info('Confidence profile updated', {
      agentId,
      taskType,
      wasCorrect,
      newAccuracy: profile.historicalAccuracy,
      sampleSize: profile.sampleSize,
      dynamicThreshold: profile.dynamicThreshold,
    });

    // Persist via event bus for downstream consumers
    try {
      await this.eventBus.publish('confidence.profile.updated', {
        profile: { ...profile },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.warn('Failed to publish confidence profile update', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get an agent's confidence profile for a specific task type.
   * Returns a default profile if none exists.
   */
  getProfile(agentId: string, taskType: string): ConfidenceProfile {
    const key = this.profileKey(agentId, taskType);
    const existing = this.profiles.get(key);

    if (existing) {
      return existing;
    }

    // Create default profile for unknown agent/task combinations
    const defaultProfile: ConfidenceProfile = {
      agentId,
      taskType,
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
   * Get all profiles for a specific agent across all task types.
   */
  getAgentProfiles(agentId: string): ConfidenceProfile[] {
    const result: ConfidenceProfile[] = [];

    for (const [key, profile] of this.profiles) {
      if (key.startsWith(`${agentId}::`)) {
        result.push({ ...profile });
      }
    }

    return result;
  }

  /**
   * Get all profiles across all agents and task types.
   */
  getAllProfiles(): ConfidenceProfile[] {
    return Array.from(this.profiles.values()).map((p) => ({ ...p }));
  }

  /**
   * Reset an agent's profile for a specific task type.
   */
  resetProfile(agentId: string, taskType: string): void {
    const key = this.profileKey(agentId, taskType);
    this.profiles.delete(key);

    logger.info('Confidence profile reset', { agentId, taskType });
  }

  /**
   * Clear all profiles.
   */
  clearAllProfiles(): void {
    this.profiles.clear();
    logger.info('All confidence profiles cleared');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Generate a composite key for the profiles map.
   */
  private profileKey(agentId: string, taskType: string): string {
    return `${agentId}::${taskType}`;
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
    taskType: string
  ): string {
    const parts: string[] = [];

    if (passed) {
      parts.push(
        `Confidence ${actual.toFixed(2)} meets the dynamic threshold of ${required.toFixed(2)}.`
      );
    } else {
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
