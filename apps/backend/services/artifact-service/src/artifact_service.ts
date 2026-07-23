import { IArtifactService } from '@uaip/types';
import type { ArtifactGenerator } from './interfaces/index.js';
import {
  ArtifactGenerationRequest,
  ArtifactGenerationResponse,
  ArtifactGenerationTemplate as ArtifactTemplate,
  ArtifactConversationContext,
  ValidationResult,
  Artifact as GeneratedArtifact,
  ArtifactMetadata,
  ArtifactType,
  EventBusMessage,
} from '@uaip/types';
import { CodeGenerator } from './generators/code_generator.js';
import { TestGenerator } from './generators/test_generator.js';
import { DocumentationGenerator } from './generators/documentation_generator.js';
import { PRDGenerator } from './generators/p_r_d_generator.js';
import { TemplateManager } from './templates/template_manager.js';
import { ArtifactValidator } from './validation/artifact_validator.js';
import { logger, InternalServerError, ValidationError } from '@uaip/utils';
import { EventBusService } from '@uaip/infra/event_bus';
import { DatabaseService } from '@uaip/shared-services';
import type { NewArtifact } from '@uaip/shared-services/drizzle/intelligence';

type PersistedArtifactGenerationResponse = ArtifactGenerationResponse & {
  persistedArtifact?: Awaited<ReturnType<ReturnType<DatabaseService['getArtifactRepository']>['create']>>;
};

type PersistArtifactOptions = {
  generatedBy?: string;
  generator?: string;
};

type ArtifactPersistenceInput = {
  request: ArtifactGenerationRequest;
  response: ArtifactGenerationResponse;
  options?: PersistArtifactOptions;
};

const INVALID_ARTIFACT_PATTERNS = [
  /I apologize, but I am currently unable to generate a response/i,
  /I apologize, but I encountered an error/i,
  /no LLM providers are currently available/i,
  /TODO:\s*Implement/i,
  /not yet implemented/i,
  /NotImplementedError/i,
] as const;

export interface LLMGenerationRequest {
  type: 'generate_artifact_content';
  artifactType: string;
  context: Record<string, unknown>;
  options?: {
    language?: string;
    framework?: string;
    template?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface LLMGenerationResponse {
  success: boolean;
  content?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

function isLLMGenerationResponse(value: unknown): value is LLMGenerationResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof value.success === 'boolean'
  );
}

export class ArtifactService implements IArtifactService {
  private generators: Map<string, ArtifactGenerator> = new Map();
  public templateManager: TemplateManager;
  private validator: ArtifactValidator;
  private eventBusService: EventBusService;
  private pendingLLMRequests: Map<
    string,
    { resolve: (value: LLMGenerationResponse) => void; reject: (reason: unknown) => void }
  > = new Map();

  constructor(eventBusService?: EventBusService) {
    this.templateManager = new TemplateManager();
    this.validator = new ArtifactValidator();
    this.eventBusService = eventBusService || EventBusService.getInstance();
    this.initializeGenerators();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing ArtifactService...');

    // Initialize templates
    await this.templateManager.initialize();

    // Set up LLM response event listener
    await this.setupLLMEventListeners();

    // Validate generator initialization
    if (this.generators.size === 0) {
      throw new ValidationError('No generators initialized');
    }

    logger.info(
      `ArtifactService initialized with ${this.generators.size} generators and ${this.templateManager.listTemplates().length} templates`
    );
  }

  private async setupLLMEventListeners(): Promise<void> {
    try {
      // Listen for LLM generation responses
      await this.eventBusService.subscribe('llm.generate.response', async (eventMessage) => {
        await this.handleLLMGenerationResponse(eventMessage);
      });

      logger.info('LLM event listeners set up successfully');
    } catch (error) {
      logger.error('Failed to set up LLM event listeners', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleLLMGenerationResponse(eventMessage: EventBusMessage): Promise<void> {
    try {
      if (!isLLMGenerationResponse(eventMessage.data)) {
        logger.warn('Received malformed LLM generation response', {
          type: eventMessage.type,
          data: eventMessage.data,
        });
        return;
      }

      const response = eventMessage.data;
      const requestId =
        typeof eventMessage.metadata?.requestId === 'string'
          ? eventMessage.metadata.requestId
          : typeof response.metadata?.requestId === 'string'
            ? response.metadata.requestId
            : eventMessage.correlationId;

      if (!requestId) {
        logger.warn('Received LLM response without requestId', { response });
        return;
      }

      logger.info('Received LLM generation response', {
        requestId,
        success: response.success,
        contentLength: response.content?.length || 0,
      });

      // Find and resolve pending request
      const pendingRequest = this.pendingLLMRequests.get(requestId);
      if (pendingRequest) {
        this.pendingLLMRequests.delete(requestId);

        if (response.success && response.content) {
          pendingRequest.resolve(response);
        } else {
          pendingRequest.reject(new Error(response.error?.message || 'LLM generation failed'));
        }
      } else {
        logger.warn('Received LLM response for unknown requestId', { requestId });
      }
    } catch (error) {
      logger.error('Error handling LLM generation response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventMessage: eventMessage.data,
      });
    }
  }

  async generateArtifact(request: ArtifactGenerationRequest): Promise<ArtifactGenerationResponse> {
    const startTime = Date.now();

    logger.info('Generating artifact', {
      type: request.type,
      contextId: request.context.conversationId || 'unknown',
    });

    try {
      // Check if we need advanced LLM generation
      const requiresLLMGeneration = this.shouldUseLLMService(request.type, request.context);

      if (requiresLLMGeneration) {
        // Use event-driven LLM generation
        return await this.generateArtifactWithLLMService(request, startTime);
      } else {
        // Use local generator
        return await this.generateArtifactLocally(request, startTime);
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Artifact generation failed', {
        type: request.type,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { duration },
        },
      };
    }
  }

  async generateAndPersistArtifact(
    request: ArtifactGenerationRequest,
    options?: PersistArtifactOptions
  ): Promise<PersistedArtifactGenerationResponse> {
    const response = await this.generateArtifact(request);
    if (!response.success || !response.artifact) {
      return response;
    }

    try {
      const persistedArtifact = await this.persistArtifact({ request, response, options });
      return {
        ...response,
        persistedArtifact,
        metadata: {
          ...(response.metadata || {}),
          persistedArtifactId: persistedArtifact.id,
        },
      };
    } catch (error) {
      logger.warn('Generated artifact was not persisted', {
        type: request.type,
        conversationId: request.context.conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'ARTIFACT_PERSISTENCE_REJECTED',
          message: error instanceof Error ? error.message : 'Generated artifact failed persistence gate',
        },
        metadata: response.metadata,
      };
    }
  }

  private async persistArtifact(input: ArtifactPersistenceInput) {
    const { request, response, options } = input;
    const artifact = response.artifact;
    if (!artifact) {
      throw new ValidationError('Cannot persist artifact generation without artifact content');
    }

    const content = artifact.content.trim();
    if (!content) {
      throw new ValidationError('Generated artifact content is empty');
    }

    const invalidPattern = INVALID_ARTIFACT_PATTERNS.find((pattern) => pattern.test(content));
    if (invalidPattern) {
      throw new ValidationError('Generated artifact content failed quality gate', {
        pattern: invalidPattern.source,
      });
    }

    const validation = artifact.validation;
    if (validation && !validation.isValid) {
      throw new ValidationError('Generated artifact failed validation', {
        validationStatus: validation.status,
        validationScore: validation.score,
      });
    }

    const metadata = artifact.metadata;
    const context = request.context;
    const sourceMessages = context.messages.map((message) => message.id).filter((id) => id.length > 0);
    const generator = options?.generator || String(response.metadata?.generationMethod ?? 'artifact-service');
    const validationScore = validation?.score === undefined
      ? undefined
      : validation.score > 1
        ? validation.score / 100
        : validation.score;
    const generatedBy =
      options?.generatedBy ||
      metadata.generatedBy ||
      context.agent?.id ||
      'artifact-service';

    const artifactRecord: NewArtifact = {
      type: request.type,
      content,
      title: metadata.title,
      description: metadata.description,
      language: metadata.language || request.options?.language || context.technical?.language,
      framework: metadata.framework || request.options?.framework || context.technical?.framework,
      targetFile: metadata.targetFile,
      estimatedEffort: metadata.estimatedEffort,
      tags: metadata.tags,
      conversationId: context.conversationId,
      generatedBy,
      generatedAt: new Date(),
      generator,
      confidence: validationScore ?? 0.8,
      sourceMessages,
      validationResult: validation,
      validationStatus: validation?.status ?? 'pending',
      validationScore,
      status: 'draft',
      qualityScore: validationScore,
      contentSizeBytes: Buffer.byteLength(content, 'utf8'),
      lineCount: content.split('\n').length,
      metadata: {
        ...(request.metadata || {}),
        ...(response.metadata || {}),
        ...(metadata.template ? { template: metadata.template } : {}),
      },
      generationContext: {
        summary: context.summary,
        topics: context.topics,
        decisions: context.decisions,
        actionItems: context.actionItems,
        participantCount: context.participants.length,
        messageCount: context.messages.length,
      },
    };

    const repository = DatabaseService.getInstance().getArtifactRepository();
    const persistedArtifact = await repository.create(artifactRecord);

    logger.info('Generated artifact persisted', {
      artifactId: persistedArtifact.id,
      type: persistedArtifact.type,
      conversationId: persistedArtifact.conversationId,
    });

    return persistedArtifact;
  }

  private shouldUseLLMService(
    artifactType: string,
    context: ArtifactConversationContext
  ): boolean {
    // Completed discussions carry the authenticated creator so artifact generation
    // can use the same user-scoped provider as agent turns. Never route that path
    // through legacy generators, which use the global provider singleton.
    if (typeof context.metadata?.userId === 'string') return true;

    // Determine if we need advanced LLM generation based on complexity
    const complexArtifactTypes = ['code', 'prd', 'analysis', 'workflow'];
    const hasComplexContext =
      (context.messages?.length ?? 0) > 10 ||
      (context.decisions?.length ?? 0) > 3 ||
      (context.actionItems?.length ?? 0) > 5;

    return complexArtifactTypes.includes(artifactType) || hasComplexContext;
  }

  private async generateArtifactWithLLMService(
    request: ArtifactGenerationRequest,
    startTime: number
  ): Promise<ArtifactGenerationResponse> {
    const requestId = `artifact_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Prepare LLM generation request
      const llmRequest: LLMGenerationRequest = {
        type: 'generate_artifact_content',
        artifactType: request.type,
        context: this.prepareLLMContext(request.context),
        options: {
          language: request.options?.language,
          framework: request.options?.framework,
          template: request.options?.template,
        },
        metadata: {
          requestId,
          conversationId: request.context.conversationId,
          timestamp: new Date(),
          ...(typeof request.context.metadata?.userId === 'string'
            ? { userId: request.context.metadata.userId }
            : {}),
        },
      };

      // Send request to LLM service and wait for response
      const response = await this.sendLLMRequest(llmRequest, requestId);

      if (response.content) {
        // Create artifact with generated content
        const artifact: GeneratedArtifact = {
          id: Date.now().toString(),
          type: request.type,
          content: response.content,
          metadata: {
            title: `Generated ${request.type}`,
            description: `AI-generated ${request.type} artifact from discussion`,
            estimatedEffort: this.estimateEffort(request.type, response.content),
            tags: [request.type, 'ai-generated', 'discussion-triggered'],
            generatedBy: 'artifact-service-llm',
            template: request.options?.template,
            language: request.options?.language,
            framework: request.options?.framework,
            createdAt: new Date(),
          },
        };

        // Validate the generated artifact
        const validation = this.validator.validate(response.content, request.type);
        artifact.validation = validation;

        const duration = Date.now() - startTime;

        logger.info('LLM artifact generated successfully', {
          type: request.type,
          duration,
          requestId,
          isValid: validation.isValid,
          score: validation.score,
        });

        return {
          success: true,
          artifact,
          metadata: {
            generationMethod: 'llm-service',
            requestId,
            duration,
          },
        };
      } else {
        return {
          success: false,
          error: response.error || {
            code: 'LLM_GENERATION_FAILED',
            message: 'LLM service failed to generate content',
          },
        };
      }
    } catch (error) {
      logger.error('LLM-based artifact generation failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'LLM_SERVICE_ERROR',
          message: error instanceof Error ? error.message : 'LLM service integration error',
        },
      };
    }
  }

  private async generateArtifactLocally(
    request: ArtifactGenerationRequest,
    startTime: number
  ): Promise<ArtifactGenerationResponse> {
    // Get appropriate generator
    const generator = this.generators.get(request.type);
    if (!generator) {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_TYPE',
          message: `Artifact type '${request.type}' is not supported`,
          details: { supportedTypes: Array.from(this.generators.keys()) },
        },
      };
    }

    // Check if generator can handle this context
    if (!generator.canHandle(request.context)) {
      return {
        success: false,
        error: {
          code: 'CONTEXT_INCOMPATIBLE',
          message: `Generator cannot handle the provided context for type '${request.type}'`,
        },
      };
    }

    // Generate content
    const content = await generator.generate(request.context);

    // Validate generated content
    const validation = this.validator.validate(content, request.type);

    // Create artifact metadata
    const metadata: ArtifactMetadata = {
      title: `Generated ${request.type}`,
      description: `Generated artifact of type ${request.type}`,
      tags: [request.type],
      generatedBy: 'artifact-service',
      template: request.options?.template,
      language: request.options?.language,
      framework: request.options?.framework,
      createdAt: new Date(),
    };

    // Create artifact
    const artifact: GeneratedArtifact = {
      id: Date.now().toString(),
      type: request.type,
      content,
      metadata,
      validation,
    };

    const duration = Date.now() - startTime;

    logger.info('Local artifact generated successfully', {
      type: request.type,
      duration,
      isValid: validation.isValid,
      score: validation.score,
    });

    return {
      success: true,
      artifact,
      metadata: {
        generationMethod: 'local-factory',
        duration,
      },
    };
  }

  private async sendLLMRequest(
    llmRequest: LLMGenerationRequest,
    requestId: string
  ): Promise<LLMGenerationResponse> {
    return new Promise((resolve, reject) => {
      // Store the pending request
      this.pendingLLMRequests.set(requestId, { resolve, reject });

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingLLMRequests.delete(requestId);
        reject(new Error('LLM request timeout'));
      }, 30000); // 30 second timeout

      // Override resolve to clear timeout
      const originalResolve = resolve;
      const resolveWithCleanup = (response: LLMGenerationResponse) => {
        clearTimeout(timeout);
        originalResolve(response);
      };

      const originalReject = reject;
      const rejectWithCleanup = (error: unknown) => {
        clearTimeout(timeout);
        originalReject(error);
      };

      // Update the stored request with cleanup versions
      this.pendingLLMRequests.set(requestId, {
        resolve: resolveWithCleanup,
        reject: rejectWithCleanup,
      });

      // Send request to LLM service
      this.eventBusService
        .publish('llm.generate.request', llmRequest, {
          metadata: {
            requestId,
            ...(typeof this.getArtifactUserId(llmRequest) === 'string'
              ? { userId: this.getArtifactUserId(llmRequest) }
              : {}),
          },
        })
        .catch((error) => {
          this.pendingLLMRequests.delete(requestId);
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private getArtifactUserId(llmRequest: LLMGenerationRequest): string | undefined {
    const metadata = llmRequest.metadata
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
    const userId = (metadata as Record<string, unknown>).userId
    return typeof userId === 'string' && userId.length > 0 ? userId : undefined
  }

  private prepareLLMContext(context: ArtifactConversationContext): Record<string, unknown> {
    // Prepare context for LLM service, removing unnecessary data
    return {
      conversationId: context.conversationId,
      summary: context.summary,
      topics: context.topics,
      decisions: context.decisions,
      actionItems: context.actionItems,
      keyMessages: context.messages?.slice(-10) || [], // Last 10 messages for context
      participantRoles:
        context.participants?.map((p: { id: string; role: string; messageCount?: number }) => ({
          id: p.id,
          role: p.role,
          messageCount: p.messageCount,
        })) || [],
      technical: context.technical,
      metadata: {
        totalMessages: context.messages?.length || 0,
        discussionDuration: context.metadata?.discussionDuration,
        discussionTopic: context.metadata?.discussionTopic,
      },
    };
  }

  private estimateEffort(artifactType: string, content: string): 'low' | 'medium' | 'high' {
    const contentLength = content.length;
    const complexTypes = ['code', 'prd', 'analysis'];

    if (complexTypes.includes(artifactType) && contentLength > 2000) {
      return 'high';
    } else if (contentLength > 1000) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  async listTemplates(type?: ArtifactType): Promise<ArtifactTemplate[]> {
    try {
      const filters = type ? { type } : undefined;
      return this.templateManager.listTemplates(filters);
    } catch (error) {
      logger.error('Failed to list templates:', error);
      return [];
    }
  }

  async getTemplate(id: string): Promise<ArtifactTemplate | null> {
    try {
      return this.templateManager.getTemplate(id);
    } catch (error) {
      logger.error('Failed to get template:', error);
      return null;
    }
  }

  async validateArtifact(content: string, type: ArtifactType): Promise<ValidationResult> {
    try {
      return this.validator.validate(content, type);
    } catch (error) {
      logger.error('Validation failed:', error);
      return {
        status: 'invalid',
        isValid: false,
        errors: [
          {
            code: 'VALIDATION_ERROR',
            message: 'Internal validation error',
            severity: 'error',
          },
        ],
        warnings: [],
        suggestions: [],
        score: 0,
        issues: [
          {
            code: 'VALIDATION_ERROR',
            message: 'Internal validation error',
            severity: 'error',
          },
        ],
      };
    }
  }

  // Service health and metrics
  getServiceHealth() {
    const generators = Object.fromEntries(
      Array.from(this.generators.entries()).map(([type, generator]) => [type, generator !== null])
    );

    const templates = this.templateManager.listTemplates();
    const templatesByType = templates.reduce<{ [key: string]: number }>(
      (acc, template) => {
        acc[template.type] = (acc[template.type] || 0) + 1;
        return acc;
      },
      {}
    );

    return {
      status: 'healthy' as const,
      generators,
      templates: {
        total: templates.length,
        byType: templatesByType,
      },
    };
  }

  private initializeGenerators(): void {
    try {
      this.generators.set('code', new CodeGenerator());
      this.generators.set('test', new TestGenerator());
      this.generators.set('documentation', new DocumentationGenerator());
      this.generators.set('prd', new PRDGenerator());

      logger.info(`Initialized ${this.generators.size} artifact generators`);
    } catch (error) {
      logger.error('Failed to initialize generators:', error);
      throw new InternalServerError('Service initialization failed', { cause: error });
    }
  }
}
