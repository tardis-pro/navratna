/**
 * ApprovalAllowlistService — who is allowed to approve real-world operations over WhatsApp.
 *
 * This is deliberately SEPARATE from ContactBindingService. That one is self-service:
 * any contact who messages the bot binds themselves to an agent. This one is an
 * explicitly provisioned jid → userId map used to authorise privileged decisions, so it
 * is never populated as a side effect of someone sending a message.
 *
 * Redis key layout:
 *   whatsapp:approval:allowlist:{jid}  → JSON ApproverEntry (no TTL — permanent until removed)
 *
 * Seeding / merge rule (env var WHATSAPP_APPROVER_ALLOWLIST):
 *   Every entry records who created it in `addedBy`. Entries created by seeding carry
 *   `addedBy: 'env:WHATSAPP_APPROVER_ALLOWLIST'` and are OWNED by the env var: on every
 *   startup they are reconciled to match it exactly — added when new, updated when the
 *   userId changed, and DELETED when they have been dropped from the env var (otherwise
 *   removing an approver from config would silently fail to revoke them).
 *   Entries created at runtime through `add()` carry the admin's own `addedBy` and are
 *   never touched by seeding: not overwritten, not deleted, even when the same jid also
 *   appears in the env var. Runtime provisioning is the more deliberate act, so it wins.
 *   Seeding is therefore idempotent — running it twice over an unchanged env is a no-op.
 *
 * There is no implicit approver and no "empty allowlist means allow anyone" escape hatch:
 * an unlisted jid always resolves to null.
 */

import type { Redis } from 'ioredis';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'ApprovalAllowlistService',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

// ─── Redis key constants ──────────────────────────────────────────────────────

const ALLOWLIST_PREFIX = 'whatsapp:approval:allowlist:';

/** `addedBy` marker identifying entries owned by the env var (see merge rule above). */
const ENV_SOURCE = 'env:WHATSAPP_APPROVER_ALLOWLIST';

/** Default WhatsApp 1:1 domain appended to bare phone numbers. */
const WA_USER_DOMAIN = 's.whatsapp.net';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApproverEntry {
  /** Platform principal id this WhatsApp contact acts as when approving. */
  userId: string;
  /** Optional human label, for the admin listing only. */
  label?: string;
  /** ISO timestamp. */
  addedAt: string;
  /** Provenance — ENV_SOURCE for seeded entries, else the admin who added it. */
  addedBy: string;
}

export interface ApproverListEntry extends ApproverEntry {
  jid: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isApproverEntry(v: unknown): v is ApproverEntry {
  return (
    isRecord(v) &&
    typeof v['userId'] === 'string' &&
    v['userId'].length > 0 &&
    typeof v['addedAt'] === 'string' &&
    typeof v['addedBy'] === 'string'
  );
}

/**
 * Normalise an operator-supplied contact into a WhatsApp JID.
 * `+91 98123-45678` → `919812345678@s.whatsapp.net`; anything already carrying a
 * domain keeps it. Returns null when there is no usable number part.
 */
export function normaliseWhatsAppJid(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const at = raw.indexOf('@');
  const numberPart = (at === -1 ? raw : raw.slice(0, at)).replace(/[+\s-]/g, '');
  if (!numberPart) return null;

  if (at === -1) return `${numberPart}@${WA_USER_DOMAIN}`;

  const domain = raw.slice(at + 1).trim().toLowerCase();
  if (!domain) return null;
  return `${numberPart}@${domain}`;
}

/** Parse `jid:userId,jid:userId` into a normalised jid → userId map. */
function parseSeedSpec(spec: string): Map<string, string> {
  const desired = new Map<string, string>();

  for (const rawEntry of spec.split(',')) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    // Split on the LAST colon: a JID may itself carry a `:device` suffix.
    const sep = entry.lastIndexOf(':');
    if (sep <= 0) {
      logger.warn('Ignoring malformed WHATSAPP_APPROVER_ALLOWLIST entry (expected jid:userId)', {
        entry,
      });
      continue;
    }

    const jid = normaliseWhatsAppJid(entry.slice(0, sep));
    const userId = entry.slice(sep + 1).trim();
    if (!jid || !userId) {
      logger.warn('Ignoring malformed WHATSAPP_APPROVER_ALLOWLIST entry (expected jid:userId)', {
        entry,
      });
      continue;
    }

    desired.set(jid, userId);
  }

  return desired;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ApprovalAllowlistService {
  /** Resolves once the env seed has been reconciled; every public call awaits it. */
  private readonly seeded: Promise<void>;

  constructor(private readonly redis: Redis) {
    this.seeded = this.seedFromEnv().catch((err: unknown) => {
      // Fail closed: an unseeded allowlist simply authorises nobody.
      logger.error('Failed to seed WhatsApp approval allowlist from env', { err });
    });
  }

  /** Resolve the approver principal for a JID, or null when not explicitly allow-listed. */
  async resolveApprover(jid: string): Promise<{ userId: string } | null> {
    await this.seeded;
    const entry = await this.read(jid);
    return entry ? { userId: entry.userId } : null;
  }

  /** Explicitly provision an approver. Overrides and pins against env reconciliation. */
  async add(jid: string, userId: string, addedBy: string): Promise<void> {
    await this.seeded;
    const normalised = normaliseWhatsAppJid(jid);
    if (!normalised || !userId) {
      logger.warn('Refusing to add approver with an unusable jid or userId', { jid, userId });
      return;
    }
    await this.write(normalised, { userId, addedAt: new Date().toISOString(), addedBy });
    logger.info('WhatsApp approver added', { jid: normalised, userId, addedBy });
  }

  /** Revoke an approver. */
  async remove(jid: string): Promise<void> {
    await this.seeded;
    const normalised = normaliseWhatsAppJid(jid) ?? jid;
    await this.redis.del(`${ALLOWLIST_PREFIX}${normalised}`);
    logger.info('WhatsApp approver removed', { jid: normalised });
  }

  /** Every currently provisioned approver. */
  async list(): Promise<ApproverListEntry[]> {
    await this.seeded;
    const all = await this.readAll();
    return [...all.entries()].map(([jid, entry]) => ({ jid, ...entry }));
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async seedFromEnv(): Promise<void> {
    const desired = parseSeedSpec(process.env.WHATSAPP_APPROVER_ALLOWLIST ?? '');
    const existing = await this.readAll();

    // 1. Revoke env-owned entries that have been dropped from the env var.
    for (const [jid, entry] of existing) {
      if (entry.addedBy !== ENV_SOURCE || desired.has(jid)) continue;
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      await this.redis.del(`${ALLOWLIST_PREFIX}${jid}`);
      logger.info('Revoked WhatsApp approver dropped from env allowlist', { jid });
    }

    // 2. Add new entries; refresh env-owned ones whose userId changed. Runtime-added
    //    entries (addedBy !== ENV_SOURCE) are left exactly as the admin set them.
    for (const [jid, userId] of desired) {
      const current = existing.get(jid);
      if (current && (current.addedBy !== ENV_SOURCE || current.userId === userId)) continue;
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      await this.write(jid, { userId, addedAt: new Date().toISOString(), addedBy: ENV_SOURCE });
      logger.info('Seeded WhatsApp approver from env allowlist', { jid, userId });
    }

    logger.info('WhatsApp approval allowlist seeded', { envEntries: desired.size });
  }

  private async write(jid: string, entry: ApproverEntry): Promise<void> {
    await this.redis.set(`${ALLOWLIST_PREFIX}${jid}`, JSON.stringify(entry));
  }

  private async read(jid: string): Promise<ApproverEntry | null> {
    try {
      const raw = await this.redis.get(`${ALLOWLIST_PREFIX}${jid}`);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isApproverEntry(parsed) ? parsed : null;
    } catch (err) {
      logger.error('Failed to read WhatsApp approver entry', { jid, err });
      return null;
    }
  }

  /** SCAN the whole allowlist. Small keyset (admins only), but SCAN keeps it non-blocking. */
  private async readAll(): Promise<Map<string, ApproverEntry>> {
    const result = new Map<string, ApproverEntry>();
    let cursor = '0';

    do {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${ALLOWLIST_PREFIX}*`,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const values = await this.redis.mget(...keys);
        keys.forEach((key, i) => {
          const raw = values[i];
          if (!raw) return;
          try {
            const parsed: unknown = JSON.parse(raw);
            if (isApproverEntry(parsed)) result.set(key.slice(ALLOWLIST_PREFIX.length), parsed);
          } catch {
            logger.warn('Skipping unparsable WhatsApp approver entry', { key });
          }
        });
      }
    } while (cursor !== '0');

    return result;
  }
}
