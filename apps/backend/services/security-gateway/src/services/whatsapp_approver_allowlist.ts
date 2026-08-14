import { logger } from '@uaip/utils';

/**
 * Approval allowlist, read in the `userId -> jid` direction.
 *
 * `WHATSAPP_APPROVER_ALLOWLIST` is the single source of truth for who may act on
 * an approval over WhatsApp. The discussion service reads the same variable in
 * the opposite direction (`jid -> userId`) to authenticate inbound replies — do
 * not introduce a second variable for either direction.
 *
 * Format: comma-separated `jid:userId` pairs, e.g.
 *   `919812345678@s.whatsapp.net:user-abc,919800000000:user-def`
 *
 * A bare number is normalised to `<digits>@s.whatsapp.net`.
 */
const ALLOWLIST_ENV = 'WHATSAPP_APPROVER_ALLOWLIST';
const WHATSAPP_USER_SUFFIX = '@s.whatsapp.net';

/**
 * Normalise the JID half of an allowlist entry. Must stay byte-identical to the
 * discussion service's normalisation of the same variable, or the two directions
 * of the map disagree: strip `+`/space/dash from the number, append
 * `@s.whatsapp.net` when there is no domain, lowercase the domain.
 */
export function normaliseJid(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const at = trimmed.lastIndexOf('@');
  if (at >= 0) {
    const user = trimmed.slice(0, at).replace(/[+\s\-()]/g, '');
    const domain = trimmed.slice(at + 1).toLowerCase();
    if (user.length === 0 || domain.length === 0) return null;
    return `${user}@${domain}`;
  }

  const digits = trimmed.replace(/[+\s\-()]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  return `${digits}${WHATSAPP_USER_SUFFIX}`;
}

/**
 * Parse the allowlist into a `userId -> jid` map. Malformed entries are skipped
 * with a warning rather than throwing: a typo in one entry must not take the
 * whole approval channel down, and every unmapped approver is skipped anyway.
 */
export function parseApproverAllowlist(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;

    // Split on the LAST colon: device-suffixed JIDs (`1234:5@s.whatsapp.net`)
    // contain a colon of their own.
    const separator = trimmed.lastIndexOf(':');
    if (separator <= 0 || separator === trimmed.length - 1) {
      logger.warn(`Skipping malformed ${ALLOWLIST_ENV} entry (expected "jid:userId")`);
      continue;
    }

    const jid = normaliseJid(trimmed.slice(0, separator));
    const userId = trimmed.slice(separator + 1).trim();
    if (!jid || userId.length === 0) {
      logger.warn(`Skipping malformed ${ALLOWLIST_ENV} entry (unusable jid or userId)`);
      continue;
    }

    map.set(userId, jid);
  }

  return map;
}

/**
 * Resolve an approver user id to their WhatsApp JID. Returns null when the user
 * is not allow-listed — callers must skip that recipient, never guess a number.
 *
 * The env var is read per call so a deployment can roll the allowlist without a
 * restart, and so tests can set it without module-load ordering games.
 */
export function resolveApproverJid(userId: string): string | null {
  return parseApproverAllowlist(process.env[ALLOWLIST_ENV]).get(userId) ?? null;
}
