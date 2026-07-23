import { ArtifactConversationContext } from '@uaip/types';
import type { ArtifactRequest } from '@uaip/types';
import { LLMService } from '@uaip/llm-service';

import { ArtifactGenerator } from '../interfaces';
import { logger, InternalServerError } from '@uaip/utils';

export class PRDGenerator implements ArtifactGenerator {
  private readonly supportedType = 'prd';

  /**
   * Check if this generator can handle the given context
   */
  canHandle(context: ArtifactConversationContext): boolean {
    const messages = context.messages;
    const recentMessages = messages.slice(-5);

    // Look for PRD-related keywords
    const prdKeywords = [
      'requirements',
      'specification',
      'prd',
      'product requirements',
      'document',
      'spec',
    ];

    const hasPRDContext = recentMessages.some((message) =>
      prdKeywords.some((keyword) => message.content.toLowerCase().includes(keyword))
    );

    // Check for explicit PRD requests
    const prdRequestPatterns = [
      /create.*prd/i,
      /write.*requirements/i,
      /document.*requirements/i,
      /specification/i,
      /requirements.*document/i,
    ];

    const hasPRDRequest = recentMessages.some((message) =>
      prdRequestPatterns.some((pattern) => pattern.test(message.content))
    );

    return hasPRDContext || hasPRDRequest;
  }

  /**
   * Generate PRD artifact from conversation context
   */
  async generate(context: ArtifactConversationContext): Promise<string> {
    logger.info('Generating PRD artifact', {
      conversationId: context.conversationId,
      messageCount: context.messages.length,
    });

    const requirements = this.extractRequirements(context.messages);

    try {
      const llmRequest: ArtifactRequest = {
        type: 'prd',
        context: context.messages.slice(-10).map((m) => m.content).join('\n'),
        requirements,
        constraints: context.decisions?.map((d) => String(d)) ?? [],
      };

      const llmResponse = await LLMService.getInstance().generateArtifact(llmRequest);
      if (llmResponse.error) {
        throw new InternalServerError(`LLM PRD generation failed: ${llmResponse.error}`);
      }

      const content = llmResponse.content.trim();
      if (!content) {
        throw new InternalServerError('LLM PRD generation returned empty content');
      }

      return content;
    } catch (error) {
      logger.error('PRD generation failed:', error);
      throw new InternalServerError(
        `PRD generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  /**
   * Get supported artifact type
   */
  getSupportedType(): string {
    return this.supportedType;
  }

  /**
   * Get supported artifact types
   */
  getSupportedTypes(): string[] {
    return ['prd'];
  }

  // Private helper methods

  private extractRequirements(messages: Array<{ content: string }>): string[] {
    const requirements: string[] = [];

    for (const message of messages) {
      const content = message.content.toLowerCase();

      // Look for requirement patterns
      if (content.includes('must') || content.includes('should') || content.includes('need')) {
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (/must|should|need|require|shall/i.test(sentence)) {
            requirements.push(sentence.trim());
          }
        }
      }
    }

    return requirements.slice(0, 10);
  }

}
