import { 
  LLMRequest, 
  LLMResponse, 
  AgentResponseRequest, 
  AgentResponseResponse,
  ArtifactRequest,
  ArtifactResponse,
  ContextRequest,
  ContextAnalysis,
  Message,
  DocumentContext,
  ToolCall,
  ToolResult
} from './interfaces';
import { BaseProvider } from './providers/BaseProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { LLMStudioProvider } from './providers/LLMStudioProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

export class LLMService {
  private static instance: LLMService;
  private providers: Map<string, BaseProvider> = new Map();
  private initialized = false;

  private constructor() {
    // Initialize with default configuration for now
    // TODO: Replace with database-driven configuration
    this.initializeDefaultProviders();
  }

  public static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  private initializeDefaultProviders(): void {
    // Default Ollama provider
    const ollamaProvider = new OllamaProvider({
      type: 'ollama',
      baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      defaultModel: 'llama2',
      timeout: 30000,
      retries: 3
    }, 'Default Ollama');

    // Default LLM Studio provider
    const llmStudioProvider = new LLMStudioProvider({
      type: 'llmstudio',
      baseUrl: process.env.LLM_STUDIO_URL || 'http://localhost:1234',
      defaultModel: 'gpt-3.5-turbo',
      timeout: 30000,
      retries: 3
    }, 'Default LLM Studio');

    // OpenAI provider (if API key is available)
    if (process.env.OPENAI_API_KEY) {
      const openaiProvider = new OpenAIProvider({
        type: 'openai',
        baseUrl: 'https://api.openai.com',
        apiKey: process.env.OPENAI_API_KEY,
        defaultModel: 'gpt-3.5-turbo',
        timeout: 30000,
        retries: 3
      }, 'OpenAI');
      
      this.providers.set('openai', openaiProvider);
    }

    this.providers.set('ollama', ollamaProvider);
    this.providers.set('llmstudio', llmStudioProvider);
    
    this.initialized = true;
    logger.info(`LLM Service initialized with ${this.providers.size} providers`);
  }

  private async getBestProvider(preferredType?: string): Promise<BaseProvider | null> {
    if (!this.initialized) {
      this.initializeDefaultProviders();
    }

    // If preferred type is specified, try to use it
    if (preferredType && this.providers.has(preferredType)) {
      return this.providers.get(preferredType)!;
    }

    // Fallback order: OpenAI -> LLM Studio -> Ollama
    const fallbackOrder = ['openai', 'llmstudio', 'ollama'];
    
    for (const providerType of fallbackOrder) {
      if (this.providers.has(providerType)) {
        return this.providers.get(providerType)!;
      }
    }

    return null;
  }

  // Core LLM generation method
  async generateResponse(request: LLMRequest, preferredType?: string): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const provider = await this.getBestProvider(preferredType);
      if (!provider) {
        return {
          content: 'I apologize, but no LLM providers are currently available. Please check the system configuration.',
          model: 'unavailable',
          error: 'No active providers available',
          finishReason: 'error'
        };
      }

      logger.info('Generating LLM response', {
        provider: preferredType || 'auto',
        promptLength: request.prompt.length,
        model: request.model
      });

      const response = await provider.generateResponse(request);

      const duration = Date.now() - startTime;
      logger.info('LLM response generated successfully', {
        tokensUsed: response.tokensUsed,
        duration,
        isError: !!response.error
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error generating LLM response', { 
        error,
        duration
      });

      return {
        content: 'I apologize, but I encountered an error generating my response. Please try again later.',
        model: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        finishReason: 'error'
      };
    }
  }

  // Agent-specific response generation
  async generateAgentResponse(request: AgentResponseRequest): Promise<AgentResponseResponse> {
    try {
      // Build the prompt from agent context
      const prompt = this.buildAgentPrompt(request);
      const systemPrompt = this.buildAgentSystemPrompt(request);

      // Determine preferred provider type based on agent configuration
      const preferredType = this.getPreferredProviderType(request.agent);

      const response = await this.generateResponse({
        prompt,
        systemPrompt,
        maxTokens: request.agent.intelligence_config?.maxTokens || 500,
        temperature: request.agent.intelligence_config?.temperature || 0.7,
        model: request.agent.intelligence_config?.modelId
      }, preferredType);

      // Parse tool calls if agent has tools
      const { cleanContent, toolCalls } = this.parseToolCalls(response.content, request.tools);

      return {
        ...response,
        content: cleanContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };
    } catch (error) {
      logger.error('Error generating agent response', { 
        agentId: request.agent.id,
        error 
      });

      return {
        content: 'I apologize, but I encountered an error generating my response. Please try again.',
        model: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        finishReason: 'error'
      };
    }
  }

  // Artifact generation
  async generateArtifact(request: ArtifactRequest): Promise<ArtifactResponse> {
    try {
      const prompt = this.buildArtifactPrompt(request);
      const systemPrompt = this.buildArtifactSystemPrompt(request);

      const response = await this.generateResponse({
        prompt,
        systemPrompt,
        maxTokens: 2000, // Artifacts typically need more tokens
        temperature: 0.3, // Lower temperature for more consistent code generation
      });

      return {
        ...response,
        artifactType: request.type,
        metadata: {
          language: request.language,
          framework: this.detectFramework(response.content, request.language),
          dependencies: this.extractDependencies(response.content, request.language)
        }
      };
    } catch (error) {
      logger.error('Error generating artifact', { 
        type: request.type,
        language: request.language,
        error 
      });

      return {
        content: `// Error generating ${request.type}\n// ${error instanceof Error ? error.message : 'Unknown error'}`,
        model: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        finishReason: 'error',
        artifactType: request.type,
        metadata: {
          language: request.language
        }
      };
    }
  }

  // Context analysis
  async analyzeContext(request: ContextRequest): Promise<ContextAnalysis> {
    try {
      const prompt = this.buildContextAnalysisPrompt(request);
      const systemPrompt = 'You are an expert conversation analyst. Analyze the context and provide structured insights in JSON format.';

      const response = await this.generateResponse({
        prompt,
        systemPrompt,
        maxTokens: 1000,
        temperature: 0.2, // Lower temperature for more consistent analysis
      });

      // Parse the analysis from the response
      const analysis = this.parseContextAnalysis(response.content, request);

      return {
        ...response,
        analysis
      };
    } catch (error) {
      logger.error('Error analyzing context', { error });

      // Return fallback analysis
      return {
        content: 'Context analysis failed',
        model: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        finishReason: 'error',
        analysis: {
          intent: {
            primary: 'unknown',
            secondary: [],
            confidence: 0
          },
          context: {
            messageCount: request.conversationHistory.length,
            participants: Array.from(new Set(request.conversationHistory.map(m => m.sender))),
            topics: [],
            sentiment: 'neutral',
            complexity: 'unknown'
          },
          recommendations: []
        }
      };
    }
  }

  // Provider management methods
  async getProviderStats(): Promise<Array<{
    name: string;
    type: string;
    available: boolean;
  }>> {
    const stats = [];
    
    for (const [name, provider] of this.providers) {
      stats.push({
        name,
        type: name, // Using name as type for now
        available: true // Always true for initialized providers
      });
    }

    return stats;
  }

  // Private helper methods
  private buildAgentPrompt(request: AgentResponseRequest): string {
    const { agent, messages, context } = request;

    let prompt = '';

    // Add context if available
    if (context) {
      prompt += `Context Document:\nTitle: ${context.title}\nContent: ${context.content}\n\n`;
    }

    // Add conversation history
    if (messages.length > 0) {
      prompt += 'Conversation History:\n';
      messages.forEach(msg => {
        prompt += `${msg.sender}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    prompt += `${agent.name}:`;
    return prompt;
  }

  private buildAgentSystemPrompt(request: AgentResponseRequest): string {
    const { agent } = request;
    
    let systemPrompt = `You are ${agent.name}`;
    
    if (agent.persona?.description) {
      systemPrompt += `, ${agent.persona.description}`;
    }
    
    systemPrompt += '.\n\nCRITICAL RESPONSE RULES:\n';
    systemPrompt += '- Keep responses under 200 words maximum\n';
    systemPrompt += '- Be direct and concise - no fluff or filler\n';
    systemPrompt += '- Only answer what was asked - don\'t elaborate unnecessarily\n';
    systemPrompt += '- Use bullet points or short sentences\n';
    systemPrompt += '- If the topic is complex, give a brief answer and offer to elaborate if needed\n\n';
    
    if (agent.persona?.capabilities && agent.persona.capabilities.length > 0) {
      systemPrompt += `Your capabilities include: ${agent.persona.capabilities.join(', ')}\n`;
    }
    
    if (request.tools && request.tools.length > 0) {
      systemPrompt += '\nAvailable tools:\n';
      request.tools.forEach(tool => {
        systemPrompt += `- ${tool.name}: ${tool.description}\n`;
      });
    }

    return systemPrompt;
  }

  private buildArtifactPrompt(request: ArtifactRequest): string {
    let prompt = `Generate a ${request.type}`;
    
    if (request.language) {
      prompt += ` in ${request.language}`;
    }
    
    prompt += ` based on the following context and requirements:\n\n`;
    prompt += `Context: ${request.context}\n\n`;
    prompt += `Requirements:\n`;
    request.requirements.forEach(req => {
      prompt += `- ${req}\n`;
    });

    if (request.constraints && request.constraints.length > 0) {
      prompt += `\nConstraints:\n`;
      request.constraints.forEach(constraint => {
        prompt += `- ${constraint}\n`;
      });
    }

    return prompt;
  }

  private buildArtifactSystemPrompt(request: ArtifactRequest): string {
    const typePrompts = {
      code: 'You are an expert software engineer. Generate clean, well-structured, production-ready code with appropriate comments and error handling.',
      documentation: 'You are a technical writer. Generate clear, comprehensive documentation that is easy to understand and follow.',
      test: 'You are a QA engineer. Generate thorough test cases that cover edge cases and ensure code reliability.',
      prd: 'You are a product manager. Generate detailed product requirements that are clear, actionable, and comprehensive.'
    };

    let systemPrompt = typePrompts[request.type] || 'You are an expert assistant.';
    
    if (request.language) {
      systemPrompt += ` Focus specifically on ${request.language} best practices and conventions.`;
    }

    return systemPrompt;
  }

  private buildContextAnalysisPrompt(request: ContextRequest): string {
    let prompt = 'Analyze the following conversation context and provide structured insights:\n\n';
    
    prompt += `User Request: ${request.userRequest}\n\n`;
    
    if (request.currentContext) {
      prompt += `Current Context: ${request.currentContext.title} - ${request.currentContext.content}\n\n`;
    }
    
    prompt += 'Conversation History:\n';
    request.conversationHistory.forEach(msg => {
      prompt += `${msg.sender}: ${msg.content}\n`;
    });
    
    if (request.agentCapabilities && request.agentCapabilities.length > 0) {
      prompt += `\nAgent Capabilities: ${request.agentCapabilities.join(', ')}\n`;
    }
    
    prompt += '\nProvide analysis in the following areas:\n';
    prompt += '1. Primary and secondary intents\n';
    prompt += '2. Conversation context (participants, topics, sentiment)\n';
    prompt += '3. Recommended actions with confidence scores\n';

    return prompt;
  }

  private getPreferredProviderType(agent: any): string | undefined {
    // Logic to determine preferred provider based on agent configuration
    const modelId = agent.intelligence_config?.modelId;
    
    if (!modelId) return undefined;
    
    if (modelId.includes('gpt') || modelId.includes('openai')) {
      return 'openai';
    }
    
    if (modelId.includes('llama') || modelId.includes('ollama')) {
      return 'ollama';
    }
    
    return 'llmstudio'; // Default fallback
  }

  private parseToolCalls(content: string, tools?: any[]): { cleanContent: string; toolCalls: ToolCall[] } {
    // Simple tool call parsing - can be enhanced based on specific format
    const toolCallRegex = /\[TOOL_CALL:(\w+)\((.*?)\)\]/g;
    const toolCalls: ToolCall[] = [];
    let cleanContent = content;

    let match;
    while ((match = toolCallRegex.exec(content)) !== null) {
      const [fullMatch, toolName, args] = match;
      
      toolCalls.push({
        id: uuidv4(),
        type: 'function',
        function: {
          name: toolName,
          arguments: args
        }
      });

      cleanContent = cleanContent.replace(fullMatch, '').trim();
    }

    return { cleanContent, toolCalls };
  }

  private parseContextAnalysis(content: string, request: ContextRequest): any {
    // Try to parse JSON from the response, fallback to basic analysis
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Failed to parse context analysis JSON', { error });
    }

    // Fallback analysis
    return {
      intent: {
        primary: this.extractPrimaryIntent(request.userRequest),
        secondary: [],
        confidence: 0.5
      },
      context: {
        messageCount: request.conversationHistory.length,
        participants: Array.from(new Set(request.conversationHistory.map(m => m.sender))),
        topics: this.extractTopics(request.conversationHistory),
        sentiment: 'neutral',
        complexity: request.conversationHistory.length > 10 ? 'high' : 'low'
      },
      recommendations: []
    };
  }

  private extractPrimaryIntent(userRequest: string): string {
    const lowerRequest = userRequest.toLowerCase();
    
    if (lowerRequest.includes('create') || lowerRequest.includes('generate')) {
      return 'creation';
    }
    if (lowerRequest.includes('explain') || lowerRequest.includes('what') || lowerRequest.includes('how')) {
      return 'explanation';
    }
    if (lowerRequest.includes('fix') || lowerRequest.includes('debug') || lowerRequest.includes('error')) {
      return 'troubleshooting';
    }
    
    return 'general_inquiry';
  }

  private extractTopics(messages: Message[]): string[] {
    // Simple topic extraction - can be enhanced with NLP
    const topics = new Set<string>();
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    messages.forEach(msg => {
      const words = msg.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        word = word.replace(/[^\w]/g, '');
        if (word.length > 3 && !commonWords.has(word)) {
          topics.add(word);
        }
      });
    });
    
    return Array.from(topics).slice(0, 5); // Return top 5 topics
  }

  private detectFramework(content: string, language?: string): string | undefined {
    if (!language) return undefined;
    
    const frameworks: Record<string, string[]> = {
      javascript: ['react', 'vue', 'angular', 'express', 'nodejs'],
      typescript: ['react', 'vue', 'angular', 'express', 'nestjs'],
      python: ['django', 'flask', 'fastapi', 'pandas', 'numpy'],
      java: ['spring', 'hibernate', 'junit'],
      csharp: ['asp.net', '.net', 'entity framework']
    };
    
    const contentLower = content.toLowerCase();
    const possibleFrameworks = frameworks[language.toLowerCase()] || [];
    
    return possibleFrameworks.find(fw => contentLower.includes(fw));
  }

  private extractDependencies(content: string, language?: string): string[] {
    if (!language) return [];
    
    const deps: string[] = [];
    
    // Extract imports/requires based on language
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'typescript':
        const jsImports = content.match(/import .+ from ['"]([^'"]+)['"]/g) || [];
        const requires = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
        deps.push(...jsImports.map(imp => imp.match(/['"]([^'"]+)['"]/)![1]));
        deps.push(...requires.map(req => req.match(/['"]([^'"]+)['"]/)![1]));
        break;
        
      case 'python':
        const pythonImports = content.match(/(?:from|import)\s+(\w+)/g) || [];
        deps.push(...pythonImports.map(imp => imp.replace(/(?:from|import)\s+/, '')));
        break;
    }
    
    return [...new Set(deps)]; // Remove duplicates
  }
}

// Export singleton instance
export const llmService = LLMService.getInstance(); 