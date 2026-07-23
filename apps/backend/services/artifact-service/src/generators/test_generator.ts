import { ArtifactConversationContext } from '@uaip/types';
import type { ArtifactRequest } from '@uaip/types';
import { LLMService } from '@uaip/llm-service';

import { ArtifactGenerator } from '../interfaces';
import { logger, InternalServerError } from '@uaip/utils';

export class TestGenerator implements ArtifactGenerator {
  private readonly supportedType = 'test';

  /**
   * Check if this generator can handle the given context
   */
  canHandle(context: ArtifactConversationContext): boolean {
    const messages = context.messages;
    const recentMessages = messages.slice(-5);

    // Look for test-related keywords
    const testKeywords = [
      'test',
      'testing',
      'unit test',
      'integration test',
      'spec',
      'jest',
      'mocha',
      'pytest',
    ];

    const hasTestContext = recentMessages.some((message) =>
      testKeywords.some((keyword) => message.content.toLowerCase().includes(keyword))
    );

    // Check for explicit test requests
    const testRequestPatterns = [
      /write.*test/i,
      /create.*test/i,
      /test.*code/i,
      /unit.*test/i,
      /integration.*test/i,
    ];

    const hasTestRequest = recentMessages.some((message) =>
      testRequestPatterns.some((pattern) => pattern.test(message.content))
    );

    return hasTestContext || hasTestRequest;
  }

  /**
   * Generate test artifact from conversation context
   */
  async generate(context: ArtifactConversationContext): Promise<string> {
    logger.info('Generating test artifact', {
      conversationId: context.conversationId,
      messageCount: context.messages.length,
    });

    const testRequirements = this.extractTestRequirements(context.messages);
    const language = this.detectLanguage(context.messages) || 'typescript';
    const framework = this.detectTestFramework(context.messages) || 'jest';

    try {
      const llmRequest: ArtifactRequest = {
        type: 'test',
        language,
        context: context.messages.slice(-10).map((m) => m.content).join('\n'),
        requirements: testRequirements,
        constraints: [`framework: ${framework}`],
      };

      const llmResponse = await LLMService.getInstance().generateArtifact(llmRequest);
      if (llmResponse.error) {
        throw new InternalServerError(`LLM test generation failed: ${llmResponse.error}`);
      }

      const content = llmResponse.content.trim();
      if (!content) {
        throw new InternalServerError('LLM test generation returned empty content');
      }

      return content;
    } catch (error) {
      logger.error('Test generation failed:', error);
      throw new InternalServerError(
        `Test generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    return ['test'];
  }

  // Private helper methods

  private extractTestRequirements(messages: Array<{ content: string }>): string[] {
    const requirements: string[] = [];

    for (const message of messages) {
      const content = message.content.toLowerCase();

      // Look for test requirement patterns
      if (content.includes('should') || content.includes('expect') || content.includes('test')) {
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (/should|expect|test|verify|check/i.test(sentence)) {
            requirements.push(sentence.trim());
          }
        }
      }
    }

    return requirements.slice(0, 5);
  }

  private detectLanguage(messages: Array<{ content: string }>): string | undefined {
    const languageKeywords = {
      typescript: ['typescript', 'ts', 'jest', 'vitest'],
      javascript: ['javascript', 'js', 'mocha', 'chai'],
      python: ['python', 'py', 'pytest', 'unittest'],
      java: ['java', 'junit', 'testng'],
      rust: ['rust', 'cargo test'],
      go: ['golang', 'go test'],
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

  private detectTestFramework(messages: Array<{ content: string }>): string {
    const frameworks = {
      jest: ['jest', 'describe', 'it(', 'expect('],
      mocha: ['mocha', 'chai', 'assert'],
      pytest: ['pytest', 'def test_'],
      junit: ['junit', '@test', 'assertthat'],
    };

    for (const message of messages) {
      const content = message.content.toLowerCase();

      for (const [framework, keywords] of Object.entries(frameworks)) {
        if (keywords.some((keyword) => content.includes(keyword))) {
          return framework;
        }
      }
    }

    return 'jest'; // Default
  }

  async generateUnitTest(
    functionName: string,
    functionBody: string,
    framework: string
  ): Promise<string> {
    const request: ArtifactRequest = {
      type: 'test',
      language: 'typescript',
      context: `Function name: ${functionName}\nFunction body:\n${functionBody}`,
      requirements: [`Write unit tests for ${functionName}`],
      constraints: [`framework: ${framework}`],
    };

    try {
      const response = await LLMService.getInstance().generateArtifact(request);
      const content = response.content.trim();
      if (!response.error && content) {
        return content;
      }
      throw new InternalServerError(response.error ?? 'LLM unit test generation returned empty content');
    } catch (llmError) {
      logger.error('LLM generateUnitTest failed', {
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
      throw new InternalServerError(
        `Unit test generation failed: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`,
        { cause: llmError }
      );
    }
  }

  async generateMock(serviceInterface: string): Promise<string> {
    const request: ArtifactRequest = {
      type: 'test',
      language: 'typescript',
      context: `Service interface:\n${serviceInterface}`,
      requirements: ['Generate a vi.mock() factory for the service interface'],
      constraints: ['framework: vitest', 'use vi.fn() for all methods'],
    };

    try {
      const response = await LLMService.getInstance().generateArtifact(request);
      const content = response.content.trim();
      if (!response.error && content) {
        return content;
      }
      throw new InternalServerError(response.error ?? 'LLM mock generation returned empty content');
    } catch (llmError) {
      logger.error('LLM generateMock failed', {
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
      throw new InternalServerError(
        `Mock generation failed: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`,
        { cause: llmError }
      );
    }
  }
}
