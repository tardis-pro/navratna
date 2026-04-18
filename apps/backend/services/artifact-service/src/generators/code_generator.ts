import { ArtifactConversationContext } from '@uaip/types';
import type { ArtifactRequest } from '@uaip/types';
import { LLMService } from '@uaip/llm-service';

import { TemplateManager } from '../templates/template_manager.js';
import { logger, InternalServerError } from '@uaip/utils';
import { ArtifactGenerator } from '../interfaces';

export class CodeGenerator implements ArtifactGenerator {
  private readonly supportedType = 'code';
  private templateManager: TemplateManager;

  constructor() {
    this.templateManager = new TemplateManager();
  }

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
      }

      const llmResponse = await LLMService.getInstance().generateArtifact(llmRequest)
      if (llmResponse.content && !llmResponse.error) {
        return llmResponse.content
      }

      logger.warn('LLM code generation returned empty content, falling back to template', {
        conversationId: context.conversationId,
        model: llmResponse.model,
      })
    } catch (llmError) {
      logger.warn('LLM code generation failed, falling back to template', {
        conversationId: context.conversationId,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      })
    }

    try {
      const functionName = this.extractFunctionName(context.messages) || 'generatedFunction';

      switch (language.toLowerCase()) {
        case 'typescript':
        case 'javascript':
          return this.generateTypeScriptCode(functionName, requirements);
        case 'python':
          return this.generatePythonCode(functionName, requirements);
        case 'java':
          return this.generateJavaCode(functionName, requirements);
        default:
          return this.generateGenericCode(functionName, requirements, language);
      }
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

  private extractFunctionName(messages: Array<{ content: string }>): string | null {
    for (const message of messages) {
      // Look for function name patterns
      const functionMatch = message.content.match(
        /function\s+(\w+)|(\w+)\s*function|create\s+(\w+)|implement\s+(\w+)/i
      );
      if (functionMatch) {
        return functionMatch[1] || functionMatch[2] || functionMatch[3] || functionMatch[4];
      }
    }
    return null;
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

  private generateTypeScriptCode(functionName: string, requirements: string[]): string {
    const requirementsComment =
      requirements.length > 0 ? `/**\n * ${requirements.join('\n * ')}\n */\n` : '';

    return `${requirementsComment}export function ${functionName}(): void {
  // TODO: Implement function based on requirements
  console.log('${functionName} called');
  
  // Add your implementation here
  throw new InternalServerError('Function not yet implemented');
}

// Example usage:
// ${functionName}();`;
  }

  private generatePythonCode(functionName: string, requirements: string[]): string {
    const requirementsComment =
      requirements.length > 0 ? `"""\n${requirements.join('\n')}\n"""\n` : '';

    return `def ${functionName}():
    ${requirementsComment}
    """
    TODO: Implement function based on requirements
    """
    print(f"${functionName} called")
    
    # Add your implementation here
    raise NotImplementedError("Function not yet implemented")

# Example usage:
# ${functionName}()`;
  }

  private generateJavaCode(functionName: string, requirements: string[]): string {
    const requirementsComment =
      requirements.length > 0 ? `    /**\n     * ${requirements.join('\n     * ')}\n     */\n` : '';

    const className = this.capitalizeFirst(functionName) + 'Service';

    return `public class ${className} {
${requirementsComment}    public void ${functionName}() {
        // TODO: Implement method based on requirements
        System.out.println("${functionName} called");
        
        // Add your implementation here
        throw new UnsupportedOperationException("Method not yet implemented");
    }
    
    // Example usage:
    // ${className} service = new ${className}();
    // service.${functionName}();
}`;
  }

  private generateGenericCode(
    functionName: string,
    requirements: string[],
    language: string
  ): string {
    const requirementsComment =
      requirements.length > 0 ? `// Requirements:\n// ${requirements.join('\n// ')}\n\n` : '';

    return `${requirementsComment}// ${language} implementation
function ${functionName}() {
    // TODO: Implement function based on requirements
    console.log("${functionName} called");
    
    // Add your implementation here
    throw new InternalServerError("Function not yet implemented");
}

// Example usage:
// ${functionName}();`;
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
      if (response.content && !response.error) {
        return response.content;
      }
    } catch (llmError) {
      logger.warn('LLM generateFunction failed, using template fallback', {
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
    }

    const lang = language.toLowerCase();
    if (lang === 'python') {
      return `def ${this.extractFunctionNameFromSignature(signature)}():\n    """${description}"""\n    raise NotImplementedError`;
    }
    return `export function ${this.extractFunctionNameFromSignature(signature)}() {\n  // ${description}\n  throw new Error('Not implemented');\n}`;
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
      if (response.content && !response.error) {
        return response.content;
      }
    } catch (llmError) {
      logger.warn('LLM generateClass failed, using template fallback', {
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
    }

    const methodStubs = methods
      .map((m) => `  ${m}() {\n    throw new Error('Not implemented');\n  }`)
      .join('\n\n');

    return `export class ${className} {\n${methodStubs}\n}`;
  }

  private extractFunctionNameFromSignature(signature: string): string {
    const match = signature.match(/(?:function\s+)?(\w+)\s*\(/);
    return match?.[1] ?? 'generatedFunction';
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
