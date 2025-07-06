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

export class ArtifactService implements IArtifactService {
  private generators: Map<string, any> = new Map();
  public templateManager: TemplateManager;
  private validator: ArtifactValidator;

  constructor() {
    this.templateManager = new TemplateManager();
    this.validator = new ArtifactValidator();
    this.initializeGenerators();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing ArtifactService...');
    
    // Initialize templates
    await this.templateManager.initialize();
    
    // Validate generator initialization
    if (this.generators.size === 0) {
      throw new Error('No generators initialized');
    }
    
    logger.info(`ArtifactService initialized with ${this.generators.size} generators and ${this.templateManager.listTemplates().length} templates`);
  }

  async generateArtifact(request: ArtifactGenerationRequest): Promise<ArtifactGenerationResponse> {
    const startTime = Date.now();
    
    logger.info('Generating artifact', {
      type: request.type,
      contextId: request.context.conversationId || 'unknown'
    });

    try {
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
        id: Date.now().toString(), // Use timestamp as simple numeric ID
        type: request.type,
        content,
        metadata,
        validation
      };

      const duration = Date.now() - startTime;
      
      logger.info('Artifact generated successfully', {
        type: request.type,
        duration,
        isValid: validation.isValid,
        score: validation.score
      });

      return {
        success: true,
        artifact
      };

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