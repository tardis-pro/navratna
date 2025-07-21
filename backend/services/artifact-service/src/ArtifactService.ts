import { IArtifactService } from './interfaces/ArtifactTypes.js';
import { 
  ArtifactGenerationRequest, 
  ArtifactGenerationResponse, 
  ArtifactGenerationTemplate as ArtifactTemplate, 
  ValidationResult, 
  Artifact as GeneratedArtifact,
  ArtifactMetadata,
  ArtifactType
} from '@uaip/types';
import { CodeGenerator } from './generators/CodeGenerator.js';
import { TestGenerator } from './generators/TestGenerator.js';
import { DocumentationGenerator } from './generators/DocumentationGenerator.js';
import { PRDGenerator } from './generators/PRDGenerator.js';
import { TemplateManager } from './templates/TemplateManager.js';
import { ArtifactValidator } from './validation/ArtifactValidator.js';
import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/shared-services';

export interface LLMGenerationRequest {
  type: 'generate_artifact_content';
  artifactType: string;
  context: any;
  options?: {
    language?: string;
    framework?: string;
    template?: string;
  };
  metadata?: Record<string, any>;
}

export interface LLMGenerationResponse {
  success: boolean;
  content?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: Record<string, any>;
}

export class ArtifactService implements IArtifactService {
  private generators: Map<string, any> = new Map();
  public templateManager: TemplateManager;
  private validator: ArtifactValidator;
  private eventBusService: EventBusService;
  private pendingLLMRequests: Map<string, any> = new Map();

  constructor() {
    this.templateManager = new TemplateManager();
    this.validator = new ArtifactValidator();
    this.eventBusService = EventBusService.getInstance();
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
      throw new Error('No generators initialized');
    }
    
    logger.info(`ArtifactService initialized with ${this.generators.size} generators and ${this.templateManager.listTemplates().length} templates`);
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
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleLLMGenerationResponse(eventMessage: any): Promise<void> {
    try {
      const response: LLMGenerationResponse = eventMessage.data;
      const requestId = eventMessage.metadata?.requestId;
      
      if (!requestId) {
        logger.warn('Received LLM response without requestId', { response });
        return;
      }

      logger.info('Received LLM generation response', {
        requestId,
        success: response.success,
        contentLength: response.content?.length || 0
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
        eventMessage: eventMessage.data
      });
    }
  }

  async generateArtifact(request: ArtifactGenerationRequest): Promise<ArtifactGenerationResponse> {
    const startTime = Date.now();
    
    logger.info('Generating artifact', {
      type: request.type,
      contextId: request.context.conversationId || 'unknown'
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
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { duration }
        }
      };
    }
  }

  private shouldUseLLMService(artifactType: string, context: any): boolean {
    // Determine if we need advanced LLM generation based on complexity
    const complexArtifactTypes = ['code', 'prd', 'analysis', 'workflow'];
    const hasComplexContext = context.messages?.length > 10 || 
                             context.decisions?.length > 3 ||
                             context.actionItems?.length > 5;

    return complexArtifactTypes.includes(artifactType) || hasComplexContext;
  }

  private async generateArtifactWithLLMService(request: ArtifactGenerationRequest, startTime: number): Promise<ArtifactGenerationResponse> {
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
          template: request.options?.template
        },
        metadata: {
          requestId,
          conversationId: request.context.conversationId,
          timestamp: new Date()
        }
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
            createdAt: new Date()
          }
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
          score: validation.score
        });

        return {
          success: true,
          artifact,
          metadata: {
            generationMethod: 'llm-service',
            requestId,
            duration
          }
        };
      } else {
        return {
          success: false,
          error: response.error || {
            code: 'LLM_GENERATION_FAILED',
            message: 'LLM service failed to generate content'
          }
        };
      }
    } catch (error) {
      logger.error('LLM-based artifact generation failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: {
          code: 'LLM_SERVICE_ERROR',
          message: error instanceof Error ? error.message : 'LLM service integration error'
        }
      };
    }
  }

  private async generateArtifactLocally(request: ArtifactGenerationRequest, startTime: number): Promise<ArtifactGenerationResponse> {
    // Get appropriate generator
    const generator = this.generators.get(request.type);
    if (!generator) {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_TYPE',
          message: `Artifact type '${request.type}' is not supported`,
          details: { supportedTypes: Array.from(this.generators.keys()) }
        }
      };
    }

    // Check if generator can handle this context
    if (!generator.canHandle(request.context)) {
      return {
        success: false,
        error: {
          code: 'CONTEXT_INCOMPATIBLE',
          message: `Generator cannot handle the provided context for type '${request.type}'`
        }
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
      createdAt: new Date()
    };

    // Create artifact
    const artifact: GeneratedArtifact = {
      id: Date.now().toString(),
      type: request.type,
      content,
      metadata,
      validation
    };

    const duration = Date.now() - startTime;
    
    logger.info('Local artifact generated successfully', {
      type: request.type,
      duration,
      isValid: validation.isValid,
      score: validation.score
    });

    return {
      success: true,
      artifact,
      metadata: {
        generationMethod: 'local-factory',
        duration
      }
    };
  }

  private async sendLLMRequest(llmRequest: LLMGenerationRequest, requestId: string): Promise<LLMGenerationResponse> {
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
      const rejectWithCleanup = (error: Error) => {
        clearTimeout(timeout);
        originalReject(error);
      };

      // Update the stored request with cleanup versions
      this.pendingLLMRequests.set(requestId, { 
        resolve: resolveWithCleanup, 
        reject: rejectWithCleanup 
      });

      // Send request to LLM service
      this.eventBusService.publish('llm.generate.request', llmRequest, {
        metadata: { requestId }
      }).catch((error) => {
        this.pendingLLMRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private prepareLLMContext(context: any): any {
    // Prepare context for LLM service, removing unnecessary data
    return {
      conversationId: context.conversationId,
      summary: context.summary,
      topics: context.topics,
      decisions: context.decisions,
      actionItems: context.actionItems,
      keyMessages: context.messages?.slice(-10) || [], // Last 10 messages for context
      participantRoles: context.participants?.map(p => ({
        id: p.id,
        role: p.role,
        messageCount: p.messageCount
      })) || [],
      technical: context.technical,
      metadata: {
        totalMessages: context.messages?.length || 0,
        discussionDuration: context.metadata?.discussionDuration,
        discussionTopic: context.metadata?.discussionTopic
      }
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
        errors: [{
          code: 'VALIDATION_ERROR',
          message: 'Internal validation error',
          severity: 'error'
        }],
        warnings: [],
        suggestions: [],
        score: 0,
        issues: [{
          code: 'VALIDATION_ERROR',
          message: 'Internal validation error',
          severity: 'error'
        }]
      };
    }
  }

  // Service health and metrics
  getServiceHealth() {
    const generators = Object.fromEntries(
      Array.from(this.generators.entries()).map(([type, generator]) => [
        type, 
        generator !== null
      ])
    );

    const templates = this.templateManager.listTemplates();
    const templatesByType = templates.reduce((acc, template) => {
      acc[template.type] = (acc[template.type]) + 1;
      return acc;
    }, {} as { [key: string]: number });

    return {
      status: 'healthy' as const,
      generators,
      templates: {
        total: templates.length,
        byType: templatesByType
      }
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
      throw new Error('Service initialization failed');
    }
  }
} 