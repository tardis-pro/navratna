import {
  BaseService,
  DiscussionService,
  PersonaService,
  MemoryConsolidator,
  SemanticMemoryManager,
  serviceFactory,
} from '@uaip/shared-services';
import { LLMService, UserLLMService } from '@uaip/llm-service';
import type { Agent as AgentEntity } from '@uaip/shared-services';
import {
  ActionRecommendation,
  AgentRole,
  AgentStatus,
  DiscussionStatus,
  LLMTaskType,
  MessageType,
  PersonaStatus,
  PersonaVisibility,
  SecurityLevel,
  ToolCategory,
  ToolDefinition,
  ToolExample,
} from '@uaip/types';
import { attachAuth, attachNginxAuth, requireNginxAuth, UserContext } from '@uaip/middleware';
import { ConversationEnhancementService } from './services/conversation-enhancement.service.js';
import { AgentDiscussionService } from './services/agent-discussion.service.js';
import { AgentCoreService } from './services/agent-core.service.js';
import { AgentPlanningService } from './services/agent-planning.service.js';
import type { KnowledgeGraphService as LocalKnowledgeGraphService } from '@/knowledge-graph/knowledge-graph.service';
import { DecisionEngine } from '../../../shared/services/src/agent/agent-intelligence/decision-engine.js';
import { ToolRegistryCapabilityResolver } from '../../../shared/services/src/agent/agent-intelligence/capability-resolver.js';
import { AgentStateMachine } from '../../../shared/services/src/agent-state/agent-state-machine.js';
import { logger } from '@uaip/utils';
import { z } from 'zod';
import { registerAgentRoutes } from './routes/agent.routes.js';
import { registerConstellationRoutes } from './routes/constellation.routes.js';
import { randomUUID } from 'crypto';

interface PendingApproval {
  agentId: string;
  resolve: () => void;
  reject: (reason?: string) => void;
  timeout: NodeJS.Timeout;
}

interface ApprovalRequestContext {
  userId?: string;
  socketId?: string;
}

interface ConversationMessageHistoryItem {
  id: string;
  speaker: string;
  content: string;
  timestamp: Date;
  responseType?: string;
  topic?: string;
}

class AgentIntelligenceService extends BaseService {
  private agentDiscussionService: AgentDiscussionService;
  private discussionService: DiscussionService;
  private personaService: PersonaService;
  private conversationEnhancementService: ConversationEnhancementService;
  private llmService: LLMService;
  private agentCoreService: AgentCoreService;
  private agentPlanningService: AgentPlanningService;
  private memoryConsolidator?: MemoryConsolidator;
  private semanticMemoryManager?: SemanticMemoryManager;
  private memoryConsolidationInterval?: ReturnType<typeof setInterval>;
  private pendingApprovals: Map<string, PendingApproval> = new Map();

  constructor() {
    super({
      name: 'agent-intelligence',
      port: 3001,
      version: '1.0.0',
      enableWebSocket: false,
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    });

    // Register all entities. TypeORM requires all related entities to be in the same DataSource.
    // TODO: When per-plane databases are implemented, use plane-specific entity lists
    //       (requires removing cross-plane TypeORM relations from entity classes first).
    this.registerEntities([]);
  }

  protected async setupRoutes(): Promise<void> {
    // Get the KnowledgeGraphService instance from the ServiceFactory
    const { getKnowledgeGraphService } = await import('@uaip/shared-services');
    const _knowledgeGraphService = await getKnowledgeGraphService();

    // ===== AGENT CRUD ROUTES =====

    // List all agents
    this.app.get('/api/v1/agents', async ({ query, set }) => {
      try {
        const filters = {
          limit: query.limit ? parseInt(query.limit as string) : undefined,
          offset: query.offset ? parseInt(query.offset as string) : undefined,
          role: this.parseEnumValue(query.role, AgentRole),
          status: this.parseEnumValue(query.status, AgentStatus),
          createdBy: query.createdBy as string | undefined,
        };
        const agents = await this.agentCoreService.getAgents(filters);
        return { success: true, data: agents };
      } catch (error) {
        logger.error('Failed to list agents', { error });
        set.status = 500;
        return { success: false, error: 'Failed to list agents' };
      }
    });

    // Get agent by ID
    this.app.get('/api/v1/agents/:agentId', async ({ params, set }) => {
      try {
        const agent = await this.agentCoreService.getAgent(params.agentId);
        if (!agent) {
          set.status = 404;
          return { success: false, error: 'Agent not found' };
        }
        return { success: true, data: agent };
      } catch (error) {
        logger.error('Failed to get agent', { error, agentId: params.agentId });
        set.status = 500;
        return { success: false, error: 'Failed to get agent' };
      }
    });

    // Create agent
    this.app.post('/api/v1/agents', async ({ body, set, request }) => {
      try {
        const userId = request.headers.get('x-user-id') || 'system';
        const agent = await this.agentCoreService.createAgent(
          body as Record<string, unknown>,
          userId
        );
        set.status = 201;
        return { success: true, data: agent };
      } catch (error) {
        logger.error('Failed to create agent', { error });
        set.status = 500;
        return { success: false, error: 'Failed to create agent' };
      }
    });

    // Update agent
    this.app.put('/api/v1/agents/:agentId', async ({ params, body, set, request }) => {
      try {
        const userId = request.headers.get('x-user-id') || 'system';
        const agent = await this.agentCoreService.updateAgent(
          params.agentId,
          body as Record<string, unknown>,
          userId
        );
        if (!agent) {
          set.status = 404;
          return { success: false, error: 'Agent not found' };
        }
        return { success: true, data: agent };
      } catch (error) {
        logger.error('Failed to update agent', { error, agentId: params.agentId });
        set.status = 500;
        return { success: false, error: 'Failed to update agent' };
      }
    });

    // Delete agent
    this.app.delete('/api/v1/agents/:agentId', async ({ params, set, request }) => {
      try {
        const userId = request.headers.get('x-user-id') || 'system';
        await this.agentCoreService.deleteAgent(params.agentId, userId);
        set.status = 204;
        return null;
      } catch (error) {
        logger.error('Failed to delete agent', { error, agentId: params.agentId });
        set.status = 500;
        return { success: false, error: 'Failed to delete agent' };
      }
    });

    // Agent health check
    this.app.get('/api/v1/agents/health', async () => {
      return { status: 'ok', service: 'agent-intelligence' };
    });

    registerAgentRoutes(this.app);
    registerConstellationRoutes(this.app);
    this.app.post(
      '/api/v1/agents/:agentId/approvals/:approvalId',
      async ({ params, body, set }) => {
        const payload =
          body && typeof body === 'object' ? (body as { approved?: boolean; reason?: string }) : {};

        if (typeof payload.approved !== 'boolean') {
          set.status = 400;
          return { success: false, error: 'approved must be a boolean' };
        }

        const pendingApproval = this.pendingApprovals.get(params.approvalId);
        if (!pendingApproval || pendingApproval.agentId !== params.agentId) {
          set.status = 404;
          return { success: false, error: 'Pending approval not found' };
        }

        this.pendingApprovals.delete(params.approvalId);
        clearTimeout(pendingApproval.timeout);

        if (payload.approved) {
          pendingApproval.resolve();
        } else {
          pendingApproval.reject(payload.reason);
        }

        return {
          success: true,
          data: {
            approvalId: params.approvalId,
            approved: payload.approved,
            reason: payload.reason,
          },
        };
      }
    );

    this.app.delete(
      '/api/v1/agents/:agentId/memory/semantic/:conceptId',
      async ({ params, set }) => {
        try {
          if (!this.semanticMemoryManager) {
            set.status = 503;
            return { success: false, error: 'Semantic memory manager unavailable' };
          }

          await this.semanticMemoryManager.pruneMemory(params.agentId, params.conceptId);
          return { success: true };
        } catch (error) {
          logger.error('Failed to prune semantic memory', {
            agentId: params.agentId,
            conceptId: params.conceptId,
            error: error instanceof Error ? error.message : String(error),
          });
          set.status = 500;
          return { success: false, error: 'Failed to prune semantic memory' };
        }
      }
    );

    this.app.patch(
      '/api/v1/agents/:agentId/memory/semantic/:conceptId/downvote',
      async ({ params, set }) => {
        try {
          if (!this.semanticMemoryManager) {
            set.status = 503;
            return { success: false, error: 'Semantic memory manager unavailable' };
          }

          await this.semanticMemoryManager.downvoteMemory(params.agentId, params.conceptId);
          return { success: true };
        } catch (error) {
          logger.error('Failed to downvote semantic memory', {
            agentId: params.agentId,
            conceptId: params.conceptId,
            error: error instanceof Error ? error.message : String(error),
          });
          set.status = 500;
          return { success: false, error: 'Failed to downvote semantic memory' };
        }
      }
    );

    logger.info('Agent CRUD routes configured');

    // ===== AGENT CHAT ROUTE =====
    const agentChatSchema = z.object({
      message: z.string().min(1),
      conversationHistory: z
        .array(
          z.object({
            content: z.string(),
            sender: z.string(),
            timestamp: z.string(),
          })
        )
        .optional(),
      context: z.record(z.unknown()).optional(),
    });

    this.app.group('/api/v1/agents', (app) =>
      app.use(attachAuth).post('/:agentId/chat', async (context) => {
        const { params, body, set, headers } = context;
        const user = (context as Record<string, unknown> as { user: UserContext | null }).user;

        let userId = user?.id;
        if (!userId) {
          const nginxUserId = headers['x-user-id'];
          const UUID_REGEX =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (typeof nginxUserId === 'string' && UUID_REGEX.test(nginxUserId)) {
            userId = nginxUserId;
          }
        }

        if (!userId) {
          set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        const parsed = agentChatSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'Invalid chat payload' };
        }

        try {
          const detectedIntent = this.detectChatIntent(parsed.data.message);
          const isComplexRequest = this.isComplexChatRequest(
            parsed.data.message,
            parsed.data.conversationHistory || [],
            parsed.data.context || {}
          );
          const agentRecord = await this.agentCoreService.getAgent(params.agentId);

          let executionPlanContext: string | undefined;
          if (
            this.agentPlanningService &&
            isComplexRequest &&
            (detectedIntent === 'creation' || detectedIntent === 'analysis')
          ) {
            if (agentRecord) {
              try {
                const plan = await this.agentPlanningService.generateExecutionPlan(
                  agentRecord,
                  {
                    intent: { primary: detectedIntent },
                    timestamp: new Date(),
                  },
                  parsed.data.context || {},
                  { constraints: [] }
                );

                executionPlanContext = `Execution plan: ${plan.steps
                  .map((step: Record<string, unknown>) => step.description || step.id || step.type)
                  .join(' -> ')}`;
              } catch (planError) {
                logger.warn('Failed to generate execution plan for chat loop', {
                  agentId: params.agentId,
                  detectedIntent,
                  error: planError instanceof Error ? planError.message : String(planError),
                });
              }
            }
          }

          const contextWithDecision = await this.applyToolExecutionDecisionGate(
            params.agentId,
            parsed.data.context || {},
            agentRecord,
            { userId }
          );

          const llmMessage = executionPlanContext
            ? `${parsed.data.message}\n\n${executionPlanContext}`
            : parsed.data.message;

          const result = await this.agentDiscussionService.participateInDiscussion({
            agentId: params.agentId,
            message: llmMessage,
            userId,
            conversationHistory: parsed.data.conversationHistory || [],
            context: this.ensureRecord(contextWithDecision),
          });

          await this.maybeCreateSpecialistHuddleFromResponse(
            params.agentId,
            result.response,
            this.ensureRecord(contextWithDecision)
          );

          return {
            success: true,
            data: {
              response: result.response,
              agentName: result.agentName || 'Agent',
              confidence: result.confidence || 0.8,
              model: 'unknown',
              tokensUsed: 0,
              memoryEnhanced: false,
              knowledgeUsed: result.metadata?.knowledgeUsed || 0,
              persona: null,
              conversationContext: result.metadata || {},
              timestamp: new Date().toISOString(),
              toolsExecuted: [],
            },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to chat with agent';
          logger.error('Failed to handle agent chat', { error: message, agentId: params.agentId });
          set.status = message.includes('Agent not found') ? 404 : 500;
          return { success: false, error: message };
        }
      })
    );

    // ===== PERSONA ROUTES =====

    // List personas for display
    this.app.get('/api/v1/personas', async ({ query, set }) => {
      try {
        const filters = {
          limit: query.limit ? parseInt(query.limit as string) : undefined,
          offset: query.offset ? parseInt(query.offset as string) : undefined,
          status: this.parseEnumArray(query.status, PersonaStatus),
          visibility: this.parseEnumArray(query.visibility, PersonaVisibility),
        };
        const result = await this.personaService.getPersonasForDisplay(filters);
        return { success: true, data: result.personas, total: result.total };
      } catch (error) {
        logger.error('Failed to list personas', { error });
        set.status = 500;
        return { success: false, error: 'Failed to list personas' };
      }
    });

    // Get persona by ID
    this.app.get('/api/v1/personas/:personaId', async ({ params, set }) => {
      try {
        const persona = await this.personaService.getPersona(params.personaId);
        if (!persona) {
          set.status = 404;
          return { success: false, error: 'Persona not found' };
        }
        return { success: true, data: persona };
      } catch (error) {
        logger.error('Failed to get persona', { error, personaId: params.personaId });
        set.status = 500;
        return { success: false, error: 'Failed to get persona' };
      }
    });

    // Create persona
    this.app.post('/api/v1/personas', async ({ body, set, request }) => {
      try {
        const userId = request.headers.get('x-user-id') || 'system';
        const persona = await this.personaService.createPersona({
          ...(body as Record<string, unknown>),
          createdBy: userId,
        });
        set.status = 201;
        return { success: true, data: persona };
      } catch (error) {
        logger.error('Failed to create persona', { error });
        set.status = 500;
        return { success: false, error: 'Failed to create persona' };
      }
    });

    // Update persona
    this.app.put('/api/v1/personas/:personaId', async ({ params, body, set }) => {
      try {
        const persona = await this.personaService.updatePersona(
          params.personaId,
          body as Record<string, unknown>
        );
        return { success: true, data: persona };
      } catch (error) {
        logger.error('Failed to update persona', { error, personaId: params.personaId });
        set.status = 500;
        return { success: false, error: 'Failed to update persona' };
      }
    });

    // Delete persona
    this.app.delete('/api/v1/personas/:personaId', async ({ params, set, request }) => {
      try {
        const userId = request.headers.get('x-user-id') || 'system';
        await this.personaService.deletePersona(params.personaId, userId);
        set.status = 204;
        return null;
      } catch (error) {
        logger.error('Failed to delete persona', { error, personaId: params.personaId });
        set.status = 500;
        return { success: false, error: 'Failed to delete persona' };
      }
    });

    // Search personas
    this.app.get('/api/v1/personas/search', async ({ query, set }) => {
      try {
        const filters = {
          query: query.q as string | undefined,
          limit: query.limit ? parseInt(query.limit as string) : undefined,
          offset: query.offset ? parseInt(query.offset as string) : undefined,
        };
        const personas = await this.personaService.searchPersonas(filters);
        return { success: true, data: personas };
      } catch (error) {
        logger.error('Failed to search personas', { error });
        set.status = 500;
        return { success: false, error: 'Failed to search personas' };
      }
    });

    // Get persona templates
    this.app.get('/api/v1/personas/templates', async ({ query, set }) => {
      try {
        const templates = await this.personaService.getPersonaTemplates(
          query.category as string | undefined
        );
        return { success: true, data: templates };
      } catch (error) {
        logger.error('Failed to get persona templates', { error });
        set.status = 500;
        return { success: false, error: 'Failed to get persona templates' };
      }
    });

    logger.info('Persona CRUD routes configured');

    // ===== DISCUSSION ROUTES =====

    // List discussions
    this.app.get('/api/v1/discussions', async ({ query, set }) => {
      try {
        const filters = {
          status: this.parseEnumArray(query.status, DiscussionStatus),
          limit: query.limit ? parseInt(query.limit as string) : 20,
          offset: query.offset ? parseInt(query.offset as string) : 0,
        };
        const discussions = await this.discussionService.searchDiscussions(filters);
        return { success: true, data: discussions };
      } catch (error) {
        logger.error('Failed to list discussions', { error });
        set.status = 500;
        return { success: false, error: 'Failed to list discussions' };
      }
    });

    // Search discussions
    this.app.get('/api/v1/discussions/search', async ({ query, set }) => {
      try {
        const extractSearchQuery = (queryParams: Record<string, unknown>): string | undefined => {
          const direct = queryParams.q ?? queryParams.query ?? queryParams.search;
          if (typeof direct === 'string') {
            return direct;
          }
          if (Array.isArray(direct)) {
            return direct.map((entry) => String(entry)).join('');
          }

          const numericKeys = Object.keys(queryParams).filter((key) => /^\d+$/.test(key));
          if (numericKeys.length === 0) {
            return undefined;
          }

          return numericKeys
            .sort((a, b) => Number(a) - Number(b))
            .map((key) => (typeof queryParams[key] === 'string' ? queryParams[key] : ''))
            .join('');
        };

        const stringArraySchema = z.preprocess((value) => {
          if (value === undefined || value === null) {
            return undefined;
          }
          const entries = Array.isArray(value) ? value : String(value).split(',');
          const cleaned = entries.map((entry) => String(entry).trim()).filter(Boolean);
          return cleaned.length > 0 ? cleaned : undefined;
        }, z.array(z.string()).optional());

        const booleanSchema = z.preprocess((value) => {
          if (value === undefined || value === null) {
            return undefined;
          }
          if (typeof value === 'boolean') {
            return value;
          }
          const normalized = String(value).toLowerCase();
          if (['true', '1', 'yes'].includes(normalized)) {
            return true;
          }
          if (['false', '0', 'no'].includes(normalized)) {
            return false;
          }
          return undefined;
        }, z.boolean().optional());

        const numberSchema = z.preprocess((value) => {
          if (value === undefined || value === null || value === '') {
            return undefined;
          }
          const parsed = Number(value);
          return Number.isNaN(parsed) ? undefined : parsed;
        }, z.number().optional());

        const dateSchema = z.preprocess((value) => {
          if (!value) {
            return undefined;
          }
          const parsed = new Date(String(value));
          return Number.isNaN(parsed.getTime()) ? undefined : parsed;
        }, z.date().optional());

        const paginationSchema = z.preprocess((value) => {
          if (value === undefined || value === null || value === '') {
            return undefined;
          }
          const parsed = Number(value);
          return Number.isNaN(parsed) ? undefined : parsed;
        }, z.number().int().nonnegative());

        const searchSchema = z.object({
          query: z.string().optional(),
          status: stringArraySchema,
          visibility: stringArraySchema,
          createdBy: stringArraySchema,
          organizationId: z.string().optional(),
          teamId: z.string().optional(),
          tags: stringArraySchema,
          participants: stringArraySchema,
          turnStrategy: stringArraySchema,
          hasObjectives: booleanSchema,
          hasOutcomes: booleanSchema,
          minParticipants: numberSchema,
          maxParticipants: numberSchema,
          minDuration: numberSchema,
          maxDuration: numberSchema,
          createdAfter: dateSchema,
          createdBefore: dateSchema,
          startedAfter: dateSchema,
          startedBefore: dateSchema,
          endedAfter: dateSchema,
          endedBefore: dateSchema,
          limit: paginationSchema.default(20),
          offset: paginationSchema.default(0),
        });

        const rawQuery = query as Record<string, unknown>;
        const searchText = extractSearchQuery(rawQuery);
        const parsed = searchSchema.safeParse({ ...rawQuery, query: searchText });

        if (!parsed.success) {
          set.status = 400;
          return {
            success: false,
            error: 'Invalid search parameters',
            details: parsed.error.flatten(),
          };
        }

        const { limit, offset, ...filters } = parsed.data;
        const discussions = await this.discussionService.searchDiscussions(
          filters as Record<string, unknown>,
          limit,
          offset
        );
        return { success: true, data: discussions };
      } catch (error) {
        logger.error('Failed to search discussions', { error });
        set.status = 500;
        return { success: false, error: 'Failed to search discussions' };
      }
    });

    // Get discussion by ID
    this.app.get('/api/v1/discussions/:discussionId', async ({ params, set }) => {
      try {
        const discussion = await this.discussionService.getDiscussion(params.discussionId);
        if (!discussion) {
          set.status = 404;
          return { success: false, error: 'Discussion not found' };
        }
        return { success: true, data: discussion };
      } catch (error) {
        logger.error('Failed to get discussion', { error, discussionId: params.discussionId });
        set.status = 500;
        return { success: false, error: 'Failed to get discussion' };
      }
    });

    // Discussion routes that require authentication (nginx forwards X-User-ID)
    this.app.group('/api/v1/discussions', (app) =>
      app
        .use(attachNginxAuth)
        .use(requireNginxAuth)
        // Create discussion
        .post('', async (context) => {
          const { body, set } = context;
          const user = (context as Record<string, unknown> as { user: UserContext }).user;
          try {
            const discussion = await this.discussionService.createDiscussion({
              ...(body as Record<string, unknown>),
              createdBy: user.id,
            });
            set.status = 201;
            return { success: true, data: discussion };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create discussion';
            const isValidationError =
              message.includes('Discussion title is required') ||
              message.includes('Discussion topic is required') ||
              message.includes('Discussion title must be') ||
              message.includes('Discussion topic must be') ||
              message.includes('Discussion requires at least 1 initial participant') ||
              message.includes('Participant agentId is required') ||
              message.includes('Agent not found');

            logger.error('Failed to create discussion', { error: message });
            set.status = isValidationError ? 400 : 500;
            return { success: false, error: message };
          }
        })
        // Update discussion
        .put('/:discussionId', async ({ params, body, set }) => {
          try {
            const discussion = await this.discussionService.updateDiscussion(
              params.discussionId,
              body as Record<string, unknown>
            );
            return { success: true, data: discussion };
          } catch (error) {
            logger.error('Failed to update discussion', {
              error,
              discussionId: params.discussionId,
            });
            set.status = 500;
            return { success: false, error: 'Failed to update discussion' };
          }
        })
        // Start discussion
        .post('/:discussionId/start', async (context) => {
          const { params, set } = context;
          const user = (context as Record<string, unknown> as { user: UserContext }).user;
          try {
            const discussion = await this.discussionService.startDiscussion(
              params.discussionId,
              user.id
            );
            return { success: true, data: discussion };
          } catch (error) {
            logger.error('Failed to start discussion', {
              error,
              discussionId: params.discussionId,
            });
            set.status = 500;
            return { success: false, error: 'Failed to start discussion' };
          }
        })
        // Send message
        .post('/:discussionId/messages', async (context) => {
          const { params, body, set } = context;
          const user = (context as Record<string, unknown> as { user: UserContext }).user;
          const { content, messageType, participantId } =
            (body as {
              content?: string;
              messageType?: string;
              participantId?: string;
            }) || {};

          if (!content || typeof content !== 'string' || content.trim().length === 0) {
            set.status = 400;
            return { success: false, error: 'Message content is required' };
          }

          try {
            const discussion = await this.discussionService.getDiscussion(
              params.discussionId,
              true
            );
            if (!discussion) {
              set.status = 404;
              return { success: false, error: 'Discussion not found' };
            }

            const matchingParticipant = participantId
              ? discussion.participants?.find(
                  (participant: Record<string, unknown>) =>
                    participant.id === participantId || participant.participantId === participantId
                )
              : discussion.participants?.find(
                  (participant: Record<string, unknown>) =>
                    participant.participantType === 'user' && participant.userId === user.id
                );

            if (!matchingParticipant) {
              set.status = 404;
              return { success: false, error: 'Participant not found for user' };
            }

            if (
              (matchingParticipant as Record<string, unknown>).participantType !== 'user' ||
              (matchingParticipant as Record<string, unknown>).userId !== user.id
            ) {
              set.status = 403;
              return { success: false, error: 'Participant does not belong to user' };
            }

            const allowedMessageTypes = new Set<string>(Object.values(MessageType));
            const resolvedMessageType = allowedMessageTypes.has(messageType || '')
              ? (messageType as MessageType)
              : MessageType.MESSAGE;

            const message = await this.discussionService.sendMessage(
              params.discussionId,
              matchingParticipant.id,
              content.trim(),
              resolvedMessageType
            );

            return { success: true, data: message };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to send message';
            const isValidationError =
              message.includes('Discussion not found') ||
              message.includes('Cannot send message to discussion with status') ||
              message.includes('Invalid or inactive participant');

            logger.error('Failed to send discussion message', {
              error: message,
              discussionId: params.discussionId,
            });
            set.status = isValidationError ? 400 : 500;
            return { success: false, error: message };
          }
        })
        // End discussion
        .post('/:discussionId/end', async (context) => {
          const { params, body, set } = context;
          const user = (context as Record<string, unknown> as { user: UserContext }).user;
          try {
            const discussion = await this.discussionService.endDiscussion(
              params.discussionId,
              user.id,
              this.pickContextString((body as Record<string, unknown>)?.reason)
            );
            return { success: true, data: discussion };
          } catch (error) {
            logger.error('Failed to end discussion', { error, discussionId: params.discussionId });
            set.status = 500;
            return { success: false, error: 'Failed to end discussion' };
          }
        })
    );

    // Get discussion messages
    this.app.get('/api/v1/discussions/:discussionId/messages', async ({ params, query, set }) => {
      try {
        const messages = await this.discussionService.getMessages(
          params.discussionId,
          query.limit ? parseInt(query.limit as string) : 50
        );
        return { success: true, data: messages };
      } catch (error) {
        logger.error('Failed to get discussion messages', {
          error,
          discussionId: params.discussionId,
        });
        set.status = 500;
        return { success: false, error: 'Failed to get discussion messages' };
      }
    });

    logger.info('Discussion routes configured');

    // ===== DEBUG ROUTES =====

    // Debug route: conversation enhancement stats
    this.app.get('/api/v1/debug/conversation-enhancement', async ({ set }) => {
      try {
        const stats = await this.conversationEnhancementService.getServiceStatistics();
        const memoryUsage = process.memoryUsage();

        const alerts: string[] = [];

        // Check for high pending LLM requests (memory leak indicator)
        if (stats.pendingLLMRequests > 1000) {
          alerts.push(`CRITICAL: High pending LLM requests: ${stats.pendingLLMRequests}`);
        } else if (stats.pendingLLMRequests > 500) {
          alerts.push(`WARNING: Elevated pending LLM requests: ${stats.pendingLLMRequests}`);
        }

        // Check for high conversation states (memory usage)
        if (stats.conversationStates > 500) {
          alerts.push(`INFO: High conversation states: ${stats.conversationStates}`);
        }

        // Check for high agent persona mappings
        if (stats.agentPersonaMappings > 200) {
          alerts.push(`INFO: High agent persona mappings: ${stats.agentPersonaMappings}`);
        }

        return {
          success: true,
          timestamp: new Date().toISOString(),
          conversationEnhancement: stats,
          memory: {
            heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          },
          alerts,
        };
      } catch {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to fetch conversation enhancement debug info',
        };
      }
    });

    // Debug route: force LLM cleanup
    this.app.post('/api/v1/debug/force-llm-cleanup', ({ set }) => {
      try {
        // Trigger immediate cleanup on conversation enhancement service
        if (
          typeof (
            this.conversationEnhancementService as unknown as {
              cleanupStaleLLMRequests?: () => void;
            }
          ).cleanupStaleLLMRequests === 'function'
        ) {
          (
            this.conversationEnhancementService as unknown as {
              cleanupStaleLLMRequests: () => void;
            }
          ).cleanupStaleLLMRequests();
        }

        return {
          success: true,
          message: 'LLM cleanup triggered',
          timestamp: new Date().toISOString(),
        };
      } catch {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to trigger LLM cleanup',
        };
      }
    });

    // Test endpoint for manual sync trigger
    this.app.post('/test/sync', async ({ set }) => {
      try {
        const { DatabaseService: SharedDatabaseServiceClass } = await import('@uaip/shared-services/databaseService');
        const sharedDbService = new SharedDatabaseServiceClass();
        await sharedDbService.initialize();

        // Force Neo4j connection verification
        const graphDb = await sharedDbService.getToolGraphDatabase();
        logger.info('Testing Neo4j connection...');
        await graphDb.verifyConnectivity(5);

        const status = graphDb.getConnectionStatus();
        logger.info('Neo4j connection status:', status);

        if (!status.isConnected) {
          throw new Error('Neo4j connection verification failed');
        }

        const { KnowledgeBootstrapService } = await import('@uaip/shared-services');

        const knowledgeRepo = await sharedDbService.getKnowledgeRepository();
        const qdrantService = await sharedDbService.getQdrantService();
        const embeddingService = await sharedDbService.getSmartEmbeddingService();

        logger.info('Service instances created:', {
          knowledgeRepo: !!knowledgeRepo,
          qdrantService: !!qdrantService,
          graphDb: !!graphDb,
          embeddingService: !!embeddingService,
        });

        const bootstrap = new KnowledgeBootstrapService(
          knowledgeRepo,
          qdrantService,
          graphDb,
          embeddingService
        );

        const result = await bootstrap.runPostSeedSync();
        return { success: true, result, neo4jStatus: status };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        };
      }
    });
  }

  protected async setupEventSubscriptions(): Promise<void> {
    logger.info('Setting up event subscriptions for agent-intelligence service');

    // Subscribe to WebSocket agent chat requests
    await this.eventBusService.subscribe('agent.chat.request', async (event) => {
      try {
        const {
          userId,
          agentId,
          message,
          conversationHistory,
          context,
          socketId,
          messageId,
          _timestamp,
        } = event.data as Record<string, unknown>;

        const resolvedUserId = typeof userId === 'string' ? userId : 'system';
        const resolvedAgentId = typeof agentId === 'string' ? agentId : '';
        const resolvedMessage = typeof message === 'string' ? message : '';
        const resolvedSocketId = typeof socketId === 'string' ? socketId : '';
        const resolvedConversationHistory = Array.isArray(conversationHistory)
          ? conversationHistory.filter(
              (entry): entry is Record<string, unknown> =>
                typeof entry === 'object' && entry !== null
            )
          : [];
        const resolvedContext = this.ensureRecord(context);

        logger.info('Processing WebSocket agent chat request', {
          agentId,
          userId,
          messageLength: resolvedMessage.length,
          messageId,
          socketId: resolvedSocketId ? `${resolvedSocketId.substring(0, 10)}...` : undefined,
        });

        const agentRecord = await this.agentCoreService.getAgent(resolvedAgentId);

        // Use unified model selection for the agent
        let modelSelection = null;
        if (resolvedAgentId) {
          try {
            modelSelection = await this.selectModelForAgent(resolvedAgentId, LLMTaskType.REASONING);
            logger.info('Selected model for agent', {
              agentId: resolvedAgentId,
              model: modelSelection.model.model,
              provider: modelSelection.model.provider,
              strategy: modelSelection.model.selectionStrategy,
            });
          } catch (error) {
            logger.warn('Failed to select model for agent, using defaults', { agentId, error });
          }
        }

        const contextWithDecision = await this.applyToolExecutionDecisionGate(
          resolvedAgentId,
          resolvedContext,
          agentRecord,
          {
            userId: resolvedUserId,
            socketId: resolvedSocketId || undefined,
          }
        );

        // Process the chat request using AgentDiscussionService
        const result = await this.agentDiscussionService.processDiscussionMessage({
          agentId: resolvedAgentId,
          userId: resolvedUserId,
          message: resolvedMessage,
          conversationId: 'websocket-chat-' + Date.now(),
          conversationHistory: resolvedConversationHistory,
          modelSelection: modelSelection ? this.ensureRecord(modelSelection) : undefined,
        });

        // Prepare enhanced response with WebSocket metadata
        let resolvedAgentName = `Agent ${agentId}`;
        try {
          if (agentRecord?.name) resolvedAgentName = agentRecord.name;
        } catch {
          logger.warn('Could not resolve agent name', { agentId });
        }

        await this.maybeCreateSpecialistHuddleFromResponse(
          resolvedAgentId,
          result.response,
          this.ensureRecord(contextWithDecision)
        );

        const responsePayload = {
          socketId,
          agentId,
          userId,
          messageId,
          response: result.response,
          agentName: resolvedAgentName,
          confidence: result.metadata.confidence,
          memoryEnhanced: result.metadata.memoryEnhanced ?? false,
          knowledgeUsed: result.metadata.knowledgeUsed ?? 0,
          toolsExecuted: (result.metadata.toolsExecuted as string[]) ?? [],
          timestamp: new Date().toISOString(),
          processingTime: result.metadata.processingTime,
          responseType: result.metadata.responseType,
          conversationId: result.metadata.conversationId,
        };

        // Publish response back to discussion-orchestration for WebSocket delivery
        await this.eventBusService.publish('agent.chat.response', responsePayload);

        logger.info('WebSocket agent chat response published', {
          agentId,
          messageId,
          responseLength: result.response.length,
          confidence: result.metadata.confidence,
        });
      } catch (error) {
        logger.error('Failed to process WebSocket agent chat request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          agentId: (event.data as Record<string, unknown>)?.agentId,
          messageId: (event.data as Record<string, unknown>)?.messageId,
        });

        // Send error response back to client
        if (
          (event.data as Record<string, unknown>)?.socketId &&
          (event.data as Record<string, unknown>)?.messageId
        ) {
          await this.eventBusService.publish('agent.chat.response', {
            socketId: event.data.socketId,
            agentId: event.data.agentId,
            userId: event.data.userId,
            messageId: event.data.messageId,
            response: 'Sorry, I encountered an error processing your request. Please try again.',
            agentName: `Agent ${(event.data as Record<string, unknown>).agentId}`,
            confidence: 0.0,
            error: true,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // Subscribe to conversation enhancement requests from discussion orchestration
    await this.eventBusService.subscribe('conversation.enhancement.request', async (event) => {
      try {
        if (!event?.data) {
          logger.warn('Conversation enhancement request missing payload');
          return;
        }

        const {
          discussionId,
          availableAgentIds,
          messageHistory,
          currentTopic,
          enhancementType,
          context,
        } = event.data as Record<string, unknown>;

        if (!this.conversationEnhancementService) {
          this.conversationEnhancementService = new ConversationEnhancementService(
            this.databaseService,
            this.eventBusService
          );
          await this.conversationEnhancementService.initialize();
          logger.info('ConversationEnhancementService initialized on demand');
        }

        const resolvedDiscussionId = typeof discussionId === 'string' ? discussionId : '';
        const resolvedAgentIds = Array.isArray(availableAgentIds)
          ? availableAgentIds.filter((id): id is string => typeof id === 'string')
          : [];
        const resolvedMessageHistory = Array.isArray(messageHistory)
          ? messageHistory.filter(
              (entry): entry is Record<string, unknown> =>
                typeof entry === 'object' && entry !== null
            )
          : [];
        const resolvedMessageHistoryItems = this.toMessageHistoryItems(resolvedMessageHistory);
        const resolvedCurrentTopic = typeof currentTopic === 'string' ? currentTopic : '';
        const resolvedEnhancementType =
          enhancementType === 'auto' ||
          enhancementType === 'manual' ||
          enhancementType === 'triggered'
            ? enhancementType
            : 'auto';
        const resolvedEnhancementContext = this.ensureRecord(context);

        logger.info('Processing conversation enhancement request', {
          discussionId,
          agentCount: resolvedAgentIds.length,
          messageCount: resolvedMessageHistory.length,
          enhancementType,
        });

        // Get agent objects from IDs
        const availableAgents: AgentEntity[] = [];
        for (const agentId of resolvedAgentIds) {
          try {
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            const agent = await this.databaseService.findById<AgentEntity>('agents', agentId);
            if (agent) {
              availableAgents.push(agent);
            }
          } catch (error) {
            logger.warn('Failed to get agent for enhancement', { agentId, error });
          }
        }

        if (availableAgents.length === 0) {
          logger.warn('No valid agents found for enhancement request', { discussionId });
          return;
        }

        // Process enhancement request
        const result = await this.conversationEnhancementService.getEnhancedContribution({
          discussionId: resolvedDiscussionId,
          availableAgents,
          messageHistory: resolvedMessageHistoryItems,
          currentTopic: resolvedCurrentTopic,
          enhancementType: resolvedEnhancementType,
          context: resolvedEnhancementContext,
        });

        if (result.success && result.enhancedResponse) {
          try {
            // Find the participant ID for the selected agent
            const discussion = await this.discussionService.getDiscussion(resolvedDiscussionId);
            const participant = discussion?.participants?.find(
              (p: Record<string, unknown>) => p.agentId === result.selectedAgent?.id
            );

            if (participant) {
              // Send enhanced response back to discussion orchestration
              const isInitialParticipation =
                (discussion?.state?.messageCount ??
                  (typeof resolvedEnhancementContext.messageCount === 'number'
                    ? resolvedEnhancementContext.messageCount
                    : 0) ??
                  resolvedMessageHistory.length ??
                  0) === 0;

              await this.eventBusService.publish('discussion.agent.message', {
                discussionId,
                participantId: participant.id,
                content: result.enhancedResponse,
                messageType: 'agent_contribution',
                isInitialParticipation,
                metadata: {
                  agentId: result.selectedAgent?.id,
                  personaId: result.selectedPersona?.id,
                  enhancementType: 'contextual',
                  isInitialParticipation,
                  contributionScore: result.contributionScores?.[0]?.score,
                  suggestions: result.suggestions || [],
                  nextActions: result.nextActions || [],
                },
              });

              logger.info('Enhanced conversation response sent', {
                discussionId,
                agentId: result.selectedAgent?.id,
                personaId: result.selectedPersona?.id,
                responseLength: result.enhancedResponse.length,
              });
            } else {
              logger.warn('Could not find participant for enhanced response', {
                discussionId,
                agentId: result.selectedAgent?.id,
                discussionExists: !!discussion,
                participantCount: discussion?.participants?.length || 0,
              });
            }
          } catch (publishError) {
            logger.error('Failed to publish enhanced response', {
              discussionId,
              error: publishError instanceof Error ? publishError.message : 'Unknown error',
              stack: publishError instanceof Error ? publishError.stack : undefined,
            });
          }
        } else {
          logger.info('No enhanced response generated', {
            discussionId,
            success: result.success,
            error: result.error,
          });
        }
      } catch (error) {
        logger.error('Failed to process conversation enhancement request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          discussionId: (event?.data as Record<string, unknown>)?.discussionId,
        });
      }
    });

    // DEPRECATED: Agent participation is now handled by Discussion Orchestration service
    // via 'agent.discussion.participate' events. This removes the duplicate event handler
    // that was causing participant ID conflicts and "Participant not found" errors.
    // The AgentDiscussionService now properly subscribes to 'agent.discussion.participate'
    // events in its setupDiscussionEventSubscriptions() method.

    logger.info('Agent chat WebSocket event subscription established');
    logger.info('Conversation enhancement event subscription established');
    logger.info('Agent discussion participation events will be handled via AgentDiscussionService');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }

  protected async initialize(): Promise<void> {
    // Initialize AgentCoreService for agent CRUD operations
    this.agentCoreService = new AgentCoreService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      serviceName: 'agent-intelligence',
      securityLevel: 3,
    });
    await this.agentCoreService.initialize();
    logger.info('AgentCoreService initialized');

    // Initialize PersonaService
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
    });
    logger.info('PersonaService initialized');

    // Initialize LLMService (legacy - conversation enhancement now uses events)
    this.llmService = LLMService.getInstance();
    logger.info('LLMService initialized (legacy)');

    // Initialize ConversationEnhancementService (now event-driven)
    this.conversationEnhancementService = new ConversationEnhancementService(
      this.databaseService,
      this.eventBusService
      // No longer passing LLMService - using event-driven approach
    );
    await this.conversationEnhancementService.initialize();
    logger.info('ConversationEnhancementService initialized');

    // Initialize AgentDiscussionService
    // Instantiate knowledgeGraphService here so it can be passed to AgentDiscussionService.
    // (setupRoutes() also instantiates it but runs after initializeServices().)
    const { getKnowledgeGraphService } = await import('@uaip/shared-services');
    const knowledgeGraphService = await getKnowledgeGraphService();

    this.agentDiscussionService = new AgentDiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      knowledgeGraphService,
      agentMemoryService: undefined,
      discussionService: undefined,
      llmService: this.llmService,
      userLLMService: new UserLLMService(),
      serviceName: 'agent-intelligence',
      securityLevel: 1,
    });
    await this.agentDiscussionService.initialize();
    logger.info('AgentDiscussionService initialized with knowledgeGraphService');

    this.agentPlanningService = new AgentPlanningService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      knowledgeGraphService: knowledgeGraphService as unknown as LocalKnowledgeGraphService,
      serviceName: 'agent-intelligence',
      securityLevel: 2,
    });
    await this.agentPlanningService.initialize();
    logger.info('AgentPlanningService initialized');

    // Initialize DiscussionService for API routes
    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: false,
      auditMode: 'comprehensive',
    });
    logger.info('DiscussionService initialized');

    await this.setupRoutes();
    await this.setupEventSubscriptions();
    await this.startMemoryConsolidationCron();
  }

  private detectChatIntent(message: string): 'creation' | 'analysis' | 'conversation' {
    const normalized = message.toLowerCase();
    const creationKeywords = [
      'create',
      'build',
      'generate',
      'design',
      'implement',
      'draft',
      'write',
    ];
    const analysisKeywords = [
      'analyze',
      'investigate',
      'review',
      'evaluate',
      'assess',
      'debug',
      'diagnose',
    ];

    if (creationKeywords.some((keyword) => normalized.includes(keyword))) {
      return 'creation';
    }

    if (analysisKeywords.some((keyword) => normalized.includes(keyword))) {
      return 'analysis';
    }

    return 'conversation';
  }

  private isComplexChatRequest(
    message: string,
    conversationHistory: Record<string, unknown>[],
    context: Record<string, unknown>
  ): boolean {
    const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
    const hasStructuredContext = Object.keys(context || {}).length > 2;
    const hasDeepHistory = (conversationHistory || []).length >= 4;
    return wordCount >= 15 || hasStructuredContext || hasDeepHistory;
  }

  private async applyToolExecutionDecisionGate(
    agentId: string,
    context: Record<string, unknown>,
    agentRecord?: Record<string, unknown>,
    approvalContext?: ApprovalRequestContext
  ): Promise<Record<string, unknown>> {
    const proposedAction = this.extractProposedAction(context);
    if (!proposedAction) {
      return context;
    }

    const availableTools = this.extractAvailableTools(context, proposedAction);

    try {
      const resolver = new ToolRegistryCapabilityResolver({
        lookup: async (toolName: string) =>
          availableTools.find((tool) => tool.name === toolName || tool.id === toolName) || null,
        getTools: async () => availableTools,
      });

      const stateMachine = new AgentStateMachine(
        agentId,
        proposedAction.requiredCapabilities || []
      );
      const decisionEngine = new DecisionEngine(resolver, stateMachine);
      const decision = await decisionEngine.selectAction(this.buildDecisionContext(), [
        proposedAction,
      ]);

      if (decision.confidence < 0.5) {
        logger.info('Tool execution skipped - confidence below threshold', {
          agentId,
          confidence: decision.confidence,
          actionType: proposedAction.type,
        });

        const existingToolExecution = this.ensureRecord(context.toolExecution);
        return {
          ...context,
          toolExecution: {
            ...existingToolExecution,
            skipped: true,
            skipReason: 'confidence_below_threshold',
            decisionConfidence: decision.confidence,
          },
        };
      }

      const operationSecurityLevel = this.resolveOperationSecurityLevel(context?.toolExecution);

      if (decision.selectedAction?.riskLevel === 'high') {
        const allowsHighRisk =
          operationSecurityLevel === SecurityLevel.HIGH ||
          operationSecurityLevel === SecurityLevel.CRITICAL;

        if (!allowsHighRisk) {
          logger.info('Tool execution skipped - security level too low for high risk action', {
            agentId,
            operationSecurityLevel,
          });

          const existingToolExecution = this.ensureRecord(context.toolExecution);
          return {
            ...context,
            toolExecution: {
              ...existingToolExecution,
              skipped: true,
              skipReason: 'security_level_restriction',
              decisionConfidence: decision.confidence,
            },
          };
        }
      }

      const requiresApproval = this.requiresApprovalForAgentChatConfig(agentRecord);
      const isHighRisk = decision.selectedAction?.riskLevel === 'high';
      const isCriticalSecurity = operationSecurityLevel === SecurityLevel.CRITICAL;

      if (requiresApproval && (isHighRisk || isCriticalSecurity)) {
        const toolExecution: Record<string, unknown> =
          context?.toolExecution && typeof context.toolExecution === 'object'
            ? (context.toolExecution as Record<string, unknown>)
            : {};
        const approvalResult = await this.requestToolExecutionApproval(agentId, {
          toolId: String(toolExecution.toolId || toolExecution.toolName || 'unknown-tool'),
          toolDescription: String(
            toolExecution.toolDescription ||
              toolExecution.reasoning ||
              'High-risk tool execution requires approval'
          ),
          riskLevel: isHighRisk ? 'high' : String(toolExecution.riskLevel || 'medium'),
          securityLevel: isCriticalSecurity
            ? 'critical'
            : String(toolExecution.securityLevel || ''),
          parameters: this.ensureRecord(toolExecution.parameters),
          userId: approvalContext?.userId,
          socketId: approvalContext?.socketId,
        });

        if (!approvalResult.approved) {
          logger.info('Tool execution skipped - approval rejected or timed out', {
            agentId,
            approvalId: approvalResult.approvalId,
            reason: approvalResult.reason,
          });

          const existingToolExecution = this.ensureRecord(context.toolExecution);
          return {
            ...context,
            toolExecution: {
              ...existingToolExecution,
              skipped: true,
              skipReason: 'approval_required',
              approvalId: approvalResult.approvalId,
              approvalReason: approvalResult.reason,
            },
          };
        }
      }

      const existingToolExecution = this.ensureRecord(context.toolExecution);
      return {
        ...context,
        toolExecution: {
          ...existingToolExecution,
          decisionConfidence: decision.confidence,
          decisionReasoning: decision.reasoning,
        },
      };
    } catch (error) {
      logger.warn('Decision engine evaluation failed for tool execution path', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return context;
    }
  }

  private extractProposedAction(context: Record<string, unknown>): ActionRecommendation | null {
    const toolExecution =
      context?.toolExecution && typeof context.toolExecution === 'object'
        ? (context.toolExecution as Record<string, unknown>)
        : null;
    if (!toolExecution || typeof toolExecution !== 'object') {
      return null;
    }

    const requiredCapabilities = Array.isArray(toolExecution.requiredCapabilities)
      ? toolExecution.requiredCapabilities
      : typeof toolExecution.capability === 'string'
        ? [toolExecution.capability]
        : typeof toolExecution.toolName === 'string'
          ? [toolExecution.toolName]
          : [];

    if (requiredCapabilities.length === 0) {
      return null;
    }

    return {
      type: 'tool_execution',
      confidence:
        typeof toolExecution.confidence === 'number' && Number.isFinite(toolExecution.confidence)
          ? toolExecution.confidence
          : 0.6,
      reasoning: String(toolExecution.reasoning || 'Tool execution requested from chat context'),
      estimatedDuration:
        typeof toolExecution.estimatedDuration === 'number' ? toolExecution.estimatedDuration : 30,
      requiredCapabilities,
      riskLevel:
        toolExecution.riskLevel === 'high' ||
        toolExecution.riskLevel === 'medium' ||
        toolExecution.riskLevel === 'low'
          ? toolExecution.riskLevel
          : 'medium',
    };
  }

  private extractAvailableTools(
    context: Record<string, unknown>,
    proposedAction: ActionRecommendation
  ): ToolDefinition[] {
    const providedTools = Array.isArray(context?.availableTools) ? context.availableTools : [];
    const normalizedProvided = providedTools
      .filter((tool: Record<string, unknown>) => tool && typeof tool === 'object' && tool.name)
      .map((tool: Record<string, unknown>) => ({
        id: String(tool.id || tool.name),
        name: String(tool.name),
        description: String(tool.description || tool.name),
        category: ToolCategory.ANALYSIS,
        parameters: tool.parameters || { type: 'object', properties: {} },
        returnType: tool.returnType || { type: 'object' },
        examples: Array.isArray(tool.examples) ? tool.examples : [],
        securityLevel: this.resolveOperationSecurityLevel(tool),
        requiresApproval: Boolean(tool.requiresApproval),
        dependencies: Array.isArray(tool.dependencies) ? tool.dependencies : [],
        version: String(tool.version || '1.0.0'),
        author: String(tool.author || 'agent-intelligence'),
        tags: Array.isArray(tool.tags) ? tool.tags : [],
        isEnabled: tool.isEnabled !== false,
        executionTimeEstimate:
          typeof tool.executionTimeEstimate === 'number' ? tool.executionTimeEstimate : 30,
      }));

    if (normalizedProvided.length > 0) {
      return normalizedProvided;
    }

    const fallbackTools: ToolDefinition[] = proposedAction.requiredCapabilities.map(
      (capability) => ({
        id: capability,
        name: capability,
        description: `Dynamically resolved capability: ${capability}`,
        category: ToolCategory.ANALYSIS,
        parameters: { type: 'object', properties: {} },
        returnType: { type: 'object' },
        examples: [] as ToolExample[],
        securityLevel: SecurityLevel.MEDIUM,
        requiresApproval: false,
        dependencies: [] as string[],
        version: '1.0.0',
        author: 'agent-intelligence',
        tags: [] as string[],
        isEnabled: true,
        executionTimeEstimate: 30,
      })
    );

    return fallbackTools;
  }

  private resolveOperationSecurityLevel(toolExecution: unknown): SecurityLevel {
    const execution =
      toolExecution && typeof toolExecution === 'object'
        ? (toolExecution as Record<string, unknown>)
        : {};
    const level = execution.securityLevel;
    if (level === SecurityLevel.LOW) return SecurityLevel.LOW;
    if (level === SecurityLevel.HIGH) return SecurityLevel.HIGH;
    if (level === SecurityLevel.CRITICAL) return SecurityLevel.CRITICAL;
    return SecurityLevel.MEDIUM;
  }

  private buildDecisionContext(): Record<string, unknown> {
    return {
      analysis: {
        context: {
          messageCount: 1,
          participants: [],
          topics: [],
          sentiment: 'neutral',
          complexity: 'medium',
          urgency: 'medium',
        },
        intent: {
          primary: 'tool_execution',
          secondary: [],
          confidence: 0.7,
          entities: [],
          complexity: 'medium',
        },
        agentCapabilities: {
          tools: [],
          artifacts: [],
          specializations: [],
          limitations: [],
        },
        environmentFactors: {
          timeOfDay: new Date().getHours(),
          userLoad: 1,
          systemLoad: 'normal',
          availableResources: 'standard',
        },
      },
      recommendedActions: [],
      confidence: 0.7,
      explanation: 'Decision context generated from chat tool execution request',
      timestamp: new Date(),
    };
  }

  private requiresApprovalForAgentChatConfig(agentRecord?: Record<string, unknown>): boolean {
    if (!agentRecord || typeof agentRecord !== 'object') {
      return false;
    }

    const record = agentRecord as Record<string, unknown>;
    const chatConfig = record.chatConfig;
    if (!chatConfig || typeof chatConfig !== 'object') {
      return false;
    }

    return (chatConfig as Record<string, unknown>).requireApproval === true;
  }

  private async requestToolExecutionApproval(
    agentId: string,
    request: {
      toolId: string;
      toolDescription: string;
      riskLevel: string;
      securityLevel: string;
      parameters: Record<string, unknown>;
      userId?: string;
      socketId?: string;
    }
  ): Promise<{ approved: boolean; approvalId: string; reason?: string }> {
    const approvalId = randomUUID();

    const approvalPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          this.pendingApprovals.delete(approvalId);
          reject(new Error('Approval timed out'));
        },
        5 * 60 * 1000
      );

      this.pendingApprovals.set(approvalId, {
        agentId,
        resolve,
        reject: (reason?: string) => reject(new Error(reason || 'Approval rejected')),
        timeout,
      });
    });

    await this.eventBusService.publish('approval:required', {
      approvalId,
      agentId,
      userId: request.userId,
      socketId: request.socketId,
      toolId: request.toolId,
      toolDescription: request.toolDescription,
      riskLevel: request.riskLevel,
      parameters: this.sanitizeApprovalParameters(request.parameters),
      securityLevel: request.securityLevel,
      timestamp: new Date().toISOString(),
    });

    try {
      await approvalPromise;
      return { approved: true, approvalId };
    } catch (error) {
      return {
        approved: false,
        approvalId,
        reason: error instanceof Error ? error.message : 'Approval rejected',
      };
    } finally {
      const pendingApproval = this.pendingApprovals.get(approvalId);
      if (pendingApproval) {
        clearTimeout(pendingApproval.timeout);
        this.pendingApprovals.delete(approvalId);
      }
    }
  }

  private sanitizeApprovalParameters(value: unknown): Record<string, unknown> {
    const sensitiveFields = new Set([
      'password',
      'token',
      'secret',
      'authorization',
      'apiKey',
      'accessToken',
      'refreshToken',
    ]);

    if (Array.isArray(value)) {
      return {
        items: value.map((entry) => this.sanitizeApprovalParameters(entry)),
      };
    }

    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (sensitiveFields.has(key)) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.sanitizeApprovalParameters(nestedValue);
        }
      }
      return result;
    }

    return { value };
  }

  private async maybeCreateSpecialistHuddleFromResponse(
    agentId: string,
    llmResponse: string,
    context: Record<string, unknown>
  ): Promise<void> {
    const needsConsult = /i\s+need\s+to\s+consult/i.test(llmResponse);
    const hasSpecialistSubTask = this.hasSpecialistSubTaskInContext(context);

    if (!needsConsult && !hasSpecialistSubTask) {
      return;
    }

    const parentDiscussionId =
      this.pickContextString(context.discussionId) ||
      this.pickContextString(context.parentDiscussionId);
    const specialistAgentIds = this.pickContextStringArray(context.specialistAgentIds);
    const contextParticipantIds = this.pickContextStringArray(context.participantIds);
    const availableAgentIds = this.pickContextStringArray(context.availableAgentIds);
    const participantIds =
      specialistAgentIds.length > 0
        ? specialistAgentIds
        : contextParticipantIds.length > 0
          ? contextParticipantIds
          : availableAgentIds;

    if (!parentDiscussionId || participantIds.length === 0) {
      return;
    }

    const topic =
      this.pickContextString(context.huddleTopic) ||
      this.pickContextString(context.specialistTopic) ||
      `Specialist consult requested by agent ${agentId}`;

    const baseUrl = process.env.DISCUSSION_ORCHESTRATION_URL || 'http://localhost:3005';
    const response = await fetch(`${baseUrl}/api/v1/discussions/huddle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parentDiscussionId,
        participantIds,
        topic,
      }),
    });

    if (!response.ok) {
      logger.warn('Failed to create specialist huddle', {
        agentId,
        parentDiscussionId,
        status: response.status,
      });
      return;
    }

    logger.info('Specialist huddle requested', {
      agentId,
      parentDiscussionId,
      participantCount: participantIds.length,
    });
  }

  private hasSpecialistSubTaskInContext(context: Record<string, unknown>): boolean {
    const candidateSubTaskLists: unknown[] = [
      context.subTasks,
      context.tasks,
      context.plannedSubTasks,
      context.plan,
      context.planning,
    ];

    for (const candidate of candidateSubTaskLists) {
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          if (!item || typeof item !== 'object') {
            continue;
          }

          const task = item as Record<string, unknown>;
          if (task.requiresSpecialist === true) {
            return true;
          }

          const requiredSkills = this.pickContextStringArray(task.requiredSkills);
          if (requiredSkills.some((skill) => /specialist|expert/i.test(skill))) {
            return true;
          }
        }
      }

      if (candidate && typeof candidate === 'object') {
        const nested = candidate as Record<string, unknown>;
        if (Array.isArray(nested.subTasks)) {
          for (const nestedTask of nested.subTasks) {
            if (nestedTask && typeof nestedTask === 'object') {
              const task = nestedTask as Record<string, unknown>;
              if (task.requiresSpecialist === true) {
                return true;
              }
              const requiredSkills = this.pickContextStringArray(task.requiredSkills);
              if (requiredSkills.some((skill) => /specialist|expert/i.test(skill))) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }

  private pickContextString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private pickContextStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private parseEnumValue<T extends string>(
    value: unknown,
    enumObj: Record<string, T>
  ): T | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const candidates = Object.values(enumObj);
    return candidates.includes(value as T) ? (value as T) : undefined;
  }

  private parseEnumArray<T extends string>(
    value: unknown,
    enumObj: Record<string, T>
  ): T[] | undefined {
    const values =
      typeof value === 'string'
        ? value.split(',').map((entry) => entry.trim())
        : Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === 'string')
          : [];
    if (values.length === 0) {
      return undefined;
    }
    const allowed = new Set(Object.values(enumObj));
    const parsed = values.filter((entry): entry is T => allowed.has(entry as T));
    return parsed.length > 0 ? parsed : undefined;
  }

  private toMessageHistoryItems(
    messages: Record<string, unknown>[]
  ): ConversationMessageHistoryItem[] {
    const normalized: ConversationMessageHistoryItem[] = [];
    for (const [index, message] of messages.entries()) {
      const content = this.pickContextString(message.content);
      if (!content) {
        continue;
      }
      normalized.push({
        id: this.pickContextString(message.id) || `msg-${index}`,
        speaker: this.pickContextString(message.speaker) || 'unknown',
        content,
        timestamp:
          message.timestamp instanceof Date
            ? message.timestamp
            : new Date(
                typeof message.timestamp === 'string' || typeof message.timestamp === 'number'
                  ? message.timestamp
                  : Date.now()
              ),
        responseType: this.pickContextString(message.responseType) || undefined,
        topic: this.pickContextString(message.topic) || undefined,
      });
    }
    return normalized;
  }

  private async startMemoryConsolidationCron(): Promise<void> {
    this.memoryConsolidator = await serviceFactory.getMemoryConsolidator();
    this.semanticMemoryManager = await serviceFactory.getSemanticMemoryManager();

    this.memoryConsolidationInterval = setInterval(
      async () => {
        try {
          const activeAgents = await this.agentCoreService.getAgents({
            status: AgentStatus.ACTIVE,
          });

          for (const agent of activeAgents) {
            if (agent.isActive === false) {
              continue;
            }

            try {
              // oxlint-disable-next-line no-await-in-loop -- sequential processing required
              await this.memoryConsolidator.consolidateMemories(agent.id);
            } catch (error) {
              logger.error('Memory consolidation failed for agent', {
                agentId: agent.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } catch (error) {
          logger.error('Memory consolidation cycle failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      30 * 60 * 1000
    );

    logger.info('Memory consolidation cron initialized', {
      intervalMs: 30 * 60 * 1000,
    });
  }

  protected async cleanup(): Promise<void> {
    if (this.memoryConsolidationInterval) {
      clearInterval(this.memoryConsolidationInterval);
      this.memoryConsolidationInterval = undefined;
      logger.info('Memory consolidation cron stopped');
    }
  }

  async start(): Promise<void> {
    try {
      // Call parent start method which handles database initialization
      await super.start();
    } catch (error) {
      console.error('Failed to start Agent Intelligence Service:', error);
      throw error;
    }
  }
}

// Start the service
const service = new AgentIntelligenceService();
service.start().catch((error) => {
  console.error('Failed to start Agent Intelligence Service:', error);
  process.exit(1);
});

// Named export to avoid Bun auto-serve on default export
export { AgentIntelligenceService };
