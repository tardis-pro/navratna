// Code Generator - Generates code diffs and suggestions
// Epic 4 Implementation

import {
  Artifact,
  ArtifactConversationContext,
  ValidationResult,
  ValidationStatus,
  ArtifactMetadata,
  TraceabilityInfo,
} from '@uaip/types';

import { TemplateManager } from '../templates/TemplateManager.js';
import { logger } from '@uaip/utils';
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

    try {
      // Extract requirements from conversation
      const requirements = this.extractRequirements(context.messages);
      const functionName = this.extractFunctionName(context.messages) || 'generatedFunction';

      // Detect language from context
      const language = this.detectLanguage(context.messages) || 'typescript';

      // Generate code based on language
      let generatedCode: string;

      switch (language.toLowerCase()) {
        case 'typescript':
        case 'javascript':
          generatedCode = this.generateTypeScriptCode(functionName, requirements);
          break;
        case 'python':
          generatedCode = this.generatePythonCode(functionName, requirements);
          break;
        case 'java':
          generatedCode = this.generateJavaCode(functionName, requirements);
          break;
        default:
          generatedCode = this.generateGenericCode(functionName, requirements, language);
      }

      return generatedCode;
    } catch (error) {
      logger.error('Code generation failed:', error);
      throw new Error(
        `Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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

  private extractRequirements(messages: any[]): string[] {
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

  private extractFunctionName(messages: any[]): string | null {
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

  private detectLanguage(messages: any[]): string | undefined {
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
  throw new Error('Function not yet implemented');
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
    throw new Error("Function not yet implemented");
}

// Example usage:
// ${functionName}();`;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
