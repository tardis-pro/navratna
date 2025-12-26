import { LLMService, UserLLMService } from '@uaip/llm-service';
import { EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { LLMTaskType } from '@uaip/types';

export interface AgentGenerationRequest {
  requestId: string;
  agentId?: string;
  messages: any[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  provider?: string;
}

export class AgentGenerationHandler {
  constructor(
    private userLLMService: UserLLMService,
    private llmService: LLMService,
    private eventBus: EventBusService
  ) {}

  async handle(event: any): Promise<void> {
    try {
      const request = this.validateRequest(event);
      const agent = await this.loadAgent(request.agentId);
      const response = await this.generateResponse(request, agent);
      await this.publishResponse(request.requestId, request.agentId, response);

      logger.info('Agent generation completed', {
        requestId: request.requestId,
        agentId: request.agentId,
        responseLength: response.content?.length || 0,
      });
    } catch (error) {
      await this.handleError(event, error);
    }
  }

  private validateRequest(event: any): AgentGenerationRequest {
    const { requestId, agentId, messages, systemPrompt, maxTokens, temperature, model, provider } =
      event.data || event;

    if (!requestId) {
      throw new Error('RequestId is required');
    }

    if (!messages || !Array.isArray(messages)) {
      throw new Error('Messages array is required');
    }

    return {
      requestId,
      agentId,
      messages,
      systemPrompt,
      maxTokens,
      temperature,
      model,
      provider,
    };
  }

  private async loadAgent(agentId?: string): Promise<any | null> {
    if (!agentId) {
      logger.info('No agent ID provided, using generic configuration');
      return null;
    }

    // Use AgentRepository.getActiveAgentById() which loads the persona relation
    const { AgentService } = await import('@uaip/shared-services');
    const agentService = AgentService.getInstance();
    const agentRepository = agentService.getAgentRepository();
    const agent = await agentRepository.getActiveAgentById(agentId);

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    logger.info('Loaded agent with persona for generation', {
      agentId: agent.id,
      agentName: agent.name,
      hasPersona: !!agent.persona,
      hasLegacyPersona: !!agent.legacyPersona,
      hasSystemPrompt: !!agent.systemPrompt,
    });

    return agent;
  }

  private async generateResponse(request: AgentGenerationRequest, agent: any): Promise<any> {
    const prompt = this.buildPromptFromMessages(request.messages);

    // Build system prompt from agent persona if available, otherwise use request.systemPrompt
    const systemPrompt = this.buildAgentSystemPrompt(agent, request.systemPrompt);

    const generationRequest = {
      prompt,
      systemPrompt,
      maxTokens: request.maxTokens || agent?.maxTokens || 1000,
      temperature: request.temperature || agent?.temperature || 0.7,
      model: request.model || agent?.configuration?.model,
    };

    // Use user-specific service if agent has user context
    if (agent?.createdBy) {
      try {
        return await this.userLLMService.generateResponse(agent.createdBy, generationRequest);
      } catch (error) {
        logger.warn('UserLLMService failed, falling back to global', {
          agentId: agent.id,
          userId: agent.createdBy,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Fall back to global service
    return await this.llmService.generateResponse(generationRequest);
  }

  private buildPromptFromMessages(messages: any[]): string {
    if (!messages?.length) return '';

    return (
      messages
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n') + '\nAssistant:'
    );
  }

  /**
   * Build system prompt from agent data with persona context
   * Falls back to provided fallbackPrompt if no agent persona is available
   */
  private buildAgentSystemPrompt(agent: any, fallbackPrompt?: string): string {
    if (!agent) {
      return fallbackPrompt || 'You are a helpful AI assistant.';
    }

    // Get persona from either the loaded relation or legacy field
    const persona = agent.persona || agent.legacyPersona;

    let systemPrompt = `You are ${agent.name}`;

    // Add persona description
    if (persona?.description) {
      systemPrompt += `, ${persona.description}`;
    } else if (agent.description) {
      systemPrompt += `. ${agent.description}`;
    }

    systemPrompt += '.\n\n';

    // Add capabilities
    const capabilities = persona?.capabilities || agent.capabilities;
    if (capabilities && Array.isArray(capabilities) && capabilities.length > 0) {
      systemPrompt += `Your capabilities include: ${capabilities.join(', ')}.\n`;
    }

    // Add role context
    if (agent.role) {
      systemPrompt += `Your role is: ${agent.role}.\n`;
    }

    // Add agent's custom system prompt if configured
    if (agent.systemPrompt) {
      systemPrompt += `\n${agent.systemPrompt}\n`;
    }

    // Add response guidelines
    systemPrompt += '\nProvide a natural, helpful response to the user\'s message.';

    logger.info('Built agent system prompt', {
      agentId: agent.id,
      agentName: agent.name,
      hasPersona: !!persona,
      hasCapabilities: !!(capabilities?.length),
      systemPromptLength: systemPrompt.length,
    });

    return systemPrompt;
  }

  private async publishResponse(
    requestId: string,
    agentId: string | undefined,
    response: any
  ): Promise<void> {
    await this.eventBus.publish('llm.agent.generate.response', {
      requestId,
      agentId,
      content: response.content,
      error: response.error,
      confidence: this.calculateConfidence(response),
      model: response.model,
      finishReason: response.finishReason,
      tokensUsed: response.tokensUsed,
      timestamp: new Date().toISOString(),
    });
  }

  private calculateConfidence(response: any): number {
    if (response.error) return 0;
    if (!response.content?.trim()) return 0.1;

    let confidence = 0.8;

    switch (response.finishReason) {
      case 'stop':
        confidence = 0.9;
        break;
      case 'length':
        confidence = 0.7;
        break;
      case 'error':
        confidence = 0.1;
        break;
    }

    const contentLength = response.content.trim().length;
    if (contentLength < 10) confidence *= 0.5;
    else if (contentLength < 50) confidence *= 0.8;

    return Math.max(0, Math.min(1, confidence));
  }

  private async handleError(event: any, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const requestId = event?.data?.requestId || event?.requestId;
    const agentId = event?.data?.agentId || event?.agentId;

    logger.error('Agent generation failed', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
      agentId,
    });

    await this.eventBus.publish('llm.agent.generate.response', {
      requestId,
      agentId,
      content: null,
      error: errorMessage,
      confidence: 0,
      model: 'unknown',
      finishReason: 'error',
      timestamp: new Date().toISOString(),
    });
  }
}
