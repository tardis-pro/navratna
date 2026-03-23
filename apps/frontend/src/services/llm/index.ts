import { llmAPI } from '@/api/llm.api';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class _LLMService {
  private defaultModelId: string = 'default';

  async generate(messages: LLMMessage[]): Promise<string> {
    try {
      const response = await llmAPI.userLLM.generate({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
      return response.content || '';
    } catch (error) {
      console.error('LLM generate error:', error);
      throw error;
    }
  }

  async streamGenerate(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    try {
      const response = await llmAPI.userLLM.generate({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
      onChunk(response.content || '');
    } catch (error) {
      console.error('LLM streamGenerate error:', error);
      throw error;
    }
  }
}

export interface AgentResponseContext {
  agentId: string;
  agentName: string;
  discussionId?: string;
  topic?: string;
}

export async function generateAgentResponse(
  context: AgentResponseContext,
  prompt: string
): Promise<string> {
  try {
    const response = await llmAPI.userLLM.generate({
      messages: [
        {
          role: 'system',
          content: `You are ${context.agentName}. Respond thoughtfully to the discussion.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    return response.content || '';
  } catch (error) {
    console.error('generateAgentResponse error:', error);
    throw error;
  }
}
