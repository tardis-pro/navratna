import { AgentState, Message } from '../types/agent';
import { DocumentContext } from '../types/document';

interface LLMResponse {
  content: string;
  error?: string;
}

export class LLMService {
  private static async callOllama(
    prompt: string,
    systemPrompt: string,
    modelId: string
  ): Promise<LLMResponse> {
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          prompt,
          system: systemPrompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { content: data.response };
    } catch (error) {
      console.error('Error calling Ollama:', error);
      return { content: '', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private static async callLLMStudio(
    prompt: string,
    systemPrompt: string,
    modelId: string
  ): Promise<LLMResponse> {
    try {
      const response = await fetch('http://localhost:1234/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          model: modelId,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { content: data.choices[0].message.content };
    } catch (error) {
      console.error('Error calling LLM Studio:', error);
      return { content: '', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async generateResponse(
    agent: AgentState,
    context: DocumentContext | null,
    messages: Message[]
  ): Promise<LLMResponse> {
    // Construct the prompt
    const contextPrompt = context 
      ? `\nContext Document:\nTitle: ${context.title}\nContent: ${context.content}\n`
      : '';

    const conversationHistory = messages
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');

    const prompt = `${contextPrompt}\n\nConversation History:\n${conversationHistory}\n\n${agent.name}:`;

    // Default system prompt if none provided
    const systemPrompt = agent.systemPrompt || `You are ${agent.name}, a ${agent.role}. 
Respond in a way that reflects your expertise and role.
Keep responses concise and focused on the topic at hand.`;

    // Call appropriate LLM service
    return agent.apiType === 'ollama'
      ? this.callOllama(prompt, systemPrompt, agent.modelId)
      : this.callLLMStudio(prompt, systemPrompt, agent.modelId);
  }
} 