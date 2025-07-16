import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { authMiddleware } from '@uaip/middleware';

import { ArtifactFactory } from './ArtifactFactory.js';
import { ArtifactService } from './ArtifactService.js';
import { artifactRoutes } from './routes/artifactRoutes.js';
import { ConversationAnalyzerImpl } from './analysis/ConversationAnalyzer.js';

class ArtifactServiceApp extends BaseService {
  private artifactFactory: ArtifactFactory;
  private artifactService: ArtifactService;
  private conversationAnalyzer: ConversationAnalyzerImpl;

  constructor() {
    const serviceConfig: ServiceConfig = {
      name: 'artifact-service',
      port: config.services?.artifactService?.port || 3006,
      version: '1.0.0',
      rateLimitConfig: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      },
      customMiddleware: []
    };
    super(serviceConfig);
    this.artifactFactory = new ArtifactFactory();
    this.artifactService = new ArtifactService();
    this.conversationAnalyzer = new ConversationAnalyzerImpl();
  }

  protected async initialize(): Promise<void> {
    logger.info('Initializing Artifact Service...');
    
    // Service-specific initialization
    await this.artifactService.initialize();
    
    // Set up event listeners for discussion completion
    await this.setupDiscussionEventListeners();
    
    logger.info('Artifact Service initialized successfully');
  }

  private async setupDiscussionEventListeners(): Promise<void> {
    try {
      // Listen for discussion completion events
      await this.eventBusService.subscribe('discussion.completed', async (eventMessage) => {
        await this.handleDiscussionCompletion(eventMessage);
      });
      
      logger.info('Discussion event listeners set up successfully');
    } catch (error) {
      logger.error('Failed to set up discussion event listeners', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleDiscussionCompletion(eventMessage: any): Promise<void> {
    try {
      const { discussionId, discussion, messages, participants, artifactGeneration } = eventMessage.data;
      
      logger.info('Received discussion completion event', {
        discussionId,
        discussionTitle: discussion.title,
        completionReason: discussion.completionReason,
        suggestedArtifactType: artifactGeneration.suggestedType,
        priority: artifactGeneration.priority,
        messageCount: messages.length,
        participantCount: participants.length
      });

      // Create conversation context for analysis
      const conversationContext = {
        conversationId: discussionId,
        messages: messages.map((msg: any) => ({
          id: msg.id,
          role: msg.participantId,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          metadata: {
            participantId: msg.participantId,
            messageType: msg.messageType
          }
        })),
        participants: participants.map((p: any) => ({
          id: p.id,
          agentId: p.agentId,
          userId: p.userId,
          role: p.role,
          messageCount: p.messageCount
        })),
        summary: `Discussion: ${discussion.title} - ${discussion.description}`,
        topics: [discussion.topic || discussion.title],
        decisions: [], // Will be populated by analyzer
        actionItems: [], // Will be populated by analyzer
        metadata: {
          discussionId,
          discussionTitle: discussion.title,
          discussionDescription: discussion.description,
          discussionTopic: discussion.topic,
          completionReason: discussion.completionReason,
          discussionMetrics: discussion.metrics,
          ...artifactGeneration.metadata
        }
      };

      // Use ConversationAnalyzer to analyze the discussion
      const conversationSummary = await this.conversationAnalyzer.analyzeConversation(conversationContext);
      
      // Update context with analyzed data
      conversationContext.decisions = conversationSummary.decisions;
      conversationContext.actionItems = conversationSummary.actionItems;

      // Generate artifact based on discussion content
      const artifactRequest = {
        type: artifactGeneration.suggestedType,
        context: conversationContext,
        options: {
          priority: artifactGeneration.priority,
          autoGenerate: true,
          template: this.selectTemplateForArtifact(artifactGeneration.suggestedType, discussion),
          language: this.inferLanguageFromDiscussion(messages),
          framework: this.inferFrameworkFromDiscussion(messages)
        }
      };

      // Generate the artifact
      const result = await this.artifactService.generateArtifact(artifactRequest);
      
      if (result.success) {
        logger.info('Artifact generated successfully from discussion completion', {
          discussionId,
          artifactType: artifactGeneration.suggestedType,
          artifactId: result.artifact?.id,
          isValid: result.artifact?.validation?.isValid,
          validationScore: result.artifact?.validation?.score
        });

        // Emit artifact generation success event
        await this.eventBusService.publish('artifact.generated', {
          discussionId,
          artifactId: result.artifact?.id,
          artifactType: artifactGeneration.suggestedType,
          generationTrigger: 'discussion_completion',
          success: true,
          artifact: result.artifact,
          timestamp: new Date()
        });
      } else {
        logger.error('Failed to generate artifact from discussion completion', {
          discussionId,
          artifactType: artifactGeneration.suggestedType,
          error: result.error?.message,
          errorCode: result.error?.code
        });

        // Emit artifact generation failure event
        await this.eventBusService.publish('artifact.generation.failed', {
          discussionId,
          artifactType: artifactGeneration.suggestedType,
          generationTrigger: 'discussion_completion',
          success: false,
          error: result.error,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('Error handling discussion completion event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventMessage: eventMessage.data
      });
    }
  }

  private selectTemplateForArtifact(artifactType: string, discussion: any): string | undefined {
    // Select appropriate template based on artifact type and discussion context
    switch (artifactType) {
      case 'code':
        return discussion.topic?.includes('API') ? 'api-implementation' : 'generic-code';
      case 'test':
        return 'unit-test';
      case 'documentation':
        return discussion.topic?.includes('API') ? 'api-documentation' : 'generic-documentation';
      case 'prd':
        return 'product-requirements';
      default:
        return undefined;
    }
  }

  private inferLanguageFromDiscussion(messages: any[]): string | undefined {
    // Analyze messages to infer programming language
    const messageContent = messages.map(m => m.content.toLowerCase()).join(' ');
    
    if (messageContent.includes('typescript') || messageContent.includes('tsx')) {
      return 'typescript';
    } else if (messageContent.includes('javascript') || messageContent.includes('js')) {
      return 'javascript';
    } else if (messageContent.includes('python') || messageContent.includes('py')) {
      return 'python';
    } else if (messageContent.includes('java') && !messageContent.includes('javascript')) {
      return 'java';
    } else if (messageContent.includes('rust') || messageContent.includes('rs')) {
      return 'rust';
    } else if (messageContent.includes('go') || messageContent.includes('golang')) {
      return 'go';
    }
    
    return undefined;
  }

  private inferFrameworkFromDiscussion(messages: any[]): string | undefined {
    // Analyze messages to infer framework
    const messageContent = messages.map(m => m.content.toLowerCase()).join(' ');
    
    if (messageContent.includes('react') || messageContent.includes('jsx')) {
      return 'react';
    } else if (messageContent.includes('vue') || messageContent.includes('nuxt')) {
      return 'vue';
    } else if (messageContent.includes('angular')) {
      return 'angular';
    } else if (messageContent.includes('express') || messageContent.includes('node')) {
      return 'express';
    } else if (messageContent.includes('django') || messageContent.includes('flask')) {
      return 'python-web';
    } else if (messageContent.includes('spring') || messageContent.includes('springboot')) {
      return 'spring';
    }
    
    return undefined;
  }


  protected async setupRoutes(): Promise<void> {
    // API routes with auth middleware
    this.app.use('/api/v1/artifacts', authMiddleware, artifactRoutes(this.artifactService));
    
    // Service-specific status endpoint
    this.app.get('/status', (req, res) => {
      const factoryStatus = this.artifactFactory.getSystemStatus();
      const serviceHealth = this.artifactService.getServiceHealth();
      res.json({
        service: this.config.name,
        version: this.config.version,
        factory: factoryStatus,
        serviceHealth: serviceHealth
      });
    });
  }

  protected async checkServiceHealth(): Promise<boolean> {
    try {
      const serviceHealth = this.artifactService.getServiceHealth();
      return serviceHealth.status === 'healthy';
    } catch (error) {
      logger.error('Service health check failed:', error);
      return false;
    }
  }

  // Expose services for external access
  public getArtifactFactory(): ArtifactFactory {
    return this.artifactFactory;
  }

  public getArtifactService(): ArtifactService {
    return this.artifactService;
  }
}

// Create and start service
const service = new ArtifactServiceApp();

// Start the service
service.start().catch(error => {
  logger.error('Failed to start Artifact Service:', error);
  process.exit(1);
});

export { service };
