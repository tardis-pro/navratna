/**
 * status_tokens.ts — single source of truth for status / severity / agent colors.
 *
 * Returns Tailwind utility classes aligned with the app's dark-theme design
 * system so that ad-hoc, per-portal color maps can be repointed here without
 * changing their semantics. Each helper accepts a `variant` selecting the
 * shape of classes a given call site needs (text-only, solid background,
 * badge, left-border, etc.), defaulting to the most common case.
 *
 * Semantic buckets are intentionally coarse and stable:
 *   success | warning | error | info | neutral   (status)
 *   low | medium | high | critical               (severity)
 * Agent colors are assigned deterministically from a fixed palette by hashing
 * the agent id, so a given agent always renders the same accent.
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type StatusVariant = 'text' | 'bg' | 'badge' | 'borderLeft';

type StatusBucket = 'success' | 'warning' | 'error' | 'info' | 'neutral';

function statusBucket(status: string): StatusBucket {
  switch (status) {
    case 'healthy':
    case 'success':
    case 'online':
    case 'active':
    case 'good':
    case 'completed':
    case 'ok':
    case 'up':
      return 'success';
    case 'warning':
    case 'degraded':
    case 'pending':
      return 'warning';
    case 'critical':
    case 'error':
    case 'failed':
    case 'offline':
    case 'down':
    case 'unreachable':
      return 'error';
    case 'info':
    case 'running':
    case 'in_progress':
      return 'info';
    default:
      return 'neutral';
  }
}

const STATUS_CLASSES: Record<StatusBucket, Record<StatusVariant, string>> = {
  success: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/20 border-emerald-500/30',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    borderLeft: 'border-l-emerald-500',
  },
  warning: {
    text: 'text-amber-400',
    bg: 'bg-amber-500/20 border-amber-500/30',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    borderLeft: 'border-l-amber-500',
  },
  error: {
    text: 'text-red-400',
    bg: 'bg-red-500/20 border-red-500/30',
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    borderLeft: 'border-l-red-500',
  },
  info: {
    text: 'text-blue-400',
    bg: 'bg-blue-500/20 border-blue-500/30',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    borderLeft: 'border-l-blue-500',
  },
  neutral: {
    text: 'text-slate-400',
    bg: 'bg-slate-500/20 border-slate-500/30',
    badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    borderLeft: 'border-l-slate-500',
  },
};

/**
 * Design-token-aligned Tailwind classes for a status string.
 * @param status  e.g. 'healthy' | 'warning' | 'critical' | 'success' | 'error' | 'info'
 * @param variant which shape of classes to return (default: 'text')
 */
export function getStatusColor(status: string, variant: StatusVariant = 'text'): string {
  return STATUS_CLASSES[statusBucket(status)][variant];
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export type SeverityVariant = 'text' | 'solid' | 'badge' | 'soft';

type SeverityBucket = 'low' | 'medium' | 'high' | 'critical' | 'neutral';

function severityBucket(severity: string): SeverityBucket {
  switch (severity) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'critical':
      return 'critical';
    default:
      return 'neutral';
  }
}

const SEVERITY_CLASSES: Record<SeverityBucket, Record<SeverityVariant, string>> = {
  low: {
    text: 'text-blue-400',
    solid: 'bg-blue-500',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    soft: 'text-blue-400 bg-blue-500/10',
  },
  medium: {
    text: 'text-amber-400',
    solid: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    soft: 'text-amber-400 bg-amber-500/10',
  },
  high: {
    text: 'text-orange-400',
    solid: 'bg-orange-500',
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    soft: 'text-orange-400 bg-orange-500/10',
  },
  critical: {
    text: 'text-red-400',
    solid: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    soft: 'text-red-400 bg-red-500/10',
  },
  neutral: {
    text: 'text-slate-400',
    solid: 'bg-slate-500',
    badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    soft: 'text-slate-400 bg-slate-500/10',
  },
};

/**
 * Design-token-aligned Tailwind classes for a severity string.
 * @param severity 'low' | 'medium' | 'high' | 'critical'
 * @param variant  which shape of classes to return (default: 'text')
 */
export function getSeverityColor(severity: string, variant: SeverityVariant = 'text'): string {
  return SEVERITY_CLASSES[severityBucket(severity)][variant];
}

// ---------------------------------------------------------------------------
// Agent (deterministic by id hash)
// ---------------------------------------------------------------------------

export type AgentVariant = 'combined' | 'text' | 'bg' | 'borderLeft' | 'iconBg';

const AGENT_PALETTE = [
  'blue',
  'emerald',
  'purple',
  'orange',
  'pink',
  'indigo',
] as const;

/** Stable, non-cryptographic string hash (djb2). Always >= 0. */
function hashString(id: string): number {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 33) ^ id.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Deterministic index into a palette of `length` colors for a given id.
 * Same id always yields the same index regardless of insertion order.
 */
export function getAgentColorIndex(id: string, length: number): number {
  if (length <= 0) return 0;
  return hashString(id) % length;
}

const AGENT_CLASSES: Record<(typeof AGENT_PALETTE)[number], Record<AgentVariant, string>> = {
  blue: {
    combined: 'from-blue-500 to-blue-600 text-blue-300 bg-blue-500/20 border-blue-500/30',
    text: 'text-blue-400',
    bg: 'bg-blue-500/20 border-blue-500/30',
    borderLeft: 'border-l-blue-500',
    iconBg: 'bg-blue-500/10 text-blue-500',
  },
  emerald: {
    combined:
      'from-emerald-500 to-emerald-600 text-emerald-300 bg-emerald-500/20 border-emerald-500/30',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/20 border-emerald-500/30',
    borderLeft: 'border-l-emerald-500',
    iconBg: 'bg-emerald-500/10 text-emerald-500',
  },
  purple: {
    combined: 'from-purple-500 to-purple-600 text-purple-300 bg-purple-500/20 border-purple-500/30',
    text: 'text-purple-400',
    bg: 'bg-purple-500/20 border-purple-500/30',
    borderLeft: 'border-l-purple-500',
    iconBg: 'bg-purple-500/10 text-purple-500',
  },
  orange: {
    combined: 'from-orange-500 to-orange-600 text-orange-300 bg-orange-500/20 border-orange-500/30',
    text: 'text-orange-400',
    bg: 'bg-orange-500/20 border-orange-500/30',
    borderLeft: 'border-l-orange-500',
    iconBg: 'bg-orange-500/10 text-orange-500',
  },
  pink: {
    combined: 'from-pink-500 to-pink-600 text-pink-300 bg-pink-500/20 border-pink-500/30',
    text: 'text-pink-400',
    bg: 'bg-pink-500/20 border-pink-500/30',
    borderLeft: 'border-l-pink-500',
    iconBg: 'bg-pink-500/10 text-pink-500',
  },
  indigo: {
    combined: 'from-indigo-500 to-indigo-600 text-indigo-300 bg-indigo-500/20 border-indigo-500/30',
    text: 'text-indigo-400',
    bg: 'bg-indigo-500/20 border-indigo-500/30',
    borderLeft: 'border-l-indigo-500',
    iconBg: 'bg-indigo-500/10 text-indigo-500',
  },
};

/**
 * Deterministic design-token-aligned Tailwind classes for an agent id.
 * The same id always maps to the same palette entry (hash-based, not random).
 * @param id      agent id / name / sender key
 * @param variant which shape of classes to return (default: 'combined')
 */
export function getAgentColor(id: string, variant: AgentVariant = 'combined'): string {
  const color = AGENT_PALETTE[getAgentColorIndex(id, AGENT_PALETTE.length)];
  return AGENT_CLASSES[color][variant];
}
