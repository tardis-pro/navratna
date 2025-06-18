// Code Generator - Generates code diffs and suggestions
// Epic 4 Implementation

import { 
  Artifact, 
  ConversationContext, 
  ValidationResult,
  ValidationStatus,
  ArtifactMetadata,
  TraceabilityInfo
} from '@/types/artifact';

import { ArtifactGenerator } from '../interfaces';
import { LLMService } from '@/services/llm';
import { v4 as uuidv4 } from 'uuid';

export class CodeGenerator implements ArtifactGenerator {
  private readonly supportedType = 'code-diff';
  
  /**
   * Check if this generator can handle the given context
   */
  canHandle(context: ConversationContext): boolean {
    const messages = context.messages;
    const recentMessages = messages.slice(-5); // Check last 5 messages

    // Look for code-related keywords
    const codeKeywords = [
      'function', 'class', 'method', 'variable', 'implement', 'refactor',
      'bug', 'fix', 'optimize', 'code', 'algorithm', 'logic'
    ];

    const hasCodeContext = recentMessages.some(message => 
      codeKeywords.some(keyword => 
        message.content.toLowerCase().includes(keyword)
      )
    );

    // Check for explicit code requests
    const codeRequestPatterns = [
      /can you (generate|create|write|implement|refactor)/i,
      /write.*code/i,
      /implement.*function/i,
      /create.*class/i,
      /fix.*bug/i
    ];

    const hasCodeRequest = recentMessages.some(message =>
      codeRequestPatterns.some(pattern => pattern.test(message.content))
    );

    // Check if context includes code files or technical discussion
    const hasCodeFiles = context.codeContext !== undefined;

    return hasCodeContext || hasCodeRequest || hasCodeFiles;
  }

  /**
   * Generate code artifact from conversation context
   */
  async generate(context: ConversationContext): Promise<Artifact> {
    const analysisResult = this.analyzeCodeRequirements(context);
    
    const codeContent = await this.generateCodeContent(context, analysisResult);
    
    const metadata: ArtifactMetadata = {
      id: uuidv4(),
      title: analysisResult.title,
      description: analysisResult.description,
      language: analysisResult.language,
      framework: analysisResult.framework,
      targetFile: analysisResult.targetFile,
      estimatedEffort: analysisResult.estimatedEffort,
      tags: ['code', 'generated', analysisResult.language || 'unknown'].filter(Boolean)
    };

    // Create placeholder traceability (will be filled by factory)
    const traceability: TraceabilityInfo = {
      conversationId: context.conversationId,
      generatedBy: 'system',
      generatedAt: new Date().toISOString(),
      generator: this.supportedType,
      confidence: this.getConfidence(context),
      sourceMessages: context.messages.slice(-3).map(m => m.id)
    };

    return {
      type: 'code-diff',
      content: codeContent,
      metadata,
      traceability
    };
  }

  /**
   * Validate generated code artifact
   */
  validate(artifact: Artifact): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: string[] = [];

    // Basic content validation
    if (!artifact.content || artifact.content.trim().length === 0) {
      errors.push({
        code: 'EMPTY_CONTENT',
        message: 'Code artifact cannot be empty',
        severity: 'error' as const
      });
    }

    // Language-specific validation
    if (artifact.metadata.language) {
      const languageValidation = this.validateLanguageSyntax(
        artifact.content, 
        artifact.metadata.language
      );
      errors.push(...languageValidation.errors);
      warnings.push(...languageValidation.warnings);
    }

    // Security validation
    const securityIssues = this.detectSecurityIssues(artifact.content);
    if (securityIssues.length > 0) {
      warnings.push(...securityIssues.map(issue => ({
        code: 'SECURITY_WARNING',
        message: issue,
        severity: 'warning' as const
      })));
    }

    // Quality suggestions
    suggestions.push(...this.generateQualitySuggestions(artifact.content));

    const isValid = errors.length === 0;
    const score = this.calculateQualityScore(artifact.content, errors, warnings);

    return {
      status: isValid ? 'valid' : 'invalid' as ValidationStatus,
      isValid,
      errors,
      warnings,
      suggestions,
      score
    };
  }

  /**
   * Get confidence score for handling this context
   */
  getConfidence(context: ConversationContext): number {
    let confidence = 0.5; // Base confidence

    const recentMessages = context.messages.slice(-5);
    
    // Boost confidence for explicit code requests
    const explicitCodeRequest = recentMessages.some(msg =>
      /can you (generate|create|write|implement)/i.test(msg.content)
    );
    if (explicitCodeRequest) confidence += 0.3;

    // Boost confidence for technical context
    if (context.codeContext) confidence += 0.2;
    
    // Boost confidence for specific code mentions
    const hasSpecificCodeMentions = recentMessages.some(msg =>
      /function|class|method|variable/i.test(msg.content)
    );
    if (hasSpecificCodeMentions) confidence += 0.1;

    // Boost confidence for programming language mentions
    const programmingLanguages = ['javascript', 'typescript', 'python', 'java', 'c++', 'rust', 'go'];
    const hasLanguageMention = recentMessages.some(msg =>
      programmingLanguages.some(lang => msg.content.toLowerCase().includes(lang))
    );
    if (hasLanguageMention) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * Get supported artifact type
   */
  getSupportedType(): string {
    return this.supportedType;
  }

  // Private helper methods

  private analyzeCodeRequirements(context: ConversationContext): {
    title: string;
    description: string;
    language?: string;
    framework?: string;
    targetFile?: string;
    estimatedEffort: 'low' | 'medium' | 'high';
    codeType: 'function' | 'class' | 'module' | 'refactor' | 'fix' | 'general';
  } {
    const messages = context.messages;
    const recentContent = messages.slice(-5).map(m => m.content).join(' ');

    // Detect programming language
    const language = this.detectLanguage(recentContent, context.codeContext);
    
    // Detect framework
    const framework = this.detectFramework(recentContent);
    
    // Detect code type
    const codeType = this.detectCodeType(recentContent);
    
    // Generate title and description
    const title = this.generateTitle(recentContent, codeType);
    const description = this.generateDescription(recentContent, codeType);
    
    // Estimate effort
    const estimatedEffort = this.estimateEffort(recentContent, codeType);
    
    // Detect target file
    const targetFile = this.detectTargetFile(recentContent, context.codeContext);

    return {
      title,
      description,
      language,
      framework,
      targetFile,
      estimatedEffort,
      codeType
    };
  }

  private async generateCodeContent(context: ConversationContext, analysis: any): Promise<string> {
    const prompt = this.buildCodeGenerationPrompt(context, analysis);
    
    try {
      // Use the existing LLM service to generate code
      const response = await this.callLLMForCode(prompt, analysis.language);
      
      return this.formatCodeOutput(response, analysis);
    } catch (error) {
      console.error('Code generation failed:', error);
      return this.generateFallbackCode(analysis);
    }
  }

  private buildCodeGenerationPrompt(context: ConversationContext, analysis: any): string {
    const recentMessages = context.messages.slice(-3);
    const conversationSummary = recentMessages.map(m => `${m.sender}: ${m.content}`).join('\n');

    const systemContext = context.codeContext ? 
      `Current code context:\nRepository: ${context.codeContext.repository}\nFile: ${context.codeContext.filePath}\nLanguage: ${context.codeContext.language}\n` : '';

    return `You are an expert software engineer. Based on the following conversation, generate ${analysis.language || 'appropriate'} code.

${systemContext}

Conversation:
${conversationSummary}

Requirements:
- Code type: ${analysis.codeType}
- Language: ${analysis.language || 'auto-detect'}
- Framework: ${analysis.framework || 'none specified'}
- Target: ${analysis.targetFile || 'new code'}

Please provide:
1. Clean, well-commented code
2. Follow best practices for ${analysis.language || 'the detected language'}
3. Include error handling where appropriate
4. Make the code production-ready

Generate the code:`;
  }

  private async callLLMForCode(prompt: string, language?: string): Promise<string> {
    // Create a mock agent for code generation
    const codeAgent = {
      id: 'code-generator-agent',
      name: 'CodeGenerator',
      currentResponse: null,
      conversationHistory: [],
      isThinking: false,
      error: null,
      role: 'Software Engineer',
      modelId: 'http://localhost:1234:llama-2-7b-chat', // Use a proper server-prefixed model ID
      apiType: 'llmstudio' as const,
      maxTokens: 1000,
      systemPrompt: `You are an expert software engineer specializing in ${language || 'multiple programming languages'}. Generate clean, well-structured code with appropriate comments and error handling.`
    };

    // Convert prompt to messages format
    const messages = [
      {
        id: uuidv4(),
        content: prompt,
        sender: 'user',
        timestamp: new Date().toISOString(),
        type: 'user' as const
      }
    ];

    try {
      const response = await LLMService.generateResponse(codeAgent, null, messages);
      return response.content;
    } catch (error) {
      console.error('LLM call failed:', error);
      // Return a fallback response instead of throwing
      return `// Error generating code: ${error instanceof Error ? error.message : 'Unknown error'}
// Fallback implementation for ${language || 'general'} code

// TODO: Implement the requested functionality
function placeholder() {
  console.log("Generated code placeholder due to LLM service error");
  return null;
}`;
    }
  }

  private formatCodeOutput(response: string, analysis: any): string {
    // Clean up the response and format it properly
    let code = response.trim();
    
    // Remove common LLM artifacts
    code = code.replace(/^```[\w]*\n?/gm, '');
    code = code.replace(/\n?```$/gm, '');
    
    // Add header comment
    const header = `// Generated code for: ${analysis.title}
// Language: ${analysis.language || 'auto-detected'}
// Generated at: ${new Date().toISOString()}

`;

    return header + code;
  }

  private generateFallbackCode(analysis: any): string {
    return `// Code generation failed - manual implementation required
// Task: ${analysis.title}
// Description: ${analysis.description}
// Language: ${analysis.language || 'not specified'}

// TODO: Implement the requested functionality
// Please review the conversation context and implement manually

function placeholder() {
  // Implementation needed
  throw new Error('Not implemented');
}`;
  }

  private detectLanguage(content: string, codeContext?: any): string | undefined {
    if (codeContext?.language) {
      return codeContext.language;
    }

    const languageKeywords = {
      typescript: ['typescript', 'ts', 'interface', 'type'],
      javascript: ['javascript', 'js', 'node', 'npm'],
      python: ['python', 'py', 'pip', 'import', 'def'],
      java: ['java', 'class', 'public static'],
      'c++': ['c++', 'cpp', 'include', 'namespace'],
      rust: ['rust', 'cargo', 'fn ', 'let mut'],
      go: ['golang', 'go', 'func', 'package']
    };

    for (const [language, keywords] of Object.entries(languageKeywords)) {
      if (keywords.some(keyword => content.toLowerCase().includes(keyword))) {
        return language;
      }
    }

    return undefined;
  }

  private detectFramework(content: string): string | undefined {
    const frameworks = {
      react: ['react', 'jsx', 'component', 'usestate'],
      vue: ['vue', 'vuejs', 'template'],
      angular: ['angular', 'component', 'directive'],
      express: ['express', 'app.get', 'middleware'],
      flask: ['flask', 'app.route', '@app.route'],
      django: ['django', 'models.py', 'views.py']
    };

    for (const [framework, keywords] of Object.entries(frameworks)) {
      if (keywords.some(keyword => content.toLowerCase().includes(keyword))) {
        return framework;
      }
    }

    return undefined;
  }

  private detectCodeType(content: string): 'function' | 'class' | 'module' | 'refactor' | 'fix' | 'general' {
    const types = {
      function: ['function', 'method', 'def', 'fn '],
      class: ['class', 'object', 'constructor'],
      module: ['module', 'package', 'library'],
      refactor: ['refactor', 'cleanup', 'improve', 'optimize'],
      fix: ['fix', 'bug', 'error', 'issue', 'problem']
    };

    for (const [type, keywords] of Object.entries(types)) {
      if (keywords.some(keyword => content.toLowerCase().includes(keyword))) {
        return type as any;
      }
    }

    return 'general';
  }

  private generateTitle(content: string, codeType: string): string {
    const contentWords = content.toLowerCase().split(' ');
    
    // Extract potential function/class names
    const namePattern = /(function|class|def)\s+(\w+)/i;
    const match = content.match(namePattern);
    
    if (match) {
      return `${codeType} implementation: ${match[2]}`;
    }

    // Generate generic title based on type
    const typeMapping = {
      function: 'Function Implementation',
      class: 'Class Definition', 
      module: 'Module Creation',
      refactor: 'Code Refactoring',
      fix: 'Bug Fix',
      general: 'Code Generation'
    };

    return typeMapping[codeType as keyof typeof typeMapping] || 'Code Generation';
  }

  private generateDescription(content: string, codeType: string): string {
    return `Generated ${codeType} based on conversation requirements. ` +
           `Review and modify as needed before implementation.`;
  }

  private estimateEffort(content: string, codeType: string): 'low' | 'medium' | 'high' {
    const complexityIndicators = ['algorithm', 'database', 'api', 'async', 'complex', 'optimization'];
    const hasComplexity = complexityIndicators.some(indicator => 
      content.toLowerCase().includes(indicator)
    );

    if (codeType === 'fix' || codeType === 'refactor') return 'medium';
    if (codeType === 'function') return hasComplexity ? 'medium' : 'low';
    if (codeType === 'class' || codeType === 'module') return hasComplexity ? 'high' : 'medium';
    
    return 'low';
  }

  private detectTargetFile(content: string, codeContext?: any): string | undefined {
    if (codeContext?.filePath) {
      return codeContext.filePath;
    }

    // Look for file mentions in conversation
    const filePattern = /(\w+\.(js|ts|py|java|cpp|rs|go))/i;
    const match = content.match(filePattern);
    return match ? match[1] : undefined;
  }

  private validateLanguageSyntax(code: string, language: string): {
    errors: any[];
    warnings: any[];
  } {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Basic syntax checks (simplified)
    switch (language) {
      case 'javascript':
      case 'typescript':
        if (!this.isValidJavaScript(code)) {
          errors.push({
            code: 'SYNTAX_ERROR',
            message: 'JavaScript/TypeScript syntax validation failed',
            severity: 'error' as const
          });
        }
        break;
      
      case 'python':
        if (!this.isValidPython(code)) {
          errors.push({
            code: 'SYNTAX_ERROR',
            message: 'Python syntax validation failed',
            severity: 'error' as const
          });
        }
        break;
    }

    return { errors, warnings };
  }

  private isValidJavaScript(code: string): boolean {
    try {
      // Basic JS syntax check - in production, use a real parser
      return !code.includes('SyntaxError') && 
             code.includes('{') === code.includes('}');
    } catch {
      return false;
    }
  }

  private isValidPython(code: string): boolean {
    // Basic Python syntax check - in production, use a real parser
    const lines = code.split('\n');
    let indentLevel = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.endsWith(':')) {
        indentLevel++;
      }
    }
    
    return indentLevel >= 0; // Simplified check
  }

  private detectSecurityIssues(code: string): string[] {
    const issues: string[] = [];
    
    // Basic security pattern detection
    const securityPatterns = [
      { pattern: /eval\s*\(/i, message: 'Use of eval() detected - security risk' },
      { pattern: /innerHTML\s*=/i, message: 'Direct innerHTML assignment - XSS risk' },
      { pattern: /document\.write/i, message: 'Use of document.write() - security risk' },
      { pattern: /\$\{.*\}/g, message: 'Template literal injection possible' }
    ];

    for (const { pattern, message } of securityPatterns) {
      if (pattern.test(code)) {
        issues.push(message);
      }
    }

    return issues;
  }

  private generateQualitySuggestions(code: string): string[] {
    const suggestions: string[] = [];

    // Check for common quality issues
    if (!code.includes('//') && !code.includes('/*')) {
      suggestions.push('Consider adding comments to explain complex logic');
    }

    if (code.length > 500) {
      suggestions.push('Consider breaking down into smaller functions');
    }

    if (!code.includes('try') && code.includes('async')) {
      suggestions.push('Consider adding error handling for async operations');
    }

    return suggestions;
  }

  private calculateQualityScore(code: string, errors: any[], warnings: any[]): number {
    let score = 1.0;

    // Deduct for errors and warnings
    score -= errors.length * 0.3;
    score -= warnings.length * 0.1;

    // Add quality bonuses
    if (code.includes('//') || code.includes('/*')) score += 0.1; // Has comments
    if (code.includes('try') || code.includes('catch')) score += 0.1; // Has error handling
    if (code.length > 50 && code.length < 500) score += 0.1; // Reasonable length

    return Math.max(0, Math.min(1, score));
  }
} 