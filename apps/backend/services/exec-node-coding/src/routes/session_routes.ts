import * as fs from 'node:fs';
import * as path from 'node:path';
import Elysia, { t } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import {
  CreateCodingSessionRequestSchema,
  PromptCodingSessionRequestSchema,
  CodingSessionManifestSchema,
} from '@uaip/types';
import type { CodingNodeJwtClaims, CreateCodingSessionRequest, CodingCredential, GitHubCredential } from '@uaip/types';
import { requireJwtClaims } from '../auth/jwt_auth.js';
import { logScopeDenial } from '../auth/scope_denial_logger.js';
import { CodingSession, ConflictError, AbortError } from '../session/coding_session.js';
import { realPiLoader, validateSafeId, validateWorkspacePath } from '../session/pi_loader.js';
import { installGitCredentialEnvironment, secureGitClone } from '../session/secure_git_clone.js';
import type { PiLoader, PiLoaderOptions } from '../session/pi_loader.js';
import type { SessionRegistry } from '../session/session_registry.js';
import type { CodingNodeConfig } from '../config.js';

const CredentialRefreshBodySchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
});

type ScopeMismatch = { field: string; body: string; token: string };

type ParsedGitHubCredentialInput = {
  token?: string;
  expiresAt?: string;
  repositoryFullName?: string;
  cloneUrl?: string;
};

type ParsedCreateInput = {
  sessionId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  tenantId?: string;
  repositoryId?: string;
  workspacePath?: string;
  llmCredentials?: ParsedCredentialInput[];
  githubCredential?: ParsedGitHubCredentialInput;
  systemPromptAdditions?: string;
  continueSessionFile?: string;
};

type ParsedCredentialInput = {
  provider?: string;
  type?: 'api_key' | 'oauth';
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

function narrowCreateRequest(raw: ParsedCreateInput): CreateCodingSessionRequest {
  if (
    typeof raw.sessionId !== 'string' ||
    typeof raw.workspaceId !== 'string' ||
    typeof raw.projectId !== 'string' ||
    typeof raw.userId !== 'string' ||
    typeof raw.tenantId !== 'string' ||
    typeof raw.repositoryId !== 'string' ||
    typeof raw.workspacePath !== 'string' ||
    !Array.isArray(raw.llmCredentials)
  ) {
    throw new Error('Parsed request missing required fields (Zod default not applied)');
  }
  const llmCredentials: CodingCredential[] = [];
  for (const cred of raw.llmCredentials) {
    if (typeof cred.provider !== 'string' || typeof cred.type !== 'string') {
      throw new Error('Invalid credential: missing provider or type');
    }
    llmCredentials.push({
      provider: cred.provider,
      type: cred.type,
      apiKey: cred.apiKey,
      accessToken: cred.accessToken,
      refreshToken: cred.refreshToken,
      expiresAt: cred.expiresAt,
    });
  }
  let githubCredential: GitHubCredential | undefined;
  if (raw.githubCredential !== undefined) {
    const gc = raw.githubCredential;
    if (
      typeof gc.token !== 'string' || !gc.token ||
      typeof gc.expiresAt !== 'string' || !gc.expiresAt ||
      typeof gc.repositoryFullName !== 'string' || !gc.repositoryFullName ||
      typeof gc.cloneUrl !== 'string' || !gc.cloneUrl
    ) {
      throw new Error('githubCredential is missing required fields');
    }
    githubCredential = {
      token: gc.token,
      expiresAt: gc.expiresAt,
      repositoryFullName: gc.repositoryFullName,
      cloneUrl: gc.cloneUrl,
    };
  }

  return {
    sessionId: raw.sessionId,
    workspaceId: raw.workspaceId,
    projectId: raw.projectId,
    userId: raw.userId,
    tenantId: raw.tenantId,
    repositoryId: raw.repositoryId,
    workspacePath: raw.workspacePath,
    llmCredentials,
    githubCredential,
    systemPromptAdditions: raw.systemPromptAdditions,
    continueSessionFile: raw.continueSessionFile,
  };
}

function checkScopeMismatch(claims: CodingNodeJwtClaims, req: CreateCodingSessionRequest): ScopeMismatch | null {
  if (claims.sessionId !== req.sessionId) return { field: 'sessionId', body: req.sessionId, token: claims.sessionId };
  if (claims.workspaceId !== req.workspaceId) return { field: 'workspaceId', body: req.workspaceId, token: claims.workspaceId };
  if (claims.projectId !== req.projectId) return { field: 'projectId', body: req.projectId, token: claims.projectId };
  if (claims.tenantId !== req.tenantId) return { field: 'tenantId', body: req.tenantId, token: claims.tenantId };
  if (claims.userId !== req.userId) return { field: 'userId', body: req.userId, token: claims.userId };
  if (claims.repositoryId !== req.repositoryId) return { field: 'repositoryId', body: req.repositoryId, token: claims.repositoryId };
  return null;
}

function requireSessionScope(claims: CodingNodeJwtClaims, pathId: string): ScopeMismatch | null {
  if (claims.sessionId !== pathId) return { field: 'sessionId', body: pathId, token: claims.sessionId };
  return null;
}

const CreateBody = t.Object({
  sessionId: t.String({ minLength: 1 }),
  workspaceId: t.String({ minLength: 1 }),
  projectId: t.String({ minLength: 1 }),
  userId: t.String({ minLength: 1 }),
  tenantId: t.String({ minLength: 1 }),
  repositoryId: t.String({ minLength: 1, pattern: '^[1-9]\\d*$' }),
  workspacePath: t.Optional(t.String({ minLength: 1 })),
  llmCredentials: t.Optional(
    t.Array(t.Object({
      provider: t.String({ minLength: 1 }),
      type: t.Union([t.Literal('api_key'), t.Literal('oauth')]),
      apiKey: t.Optional(t.String()),
      accessToken: t.Optional(t.String()),
      refreshToken: t.Optional(t.String()),
      expiresAt: t.Optional(t.Number()),
    }))
  ),
  githubCredential: t.Optional(t.Object({
    token: t.String({ minLength: 1 }),
    expiresAt: t.String({ minLength: 1 }),
    repositoryFullName: t.String({ minLength: 3 }),
    cloneUrl: t.String({ minLength: 1 }),
  })),
  systemPromptAdditions: t.Optional(t.String()),
  continueSessionFile: t.Optional(t.String()),
});

const PromptBody = t.Object({
  message: t.String({ minLength: 1 }),
  idempotencyKey: t.String({ minLength: 1 }),
});

export function createSessionRoutes(
  registry: SessionRegistry,
  config: CodingNodeConfig,
  piLoader: PiLoader = realPiLoader
) {
  return new Elysia()
    .post(
      '/sessions',
      async ({ body, set, request }) => {
        const parsed = CreateCodingSessionRequestSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Invalid request body', issues: parsed.error.issues };
        }

        let req: CreateCodingSessionRequest;
        try {
          req = narrowCreateRequest(parsed.data);
        } catch (err) {
          set.status = 500;
          return { error: err instanceof Error ? err.message : String(err) };
        }

        try {
          validateSafeId(req.sessionId, 'sessionId');
          validateSafeId(req.workspaceId, 'workspaceId');
          validateSafeId(req.projectId, 'projectId');
          validateSafeId(req.userId, 'userId');
          validateSafeId(req.tenantId, 'tenantId');
          validateWorkspacePath(req.workspacePath, config.workspaceRoot);
        } catch (err) {
          set.status = 400;
          return { error: err instanceof Error ? err.message : String(err) };
        }

        let jwtClaims: CodingNodeJwtClaims;
        try {
          jwtClaims = await requireJwtClaims(request);
        } catch {
          set.status = 401;
          return { error: 'Invalid or expired JWT' };
        }

        const mismatch = checkScopeMismatch(jwtClaims, req);
        if (mismatch) {
          logScopeDenial({
            route: '/sessions',
            mismatchField: mismatch.field,
            pathSessionId: req.sessionId,
            jwtSessionId: jwtClaims.sessionId,
            jwtUserId: jwtClaims.userId,
          });
          set.status = 403;
          return { error: `JWT scope mismatch on field: ${mismatch.field}` };
        }

        if (registry.has(req.sessionId)) {
          set.status = 409;
          return { error: 'Session already exists', sessionId: req.sessionId };
        }

        const workspacePath: string = req.workspacePath;
        const sessionDir = path.join(config.sessionDir, req.workspaceId);
        const manifestPath = path.join(sessionDir, `${req.sessionId}.manifest.json`);
        const eventTailPath = path.join(sessionDir, `${req.sessionId}.events.jsonl`);

        const isResume = Boolean(req.continueSessionFile);

        if ('githubToken' in body) {
          set.status = 400;
          return { error: 'githubToken is not accepted; use githubCredential from server' };
        }

        const ghCred = req.githubCredential;
        const credentialSecrets: string[] = [];
        for (const cred of req.llmCredentials) {
          if (cred.apiKey) credentialSecrets.push(cred.apiKey);
          if (cred.accessToken) credentialSecrets.push(cred.accessToken);
          if ('refreshToken' in cred && typeof cred.refreshToken === 'string') {
            credentialSecrets.push(cred.refreshToken);
          }
        }
        if (ghCred) {
          credentialSecrets.push(ghCred.token);
        }

        const session = new CodingSession({
          id: req.sessionId,
          workspaceId: req.workspaceId,
          projectId: req.projectId,
          userId: req.userId,
          tenantId: req.tenantId,
          repositoryId: req.repositoryId,
          sessionFile: req.continueSessionFile ?? path.join(sessionDir, `${req.sessionId}.jsonl`),
          manifestPath,
          eventTailPath,
          replayBufferSize: config.replayBufferSize,
          completedKeyTtlMs: config.completedKeyTtlMs,
          credentialSecrets,
        });

        registry.add(session);

        const loaderOptions: PiLoaderOptions = {
          cwd: workspacePath,
          sessionDir,
          workspaceRoot: config.workspaceRoot,
          credentials: req.llmCredentials,
          continueSessionFile: req.continueSessionFile,
          systemPromptAdditions: req.systemPromptAdditions,
        };

        initializePiSession(session, req.sessionId, loaderOptions, piLoader, isResume, manifestPath, ghCred).catch(
          (err: unknown) => {
            logger.error('exec-node-coding: async pi init failed', {
              sessionId: req.sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        );

        set.status = 202;
        return { sessionId: req.sessionId, state: 'CREATING' as const };
      },
      { body: CreateBody }
    )

    .post(
      '/sessions/:id/prompt',
      async ({ params, body, set, request }) => {
        let claims: CodingNodeJwtClaims;
        try {
          claims = await requireJwtClaims(request);
        } catch {
          set.status = 401;
          return { error: 'Invalid or expired JWT' };
        }

        const scopeMismatch = requireSessionScope(claims, params.id);
        if (scopeMismatch) {
          logScopeDenial({
            route: '/sessions/:id/prompt',
            mismatchField: scopeMismatch.field,
            pathSessionId: params.id,
            jwtSessionId: claims.sessionId,
            jwtUserId: claims.userId,
          });
          set.status = 403;
          return { error: 'JWT sessionId does not match path' };
        }

        const session = registry.get(params.id);
        if (!session) {
          set.status = 404;
          return { error: `Session ${params.id} not found` };
        }

        const parsed = PromptCodingSessionRequestSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Invalid request body', issues: parsed.error.issues };
        }
        const { message, idempotencyKey } = parsed.data;
        if (typeof message !== 'string' || typeof idempotencyKey !== 'string') {
          set.status = 500;
          return { error: 'Prompt request missing required fields' };
        }

        try {
          const result = await session.sendPrompt(message, idempotencyKey);
          if (result.alreadyCompleted) {
            return { sessionId: params.id, state: session.state, alreadyCompleted: true };
          }
        } catch (err) {
          if (err instanceof ConflictError) {
            set.status = 409;
            return { error: err.message, code: err.code };
          }
          if (err instanceof Error && err.message.includes('not READY')) {
            set.status = 409;
            return { error: err.message };
          }
          throw err;
        }

        return { sessionId: params.id, state: session.state };
      },
      { params: t.Object({ id: t.String() }), body: PromptBody }
    )

    .post(
      '/sessions/:id/verify',
      async ({ params, set, request }) => {
        let claims: CodingNodeJwtClaims;
        try {
          claims = await requireJwtClaims(request);
        } catch {
          set.status = 401;
          return { error: 'Invalid or expired JWT' };
        }

        const scopeMismatch = requireSessionScope(claims, params.id);
        if (scopeMismatch) {
          logScopeDenial({
            route: '/sessions/:id/verify',
            mismatchField: scopeMismatch.field,
            pathSessionId: params.id,
            jwtSessionId: claims.sessionId,
            jwtUserId: claims.userId,
          });
          set.status = 403;
          return { error: 'JWT sessionId does not match path' };
        }

        const session = registry.get(params.id);
        if (!session) {
          return { alive: false, sessionId: params.id, state: 'CLOSED' as const, lastEventSeq: 0 };
        }
        return {
          alive: session.state !== 'CLOSED' && session.state !== 'ERROR',
          sessionId: session.id,
          state: session.state,
          lastEventSeq: session.lastEventSeq,
          sessionFile: session.sessionFile,
        };
      },
      { params: t.Object({ id: t.String() }) }
    )

    .post(
      '/sessions/:id/abort',
      async ({ params, set, request }) => {
        let claims: CodingNodeJwtClaims;
        try {
          claims = await requireJwtClaims(request);
        } catch {
          set.status = 401;
          return { error: 'Invalid or expired JWT' };
        }

        const scopeMismatch = requireSessionScope(claims, params.id);
        if (scopeMismatch) {
          logScopeDenial({
            route: '/sessions/:id/abort',
            mismatchField: scopeMismatch.field,
            pathSessionId: params.id,
            jwtSessionId: claims.sessionId,
            jwtUserId: claims.userId,
          });
          set.status = 403;
          return { error: 'JWT sessionId does not match path' };
        }

        const session = registry.get(params.id);
        if (!session) {
          set.status = 404;
          return { error: `Session ${params.id} not found` };
        }

        try {
          await session.abort();
        } catch (err) {
          if (err instanceof AbortError) {
            set.status = 500;
            return { error: err.message, code: err.code, state: session.state };
          }
          throw err;
        }

        return { sessionId: params.id, state: session.state };
      },
      { params: t.Object({ id: t.String() }) }
    )

    .post(
      '/sessions/:id/credentials/github',
      async ({ params, body, set, request }) => {
        let claims: CodingNodeJwtClaims;
        try {
          claims = await requireJwtClaims(request);
        } catch {
          set.status = 401;
          return { error: 'Invalid or expired JWT' };
        }

        const scopeMismatch = requireSessionScope(claims, params.id);
        if (scopeMismatch) {
          logScopeDenial({
            route: '/sessions/:id/credentials/github',
            mismatchField: scopeMismatch.field,
            pathSessionId: params.id,
            jwtSessionId: claims.sessionId,
            jwtUserId: claims.userId,
          });
          set.status = 403;
          return { error: 'JWT sessionId does not match path' };
        }

        const session = registry.get(params.id);
        if (!session) {
          set.status = 404;
          return { error: `Session ${params.id} not found` };
        }

        const parsed = CredentialRefreshBodySchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Invalid credential refresh body', issues: parsed.error.issues };
        }

        const { token, expiresAt } = parsed.data;

        if (session.repositoryId !== claims.repositoryId) {
          set.status = 403;
          return { error: 'repositoryId scope mismatch' };
        }

        session.rotateGithubCredential(token, expiresAt);
        installGitCredentialEnvironment(token);

        return { sessionId: params.id };
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          token: t.String({ minLength: 1 }),
          expiresAt: t.String({ minLength: 1 }),
        }),
      }
    )

    .delete(
      '/sessions/:id',
      async ({ params, set, request }) => {
        let claims: CodingNodeJwtClaims;
        try {
          claims = await requireJwtClaims(request);
        } catch {
          set.status = 401;
          return { error: 'Invalid or expired JWT' };
        }

        const scopeMismatch = requireSessionScope(claims, params.id);
        if (scopeMismatch) {
          logScopeDenial({
            route: '/sessions/:id',
            mismatchField: scopeMismatch.field,
            pathSessionId: params.id,
            jwtSessionId: claims.sessionId,
            jwtUserId: claims.userId,
          });
          set.status = 403;
          return { error: 'JWT sessionId does not match path' };
        }

        const session = registry.get(params.id);
        if (!session) {
          set.status = 404;
          return { error: `Session ${params.id} not found` };
        }

        await session.close('client_requested');
        registry.delete(params.id);

        return new Response(null, { status: 204 });
      },
      { params: t.Object({ id: t.String() }) }
    );
}

async function initializePiSession(
  session: CodingSession,
  sessionId: string,
  loaderOptions: PiLoaderOptions,
  piLoader: PiLoader,
  isResume: boolean,
  manifestPath: string,
  ghCred?: GitHubCredential,
): Promise<void> {
  try {
    if (ghCred) {
      await secureGitClone({
        credential: ghCred,
        workspacePath: loaderOptions.cwd,
        isResume,
        repositoryId: session.repositoryId,
      });
    }

    if (isResume && fs.existsSync(manifestPath)) {
      let rawManifest: unknown;
      try {
        rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        throw new Error(`Failed to read manifest: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }

      const manifestResult = CodingSessionManifestSchema.safeParse(rawManifest);
      if (!manifestResult.success) {
        throw new Error(`Corrupt manifest at ${manifestPath}: ${manifestResult.error.message}`);
      }

      session.restoreFromManifest(manifestResult.data);
      const wasInterrupted = session.wasInterrupted();

      session.loadReplayFromEventTail();
      session.beginResume();

      const pair = await piLoader(loaderOptions);
      const actualFile = pair.getSessionFile();
      if (actualFile) session.updateSessionFile(actualFile);

      session.attachPiSession(pair.session);
      session.emitSessionRecovered(session.sessionFile, wasInterrupted);
      session.transition('READY');
    } else {
      const pair = await piLoader(loaderOptions);
      const actualFile = pair.getSessionFile();
      if (actualFile) session.updateSessionFile(actualFile);

      session.attachPiSession(pair.session);
      session.emitSessionCreated(session.sessionFile);
      session.transition('READY');
    }

    logger.info('exec-node-coding: session READY', { sessionId });
  } catch (err) {
    logger.error('exec-node-coding: session init failed', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      session.transition('ERROR');
    } catch (transErr) {
      logger.warn('exec-node-coding: could not transition to ERROR after init failure', {
        sessionId,
        error: transErr instanceof Error ? transErr.message : String(transErr),
      });
    }
  }
}
