// Main Artifact Factory - Core orchestration service
// Epic 4 Implementation

import { 
  Artifact, 
  ArtifactConversationContext, 
  OperationResult, 
  Participant,
  ValidationStatus,
  ValidationResult as SharedValidationResult,
  ValidationError,
  ValidationWarning
} from '@uaip/types';

import { logger } from '@uaip/utils';

import { 
  ArtifactGenerator, 
  ArtifactValidator, 
  SecurityManager,
  ConversationAnalyzer 
} from './interfaces';

import { ConversationAnalyzerImpl } from './analysis/ConversationAnalyzer.js';
import { SecurityManagerImpl } from './security/SecurityManager.js';
import { ArtifactValidator as ArtifactValidatorImpl } from './validation/ArtifactValidator.js';

// Generator imports
import { CodeGenerator } from './generators/CodeGenerator.js';
import { TestGenerator } from './generators/TestGenerator.js';
import { PRDGenerator } from './generators/PRDGenerator.js';
import { DocumentationGenerator } from './generators/DocumentationGenerator.js';

// Local types
import { ValidationResult as LocalValidationResult } from './types/artifact.js';

// Define proper result types for this service
export interface ArtifactResult {
  success: boolean;
  data?: Artifact;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface AnalysisResult {
  success: boolean;
  data?: {
    summary: any;
    triggers: any[];
    requirements: any[];
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface InsightsResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export class ArtifactFactory {
  private generators: Map<string, ArtifactGenerator> = new Map();
  private validator: ArtifactValidator;
  private securityManager: SecurityManager;
  private conversationAnalyzer: ConversationAnalyzer;

  constructor() {
    this.initializeServices();
    this.registerGenerators();
  }

  private initializeServices() {
    this.validator = new ArtifactValidatorImpl();
    this.securityManager = new SecurityManagerImpl();
    this.conversationAnalyzer = new ConversationAnalyzerImpl();
  }

  private registerGenerators() {
    // Register all available generators
    const generators = [
      new CodeGenerator(),
      new TestGenerator(),
      new PRDGenerator(),
      new DocumentationGenerator()
    ];

    generators.forEach(generator => {
      this.generators.set(generator.getSupportedType(), generator);
    });
  }

  /**
   * Register a custom generator
   */
  public registerGenerator(type: string, generator: ArtifactGenerator) {
    this.generators.set(type, generator);
  }

  /**
   * Get available generator types
   */
  public getAvailableTypes(): string[] {
    return Array.from(this.generators.keys());
  }

  /**
   * Convert local ValidationResult to shared ValidationResult format
   */
  private mapValidationResult(localResult: LocalValidationResult): SharedValidationResult {
    // Convert ValidationIssues to ValidationErrors and ValidationWarnings
    const errors: ValidationError[] = localResult.errors
      .filter(issue => issue.severity === 'error' || issue.severity === 'warning')
      .map(issue => ({
        code: issue.code,
        message: issue.message,
        severity: issue.severity as 'error' | 'warning'
      }));

    const warnings: ValidationWarning[] = localResult.warnings
      .filter(issue => issue.severity === 'warning')
      .map(issue => ({
        code: issue.code,
        message: issue.message,
        severity: 'warning' as const
      }));

    return {
      status: localResult.status,
      isValid: localResult.isValid,
      errors,
      warnings,
      suggestions: localResult.suggestions,
      score: localResult.score
    };
  }

  /**
   * Main artifact generation method
   */
  public async generateArtifact(
    type: string, 
    context: ArtifactConversationContext
  ): Promise<ArtifactResult> {
    try {
      logger.info('Starting artifact generation', { 
        type, 
        conversationId: context.conversationId 
      });

      // 1. Security validation
      const isSecure = await this.securityManager.validateContent(
        JSON.stringify(context)
      );
      
      if (!isSecure) {
        return {
          success: false,
          error: {
            code: 'SECURITY_VIOLATION',
            message: 'Content failed security validation'
          }
        };
      }

      // 2. Get appropriate generator
      const generator = this.generators.get(type);
      if (!generator) {
        return {
          success: false,
          error: {
            code: 'UNSUPPORTED_TYPE',
            message: `No generator available for type: ${type}`
          }
        };
      }

      // 3. Check if generator can handle this context
      if (!generator.canHandle(context)) {
        return {
          success: false,
          error: {
            code: 'CONTEXT_INCOMPATIBLE',
            message: `Generator cannot handle the provided context`
          }
        };
      }

      // 4. Generate content
      const content = await generator.generate(context);

      // 5. Validate generated content
      const validation = this.validator.validate(content, type);

      // 6. Create artifact
      const artifact: Artifact = {
        type,
        content: this.securityManager.sanitizeContent(content),
        metadata: {
          id: `artifact_${Date.now()}`,
          title: `Generated ${type}`,
          description: `Auto-generated ${type} artifact`,
          estimatedEffort: 'medium',
          tags: [type, 'auto-generated']
        },
        validation: this.mapValidationResult(validation)
      };

      logger.info('Artifact generation completed', { 
        type, 
        conversationId: context.conversationId,
        validationStatus: validation.status
      });

      return {
        success: true,
        data: artifact
      };

    } catch (error) {
      logger.error('Artifact generation failed', { 
        type, 
        conversationId: context.conversationId, 
        error 
      });

      return {
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Analyze conversation for generation opportunities
   */
  public async analyzeConversation(
    context: ArtifactConversationContext
  ): Promise<AnalysisResult> {
    try {
      const analysis = await this.conversationAnalyzer.analyzeConversation(context);
      const triggers = await this.conversationAnalyzer.detectGenerationTriggers(context);
      const requirements = await this.conversationAnalyzer.extractRequirements(context);

      return {
        success: true,
        data: {
          summary: analysis,
          triggers,
          requirements
        }
      };

    } catch (error) {
      logger.error('Conversation analysis failed', { 
        conversationId: context.conversationId, 
        error 
      });

      return {
        success: false,
        error: {
          code: 'ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Validate artifact content
   */
  public validateArtifact(content: string, type: string) {
    return this.validator.validate(content, type);
  }

  /**
   * Get generator info for a specific type
   */
  public getGeneratorInfo(type: string): {
    available: boolean;
    canHandleContext?: (context: ArtifactConversationContext) => boolean;
    getSupportedType?: () => string;
  } {
    const generator = this.generators.get(type);
    if (!generator) {
      return { available: false };
    }

    return {
      available: true,
      canHandleContext: generator.canHandle.bind(generator),
      getSupportedType: generator.getSupportedType.bind(generator)
    };
  }

  /**
   * Get conversation analysis
   */
  public async getConversationInsights(
    context: ArtifactConversationContext
  ): Promise<InsightsResult> {
    try {
      const triggers = await this.conversationAnalyzer.detectGenerationTriggers(context);
      const requirements = await this.conversationAnalyzer.extractRequirements(context);

      return {
        success: true,
        data: {
          triggers,
          requirements,
          suggestedArtifacts: triggers.map(t => ({
            type: t.artifactType,
            confidence: t.confidence,
            reason: t.context
          }))
        }
      };

    } catch (error) {
      logger.error('Conversation insights failed', { 
        conversationId: context.conversationId, 
        error 
      });

      return {
        success: false,
        error: {
          code: 'INSIGHTS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Get system status and health
   */
  public getSystemStatus(): {
    generators: Record<string, boolean>;
    services: Record<string, boolean>;
    lastError?: string;
  } {
    const generatorStatus: Record<string, boolean> = {};
    this.generators.forEach((generator, type) => {
      generatorStatus[type] = true; // Could add health checks here
    });

    return {
      generators: generatorStatus,
      services: {
        validator: !!this.validator,
        securityManager: !!this.securityManager,
        conversationAnalyzer: !!this.conversationAnalyzer
      }
    };
  }
}

// Export singleton instance
export const artifactFactory = new ArtifactFactory(); 