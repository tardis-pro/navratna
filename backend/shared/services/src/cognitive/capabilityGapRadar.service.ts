import { EventBusService } from '../eventBusService';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapabilityAssessment {
  agentId: string;
  requiredCapabilities: string[];
  availableCapabilities: string[];
  gaps: CapabilityGap[];
  overallReadiness: number; // 0-1
  recommendation: 'proceed' | 'augment' | 'delegate' | 'block';
}

export interface CapabilityGap {
  capability: string;
  severity: 'minor' | 'major' | 'critical';
  alternatives: string[]; // agent IDs or tool IDs that have this capability
  workaround?: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes
const EVENT_BUS_TIMEOUT_MS = 5_000;

/**
 * Maps keyword patterns to capability identifiers.
 * Each entry consists of a regex that matches task descriptions and
 * the capability string it implies.
 */
const CAPABILITY_PATTERNS: Array<{ pattern: RegExp; capability: string }> = [
  { pattern: /\b(code|program|implement|develop|refactor|compile)\b/i, capability: 'code_generation' },
  { pattern: /\b(deploy|release|ship|publish|rollout)\b/i, capability: 'deployment' },
  { pattern: /\b(analy[sz]e|evaluate|assess|examine|inspect)\b/i, capability: 'analysis' },
  { pattern: /\b(test|verify|validate|check|assert)\b/i, capability: 'testing' },
  { pattern: /\b(design|architect|plan|blueprint|model)\b/i, capability: 'design' },
  { pattern: /\b(search|find|lookup|query|retrieve)\b/i, capability: 'search' },
  { pattern: /\b(write|document|describe|explain|summarize)\b/i, capability: 'documentation' },
  { pattern: /\b(review|critique|feedback|audit)\b/i, capability: 'review' },
  { pattern: /\b(debug|fix|repair|troubleshoot|diagnose|patch)\b/i, capability: 'debugging' },
  { pattern: /\b(translate|convert|transform|migrate|port)\b/i, capability: 'transformation' },
  { pattern: /\b(monitor|observe|track|alert|watch)\b/i, capability: 'monitoring' },
  { pattern: /\b(security|encrypt|auth|protect|harden)\b/i, capability: 'security' },
  { pattern: /\b(database|sql|query|schema|migrate)\b/i, capability: 'database' },
  { pattern: /\b(api|endpoint|rest|graphql|grpc)\b/i, capability: 'api_development' },
  { pattern: /\b(infra|infrastructure|terraform|cloud|aws|gcp|azure)\b/i, capability: 'infrastructure' },
];

/**
 * Capabilities considered critical — a gap here blocks execution.
 */
const CRITICAL_CAPABILITIES = new Set([
  'deployment',
  'security',
  'infrastructure',
  'database',
]);

/**
 * Capabilities considered major — a gap here degrades quality significantly.
 */
const MAJOR_CAPABILITIES = new Set([
  'code_generation',
  'testing',
  'debugging',
  'api_development',
]);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * CapabilityGapRadarService detects missing capabilities before wasting
 * tokens on tasks the agent cannot complete. It assesses required vs.
 * available capabilities and recommends proceed / augment / delegate / block.
 */
export class CapabilityGapRadarService {
  private static instance: CapabilityGapRadarService;
  private eventBus: EventBusService;

  /** Capability cache keyed by agentId */
  private capabilityCache: Map<string, CacheEntry<string[]>> = new Map();

  /** Alternatives cache keyed by capability name */
  private alternativesCache: Map<string, CacheEntry<string[]>> = new Map();

  constructor(eventBus?: EventBusService) {
    this.eventBus = eventBus ?? EventBusService.getInstance();
  }

  static getInstance(): CapabilityGapRadarService {
    if (!CapabilityGapRadarService.instance) {
      CapabilityGapRadarService.instance = new CapabilityGapRadarService();
    }
    return CapabilityGapRadarService.instance;
  }

  // -------------------------------------------------------------------------
  // Core Assessment
  // -------------------------------------------------------------------------

  /**
   * Assess whether an agent has the capabilities required for a task.
   */
  async assess(
    agentId: string,
    taskDescription: string,
  ): Promise<CapabilityAssessment> {
    logger.info('Capability assessment started', { agentId, taskDescription });

    const requiredCapabilities = this.extractRequiredCapabilities(taskDescription);
    const availableCapabilities = await this.getAgentCapabilities(agentId);

    const readiness = this.computeReadiness(requiredCapabilities, availableCapabilities);
    const gaps = await this.identifyGaps(requiredCapabilities, availableCapabilities);
    const recommendation = this.determineRecommendation(gaps, readiness);

    const assessment: CapabilityAssessment = {
      agentId,
      requiredCapabilities,
      availableCapabilities,
      gaps,
      overallReadiness: readiness,
      recommendation,
    };

    logger.info('Capability assessment completed', {
      agentId,
      readiness,
      recommendation,
      gapCount: gaps.length,
    });

    return assessment;
  }

  // -------------------------------------------------------------------------
  // Capability Extraction
  // -------------------------------------------------------------------------

  /**
   * Extract required capabilities from a task description using pattern matching.
   */
  extractRequiredCapabilities(taskDescription: string): string[] {
    const capabilities = new Set<string>();

    for (const { pattern, capability } of CAPABILITY_PATTERNS) {
      if (pattern.test(taskDescription)) {
        capabilities.add(capability);
      }
    }

    // If no capabilities detected, default to 'analysis' as a general capability
    if (capabilities.size === 0) {
      capabilities.add('analysis');
    }

    return Array.from(capabilities);
  }

  // -------------------------------------------------------------------------
  // Agent Capabilities
  // -------------------------------------------------------------------------

  /**
   * Query agent capabilities, using cache with 5-minute TTL.
   */
  async getAgentCapabilities(agentId: string): Promise<string[]> {
    // Check cache
    const cached = this.capabilityCache.get(agentId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const capabilities = await this.fetchAgentCapabilities(agentId);

    // Update cache
    this.capabilityCache.set(agentId, {
      value: capabilities,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return capabilities;
  }

  /**
   * Fetch capabilities from the event bus.
   */
  private async fetchAgentCapabilities(agentId: string): Promise<string[]> {
    const requestId = uuidv4();

    return new Promise<string[]>((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('Agent capabilities request timed out, returning empty', { agentId });
        resolve([]);
      }, EVENT_BUS_TIMEOUT_MS);

      this.eventBus.subscribe(
        `agent.capabilities.response.${requestId}`,
        async (event) => {
          clearTimeout(timeout);
          const data = event.data as { capabilities?: string[] };
          resolve(data?.capabilities ?? []);
        },
      );

      this.eventBus.publish('agent.capabilities.request', {
        requestId,
        agentId,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Gap Identification
  // -------------------------------------------------------------------------

  /**
   * Identify gaps between required and available capabilities, including
   * severity classification and alternative providers.
   */
  private async identifyGaps(
    required: string[],
    available: string[],
  ): Promise<CapabilityGap[]> {
    const availableSet = new Set(available);
    const gaps: CapabilityGap[] = [];

    for (const capability of required) {
      if (availableSet.has(capability)) {
        continue;
      }

      const severity = this.classifySeverity(capability);
      const alternatives = await this.findAlternatives(capability);
      const workaround = this.suggestWorkaround(capability, alternatives);

      gaps.push({
        capability,
        severity,
        alternatives,
        workaround,
      });
    }

    return gaps;
  }

  /**
   * Classify the severity of a capability gap.
   */
  private classifySeverity(capability: string): 'minor' | 'major' | 'critical' {
    if (CRITICAL_CAPABILITIES.has(capability)) {
      return 'critical';
    }
    if (MAJOR_CAPABILITIES.has(capability)) {
      return 'major';
    }
    return 'minor';
  }

  /**
   * Suggest a workaround for a missing capability.
   */
  private suggestWorkaround(
    capability: string,
    alternatives: string[],
  ): string | undefined {
    if (alternatives.length > 0) {
      return `Delegate "${capability}" to one of: ${alternatives.join(', ')}`;
    }

    const workarounds: Record<string, string> = {
      testing: 'Proceed without automated tests; flag for manual testing.',
      documentation: 'Proceed and generate documentation as a follow-up task.',
      monitoring: 'Proceed without monitoring setup; schedule monitoring configuration.',
      review: 'Proceed without peer review; mark output for later review.',
    };

    return workarounds[capability];
  }

  // -------------------------------------------------------------------------
  // Alternatives
  // -------------------------------------------------------------------------

  /**
   * Find agents or tools that have the specified capability.
   * Results are cached with a 5-minute TTL.
   */
  async findAlternatives(capability: string): Promise<string[]> {
    // Check cache
    const cached = this.alternativesCache.get(capability);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const alternatives = await this.fetchAlternatives(capability);

    // Update cache
    this.alternativesCache.set(capability, {
      value: alternatives,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return alternatives;
  }

  /**
   * Query alternatives from the event bus.
   */
  private async fetchAlternatives(capability: string): Promise<string[]> {
    const requestId = uuidv4();

    return new Promise<string[]>((resolve) => {
      const timeout = setTimeout(() => {
        resolve([]);
      }, EVENT_BUS_TIMEOUT_MS);

      this.eventBus.subscribe(
        `capability.alternatives.response.${requestId}`,
        async (event) => {
          clearTimeout(timeout);
          const data = event.data as { alternatives?: string[] };
          resolve(data?.alternatives ?? []);
        },
      );

      this.eventBus.publish('capability.alternatives.request', {
        requestId,
        capability,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Readiness & Recommendation
  // -------------------------------------------------------------------------

  /**
   * Compute overall readiness as the ratio of available to required capabilities.
   */
  computeReadiness(required: string[], available: string[]): number {
    if (required.length === 0) {
      return 1;
    }

    const availableSet = new Set(available);
    const matched = required.filter((cap) => availableSet.has(cap)).length;

    return matched / required.length;
  }

  /**
   * Determine recommendation based on gaps and readiness.
   */
  private determineRecommendation(
    gaps: CapabilityGap[],
    readiness: number,
  ): 'proceed' | 'augment' | 'delegate' | 'block' {
    // No gaps — proceed
    if (gaps.length === 0) {
      return 'proceed';
    }

    // Any critical gap with no alternatives — block
    const hasCriticalWithoutAlternative = gaps.some(
      (gap) => gap.severity === 'critical' && gap.alternatives.length === 0,
    );
    if (hasCriticalWithoutAlternative) {
      return 'block';
    }

    // Any critical gap with alternatives — delegate
    const hasCritical = gaps.some((gap) => gap.severity === 'critical');
    if (hasCritical) {
      return 'delegate';
    }

    // High readiness with only minor gaps — augment (can proceed with workarounds)
    if (readiness >= 0.7 && gaps.every((gap) => gap.severity === 'minor')) {
      return 'augment';
    }

    // Multiple major gaps or low readiness — delegate
    const majorGaps = gaps.filter((gap) => gap.severity === 'major');
    if (majorGaps.length >= 2 || readiness < 0.5) {
      return 'delegate';
    }

    // Single major gap or moderate readiness — augment
    return 'augment';
  }

  // -------------------------------------------------------------------------
  // Cache Management
  // -------------------------------------------------------------------------

  /**
   * Clear all cached data.
   */
  clearCache(): void {
    this.capabilityCache.clear();
    this.alternativesCache.clear();
    logger.info('Capability gap radar caches cleared');
  }

  /**
   * Invalidate cache for a specific agent.
   */
  invalidateAgent(agentId: string): void {
    this.capabilityCache.delete(agentId);
  }
}
