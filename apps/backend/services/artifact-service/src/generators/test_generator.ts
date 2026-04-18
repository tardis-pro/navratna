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
      }

      const llmResponse = await LLMService.getInstance().generateArtifact(llmRequest)
      if (llmResponse.content && !llmResponse.error) {
        return llmResponse.content
      }

      logger.warn('LLM test generation returned empty content, falling back to template', {
        conversationId: context.conversationId,
      })
    } catch (llmError) {
      logger.warn('LLM test generation failed, falling back to template', {
        conversationId: context.conversationId,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      })
    }

    try {
      const functionName = this.extractFunctionName(context.messages) || 'testFunction';
      return this.generateTestCode(functionName, testRequirements, language, framework);
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

  private extractFunctionName(messages: Array<{ content: string }>): string | null {
    for (const message of messages) {
      const functionMatch = message.content.match(/test\s+(\w+)|(\w+)\s*test|testing\s+(\w+)/i);
      if (functionMatch) {
        return functionMatch[1] || functionMatch[2] || functionMatch[3];
      }
    }
    return null;
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

  private generateTestCode(
    functionName: string,
    requirements: string[],
    language: string,
    framework: string
  ): string {
    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        return this.generateJavaScriptTests(functionName, requirements, framework);
      case 'python':
        return this.generatePythonTests(functionName, requirements);
      case 'java':
        return this.generateJavaTests(functionName, requirements);
      default:
        return this.generateGenericTests(functionName, requirements, language);
    }
  }

  private generateJavaScriptTests(
    functionName: string,
    requirements: string[],
    framework: string
  ): string {
    const requirementsComment =
      requirements.length > 0 ? `// Test requirements:\n// ${requirements.join('\n// ')}\n\n` : '';

    if (framework === 'jest') {
      return `${requirementsComment}import { ${functionName} } from './${functionName}.js';

describe('${functionName}', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  it('should be defined', () => {
    expect(${functionName}).toBeDefined();
  });

  ${requirements
    .map(
      (req, _index) => `
  it('${req}', () => {
    // TODO: Implement test case
    // Arrange
    const input = {};
    const expected = {};

    // Act
    const result = ${functionName}(input);

    // Assert
    expect(result).toEqual(expected);
  });`
    )
    .join('\n')}

  it('should handle edge cases', () => {
    // TODO: Test edge cases
    expect(() => ${functionName}(null)).not.toThrow();
  });

  it('should handle errors gracefully', () => {
    // TODO: Test error handling
    expect(() => ${functionName}(undefined)).not.toThrow();
  });
});`;
    }

    return `${requirementsComment}// Generic test structure
describe('${functionName}', function() {
  it('should work correctly', function() {
    // TODO: Implement test
  });
});`;
  }

  private generatePythonTests(functionName: string, requirements: string[]): string {
    const requirementsComment =
      requirements.length > 0 ? `# Test requirements:\n# ${requirements.join('\n# ')}\n\n` : '';

    return `${requirementsComment}import pytest
from ${functionName} import ${functionName}

class Test${this.capitalizeFirst(functionName)}:
    def setup_method(self):
        """Setup before each test method"""
        pass

    def teardown_method(self):
        """Cleanup after each test method"""
        pass

    def test_${functionName}_is_defined(self):
        """Test that function is defined"""
        assert ${functionName} is not None

    ${requirements
      .map(
        (req, index) => `
    def test_${functionName}_requirement_${index + 1}(self):
        """${req}"""
        # TODO: Implement test case
        # Arrange
        input_data = {}
        expected = {}

        # Act
        result = ${functionName}(input_data)

        # Assert
        assert result == expected`
      )
      .join('\n')}

    def test_${functionName}_edge_cases(self):
        """Test edge cases"""
        # TODO: Test edge cases
        assert ${functionName}(None) is not None

    def test_${functionName}_error_handling(self):
        """Test error handling"""
        # TODO: Test error handling
        with pytest.raises(ValueError):
            ${functionName}(invalid_input)`;
  }

  private generateJavaTests(functionName: string, requirements: string[]): string {
    const className = this.capitalizeFirst(functionName) + 'Test';
    const serviceClass = this.capitalizeFirst(functionName) + 'Service';

    const requirementsComment =
      requirements.length > 0
        ? `    // Test requirements:\n    // ${requirements.join('\n    // ')}\n\n`
        : '';

    return `${requirementsComment}import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.*;

public class ${className} {
    private ${serviceClass} service;

    @BeforeEach
    void setUp() {
        service = new ${serviceClass}();
    }

    @AfterEach
    void tearDown() {
        service = null;
    }

    @Test
    void ${functionName}_shouldBeDefined() {
        assertNotNull(service);
    }

    ${requirements
      .map(
        (req, index) => `
    @Test
    void ${functionName}_requirement${index + 1}() {
        // ${req}
        // TODO: Implement test case
        // Arrange
        Object input = new Object();
        Object expected = new Object();

        // Act
        Object result = service.${functionName}(input);

        // Assert
        assertEquals(expected, result);
    }`
      )
      .join('\n')}

    @Test
    void ${functionName}_shouldHandleEdgeCases() {
        // TODO: Test edge cases
        assertDoesNotThrow(() -> service.${functionName}(null));
    }

    @Test
    void ${functionName}_shouldHandleErrors() {
        // TODO: Test error handling
        assertThrows(IllegalArgumentException.class, () -> {
            service.${functionName}(invalidInput);
        });
    }
}`;
  }

  private generateGenericTests(
    functionName: string,
    requirements: string[],
    language: string
  ): string {
    const requirementsComment =
      requirements.length > 0 ? `// Test requirements:\n// ${requirements.join('\n// ')}\n\n` : '';

    return `${requirementsComment}// ${language} test structure
// TODO: Implement tests for ${functionName}

test('${functionName} should work correctly', () => {
    // Arrange
    const input = {};
    const expected = {};

    // Act
    const result = ${functionName}(input);

    // Assert
    assert(result === expected);
});

${requirements
  .map(
    (req, index) => `
test('${req}', () => {
    // TODO: Implement test case for requirement ${index + 1}
});`
  )
  .join('\n')}`;
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
      if (response.content && !response.error) {
        return response.content;
      }
    } catch (llmError) {
      logger.warn('LLM generateUnitTest failed, using template fallback', {
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
    }

    return this.generateJavaScriptTests(functionName, [], framework);
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
      if (response.content && !response.error) {
        return response.content;
      }
    } catch (llmError) {
      logger.warn('LLM generateMock failed, using template fallback', {
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
    }

    return this.buildMockTemplate(serviceInterface);
  }

  private buildMockTemplate(serviceInterface: string): string {
    const methodMatches = serviceInterface.matchAll(/(\w+)\s*\(/g);
    const methods = Array.from(methodMatches, (m) => m[1]).filter(
      (m) => m !== 'constructor' && m !== 'class' && m !== 'interface'
    );

    if (methods.length === 0) {
      return `vi.mock('./service', () => ({\n  default: { mock: vi.fn() }\n}));`;
    }

    const stubs = methods.map((m) => `    ${m}: vi.fn()`).join(',\n');
    return `vi.mock('./service', () => ({\n  default: {\n${stubs}\n  }\n}));`;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
