import { ArtifactConversationContext } from '@uaip/types';
import type { ArtifactRequest } from '@uaip/types';
import { LLMService } from '@uaip/llm-service';

import { logger, InternalServerError } from '@uaip/utils';
import { ArtifactGenerator } from '../interfaces';

export class CodeGenerator implements ArtifactGenerator {
  private readonly supportedType = 'code';

  /**
   * Check if this generator can handle the given context
   */
  canHandle(context: ArtifactConversationContext): boolean {
    const messages = context.messages;
    const recentMessages = messages.slice(-5); // Check last 5 messages

    // Look for code-related keywords
    const codeKeywords = [
      'function',
      'class',
      'method',
      'variable',
      'implement',
      'refactor',
      'bug',
      'fix',
      'optimize',
      'code',
      'algorithm',
      'logic',
    ];

    const hasCodeContext = recentMessages.some((message) =>
      codeKeywords.some((keyword) => message.content.toLowerCase().includes(keyword))
    );

    // Check for explicit code requests
    const codeRequestPatterns = [
      /can you (generate|create|write|implement|refactor)/i,
      /write.*code/i,
      /implement.*function/i,
      /create.*class/i,
      /fix.*bug/i,
    ];

    const hasCodeRequest = recentMessages.some((message) =>
      codeRequestPatterns.some((pattern) => pattern.test(message.content))
    );

    return hasCodeContext || hasCodeRequest;
  }

  /**
   * Generate code artifact from conversation context
   */
  async generate(context: ArtifactConversationContext): Promise<string> {
    logger.info('Generating code artifact', {
      conversationId: context.conversationId,
      messageCount: context.messages.length,
    });

    const requirements = this.extractRequirements(context.messages);
    const language = this.detectLanguage(context.messages) || 'typescript';

    try {
      const llmRequest: ArtifactRequest = {
        type: 'code',
        language,
        context: context.messages.slice(-10).map((m) => m.content).join('\n'),
        requirements,
        constraints: context.decisions?.map((d) => String(d)) ?? [],
      };

      const llmResponse = await LLMService.getInstance().generateArtifact(llmRequest);
      if (llmResponse.error) {
        throw new InternalServerError(`LLM code generation failed: ${llmResponse.error}`);
      }

      const content = llmResponse.content.trim();
      if (!content) {
        throw new InternalServerError('LLM code generation returned empty content');
      }

      return content;
    } catch (error) {
      logger.error('Code generation failed:', error);
      throw new InternalServerError(
        `Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    return ['code'];
  }

  // Private helper methods

  private extractRequirements(messages: Array<{ content: string }>): string[] {
    const requirements: string[] = [];

    for (const message of messages) {
      const content = message.content.toLowerCase();

      // Look for requirement patterns
      if (content.includes('should') || content.includes('need') || content.includes('must')) {
        // Extract the requirement sentence
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (/should|need|must|require/i.test(sentence)) {
            requirements.push(sentence.trim());
          }
        }
      }
    }

    return requirements.slice(0, 5); // Limit to top 5 requirements
  }

  private detectLanguage(messages: Array<{ content: string }>): string | undefined {
    const languageKeywords = {
      typescript: ['typescript', 'ts', 'interface', 'type'],
      javascript: ['javascript', 'js', 'node', 'npm'],
      python: ['python', 'py', 'def ', 'import ', 'pip'],
      java: ['java', 'class ', 'public class', 'spring'],
      rust: ['rust', 'fn ', 'cargo', 'struct'],
      go: ['golang', 'go', 'func ', 'package'],
    };

    for (const message of messages) {
      const content = message.content.toLowerCase();

      for (const [language, keywords] of Object.entries(languageKeywords)) {
        if (keywords.some((keyword) => content.includes(keyword))) {
          return language;
        }
      }
    }

    return undefined;
  }

  async generateFunction(
    signature: string,
    description: string,
    language: string
  ): Promise<string> {
    const request: ArtifactRequest = {
      type: 'code',
      language,
      context: `Function signature: ${signature}\nDescription: ${description}`,
      requirements: [description],
      constraints: [`signature: ${signature}`],
    };

    try {
      const response = await LLMService.getInstance().generateArtifact(request);
      const content = response.content.trim();
      if (!response.error && content) {
        return content;
      }
      throw new InternalServerError(response.error ?? 'LLM function generation returned empty content');
    } catch (llmError) {
      logger.error('LLM generateFunction failed', {
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
      throw new InternalServerError(
        `Function generation failed: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`,
        { cause: llmError }
      );
    }
  }

  async generateClass(
    className: string,
    methods: string[],
    description: string
  ): Promise<string> {
    const methodList = methods.join(', ');
    const request: ArtifactRequest = {
      type: 'code',
      language: 'typescript',
      context: `Class name: ${className}\nDescription: ${description}\nMethods: ${methodList}`,
      requirements: [description, `Implement methods: ${methodList}`],
    };

    try {
      const response = await LLMService.getInstance().generateArtifact(request);
      const content = response.content.trim();
      if (!response.error && content) {
        return content;
      }
      throw new InternalServerError(response.error ?? 'LLM class generation returned empty content');
    } catch (llmError) {
      logger.error('LLM generateClass failed', {
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
      throw new InternalServerError(
        `Class generation failed: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`,
        { cause: llmError }
      );
    }
  }

}
