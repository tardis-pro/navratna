/**
 * ContactBindingService — per-contact agent binding and self-service agent selection.
 *
 * Redis key layout:
 *   whatsapp:binding:{jid}          → agentId (no TTL — permanent until removed)
 *   whatsapp:selecting:{jid}        → JSON PendingSelection (10-min TTL)
 *   whatsapp:agents:cache           → JSON AgentSummary[] (5-min TTL)
 */

import type { Redis } from 'ioredis';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'ContactBindingService',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

// ─── Redis key constants ──────────────────────────────────────────────────────

const BINDING_PREFIX = 'whatsapp:binding:';
const SELECTING_PREFIX = 'whatsapp:selecting:';
const AGENTS_CACHE_KEY = 'whatsapp:agents:cache';

const SELECTING_TTL = 60 * 10; // 10 minutes
const AGENTS_CACHE_TTL = 60 * 5; // 5 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentSummary {
  id: string;
  name: string;
  description: string;
}

export interface PendingSelection {
  agents: AgentSummary[];
  expiresAt: number; // unix ms
}

export interface ContactBinding {
  jid: string;
  agentId: string;
  agentName: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ContactBindingService {
  constructor(private readonly redis: Redis) {}

  // ─── Bindings ──────────────────────────────────────────────────────────────

  /** Return the agentId bound to this JID, or null if unbound. */
  async getBinding(jid: string): Promise<string | null> {
    return this.redis.get(`${BINDING_PREFIX}${jid}`);
  }

  /** Permanently bind a JID to an agent. */
  async setBinding(jid: string, agentId: string): Promise<void> {
    await this.redis.set(`${BINDING_PREFIX}${jid}`, agentId);
    logger.info('Contact binding set', { jid, agentId });
  }

  /** Remove the binding for a JID. */
  async removeBinding(jid: string): Promise<void> {
    await this.redis.del(`${BINDING_PREFIX}${jid}`);
    logger.info('Contact binding removed', { jid });
  }

  /**
   * Return all current bindings as a map: jid → agentId.
   * Uses Redis SCAN to avoid blocking on large keyset.
   */
  async getAllBindings(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    let cursor = '0';

    do {
      // oxlint-ignore-next-line no-await-in-loop -- sequential processing required
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${BINDING_PREFIX}*`,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        // oxlint-ignore-next-line no-await-in-loop -- sequential processing required
        const values = await this.redis.mget(...keys);
        keys.forEach((key, i) => {
          const jid = key.slice(BINDING_PREFIX.length);
          const agentId = values[i];
          if (agentId) result[jid] = agentId;
        });
      }
    } while (cursor !== '0');

    return result;
  }

  // ─── Pending selection state ───────────────────────────────────────────────

  /** Return a pending selection for this JID, or null if none / expired. */
  async getPendingSelection(jid: string): Promise<PendingSelection | null> {
    try {
      const raw = await this.redis.get(`${SELECTING_PREFIX}${jid}`);
      if (!raw) return null;
      return JSON.parse(raw) as PendingSelection;
    } catch {
      return null;
    }
  }

  /** Store pending selection state for a JID (10-min TTL). */
  async setPendingSelection(jid: string, agents: AgentSummary[]): Promise<void> {
    const payload: PendingSelection = {
      agents,
      expiresAt: Date.now() + SELECTING_TTL * 1000,
    };
    await this.redis.set(`${SELECTING_PREFIX}${jid}`, JSON.stringify(payload), 'EX', SELECTING_TTL);
  }

  /** Remove pending selection state (after user completes selection). */
  async clearPendingSelection(jid: string): Promise<void> {
    await this.redis.del(`${SELECTING_PREFIX}${jid}`);
  }

  // ─── Agent list cache ──────────────────────────────────────────────────────

  /** Return cached agent list, or null if cache is stale. */
  async getCachedAgents(): Promise<AgentSummary[] | null> {
    try {
      const raw = await this.redis.get(AGENTS_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AgentSummary[];
    } catch {
      return null;
    }
  }

  /** Store agent list in cache (5-min TTL). */
  async cacheAgents(agents: AgentSummary[]): Promise<void> {
    await this.redis.set(AGENTS_CACHE_KEY, JSON.stringify(agents), 'EX', AGENTS_CACHE_TTL);
  }
}
