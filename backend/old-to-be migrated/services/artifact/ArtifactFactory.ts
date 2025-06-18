// Main Artifact Factory - Core orchestration service
// Epic 4 Implementation

import { 
  Artifact, 
  ConversationContext, 
  GenerationResult, 
  Participant,
  ArtifactType,
  ValidationStatus
} from '@/types/artifact';

import { 
  ArtifactGenerator, 
  ArtifactValidator, 
  SecurityManager,
  ConversationAnalyzer 
} from './interfaces';

import { ConversationAnalyzerImpl } from './analysis/ConversationAnalyzer';
import { SecurityManagerImpl } from './security/SecurityManager';
import { ArtifactValidatorImpl } from './validation/ArtifactValidator';

// Generator imports
import { CodeGenerator } from './generators/CodeGenerator';
import { TestGenerator } from './generators/TestGenerator';
import { PRDGenerator } from './generators/PRDGenerator';
import { DocumentationGenerator } from './generators/DocumentationGenerator';

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
   * Analyze conversation to detect generation opportunities
   */
  public async analyzeConversation(context: ConversationContext): Promise<{
    triggers: any[];
    phase: any;
    summary: any;
    suggestions: string[];
  }> {
    try {
      const triggers = this.conversationAnalyzer.detectTriggers(context);
      const phase = this.conversationAnalyzer.analyzePhase(context);
      const summary = this.conversationAnalyzer.summarize(context);

      // Generate suggestions based on analysis
      const suggestions = this.generateSuggestions(triggers, phase, summary);

      return {
        triggers,
        phase,
        summary,
        suggestions
      };
    } catch (error) {
      console.error('Conversation analysis failed:', error);
      return {
        triggers: [],
        phase: { current: 'unknown', confidence: 0, suggestedActions: [] },
        summary: { keyPoints: [], decisions: [], actionItems: [], participants: [], phase: 'unknown', confidence: 0 },
        suggestions: ['Unable to analyze conversation - please try again']
      };
    }
  }

  /**
   * Generate an artifact from conversation context
   */
  public async generateArtifact(
    type: ArtifactType,
    context: ConversationContext,
    user: Participant,
    parameters: Record<string, any> = {}
  ): Promise<GenerationResult> {
    try {
      // Security check
      const hasAccess = await this.securityManager.validateAccess(
        user.id, 
        'generate', 
        type
      );

      if (!hasAccess) {
        return {
          success: false,
          errors: [`User ${user.id} not authorized to generate ${type} artifacts`],
          warnings: [],
          confidence: 0
        };
      }

      // Find appropriate generator
      const generator = this.generators.get(type);
      if (!generator) {
        return {
          success: false,
          errors: [`No generator available for type: ${type}`],
          warnings: [],
          confidence: 0
        };
      }

      // Check if generator can handle this context
      if (!generator.canHandle(context)) {
        return {
          success: false,
          errors: [`Generator cannot handle current context for type: ${type}`],
          warnings: ['Context may be missing required information'],
          confidence: 0
        };
      }

      // Generate artifact
      const artifact = await generator.generate(context);
      
      // Add traceability information
      artifact.traceability = {
        conversationId: context.conversationId,
        generatedBy: user.id,
        generatedAt: new Date().toISOString(),
        generator: type,
        confidence: generator.getConfidence?.(context) || 0.8,
        sourceMessages: context.messages.map(m => m.id)
      };

      // Validate artifact
      const validation = this.validator.validate(artifact);
      artifact.validation = validation;

      if (!validation.isValid) {
        return {
          success: false,
          artifact,
          errors: validation.errors.map(e => e.message),
          warnings: validation.warnings.map(w => w.message),
          confidence: validation.score
        };
      }

      // Security validation
      const securityValidation = this.validator.validateSecurity(artifact);
      if (securityValidation.status === 'fail') {
        return {
          success: false,
          artifact,
          errors: securityValidation.findings.map(f => `Security: ${f.message}`),
          warnings: validation.warnings.map(w => w.message),
          confidence: 0
        };
      }

      // Audit log
      await this.securityManager.auditLog({
        type: 'artifact_generated',
        userId: user.id,
        resource: type,
        operation: 'generate',
        timestamp: new Date().toISOString(),
        metadata: {
          artifactId: artifact.metadata.id,
          confidence: artifact.traceability.confidence
        }
      });

      return {
        success: true,
        artifact,
        errors: [],
        warnings: validation.warnings.map(w => w.message),
        confidence: artifact.traceability.confidence
      };

    } catch (error) {
      console.error('Artifact generation failed:', error);
      
      // Audit error
      await this.securityManager.auditLog({
        type: 'generation_failed',
        userId: user.id,
        resource: type,
        operation: 'generate',
        timestamp: new Date().toISOString(),
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
        warnings: [],
        confidence: 0
      };
    }
  }

  /**
   * Validate an existing artifact
   */
  public validateArtifact(artifact: Artifact): ValidationResult {
    try {
      return this.validator.validate(artifact);
    } catch (error) {
      console.error('Artifact validation failed:', error);
      return {
        status: 'invalid' as ValidationStatus,
        isValid: false,
        errors: [{
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown validation error',
          severity: 'error' as const
        }],
        warnings: [],
        suggestions: ['Please check artifact format and try again'],
        score: 0
      };
    }
  }

  /**
   * Get generator info for a specific type
   */
  public getGeneratorInfo(type: string): {
    available: boolean;
    canHandleContext?: (context: ConversationContext) => boolean;
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
   * Generate suggestions based on conversation analysis
   */
  private generateSuggestions(triggers: any[], phase: any, summary: any): string[] {
    const suggestions: string[] = [];

    // Suggest based on triggers
    triggers.forEach(trigger => {
      if (trigger.confidence > 0.7) {
        suggestions.push(`Consider generating ${trigger.artifactType} based on recent discussion`);
      }
    });

    // Suggest based on phase
    if (phase.current === 'decision' && phase.confidence > 0.8) {
      suggestions.push('Decisions have been made - consider generating documentation');
    }

    if (phase.current === 'implementation' && phase.confidence > 0.8) {
      suggestions.push('Implementation phase detected - consider generating code or tests');
    }

    // Suggest based on summary
    if (summary.decisions.length > 0) {
      suggestions.push('Multiple decisions detected - consider creating a PRD section');
    }

    if (summary.actionItems.length > 0) {
      suggestions.push('Action items identified - consider generating implementation artifacts');
    }

    // Default suggestions if none found
    if (suggestions.length === 0) {
      suggestions.push('Continue the conversation to identify generation opportunities');
    }

    return suggestions;
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