/**
 * QUARANTINED — NOT ON ANY LIVE PATH (2026-08-15).
 *
 * CodingAgentExecutor is never constructed anywhere in the codebase. It belongs
 * to the coding tier, which cannot run on this deployment: the only machine
 * backend is Fly.io and the clone path is hardcoded to github.com while this
 * homelab runs Gitea. See apps/backend/services/exec-node-coding/AGENTS.md.
 *
 * Do not wire this up on the strength of it looking complete.
 */
import { EventEmitter } from 'events';
import { logger, NotFoundError } from '@uaip/utils';
import { WorkspaceManager } from './workspace_manager_service.js';

type AgentSession = {
  prompt: (message: string) => Promise<void>;
  abort?: () => void;
  subscribe?: (cb: (event: unknown) => void) => (() => void) | void;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extractEventType(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined;
  return typeof event.type === 'string' ? event.type : undefined;
}

export interface LLMCredential {
  provider: string;
  type: 'api_key' | 'oauth';
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface CreateCodingSessionOptions {
  sessionId: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  llmCredentials: LLMCredential[];
  systemPromptAdditions?: string;
  continuePreviousSession?: boolean;
}

export interface CodingAgentEvent {
  type:
    | 'agent_start'
    | 'turn_start'
    | 'message_update'
    | 'message_end'
    | 'tool_execution_start'
    | 'tool_execution_update'
    | 'tool_execution_end'
    | 'turn_end'
    | 'agent_end'
    | 'error';
  sessionId: string;
  payload: unknown;
  timestamp: Date;
}

export class CodingAgentExecutor extends EventEmitter {
  private static instance: CodingAgentExecutor;
  private activeSessions = new Map<
    string,
    { session: AgentSession; workspaceId: string; userId: string }
  >();
  private workspaceManager: WorkspaceManager;
  private eventBus: { publish: (topic: string, data: unknown) => Promise<void> } | null = null;

  constructor(
    workspaceManager: WorkspaceManager,
    eventBus?: { publish: (topic: string, data: unknown) => Promise<void> } | null
  ) {
    super();
    this.workspaceManager = workspaceManager;
    this.eventBus = eventBus ?? null;
  }

  static getInstance(
    workspaceManager?: WorkspaceManager,
    eventBus?: { publish: (topic: string, data: unknown) => Promise<void> } | null
  ): CodingAgentExecutor {
    if (!CodingAgentExecutor.instance) {
      CodingAgentExecutor.instance = new CodingAgentExecutor(
        workspaceManager || WorkspaceManager.getInstance(),
        eventBus
      );
    }
    return CodingAgentExecutor.instance;
  }

  async createSession(
    options: CreateCodingSessionOptions
  ): Promise<{ sessionId: string; ready: boolean }> {
    const { sessionId, workspaceId, llmCredentials } = options;

    logger.info('Creating coding agent session', { sessionId, workspaceId });

    try {
      let piModule: unknown;
      try {
        const moduleName = '@mariozechner/pi-coding-agent';
        piModule = await import(moduleName);
      } catch (importErr) {
        logger.error('pi-coding-agent not installed; session cannot be created via CodingAgentExecutor', { sessionId });
        throw new Error(
          `pi-coding-agent module unavailable: ${importErr instanceof Error ? importErr.message : String(importErr)}`,
          { cause: importErr },
        );
      }

      type PiAgentModule = {
        createAgentSession?: (args: Record<string, unknown>) => Promise<{ session: AgentSession }>;
        AuthStorage?: { inMemory: (data: Record<string, unknown>) => unknown };
        SessionManager?: { inMemory: () => unknown };
      };
      function isPiAgentModule(v: unknown): v is PiAgentModule {
        return isRecord(v);
      }
      if (!isPiAgentModule(piModule)) {
        throw new NotFoundError('pi-coding-agent module has unexpected shape');
      }
      const mod = piModule;

      if (!mod.createAgentSession || !mod.AuthStorage || !mod.SessionManager) {
        throw new NotFoundError('pi-coding-agent module is missing expected exports');
      }

      const authData: Record<string, unknown> = {};
      for (const cred of llmCredentials) {
        if (cred.type === 'api_key' && cred.apiKey) {
          authData[cred.provider] = { type: 'api_key', key: cred.apiKey };
        } else if (cred.type === 'oauth' && cred.accessToken) {
          const expiresAt =
            cred.expiresAt instanceof Date ? cred.expiresAt.getTime() : Date.now() + 3600000;
          authData[cred.provider] = {
            type: 'oauth',
            access_token: cred.accessToken,
            refresh_token: cred.refreshToken,
            expires: expiresAt,
          };
        }
      }

      const authStorage = mod.AuthStorage.inMemory(authData);

      const workspace = await this.workspaceManager.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError(`Workspace ${workspaceId} not found or not ready`);
      }

      const { session } = await mod.createAgentSession({
        cwd: workspace.workspacePath,
        authStorage,
        sessionManager: mod.SessionManager.inMemory(),
      });

      session.subscribe?.((event: unknown) => {
        const agentEvent: CodingAgentEvent = {
          type: this.mapEventType(extractEventType(event) ?? 'error'),
          sessionId,
          payload: event,
          timestamp: new Date(),
        };
        this.emit('agent:event', agentEvent);
        this.emit(`session:${sessionId}:event`, agentEvent);
        // Fan-out via event bus for Socket.IO relay in discussion-orchestration
        this.eventBus
          ?.publish('coding.agent.event', agentEvent)
          .catch((err: unknown) => logger.warn('Failed to publish coding.agent.event', { err }));
      });

      this.activeSessions.set(sessionId, { session, workspaceId, userId: options.userId });
      logger.info('Coding agent session created', { sessionId });

      return { sessionId, ready: true };
    } catch (error) {
      logger.error('Failed to create coding agent session', { sessionId, error });
      throw error;
    }
  }

  async prompt(sessionId: string, message: string): Promise<void> {
    const entry = this.activeSessions.get(sessionId);
    if (!entry) throw new NotFoundError(`Session ${sessionId} not found`);

    logger.info('Sending prompt to coding agent', { sessionId, messageLength: message.length });
    await entry.session.prompt(message);
  }

  async abort(sessionId: string): Promise<void> {
    const entry = this.activeSessions.get(sessionId);
    if (!entry) return;
    entry.session.abort?.();
    logger.info('Coding agent session aborted', { sessionId });
  }

  async closeSession(sessionId: string): Promise<void> {
    const entry = this.activeSessions.get(sessionId);
    if (!entry) return;
    await this.abort(sessionId);
    this.activeSessions.delete(sessionId);
    this.emit('session:closed', { sessionId });
    logger.info('Coding agent session closed', { sessionId });
  }

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  private mapEventType(piEventType: string): CodingAgentEvent['type'] {
    const map: Record<string, CodingAgentEvent['type']> = {
      agent_start: 'agent_start',
      turn_start: 'turn_start',
      message_update: 'message_update',
      message_end: 'message_end',
      tool_execution_start: 'tool_execution_start',
      tool_execution_update: 'tool_execution_update',
      tool_execution_end: 'tool_execution_end',
      turn_end: 'turn_end',
      agent_end: 'agent_end',
    };
    return map[piEventType] || 'error';
  }

  private createMockSession(sessionId: string): AgentSession {
    return {
      prompt: async (message: string) => {
        logger.info('[MOCK] Agent received prompt', { sessionId, message: message.slice(0, 100) });

        setTimeout(() => {
          const startEvent: CodingAgentEvent = {
            type: 'agent_start',
            sessionId,
            payload: { message: 'Mock agent started' },
            timestamp: new Date(),
          };
          this.emit('agent:event', startEvent);
          this.emit(`session:${sessionId}:event`, startEvent);
          this.eventBus?.publish('coding.agent.event', startEvent).catch((err) => {
            logger.warn('Failed to publish coding agent start event', { sessionId, error: err instanceof Error ? err.message : String(err) });
          });

          setTimeout(() => {
            const updateEvent: CodingAgentEvent = {
              type: 'message_update',
              sessionId,
              payload: {
                delta: `[Mock response] I received your message: "${message.slice(0, 50)}"`,
              },
              timestamp: new Date(),
            };
            this.emit('agent:event', updateEvent);
            this.emit(`session:${sessionId}:event`, updateEvent);
            this.eventBus?.publish('coding.agent.event', updateEvent).catch((err) => {
              logger.warn('Failed to publish coding agent update event', { sessionId, error: err instanceof Error ? err.message : String(err) });
            });

            const endEvent: CodingAgentEvent = {
              type: 'agent_end',
              sessionId,
              payload: { messages: [] },
              timestamp: new Date(),
            };
            this.emit('agent:event', endEvent);
            this.emit(`session:${sessionId}:event`, endEvent);
            this.eventBus?.publish('coding.agent.event', endEvent).catch((err) => {
              logger.warn('Failed to publish coding agent end event', { sessionId, error: err instanceof Error ? err.message : String(err) });
            });
          }, 500);
        }, 100);
      },
      abort: () => {},
      subscribe: (_cb: (event: unknown) => void) => () => {},
    };
  }
}
