import { BaseService, DiscussionService, PersonaService } from '@uaip/shared-services';
import { LLMService, UserLLMService } from '@uaip/llm-service';
import { DiscussionEventType, LLMTaskType, MessageType } from '@uaip/types';
import { attachAuth, attachNginxAuth, requireNginxAuth, UserContext } from '@uaip/middleware';
import { ConversationEnhancementService } from './services/conversation-enhancement.service.js';
import { AgentDiscussionService } from './services/agent-discussion.service.js';
import { AgentCoreService } from './services/agent-core.service.js';
import { logger } from '@uaip/utils';
import { z } from 'zod';

class AgentIntelligenceService extends BaseService {
  private agentDiscussionService: AgentDiscussionService;
  private discussionService: DiscussionService;
  private personaService: PersonaService;
  private conversationEnhancementService: ConversationEnhancementService;
  private llmService: LLMService;
  private agentCoreService: AgentCoreService;

  constructor() {
    super({
      name: 'agent-intelligence',
      port: 3001,
      version: '1.0.0',
      enableWebSocket: false,
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    });
  }

  protected async setupRoutes(): Promise<void> {
    // Get the KnowledgeGraphService instance from the ServiceFactory
    const { getKnowledgeGraphService } = await import('@uaip/shared-services');
    const knowledgeGraphService = await getKnowledgeGraphService();

    // ===== AGENT CRUD ROUTES =====

    // List all agents
    this.app.get('/api/v1/agents', async ({ query, set }) => {
      try {
        const filters = {
          limit: query.limit ? parseInt(query.limit as string) : undefined,
          offset: query.offset ? parseInt(query.offset as string) : undefined,
          role: query.role as any,
          status: query.status as any,
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
        const agent = await this.agentCoreService.createAgent(body as any, userId);
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
        const agent = await this.agentCoreService.updateAgent(params.agentId, body as any, userId);
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
      context: z.record(z.any()).optional(),
    });

    this.app
      .group('/api/v1/agents', (app) =>
        app
          .use(attachAuth)
          .post('/:agentId/chat', async (context) => {
            const { params, body, set, headers } = context;
            const user = (context as unknown as { user: UserContext | null }).user;

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
              const result = await this.agentDiscussionService.participateInDiscussion({
                agentId: params.agentId,
                message: parsed.data.message,
                userId,
                conversationHistory: parsed.data.conversationHistory || [],
                context: parsed.data.context || {},
              });

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
              const message =
                error instanceof Error ? error.message : 'Failed to chat with agent';
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
          status: query.status as any,
          visibility: query.visibility as any,
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
        const persona = await this.personaService.createPersona({ ...(body as any), createdBy: userId });
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
        const persona = await this.personaService.updatePersona(params.personaId, body as any);
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
        const templates = await this.personaService.getPersonaTemplates(query.category as string | undefined);
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
          status: query.status as any,
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
          return { success: false, error: 'Invalid search parameters', details: parsed.error.flatten() };
        }

        const { limit, offset, ...filters } = parsed.data;
        const discussions = await this.discussionService.searchDiscussions(filters as any, limit, offset);
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
            const user = (context as unknown as { user: UserContext }).user;
            try {
              const discussion = await this.discussionService.createDiscussion({
                ...(body as any),
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
              const discussion = await this.discussionService.updateDiscussion(params.discussionId, body as any);
              return { success: true, data: discussion };
            } catch (error) {
              logger.error('Failed to update discussion', { error, discussionId: params.discussionId });
              set.status = 500;
              return { success: false, error: 'Failed to update discussion' };
            }
          })
          // Start discussion
          .post('/:discussionId/start', async (context) => {
            const { params, set } = context;
            const user = (context as unknown as { user: UserContext }).user;
            try {
              const discussion = await this.discussionService.startDiscussion(params.discussionId, user.id);
              return { success: true, data: discussion };
            } catch (error) {
              logger.error('Failed to start discussion', { error, discussionId: params.discussionId });
              set.status = 500;
              return { success: false, error: 'Failed to start discussion' };
            }
          })
          // Send message
          .post('/:discussionId/messages', async (context) => {
            const { params, body, set } = context;
            const user = (context as unknown as { user: UserContext }).user;
            const { content, messageType, participantId } = (body as {
              content?: string;
              messageType?: string;
              participantId?: string;
            }) || {};

            if (!content || typeof content !== 'string' || content.trim().length === 0) {
              set.status = 400;
              return { success: false, error: 'Message content is required' };
            }

            try {
              const discussion = await this.discussionService.getDiscussion(params.discussionId, true);
              if (!discussion) {
                set.status = 404;
                return { success: false, error: 'Discussion not found' };
              }

              const matchingParticipant = participantId
                ? discussion.participants?.find(
                    (participant) =>
                      participant.id === participantId || participant.participantId === participantId
                  )
                : discussion.participants?.find(
                    (participant) => participant.participantType === 'user' && participant.userId === user.id
                  );

              if (!matchingParticipant) {
                set.status = 404;
                return { success: false, error: 'Participant not found for user' };
              }

              if (matchingParticipant.participantType !== 'user' || matchingParticipant.userId !== user.id) {
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
            const user = (context as unknown as { user: UserContext }).user;
            try {
              const discussion = await this.discussionService.endDiscussion(
                params.discussionId,
                user.id,
                (body as any)?.reason
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
        logger.error('Failed to get discussion messages', { error, discussionId: params.discussionId });
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
      } catch (error) {
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
        if (typeof (this.conversationEnhancementService as any)['cleanupStaleLLMRequests'] === 'function') {
          (this.conversationEnhancementService as any)['cleanupStaleLLMRequests']();
        }

        return {
          success: true,
          message: 'LLM cleanup triggered',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
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
        const databaseService = this.databaseService;

        // Force Neo4j connection verification
        const graphDb = await databaseService.getToolGraphDatabase();
        logger.info('Testing Neo4j connection...');
        await graphDb.verifyConnectivity(5);

        const status = graphDb.getConnectionStatus();
        logger.info('Neo4j connection status:', status);

        if (!status.isConnected) {
          throw new Error('Neo4j connection verification failed');
        }

        const { KnowledgeBootstrapService } = await import('@uaip/shared-services');

        const knowledgeRepo = await databaseService.getKnowledgeRepository();
        const qdrantService = await databaseService.getQdrantService();
        const embeddingService = await databaseService.getSmartEmbeddingService();

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
          timestamp,
        } = event.data;

        logger.info('Processing WebSocket agent chat request', {
          agentId,
          userId,
          messageLength: message?.length,
          messageId,
          socketId: socketId?.substring(0, 10) + '...',
        });

        // Use unified model selection for the agent
        let modelSelection = null;
        if (agentId) {
          try {
            modelSelection = await this.selectModelForAgent(agentId, LLMTaskType.REASONING);
            logger.info('Selected model for agent', {
              agentId,
              model: modelSelection.model.model,
              provider: (modelSelection as any).provider?.effectiveProvider || 'unknown',
              strategy: modelSelection.model.selectionStrategy,
            });
          } catch (error) {
            logger.warn('Failed to select model for agent, using defaults', { agentId, error });
          }
        }

        // Process the chat request using AgentDiscussionService
        const result = await this.agentDiscussionService.processDiscussionMessage({
          agentId,
          userId,
          message,
          conversationId: `websocket-chat-${Date.now()}`,
          modelSelection, // Pass the selected model
        });

        // Prepare enhanced response with WebSocket metadata
        const responsePayload = {
          socketId,
          agentId,
          messageId,
          response: result.response,
          agentName: `Agent ${agentId}`, // TODO: Load actual agent name from config
          confidence: result.metadata.confidence,
          memoryEnhanced: false, // TODO: Implement memory enhancement
          knowledgeUsed: 0, // TODO: Implement knowledge tracking
          toolsExecuted: [] as string[], // TODO: Implement tool execution
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
          agentId: event.data?.agentId,
          messageId: event.data?.messageId,
        });

        // Send error response back to client
        if (event.data?.socketId && event.data?.messageId) {
          await this.eventBusService.publish('agent.chat.response', {
            socketId: event.data.socketId,
            agentId: event.data.agentId,
            messageId: event.data.messageId,
            response: 'Sorry, I encountered an error processing your request. Please try again.',
            agentName: `Agent ${event.data.agentId}`,
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
        } = event.data;

        if (!this.conversationEnhancementService) {
          this.conversationEnhancementService = new ConversationEnhancementService(
            this.databaseService,
            this.eventBusService
          );
          await this.conversationEnhancementService.initialize();
          logger.info('ConversationEnhancementService initialized on demand');
        }

        logger.info('Processing conversation enhancement request', {
          discussionId,
          agentCount: availableAgentIds?.length,
          messageCount: messageHistory?.length,
          enhancementType,
        });

        // Get agent objects from IDs
        const availableAgents: any[] = [];
        for (const agentId of availableAgentIds || []) {
          try {
            const agent = await this.databaseService.getAgentService().findAgentById(agentId);
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
          discussionId,
          availableAgents,
          messageHistory: messageHistory || [],
          currentTopic: currentTopic || '',
          enhancementType: enhancementType || 'auto',
          context,
        });

        if (result.success && result.enhancedResponse) {
          try {
            // Find the participant ID for the selected agent
            const discussionService = await this.databaseService.getDiscussionService();
            const discussion = await discussionService.getDiscussion(discussionId);
            const participant = discussion?.participants?.find(
              (p) => p.agentId === result.selectedAgent?.id
            );

            if (participant) {
              // Send enhanced response back to discussion orchestration
              const isInitialParticipation =
                (discussion?.state?.messageCount ?? context?.messageCount ?? messageHistory?.length ?? 0) ===
                0;

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
          discussionId: event?.data?.discussionId,
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
    this.agentDiscussionService = new AgentDiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      knowledgeGraphService: undefined, // Optional
      agentMemoryService: undefined, // Optional
      discussionService: undefined, // Optional
      llmService: this.llmService,
      userLLMService: new UserLLMService(),
      serviceName: 'agent-intelligence',
      securityLevel: 1,
    });
    await this.agentDiscussionService.initialize();
    logger.info('AgentDiscussionService initialized for WebSocket chat processing');

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
