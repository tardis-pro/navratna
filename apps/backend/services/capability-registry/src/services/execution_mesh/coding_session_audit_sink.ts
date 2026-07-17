import { logger } from '@uaip/utils';
import { withSpan } from '@uaip/middleware';
import type { Span } from '@uaip/middleware';

// Event type constants — free-form strings; not added to shared enum because
// ImmutableAuditService accepts arbitrary eventType.
export const CODING_SESSION_EVENT = {
  // Intent events (fail_closed — must succeed before mutation begins)
  PROVISION_REQUESTED:         'coding_session.provision_requested',
  PROMPT_REQUESTED:            'coding_session.prompt_requested',
  ABORT_REQUESTED:             'coding_session.abort_requested',
  CLOSE_REQUESTED:             'coding_session.close_requested',
  CREDENTIAL_MINT_REQUESTED:   'coding_session.credential_mint_requested',
  CREDENTIAL_REFRESH_REQUESTED: 'coding_session.credential_refresh_requested',
  CREDENTIAL_REVOKE_REQUESTED: 'coding_session.credential_revoke_requested',
  PHASE_SETUP_REQUESTED:       'coding_session.phase_setup_requested',
  PHASE_AGENT_REQUESTED:       'coding_session.phase_agent_requested',
  // Outcome events (fail_observable — mutation already happened; never reverse it)
  PROVISION_SUCCEEDED:  'coding_session.provision_succeeded',
  PROVISION_FAILED:     'coding_session.provision_failed',
  SESSION_READY:        'coding_session.session_ready',
  PROMPT_ACCEPTED:      'coding_session.prompt_accepted',
  PROMPT_DUPLICATE:     'coding_session.prompt_duplicate',
  PROMPT_REJECTED:      'coding_session.prompt_rejected',
  ABORT_COMPLETED:      'coding_session.abort_completed',
  CLOSE_COMPLETED:      'coding_session.close_completed',
  DESTROY_COMPLETED:    'coding_session.destroy_completed',
  CREDENTIAL_MINTED:    'coding_session.credential_minted',
  CREDENTIAL_MINT_FAILED: 'coding_session.credential_mint_failed',
  CREDENTIAL_REFRESHED: 'coding_session.credential_refreshed',
  CREDENTIAL_REFRESH_FAILED: 'coding_session.credential_refresh_failed',
  PHASE_SETUP_APPLIED:   'coding_session.phase_setup_applied',
  PHASE_SETUP_FAILED:    'coding_session.phase_setup_failed',
  PHASE_AGENT_APPLIED:   'coding_session.phase_agent_applied',
  PHASE_AGENT_FAILED:    'coding_session.phase_agent_failed',
} as const;

export type CodingSessionEventType = (typeof CODING_SESSION_EVENT)[keyof typeof CODING_SESSION_EVENT];

// Intent events: audit must succeed before the mutation is started.
const INTENT_EVENTS = new Set<CodingSessionEventType>([
  CODING_SESSION_EVENT.PROVISION_REQUESTED,
  CODING_SESSION_EVENT.PROMPT_REQUESTED,
  CODING_SESSION_EVENT.ABORT_REQUESTED,
  CODING_SESSION_EVENT.CLOSE_REQUESTED,
  CODING_SESSION_EVENT.CREDENTIAL_MINT_REQUESTED,
  CODING_SESSION_EVENT.CREDENTIAL_REFRESH_REQUESTED,
  CODING_SESSION_EVENT.CREDENTIAL_REVOKE_REQUESTED,
  CODING_SESSION_EVENT.PHASE_SETUP_REQUESTED,
  CODING_SESSION_EVENT.PHASE_AGENT_REQUESTED,
]);

// Allowlisted detail fields; nothing else may enter audit storage.
export type CodingSessionAuditDetails = {
  sessionId: string;
  workspaceId?: string;
  state?: string;
  outcome?: string;
  reasonCode?: string;
  machineIdHash?: string;
  region?: string;
  errorCode?: string;
  idempotencyKeyPresent?: boolean;
  duplicateKind?: 'pending_duplicate' | 'completed_duplicate';
  bindingId?: string;
  installationId?: string;
  repositoryId?: string;
  repositoryFullName?: string;
  expiresAt?: string;
  phase?: 'setup' | 'agent';
};

export type AuditEventInput = {
  eventType: string;
  entityType: string;
  entityId: string;
  actorType: 'user' | 'agent' | 'system';
  actorId: string;
  details: Record<string, unknown>;
};

export type SecretScanResult = {
  clean: boolean;
  flaggedCount: number;
};

export type AuditWriter = {
  appendEvent(input: AuditEventInput): Promise<unknown>;
};

export type SecretScanner = {
  scanForRawSecrets(obj: object): SecretScanResult;
};

export type CodingSessionAuditSinkDeps = {
  writer: AuditWriter;
  scanner: SecretScanner;
};

// Typed redaction failure — carries only count, never paths, values, or pattern labels.
export type RedactionFailure = {
  kind: 'redaction_failure';
  eventType: CodingSessionEventType;
  flaggedCount: number;
};

export class RedactionError extends Error {
  readonly redactionFailure: RedactionFailure;

  constructor(failure: RedactionFailure) {
    super(`Audit blocked: ${failure.flaggedCount} secret(s) detected in details for event "${failure.eventType}"`);
    this.name = 'RedactionError';
    this.redactionFailure = failure;
  }
}

export class CodingSessionAuditSink {
  private readonly writer: AuditWriter;
  private readonly scanner: SecretScanner;

  constructor(deps: CodingSessionAuditSinkDeps) {
    this.writer = deps.writer;
    this.scanner = deps.scanner;
  }

  /**
   * Append an audit event for a coding-session lifecycle transition.
   *
   * Intent events (PROVISION_REQUESTED, PROMPT_REQUESTED, ABORT_REQUESTED,
   * CLOSE_REQUESTED): scanner failures and writer failures both throw — callers
   * must not proceed with the mutation.
   *
   * Outcome events (all others): scanner failure prevents the write but does
   * NOT throw; writer failure is logged and swallowed. The mutation has already
   * occurred and must not be reversed.
   */
  async append(opts: {
    eventType: CodingSessionEventType;
    sessionId: string;
    workspaceId: string;
    actorId: string;
    actorType: 'user' | 'system';
    details: CodingSessionAuditDetails;
  }): Promise<void> {
    const { eventType, sessionId, actorId, actorType, details } = opts;
    const isIntent = INTENT_EVENTS.has(eventType);

    const scanResult = this.scanner.scanForRawSecrets(details);
    if (!scanResult.clean) {
      // Log only count — never paths, values, or pattern labels.
      logger.error('coding-session-audit: secret scan blocked append', {
        eventType,
        sessionId,
        flaggedCount: scanResult.flaggedCount,
      });
      const failure: RedactionFailure = { kind: 'redaction_failure', eventType, flaggedCount: scanResult.flaggedCount };
      if (isIntent) throw new RedactionError(failure);
      // Outcome: log and return without writing.
      return;
    }

    const spanName = `audit.coding_session.${eventType}`;
    try {
      await withSpan(spanName, async (span: Span) => {
        span.setAttribute('audit.event_type', eventType);
        span.setAttribute('audit.entity_id', sessionId);
        span.setAttribute('audit.outcome', details.outcome ?? 'unknown');

        await this.writer.appendEvent({
          eventType,
          entityType: 'coding_session',
          entityId: sessionId,
          actorType,
          actorId,
          details: { ...details },
        });
      });
    } catch (err) {
      if (err instanceof RedactionError) throw err;

      if (isIntent) {
        logger.error('coding-session-audit: intent audit append failed', {
          eventType,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      logger.warn('coding-session-audit: outcome audit append failed (continuing)', {
        eventType,
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// Production factory — deferred dynamic imports keep the class DB-free for tests.
export async function createProductionAuditSink(): Promise<CodingSessionAuditSink> {
  const { ImmutableAuditService } = await import('@uaip/shared-services');
  const { SecretReferenceService } = await import('@uaip/shared-services');

  const rawWriter = ImmutableAuditService.getInstance();
  const rawScanner = SecretReferenceService.getInstance();

  // Adapt SecretReferenceService to the port's count-only contract.
  const scanner: SecretScanner = {
    scanForRawSecrets(obj: object): SecretScanResult {
      const result = rawScanner.scanForRawSecrets(obj);
      return { clean: result.clean, flaggedCount: result.flaggedPaths.length };
    },
  };

  return new CodingSessionAuditSink({ writer: rawWriter, scanner });
}
