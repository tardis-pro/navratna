import { randomUUID } from 'node:crypto';
/* oxlint-disable no-await-in-loop -- node readiness polling is intentionally sequential. */
import { logger } from '@uaip/utils';
import type { CodingSessionShadow, PromptOutcome, CodingSessionView, GitHubCredential } from '@uaip/types';
import { CODING_NODE_PORT } from '@uaip/types';
import type { CodingSessionStore, CodingSessionScope } from './coding_session_store.js';
import type { CodingNodeClient, CodingSessionEvent } from './coding_node_client.js';
import type { FlyMachineDriver } from './fly_machine_driver.js';
import { mintCodingNodeJwt } from './coding_node_jwt.js';
import type { JwtScope } from './coding_node_jwt.js';
import type { CodingSessionAuditSink } from './coding_session_audit_sink.js';
import { CODING_SESSION_EVENT } from './coding_session_audit_sink.js';
import type { GitHubAppTokenBroker } from './github_app_token_broker.js';
import type { GitHubAppInstallationRepository } from './github_app_installation_repository.js';

export type CoordinatorError =
  | { code: 'REDIS_UNAVAILABLE'; message: string }
  | { code: 'PROVISION_FAILED'; message: string }
  | { code: 'NODE_UNREACHABLE'; message: string }
  | { code: 'NODE_ABORT_FAILED'; message: string }
  | { code: 'NODE_CLOSE_FAILED'; message: string }
  | { code: 'AUTH_REQUIRED' }
  | { code: 'NOT_FOUND'; sessionId: string }
  | { code: 'OWNER_MISMATCH'; sessionId: string }
  | { code: 'SESSION_STATE_ERROR'; message: string }
  | { code: 'AUDIT_FAILED'; message: string }
  | { code: 'BINDING_NOT_FOUND'; message: string }
  | { code: 'BINDING_INACTIVE'; message: string }
  | { code: 'GITHUB_TOKEN_FAILED'; message: string }
  | { code: 'PHASE_TRANSITION_FAILED'; message: string };

export type CoordinatorResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CoordinatorError };

export type CreateSessionParams = {
  workspaceId: string;
  projectId: string;
  userId: string;
  tenantId: string;
  repositoryId: string;
  bindingId: string;
  llmCredentials?: Array<{
    provider: string;
    type: 'api_key' | 'oauth';
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }>;
  systemPromptAdditions?: string;
};

export type SubmitPromptParams = {
  workspaceId: string;
  sessionId: string;
  userId: string;
  tenantId: string;
  message: string;
  idempotencyKey: string;
};

export type StreamEventsParams = {
  workspaceId: string;
  sessionId: string;
  userId: string;
  tenantId: string;
  lastEventId?: string;
  signal: AbortSignal;
  onEvent: (raw: string) => void;
  onEnd: () => void;
  onError: (err: string) => void;
};

const CREDENTIAL_REFRESH_THRESHOLD_S = 600;

export type CoordinatorDeps = {
  store: CodingSessionStore;
  nodeClient: CodingNodeClient;
  fly: FlyMachineDriver;
  codingNodePublicKeyPem: string;
  auditSink: CodingSessionAuditSink;
  broker: GitHubAppTokenBroker;
  installationRepo: GitHubAppInstallationRepository;
  sleep?: (ms: number) => Promise<void>;
  maxVerifyAttempts?: number;
  verifyPollMs?: number;
  nowSeconds?: () => number;
};

function shadowToView(s: CodingSessionShadow): CodingSessionView {
  return {
    sessionId: s.sessionId,
    workspaceId: s.workspaceId,
    projectId: s.projectId,
    userId: s.userId,
    tenantId: s.tenantId,
    state: s.state,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function storeErrToCoordErr(err: { code: string; message?: string; detail?: string; sessionId?: string }): CoordinatorError {
  if (err.code === 'NOT_FOUND') return { code: 'NOT_FOUND', sessionId: err.sessionId ?? '' };
  if (err.code === 'OWNER_MISMATCH') return { code: 'OWNER_MISMATCH', sessionId: err.sessionId ?? '' };
  return { code: 'REDIS_UNAVAILABLE', message: err.message ?? err.detail ?? err.code };
}

const DEFAULT_VERIFY_ATTEMPTS = 30;
const DEFAULT_VERIFY_POLL_MS = 2_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function scopeFor(workspaceId: string, userId: string, tenantId: string): CodingSessionScope {
  return { workspaceId, userId, tenantId };
}

function shadowToJwtScope(shadow: CodingSessionShadow): JwtScope {
  const { sessionId, workspaceId, projectId, tenantId, userId, repositoryId } = shadow;
  if (!sessionId || !workspaceId || !projectId || !tenantId || !userId || !repositoryId) {
    throw new Error('coding-session-coordinator: shadow missing required JWT scope fields');
  }
  return { sessionId, workspaceId, projectId, tenantId, userId, repositoryId };
}

export class CodingSessionCoordinator {
  private readonly store: CodingSessionStore;
  private readonly nodeClient: CodingNodeClient;
  private readonly fly: FlyMachineDriver;
  private readonly codingNodePublicKeyPem: string;
  private readonly auditSink: CodingSessionAuditSink;
  private readonly broker: GitHubAppTokenBroker;
  private readonly installationRepo: GitHubAppInstallationRepository;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxVerifyAttempts: number;
  private readonly verifyPollMs: number;
  private readonly nowSeconds: () => number;

  constructor(deps: CoordinatorDeps) {
    this.store = deps.store;
    this.nodeClient = deps.nodeClient;
    this.fly = deps.fly;
    this.codingNodePublicKeyPem = deps.codingNodePublicKeyPem;
    this.auditSink = deps.auditSink;
    this.broker = deps.broker;
    this.installationRepo = deps.installationRepo;
    this.sleep = deps.sleep ?? defaultSleep;
    this.maxVerifyAttempts = deps.maxVerifyAttempts ?? DEFAULT_VERIFY_ATTEMPTS;
    this.verifyPollMs = deps.verifyPollMs ?? DEFAULT_VERIFY_POLL_MS;
    this.nowSeconds = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  async createSession(params: CreateSessionParams): Promise<CoordinatorResult<CodingSessionView>> {
    const { workspaceId, projectId, userId, tenantId, repositoryId, bindingId, llmCredentials, systemPromptAdditions } = params;
    const sessionId = randomUUID();
    const now = Date.now();

    // Intent audit — fail_closed before any mutation.
    try {
      await this.auditSink.append({
        eventType: CODING_SESSION_EVENT.PROVISION_REQUESTED,
        sessionId,
        workspaceId,
        actorId: userId,
        actorType: 'user',
        details: { sessionId, workspaceId, state: 'CREATING', outcome: 'requested', bindingId },
      });
    } catch (err) {
      logger.error('coordinator: PROVISION_REQUESTED audit failed (fail-closed)', { sessionId });
      return { ok: false, error: { code: 'AUDIT_FAILED', message: err instanceof Error ? err.message : String(err) } };
    }

    const bindingResult = await this.installationRepo.findScopedBinding({
      bindingId, userId, tenantId, projectId, repositoryId,
    });
    if (!bindingResult.ok) {
      const { error } = bindingResult;
      if (error.code === 'BINDING_NOT_FOUND') {
        return { ok: false, error: { code: 'BINDING_NOT_FOUND', message: `No active GitHub App binding found for id ${bindingId}` } };
      }
      if (error.code === 'BINDING_INACTIVE') {
        return { ok: false, error: { code: 'BINDING_INACTIVE', message: 'GitHub App binding is inactive' } };
      }
      return { ok: false, error: { code: 'BINDING_NOT_FOUND', message: 'GitHub App binding mismatch or error' } };
    }
    const binding = bindingResult.value;

    try {
      await this.auditSink.append({
        eventType: CODING_SESSION_EVENT.CREDENTIAL_MINT_REQUESTED,
        sessionId,
        workspaceId,
        actorId: userId,
        actorType: 'user',
        details: { sessionId, installationId: binding.installationId, repositoryId, outcome: 'requested' },
      });
    } catch (err) {
      logger.error('coordinator: CREDENTIAL_MINT_REQUESTED audit failed (fail-closed)', { sessionId });
      return { ok: false, error: { code: 'AUDIT_FAILED', message: err instanceof Error ? err.message : String(err) } };
    }

    const credResult = await this.broker.mintInstallationToken(binding);
    if (!credResult.ok) {
      await this.appendOutcome({
        eventType: CODING_SESSION_EVENT.CREDENTIAL_MINT_FAILED,
        sessionId, workspaceId, actorId: userId,
        details: { sessionId, installationId: binding.installationId, repositoryId, outcome: 'failed', errorCode: credResult.error.code },
      });
      return { ok: false, error: { code: 'GITHUB_TOKEN_FAILED', message: credResult.error.message } };
    }
    const ghCredential: GitHubCredential = credResult.value;

    await this.appendOutcome({
      eventType: CODING_SESSION_EVENT.CREDENTIAL_MINTED,
      sessionId, workspaceId, actorId: userId,
      details: { sessionId, installationId: binding.installationId, repositoryId, repositoryFullName: binding.repositoryFullName, expiresAt: ghCredential.expiresAt, outcome: 'minted' },
    });

    let machineId: string;
    let volumeId: string;
    let nodeBaseUrl: string;
    try {
      const prov = await this.fly.provisionWorkspace({
        sessionId,
        codingNodePublicKeyPem: this.codingNodePublicKeyPem,
      });
      machineId = prov.machineId;
      volumeId = prov.volumeId;
      nodeBaseUrl = prov.baseUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coordinator: provision failed', { sessionId, error: msg });
      await this.appendOutcome({
        eventType: CODING_SESSION_EVENT.PROVISION_FAILED,
        sessionId, workspaceId, actorId: userId,
        details: { sessionId, workspaceId, state: 'CREATING', outcome: 'failed', errorCode: 'PROVISION_FAILED' },
      });
      return { ok: false, error: { code: 'PROVISION_FAILED', message: msg } };
    }

    const shadow: CodingSessionShadow = {
      sessionId, workspaceId, projectId, userId, tenantId, repositoryId,
      machineId, volumeId, nodeBaseUrl,
      state: 'CREATING', createdAt: now, updatedAt: now,
      githubCredentialExpiresAt: ghCredential.expiresAt,
      githubBindingId: bindingId,
      githubInstallationId: binding.installationId,
      githubRepositoryId: repositoryId,
      githubRepositoryFullName: binding.repositoryFullName,
    };

    const putResult = await this.store.put(shadow);
    if (!putResult.ok) {
      logger.error('coordinator: shadow put failed', { sessionId });
      await this.cleanupMachine(machineId, volumeId, sessionId);
      return { ok: false, error: storeErrToCoordErr(putResult.error) };
    }

    const jwtScope: JwtScope = { sessionId, workspaceId, projectId, tenantId, userId, repositoryId };
    let createToken: string;
    try {
      createToken = await mintCodingNodeJwt(jwtScope);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.cleanupMachine(machineId, volumeId, sessionId);
      await this.store.deleteScoped(sessionId, scopeFor(workspaceId, userId, tenantId));
      return { ok: false, error: { code: 'PROVISION_FAILED', message: `JWT mint failed: ${msg}` } };
    }

    const nodeReq = {
      sessionId, workspaceId, projectId, userId, tenantId, repositoryId,
      workspacePath: '/workspace',
      llmCredentials: llmCredentials ?? [],
      githubCredential: ghCredential,
      systemPromptAdditions,
    };

    // Egress phase SETUP must be applied BEFORE the node calls git (which
    // uses HTTPS through the proxy). The admin listener rejects /phase
    // calls without a fresh RS256 token scoped to this session; if the
    // transition fails, we fail the entire session creation and clean up.
    const setupPhaseResult = await this.transitionEgressPhase({
      baseUrl: nodeBaseUrl,
      jwtScope,
      sessionId, workspaceId, projectId, userId, tenantId, repositoryId,
      phase: 'setup',
      actorId: userId,
      intentEvent: CODING_SESSION_EVENT.PHASE_SETUP_REQUESTED,
      outcomeEventOk: CODING_SESSION_EVENT.PHASE_SETUP_APPLIED,
      outcomeEventFail: CODING_SESSION_EVENT.PHASE_SETUP_FAILED,
    });
    if (!setupPhaseResult.ok) {
      await this.cleanupMachine(machineId, volumeId, sessionId);
      await this.store.deleteScoped(sessionId, scopeFor(workspaceId, userId, tenantId));
      return setupPhaseResult;
    }

    const createResult = await this.nodeClient.createSession(nodeBaseUrl, createToken, nodeReq);
    if (!createResult.ok) {
      await this.cleanupMachine(machineId, volumeId, sessionId);
      await this.store.deleteScoped(sessionId, scopeFor(workspaceId, userId, tenantId));
      return { ok: false, error: { code: 'NODE_UNREACHABLE', message: `Node error: ${createResult.error.code ?? 'unknown'}` } };
    }

    // If the setup phase transition succeeded but createSession failed after,
    // we DO NOT need to revert phase — the proxy is idempotent across transitions.
    // The machine is destroyed, which takes the listener with it; the kernel
    // ruleset stops applying once the machine dies.

    const readyResult = await this.pollVerifyUntilReady(
      nodeBaseUrl, jwtScope, sessionId,
      scopeFor(workspaceId, userId, tenantId),
      machineId, volumeId, userId,
    );
    if (!readyResult.ok) return readyResult;

    const agentPhaseResult = await this.transitionEgressPhase({
      baseUrl: nodeBaseUrl,
      jwtScope,
      sessionId, workspaceId, projectId, userId, tenantId, repositoryId,
      phase: 'agent',
      actorId: userId,
      intentEvent: CODING_SESSION_EVENT.PHASE_AGENT_REQUESTED,
      outcomeEventOk: CODING_SESSION_EVENT.PHASE_AGENT_APPLIED,
      outcomeEventFail: CODING_SESSION_EVENT.PHASE_AGENT_FAILED,
    });
    if (!agentPhaseResult.ok) {
      await this.cleanupMachine(machineId, volumeId, sessionId);
      await this.store.deleteScoped(sessionId, scopeFor(workspaceId, userId, tenantId));
      return agentPhaseResult;
    }

    await this.appendOutcome({
      eventType: CODING_SESSION_EVENT.PROVISION_SUCCEEDED,
      sessionId, workspaceId, actorId: userId,
      details: { sessionId, workspaceId, state: 'READY', outcome: 'succeeded' },
    });

    return { ok: true, value: shadowToView(readyResult.value) };
  }

  async submitPrompt(params: SubmitPromptParams): Promise<CoordinatorResult<PromptOutcome>> {
    const { workspaceId, sessionId, userId, tenantId, idempotencyKey } = params;
    const scope = scopeFor(workspaceId, userId, tenantId);

    // Intent audit — fail_closed before atomic claim.
    try {
      await this.auditSink.append({
        eventType: CODING_SESSION_EVENT.PROMPT_REQUESTED,
        sessionId, workspaceId,
        actorId: userId, actorType: 'user',
        details: { sessionId, workspaceId, state: 'PROMPTING', outcome: 'requested', idempotencyKeyPresent: Boolean(idempotencyKey) },
      });
    } catch (err) {
      logger.error('coordinator: PROMPT_REQUESTED audit failed (fail-closed)', { sessionId });
      return { ok: false, error: { code: 'AUDIT_FAILED', message: err instanceof Error ? err.message : String(err) } };
    }

    const claimResult = await this.store.claimPrompt({ sessionId, scope, idempotencyKey });
    if (!claimResult.ok) return { ok: false, error: storeErrToCoordErr(claimResult.error) };

    const claimed = claimResult.value;

    if (claimed.status === 'not_found' || claimed.status === 'owner_mismatch') {
      // Outcome: authenticated user's attempt recorded with rejection label.
      await this.appendOutcome({
        eventType: CODING_SESSION_EVENT.PROMPT_REJECTED,
        sessionId, workspaceId, actorId: userId,
        details: { sessionId, workspaceId, outcome: claimed.status, reasonCode: claimed.status },
      });
      const code = claimed.status === 'not_found' ? 'NOT_FOUND' : 'OWNER_MISMATCH';
      if (code === 'NOT_FOUND') return { ok: true, value: { outcome: 'not_found' } };
      return { ok: true, value: { outcome: 'owner_mismatch' } };
    }

    if (claimed.status === 'pending_duplicate' || claimed.status === 'completed_duplicate') {
      await this.appendOutcome({
        eventType: CODING_SESSION_EVENT.PROMPT_DUPLICATE,
        sessionId, workspaceId, actorId: userId,
        details: { sessionId, workspaceId, outcome: 'duplicate', duplicateKind: claimed.status as 'pending_duplicate' | 'completed_duplicate' },
      });
      return { ok: true, value: { outcome: claimed.status, sessionId, idempotencyKey } };
    }

    if (claimed.status === 'busy') {
      return { ok: true, value: { outcome: 'busy', sessionId, state: claimed.state } };
    }

    const getResult = await this.store.getScoped(sessionId, scope);
    if (!getResult.ok) {
      await this.store.rollbackActivePrompt({ sessionId, scope, idempotencyKey });
      return { ok: false, error: storeErrToCoordErr(getResult.error) };
    }

    let shadow = getResult.value;

    if (shadow.githubCredentialExpiresAt && shadow.githubInstallationId && shadow.githubRepositoryId) {
      const remainingS = (new Date(shadow.githubCredentialExpiresAt).getTime() / 1000) - this.nowSeconds();
      if (remainingS < CREDENTIAL_REFRESH_THRESHOLD_S) {
        const refreshed = await this.refreshCredential(shadow, userId);
        if (!refreshed.ok) {
          await this.store.rollbackActivePrompt({ sessionId, scope, idempotencyKey });
          return refreshed;
        }
        shadow = refreshed.value;
      }
    }

    let promptToken: string;
    try {
      promptToken = await mintCodingNodeJwt(shadowToJwtScope(shadow));
    } catch (err) {
      await this.store.rollbackActivePrompt({ sessionId, scope, idempotencyKey });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: `JWT mint failed: ${err instanceof Error ? err.message : String(err)}` } };
    }

    const { message } = params;
    const promptResult = await this.nodeClient.prompt(shadow.nodeBaseUrl ?? '', promptToken, sessionId, message, idempotencyKey);
    if (!promptResult.ok) {
      await this.store.rollbackActivePrompt({ sessionId, scope, idempotencyKey });
      return { ok: false, error: { code: 'NODE_UNREACHABLE', message: `Node error: ${promptResult.error.code ?? 'unknown'}` } };
    }

    // Outcome audit — fail_observable; node accepted the prompt, do not roll back.
    await this.appendOutcome({
      eventType: CODING_SESSION_EVENT.PROMPT_ACCEPTED,
      sessionId, workspaceId, actorId: userId,
      details: { sessionId, workspaceId, state: 'PROMPTING', outcome: 'accepted', idempotencyKeyPresent: Boolean(idempotencyKey) },
    });

    return { ok: true, value: { outcome: 'accepted', sessionId } };
  }

  async abortSession(opts: { sessionId: string; workspaceId: string; userId: string; tenantId: string }): Promise<CoordinatorResult<void>> {
    const { sessionId, workspaceId, userId, tenantId } = opts;
    const scope = scopeFor(workspaceId, userId, tenantId);

    // Intent audit — fail_closed before abort.
    try {
      await this.auditSink.append({
        eventType: CODING_SESSION_EVENT.ABORT_REQUESTED,
        sessionId, workspaceId, actorId: userId, actorType: 'user',
        details: { sessionId, workspaceId, state: 'PROMPTING', outcome: 'requested' },
      });
    } catch (err) {
      logger.error('coordinator: ABORT_REQUESTED audit failed (fail-closed)', { sessionId });
      return { ok: false, error: { code: 'AUDIT_FAILED', message: err instanceof Error ? err.message : String(err) } };
    }

    const getResult = await this.store.getScoped(sessionId, scope);
    if (!getResult.ok) return { ok: false, error: storeErrToCoordErr(getResult.error) };

    const shadow = getResult.value;
    let abortToken: string;
    try {
      abortToken = await mintCodingNodeJwt(shadowToJwtScope(shadow));
    } catch (err) {
      return { ok: false, error: { code: 'NODE_ABORT_FAILED', message: `JWT mint failed: ${err instanceof Error ? err.message : String(err)}` } };
    }

    const abortResult = await this.nodeClient.abort(shadow.nodeBaseUrl ?? '', abortToken, sessionId);
    if (!abortResult.ok) {
      return { ok: false, error: { code: 'NODE_ABORT_FAILED', message: `Node abort error: ${abortResult.error.code ?? 'unknown'}` } };
    }

    const activeKey = shadow.activeIdempotencyKey ?? '';
    const rollback = await this.store.rollbackActivePrompt({ sessionId, scope, idempotencyKey: activeKey });
    if (!rollback.ok) return { ok: false, error: storeErrToCoordErr(rollback.error) };

    // Outcome audit — fail_observable; abort already succeeded.
    await this.appendOutcome({
      eventType: CODING_SESSION_EVENT.ABORT_COMPLETED,
      sessionId, workspaceId, actorId: userId,
      details: { sessionId, workspaceId, state: 'READY', outcome: 'aborted' },
    });

    return { ok: true, value: undefined };
  }

  async closeSession(opts: { sessionId: string; workspaceId: string; userId: string; tenantId: string }): Promise<CoordinatorResult<void>> {
    const { sessionId, workspaceId, userId, tenantId } = opts;
    const scope = scopeFor(workspaceId, userId, tenantId);

    // Intent audit — fail_closed before node close/destroy.
    try {
      await this.auditSink.append({
        eventType: CODING_SESSION_EVENT.CLOSE_REQUESTED,
        sessionId, workspaceId, actorId: userId, actorType: 'user',
        details: { sessionId, workspaceId, state: 'READY', outcome: 'requested' },
      });
    } catch (err) {
      logger.error('coordinator: CLOSE_REQUESTED audit failed (fail-closed)', { sessionId });
      return { ok: false, error: { code: 'AUDIT_FAILED', message: err instanceof Error ? err.message : String(err) } };
    }

    const getResult = await this.store.getScoped(sessionId, scope);
    if (!getResult.ok) {
      if (getResult.error.code === 'NOT_FOUND') return { ok: true, value: undefined };
      return { ok: false, error: storeErrToCoordErr(getResult.error) };
    }

    const shadow = getResult.value;
    let closeToken: string;
    try {
      closeToken = await mintCodingNodeJwt(shadowToJwtScope(shadow));
    } catch (err) {
      return { ok: false, error: { code: 'NODE_CLOSE_FAILED', message: `JWT mint failed: ${err instanceof Error ? err.message : String(err)}` } };
    }

    const closeResult = await this.nodeClient.close(shadow.nodeBaseUrl ?? '', closeToken, sessionId);
    if (!closeResult.ok) {
      logger.error('coordinator: node close failed', { sessionId, code: closeResult.error.code });
      return { ok: false, error: { code: 'NODE_CLOSE_FAILED', message: `Node close error: ${closeResult.error.code ?? 'unknown'}` } };
    }

    try {
      await this.fly.destroyWorkspace(shadow.machineId ?? '', shadow.volumeId ?? '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coordinator: fly destroy failed', { sessionId, error: msg });
      return { ok: false, error: { code: 'NODE_CLOSE_FAILED', message: `Fly destroy failed: ${msg}` } };
    }

    if (shadow.githubInstallationId && shadow.githubRepositoryId) {
      this.revokeCredentialBestEffort(shadow, userId, sessionId, workspaceId);
    }

    const deleted = await this.store.deleteScoped(sessionId, scope);
    if (!deleted.ok) return { ok: false, error: storeErrToCoordErr(deleted.error) };

    await this.appendOutcome({
      eventType: CODING_SESSION_EVENT.CLOSE_COMPLETED,
      sessionId, workspaceId, actorId: userId,
      details: { sessionId, workspaceId, state: 'CLOSED', outcome: 'closed' },
    });
    await this.appendOutcome({
      eventType: CODING_SESSION_EVENT.DESTROY_COMPLETED,
      sessionId, workspaceId, actorId: userId,
      details: { sessionId, workspaceId, state: 'DESTROYED', outcome: 'destroyed' },
    });

    return { ok: true, value: undefined };
  }

  private async refreshCredential(shadow: CodingSessionShadow, actorId: string): Promise<CoordinatorResult<CodingSessionShadow>> {
    const sessionId = shadow.sessionId ?? '';
    const workspaceId = shadow.workspaceId ?? '';
    const installationId = shadow.githubInstallationId ?? '';
    const repositoryId = shadow.githubRepositoryId ?? '';
    const bindingId = shadow.githubBindingId ?? '';

    try {
      await this.auditSink.append({
        eventType: CODING_SESSION_EVENT.CREDENTIAL_REFRESH_REQUESTED,
        sessionId,
        workspaceId,
        actorId,
        actorType: 'user',
        details: { sessionId, installationId, repositoryId, outcome: 'requested' },
      });
    } catch (error) {
      return { ok: false, error: { code: 'AUDIT_FAILED', message: error instanceof Error ? error.message : String(error) } };
    }

    const bindingResult = await this.installationRepo.findScopedBinding({
      bindingId,
      userId: shadow.userId ?? '',
      tenantId: shadow.tenantId ?? '',
      projectId: shadow.projectId ?? '',
      repositoryId,
    });
    if (!bindingResult.ok) {
      await this.appendOutcome({
        eventType: CODING_SESSION_EVENT.CREDENTIAL_REFRESH_FAILED,
        sessionId, workspaceId, actorId,
        details: { sessionId, installationId, repositoryId, outcome: 'failed', errorCode: bindingResult.error.code },
      });
      return { ok: false, error: { code: 'BINDING_NOT_FOUND', message: 'GitHub App binding is no longer valid' } };
    }
    const binding = bindingResult.value;

    const credResult = await this.broker.mintInstallationToken(binding);
    if (!credResult.ok) {
      await this.appendOutcome({
        eventType: CODING_SESSION_EVENT.CREDENTIAL_REFRESH_FAILED,
        sessionId, workspaceId, actorId,
        details: { sessionId, installationId, repositoryId, outcome: 'failed', errorCode: credResult.error.code },
      });
      logger.warn('coordinator: credential refresh failed', { sessionId, error: credResult.error.code });
      return { ok: false, error: { code: 'GITHUB_TOKEN_FAILED', message: credResult.error.message } };
    }

    const newCred = credResult.value;
    const jwtScope = shadowToJwtScope(shadow);
    let refreshToken: string;
    try {
      refreshToken = await mintCodingNodeJwt(jwtScope);
    } catch (error) {
      return { ok: false, error: { code: 'GITHUB_TOKEN_FAILED', message: error instanceof Error ? error.message : String(error) } };
    }

    const nodeRefresh = await this.nodeClient.refreshGithubCredential(shadow.nodeBaseUrl ?? '', refreshToken, sessionId, {
      token: newCred.token,
      expiresAt: newCred.expiresAt,
    });
    if (!nodeRefresh.ok) {
      return { ok: false, error: { code: 'NODE_UNREACHABLE', message: `Node credential refresh failed: ${nodeRefresh.error.code}` } };
    }

    const updatedShadow: CodingSessionShadow = {
      ...shadow,
      githubCredentialExpiresAt: newCred.expiresAt,
      githubRepositoryFullName: binding.repositoryFullName,
      updatedAt: Date.now(),
    };
    const putResult = await this.store.put(updatedShadow);
    if (!putResult.ok) return { ok: false, error: storeErrToCoordErr(putResult.error) };

    await this.appendOutcome({
      eventType: CODING_SESSION_EVENT.CREDENTIAL_REFRESHED,
      sessionId, workspaceId, actorId,
      details: { sessionId, installationId, repositoryId, repositoryFullName: binding.repositoryFullName, expiresAt: newCred.expiresAt, outcome: 'refreshed' },
    });

    return { ok: true, value: updatedShadow };
  }

  private revokeCredentialBestEffort(shadow: CodingSessionShadow, actorId: string, sessionId: string, workspaceId: string): void {
    const installationId = shadow.githubInstallationId;
    const repositoryId = shadow.githubRepositoryId;
    const repositoryFullName = shadow.githubRepositoryFullName;
    if (!installationId || !repositoryId || !repositoryFullName) return;

    void this.appendOutcome({
      eventType: CODING_SESSION_EVENT.CREDENTIAL_REVOKE_REQUESTED,
      sessionId, workspaceId, actorId,
      details: { sessionId, installationId, repositoryId, outcome: 'requested' },
    });

    const binding = { installationId, repositoryId, repositoryFullName };
    void this.broker.revokeCachedInstallationToken(binding).catch((error: unknown) => {
      logger.debug('coordinator: best-effort IAT revocation failed', { sessionId });
      logger.debug('coordinator: credential revocation detail', { error: error instanceof Error ? error.message : String(error) });
    });
  }

  async streamEvents(params: StreamEventsParams): Promise<void> {
    const { sessionId, workspaceId, userId, tenantId, lastEventId, signal, onEvent, onEnd, onError } = params;
    const scope = scopeFor(workspaceId, userId, tenantId);

    const getResult = await this.store.getScoped(sessionId, scope);
    if (!getResult.ok) {
      const err = getResult.error;
      if (err.code === 'NOT_FOUND') onError(`session_not_found:${sessionId}`);
      else if (err.code === 'OWNER_MISMATCH') onError(`owner_mismatch:${sessionId}`);
      else onError(`redis_unavailable:${storeErrToCoordErr(err).code}`);
      onEnd();
      return;
    }

    const shadow = getResult.value;
    const resolvedLastEventId = lastEventId ?? shadow.lastEventId;

    let sseToken: string;
    try {
      sseToken = await mintCodingNodeJwt(shadowToJwtScope(shadow));
    } catch (err) {
      onError(`jwt_mint_failed:${err instanceof Error ? err.message : String(err)}`);
      onEnd();
      return;
    }

    const handleEvent = async (parsed: CodingSessionEvent): Promise<void> => {
      const rawLine = `event: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`;
      onEvent(rawLine);

      if (parsed.id) {
        const updated = await this.store.updateLastEventId(sessionId, scope, parsed.id);
        if (!updated.ok) logger.warn('coordinator: updateLastEventId failed', { sessionId, code: updated.error.code });
      }

      const type = parsed.type;
      if (type === 'agent_end' || type === 'session_aborted') {
        const completed = await this.store.completeActivePrompt({ sessionId, scope, nextState: 'READY' });
        if (!completed.ok) logger.warn('coordinator: completeActivePrompt failed', { sessionId, code: completed.error.code });
      } else if (type === 'session_closed') {
        const completed = await this.store.completeActivePrompt({ sessionId, scope, nextState: 'CLOSED' });
        if (!completed.ok) logger.warn('coordinator: completeActivePrompt(CLOSED) failed', { sessionId, code: completed.error.code });
      } else if (type === 'error') {
        const completed = await this.store.completeActivePrompt({ sessionId, scope, nextState: 'ERROR' });
        if (!completed.ok) logger.warn('coordinator: completeActivePrompt(ERROR) failed', { sessionId, code: completed.error.code });
      }
    };

    await this.nodeClient.streamEvents({
      baseUrl: shadow.nodeBaseUrl ?? '',
      token: sseToken,
      sessionId,
      lastEventId: resolvedLastEventId ?? undefined,
      signal,
      credentialSecrets: [],
      onEvent: handleEvent,
      onEnd,
      onError: (err) => { onError(`${err.code}:${('message' in err ? err.message : '') ?? ''}`); },
    });
  }

  private async pollVerifyUntilReady(
    nodeBaseUrl: string,
    jwtScope: JwtScope,
    sessionId: string,
    scope: CodingSessionScope,
    machineId: string,
    volumeId: string,
    actorId: string,
  ): Promise<CoordinatorResult<CodingSessionShadow>> {
    for (let attempt = 0; attempt < this.maxVerifyAttempts; attempt++) {
      if (attempt > 0) await this.sleep(this.verifyPollMs);

      let verifyToken: string;
      try {
        verifyToken = await mintCodingNodeJwt(jwtScope);
      } catch (err) {
        logger.warn('coordinator: JWT mint failed during verify poll', { sessionId, attempt, error: err instanceof Error ? err.message : String(err) });
        continue;
      }

      const vr = await this.nodeClient.verify(nodeBaseUrl, verifyToken, sessionId);
      if (!vr.ok) {
        if (vr.error.code === 'NODE_AUTH_FAILED') {
          await this.cleanupMachine(machineId, volumeId, sessionId);
          await this.store.deleteScoped(sessionId, scope);
          return { ok: false, error: { code: 'NODE_UNREACHABLE', message: 'Node auth failed during verify' } };
        }
        logger.warn('coordinator: verify attempt failed', { sessionId, attempt, code: vr.error.code });
        continue;
      }

      const { state } = vr.value;
      if (state === 'ERROR') {
        await this.cleanupMachine(machineId, volumeId, sessionId);
        await this.store.deleteScoped(sessionId, scope);
        return { ok: false, error: { code: 'NODE_UNREACHABLE', message: 'Node reported ERROR during startup' } };
      }

      if (state === 'READY') {
        const getResult = await this.store.getScoped(sessionId, scope);
        if (!getResult.ok) {
          await this.cleanupMachine(machineId, volumeId, sessionId);
          return { ok: false, error: storeErrToCoordErr(getResult.error) };
        }
        const readyShadow: CodingSessionShadow = { ...getResult.value, state: 'READY', updatedAt: Date.now() };
        const putResult = await this.store.put(readyShadow);
        if (!putResult.ok) {
          logger.error('coordinator: final shadow put failed', { sessionId });
          await this.cleanupMachine(machineId, volumeId, sessionId);
          return { ok: false, error: storeErrToCoordErr(putResult.error) };
        }

        // SESSION_READY outcome audit — fail_observable.
        await this.appendOutcome({
          eventType: CODING_SESSION_EVENT.SESSION_READY,
          sessionId, workspaceId: readyShadow.workspaceId ?? '', actorId,
          details: { sessionId, workspaceId: readyShadow.workspaceId ?? '', state: 'READY', outcome: 'ready' },
        });

        return { ok: true, value: readyShadow };
      }

      logger.debug('coordinator: verify polling', { sessionId, attempt, state });
    }

    logger.error('coordinator: verify timeout', { sessionId });
    await this.cleanupMachine(machineId, volumeId, sessionId);
    await this.store.deleteScoped(sessionId, scope);
    return { ok: false, error: { code: 'NODE_UNREACHABLE', message: `Node did not become READY after ${this.maxVerifyAttempts} attempts` } };
  }

  private async cleanupMachine(machineId: string, volumeId: string, sessionId: string): Promise<void> {
    try {
      await this.fly.destroyWorkspace(machineId, volumeId);
    } catch (err) {
      logger.warn('coordinator: cleanup failed', { sessionId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async transitionEgressPhase(opts: {
    baseUrl: string;
    jwtScope: JwtScope;
    sessionId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    tenantId: string;
    repositoryId: string;
    phase: 'setup' | 'agent';
    actorId: string;
    intentEvent: (typeof CODING_SESSION_EVENT)[keyof typeof CODING_SESSION_EVENT];
    outcomeEventOk: (typeof CODING_SESSION_EVENT)[keyof typeof CODING_SESSION_EVENT];
    outcomeEventFail: (typeof CODING_SESSION_EVENT)[keyof typeof CODING_SESSION_EVENT];
  }): Promise<CoordinatorResult<undefined>> {
    try {
      await this.auditSink.append({
        eventType: opts.intentEvent,
        sessionId: opts.sessionId,
        workspaceId: opts.workspaceId,
        actorId: opts.actorId,
        actorType: 'user',
        details: { sessionId: opts.sessionId, workspaceId: opts.workspaceId, phase: opts.phase, outcome: 'requested' },
      });
    } catch (err) {
      logger.error('coordinator: phase intent audit failed (fail-closed)', { sessionId: opts.sessionId });
      return { ok: false, error: { code: 'AUDIT_FAILED', message: err instanceof Error ? err.message : String(err) } };
    }

    let token: string;
    try {
      token = await mintCodingNodeJwt(opts.jwtScope);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.appendOutcome({
        eventType: opts.outcomeEventFail,
        sessionId: opts.sessionId, workspaceId: opts.workspaceId, actorId: opts.actorId,
        details: { sessionId: opts.sessionId, workspaceId: opts.workspaceId, phase: opts.phase, outcome: 'failed', errorCode: 'JWT_MINT_FAILED' },
      });
      return { ok: false, error: { code: 'PHASE_TRANSITION_FAILED', message: `JWT mint failed: ${msg}` } };
    }

    const nodeReq = {
      sessionId: opts.sessionId,
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      userId: opts.userId,
      tenantId: opts.tenantId,
      repositoryId: opts.repositoryId,
      phase: opts.phase,
    };
    const baseUrl = opts.baseUrl.replace(/\/$/, '').endsWith(`:${CODING_NODE_PORT}`)
      ? `${opts.baseUrl.replace(/\/$/, '').replace(`:${CODING_NODE_PORT}`, ':15444')}`
      : opts.baseUrl;
    const r = await this.nodeClient.setEgressPhase(baseUrl, token, nodeReq);
    if (!r.ok) {
      await this.appendOutcome({
        eventType: opts.outcomeEventFail,
        sessionId: opts.sessionId, workspaceId: opts.workspaceId, actorId: opts.actorId,
        details: { sessionId: opts.sessionId, workspaceId: opts.workspaceId, phase: opts.phase, outcome: 'failed', errorCode: r.error.code },
      });
      return { ok: false, error: { code: 'PHASE_TRANSITION_FAILED', message: `phase transition to ${opts.phase} rejected: ${r.error.code}` } };
    }

    await this.appendOutcome({
      eventType: opts.outcomeEventOk,
      sessionId: opts.sessionId, workspaceId: opts.workspaceId, actorId: opts.actorId,
      details: { sessionId: opts.sessionId, workspaceId: opts.workspaceId, phase: opts.phase, outcome: 'applied' },
    });
    return { ok: true, value: undefined };
  }

  // Append an outcome event; swallows errors (fail_observable — mutation already happened).
  private async appendOutcome(opts: {
    eventType: (typeof CODING_SESSION_EVENT)[keyof typeof CODING_SESSION_EVENT];
    sessionId: string;
    workspaceId: string;
    actorId: string;
    details: import('./coding_session_audit_sink.js').CodingSessionAuditDetails;
  }): Promise<void> {
    try {
      await this.auditSink.append({
        ...opts,
        actorType: 'user',
      });
    } catch (err) {
      logger.warn('coordinator: outcome audit failed (swallowed)', {
        eventType: opts.eventType,
        sessionId: opts.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
