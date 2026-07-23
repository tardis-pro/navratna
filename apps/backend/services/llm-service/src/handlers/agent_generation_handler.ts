import { LLMService, UserLLMService } from '@uaip/llm-service';
import { EventBusService } from '@uaip/infra/event_bus';
import { logger, NotFoundError, ValidationError, isRecord } from '@uaip/utils';
import type { AgentGenerationRequest, LLMResponse } from '@uaip/types';


export class AgentGenerationHandler {
  constructor(
    private userLLMService: UserLLMService,
    private llmService: LLMService,
    private eventBus: EventBusService
  ) {}

  async handle(event: Record<string, unknown>): Promise<void> {
    try {
      const request = this.validateRequest(event);
      const agent = await this.loadAgent(request.agentId);
      const response = await this.generateResponse(request, agent);
      await this.publishResponse(request.requestId, request.agentId, response);

      logger.info('Agent generation completed', {
        requestId: request.requestId,
        agentId: request.agentId,
        responseLength: response.content.length,
      });
    } catch (error) {
      await this.handleError(event, error);
    }
  }

  private validateRequest(event: Record<string, unknown>): AgentGenerationRequest {
    const rawData = event['data'];
    const data: Record<string, unknown> = isRecord(rawData) ? rawData : event;
    const { requestId, agentId, messages, systemPrompt, maxTokens, temperature, model, provider } =
      data;

    if (!requestId) {
      throw new ValidationError('RequestId is required');
    }

    if (!messages || !Array.isArray(messages)) {
      throw new ValidationError('Messages array is required');
    }

    return {
      requestId: typeof requestId === 'string' ? requestId : String(requestId),
      agentId: typeof agentId === 'string' ? agentId : undefined,
      messages: messages.filter(isRecord).map((m) => ({
        content: typeof m['content'] === 'string' ? m['content'] : '',
        sender: typeof m['sender'] === 'string' ? m['sender'] : undefined,
      })),
      systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : undefined,
      maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      model: typeof model === 'string' ? model : undefined,
      provider: typeof provider === 'string' ? provider : undefined,
    };
  }

  private async loadAgent(agentId?: string): Promise<Record<string, unknown> | null> {
    if (!agentId) {
      logger.info('No agent ID provided, using generic configuration');
      return null;
    }

    const { AgentService } = await import('@uaip/shared-services');
    const agentService = AgentService.getInstance();
    const agentRepository = agentService.getAgentRepository();
    const agent = await agentRepository.findById(agentId);

    if (!agent) {
      throw new NotFoundError(`Agent ${agentId} not found`);
    }

    logger.info('Loaded agent with persona for generation', {
      agentId: agent.id,
      agentName: agent.name,
      hasLegacyPersona: !!agent.legacyPersona,
      hasSystemPrompt: !!agent.systemPrompt,
    });

    return agent;
  }

  private async generateResponse(
    request: AgentGenerationRequest,
    agent: Record<string, unknown> | null
  ): Promise<LLMResponse> {
    const prompt = this.buildPromptFromMessages(request.messages);

    // Build system prompt from agent persona if available, otherwise use request.systemPrompt
    const systemPrompt = this.buildAgentSystemPrompt(agent, request.systemPrompt);

    const agentConfig = isRecord(agent?.['configuration']) ? agent['configuration'] : undefined;
    const generationRequest = {
      prompt,
      systemPrompt,
      maxTokens: request.maxTokens || (typeof agent?.['maxTokens'] === 'number' ? agent['maxTokens'] : 0) || 1000,
      temperature: request.temperature || (typeof agent?.['temperature'] === 'number' ? agent['temperature'] : 0) || 0.7,
      model: request.model || (typeof agentConfig?.['model'] === 'string' ? agentConfig['model'] : undefined),
    };

    // Use user-specific service if agent has user context
    if (agent?.createdBy) {
      return await this.userLLMService.generateResponse(
        typeof agent['createdBy'] === 'string' ? agent['createdBy'] : String(agent['createdBy']),
        generationRequest
      );
    }

    // Generic, non-agent generation uses the global service.
    return await this.llmService.generateResponse(generationRequest);
  }

  private buildPromptFromMessages(messages: Array<{ content: string; sender?: string }>): string {
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
  private buildAgentSystemPrompt(
    agent: Record<string, unknown> | null,
    fallbackPrompt?: string
  ): string {
    if (!agent) {
      return fallbackPrompt || 'You are a helpful AI assistant.';
    }

    // Get persona from either the loaded relation or legacy field
    const rawPersona = agent['persona'] ?? agent['legacyPersona'];
    const persona = isRecord(rawPersona) ? rawPersona : undefined;

    let systemPrompt = `You are ${agent.name}`;

    // Add persona description
    if (persona?.description) {
      systemPrompt += `, ${persona.description}`;
    } else if (agent.description) {
      systemPrompt += `. ${agent.description}`;
    }

    systemPrompt += '.\n\n';

    // Add capabilities
    const rawCaps = persona?.['capabilities'] ?? agent['capabilities'];
    const capabilities = Array.isArray(rawCaps) ? rawCaps : undefined;
    if (capabilities && capabilities.length > 0) {
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
    systemPrompt += "\nProvide a natural, helpful response to the user's message.";

    logger.info('Built agent system prompt', {
      agentId: agent.id,
      agentName: agent.name,
      hasPersona: !!persona,
      hasCapabilities: !!capabilities?.length,
      systemPromptLength: systemPrompt.length,
    });

    return systemPrompt;
  }

  private async publishResponse(
    requestId: string,
    agentId: string | undefined,
    response: LLMResponse
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

  private calculateConfidence(response: LLMResponse): number {
    if (response.error) return 0;
    const content = response.content;
    if (!content?.trim()) return 0.1;

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

    const contentLength = content.trim().length;
    if (contentLength < 10) confidence *= 0.5;
    else if (contentLength < 50) confidence *= 0.8;

    return Math.max(0, Math.min(1, confidence));
  }

  private async handleError(event: Record<string, unknown>, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const rawEventData = event?.['data'];
    const eventData = isRecord(rawEventData) ? rawEventData : undefined;
    const requestId = eventData?.['requestId'] ?? event?.['requestId'];
    const agentId = eventData?.['agentId'] ?? event?.['agentId'];

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
