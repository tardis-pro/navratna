import { ArtifactConversationContext } from '@uaip/types';
import type { ArtifactRequest } from '@uaip/types';
import { LLMService } from '@uaip/llm-service';

import { ArtifactGenerator } from '../interfaces';
import { logger, InternalServerError } from '@uaip/utils';

export class DocumentationGenerator implements ArtifactGenerator {
  private readonly supportedType = 'documentation';

  /**
   * Check if this generator can handle the given context
   */
  canHandle(context: ArtifactConversationContext): boolean {
    const messages = context.messages;
    const recentMessages = messages.slice(-5);

    // Look for documentation-related keywords
    const docKeywords = ['documentation', 'docs', 'readme', 'guide', 'manual', 'api docs', 'help'];

    const hasDocContext = recentMessages.some((message) =>
      docKeywords.some((keyword) => message.content.toLowerCase().includes(keyword))
    );

    // Check for explicit documentation requests
    const docRequestPatterns = [
      /create.*documentation/i,
      /write.*docs/i,
      /document.*this/i,
      /readme/i,
      /api.*documentation/i,
    ];

    const hasDocRequest = recentMessages.some((message) =>
      docRequestPatterns.some((pattern) => pattern.test(message.content))
    );

    return hasDocContext || hasDocRequest;
  }

  /**
   * Generate documentation artifact from conversation context
   */
  async generate(context: ArtifactConversationContext): Promise<string> {
    logger.info('Generating documentation artifact', {
      conversationId: context.conversationId,
      messageCount: context.messages.length,
    });

    const docType = this.detectDocumentationType(context.messages);

    try {
      const llmRequest: ArtifactRequest = {
        type: 'documentation',
        context: context.messages.slice(-10).map((m) => m.content).join('\n'),
        requirements: [],
        constraints: [`doc-type: ${docType}`],
      };

      const llmResponse = await LLMService.getInstance().generateArtifact(llmRequest);
      if (llmResponse.error) {
        throw new InternalServerError(`LLM documentation generation failed: ${llmResponse.error}`);
      }

      const content = llmResponse.content.trim();
      if (!content) {
        throw new InternalServerError('LLM documentation generation returned empty content');
      }

      return content;
    } catch (error) {
      logger.error('Documentation generation failed:', error);
      throw new InternalServerError(
        `Documentation generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    return ['documentation'];
  }

  // Private helper methods

  private detectDocumentationType(messages: Array<{ content: string }>): string {
    for (const message of messages) {
      const content = message.content.toLowerCase();

      if (content.includes('readme') || content.includes('getting started')) {
        return 'readme';
      }
      if (content.includes('api') || content.includes('endpoint')) {
        return 'api';
      }
      if (content.includes('user guide') || content.includes('manual')) {
        return 'user-guide';
      }
    }

    return 'generic';
  }

}
