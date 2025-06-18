import { getModelInfo, ModelOption, ServiceConfig } from '@/components/ModelSelector';
import { AgentState, Message } from '../types/agent';
import { DocumentContext } from '../types/document';
import { ToolCall, ToolResult } from '../types/tool';
import { 
  enhanceAgentWithTools, 
  parseToolCalls, 
  validateAgentToolUsage,
  LLMToolIntegrationService 
} from './tools/llm-tool-integration';
import { getModelServiceConfig } from '@/config/modelConfig';

interface LLMResponse {
  content: string;
  error?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

// Default URLs - can be overridden by environment variables
const OLLAMA_URL = 'http://192.168.1.3:1234/chat/completions';
const LLM_STUDIO_URL = '/v1/chat/completions';

export class LLMService {
  private static async callOllama(
    prompt: string,
    systemPrompt: string,
    modelId: string,
    maxTokens: number = 200
  ): Promise<LLMResponse> {
    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          prompt,
          system: systemPrompt,
          stream: false,
          options: {
            num_predict: maxTokens
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.response) {
        throw new Error('No response received from Ollama');
      }
      return { content: data.response };
    } catch (error) {
      console.error('Error calling Ollama:', error);
      return { 
        content: 'I apologize, but I am currently unable to generate a response. Please try again later.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async callLLMStudio(
    prompt: string,
    systemPrompt: string,
    modelId: string,
    maxTokens: number = 200
  ): Promise<LLMResponse> {
    try {
      const { serverUrl, modelName } = getModelInfo(modelId);
      const response = await fetch(serverUrl + LLM_STUDIO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          model: modelName,
          stream: false,
          max_tokens: maxTokens
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from LLM Studio');
      }
      return { content: data.choices[0].message.content };
    } catch (error) {
      console.error('Error calling LLM Studio:', error);
      return { 
        content: 'I apologize, but I am currently unable to generate a response. Please try again later.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static async generateResponse(
    agent: AgentState,
    context: DocumentContext | null,
    messages: Message[]
  ): Promise<LLMResponse> {
    if (!agent.modelId) {
      return {
        content: '',
        error: 'No model ID specified for agent'
      };
    }

    try {
      // Construct the prompt with proper message type handling
      const contextPrompt = context 
        ? `\nContext Document:\nTitle: ${context.title}\nContent: ${context.content}\n`
        : '';

      // Separate system messages from conversation messages
      const systemMessages = messages.filter(msg => msg.type === 'system');
      const conversationMessages = messages.filter(msg => msg.type !== 'system');

      // Include system messages as context (these contain document info, initial setup)
      const systemContext = systemMessages.length > 0
        ? `\nSystem Context:\n${systemMessages.map(msg => msg.content).join('\n')}\n`
        : '';

      // Format conversation history
      const conversationHistory = conversationMessages.length > 0
        ? conversationMessages.map(msg => `${msg.sender}: ${msg.content}`).join('\n')
        : 'No previous conversation.';

      const prompt = `${contextPrompt}${systemContext}\n\nConversation History:\n${conversationHistory}\n\n${agent.name}:`;

      // Generate tool-aware system prompt
      const baseSystemPrompt = agent.systemPrompt || `You are ${agent.name}, a ${agent.role}. 

CRITICAL RESPONSE RULES:
- Keep responses under 100 words maximum
- Be direct and concise - no fluff or filler
- Only answer what was asked - don't elaborate unnecessarily  
- Use bullet points or short sentences
- If the topic is complex, give a brief answer and offer to elaborate if needed

Respond in a way that reflects your expertise and role.
Focus only on the most important points.`;

      // Enhance with tool capabilities if agent has tools
      const toolAwareSystemPrompt = agent.availableTools && agent.availableTools.length > 0
        ? await enhanceAgentWithTools({ ...agent, systemPrompt: baseSystemPrompt })
        : baseSystemPrompt;

      // Call appropriate LLM service
      const maxTokens = agent.maxTokens || 200;
      const response = agent.apiType === 'ollama'
        ? await this.callOllama(prompt, toolAwareSystemPrompt, agent.modelId, maxTokens)
        : await this.callLLMStudio(prompt, toolAwareSystemPrompt, agent.modelId, maxTokens);

      if (response.error) {
        return response;
      }

      // Parse tool calls from response
      const { cleanContent, toolCalls } = parseToolCalls(response.content);
      
      // Validate tool usage if any tool calls were made
      if (toolCalls.length > 0) {
        const validation = await validateAgentToolUsage(agent, toolCalls, prompt);
        
        if (!validation.valid) {
          console.warn('Invalid tool usage detected:', validation.errors);
          // Return response without tool calls but include warning
          return {
            content: cleanContent + '\n\n*Note: Some tool calls were invalid and have been skipped.*',
            error: validation.errors.join(', ')
          };
        }

        if (validation.warnings.length > 0) {
          console.warn('Tool usage warnings:', validation.warnings);
        }
      }

      return {
        content: cleanContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };

    } catch (error) {
      console.error('Error in generateResponse:', error);
      return {
        content: 'I apologize, but I encountered an error generating my response. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Real implementation that uses the LLMService
export async function generateAgentResponse(
  agent: AgentState,
  documentContent: string,
  conversationHistory: Message[],
  abortSignal?: AbortSignal
): Promise<string> {
  // Check if the operation was aborted
  if (abortSignal?.aborted) {
    throw new Error('Operation aborted');
  }

  // Create a document context from the content
  const context: DocumentContext = {
    id: 'current-discussion',
    title: 'Current Discussion',
    content: documentContent,
    type: 'general',
    metadata: {
      createdAt: new Date(),
      lastModified: new Date(),
      author: agent.name
    },
    tags: ['discussion']
  };

  try {
    // Use the LLMService to generate the response
    const response = await LLMService.generateResponse(agent, context, conversationHistory);
    
    if (response.error) {
      throw new Error(response.error);
    }

    return response.content;
  } catch (error) {
    if (abortSignal?.aborted) {
      throw new Error('Operation aborted');
    }
    throw error;
  }
}

function createAgentPrompt(
  agent: AgentState,
  documentContent: string,
  conversationHistory: Message[]
): string {
  // Format the conversation history
  const formattedHistory = conversationHistory
    .map((message) => `${message.sender}: ${message.content}`)
    .join('\n');

  // Build persona description from the Persona object
  const personaDescription = agent.persona 
    ? `Your persona: ${agent.persona.name} - ${agent.persona.background}\nExpertise: ${agent.persona.expertise?.join(', ')}\nKey traits: ${agent.persona.traits?.map(t => t.name).join(', ')}`
    : '';

  // Build the prompt
  return `
You are ${agent.name}, a ${agent.role}.

${personaDescription}

You are participating in a discussion about the following document:

${documentContent}

Conversation history:
${formattedHistory}

Please provide your response as ${agent.name}:
`;
}

function generateMockResponse(
  agent: AgentState,
  documentContent: string,
  conversationHistory: Message[]
): string {
  // Generate different responses based on the agent's role
  // This is just for demonstration purposes
  
  // Extract some content from the document for more realistic responses
  const documentExcerpt = documentContent.substring(0, 100).replace(/\n/g, ' ');
  
  // Get the most recent message for context
  const lastMessage = conversationHistory[conversationHistory.length - 1];
  const referenceSender = lastMessage ? lastMessage.sender : '';
  
  switch (agent.role.toLowerCase()) {
    case 'software engineer':
      return `From a software engineering perspective, I think we should consider the technical implications of ${documentExcerpt}. ${referenceSender ? `As ${referenceSender} pointed out, we need to consider the implementation details carefully.` : ''}`;
    
    case 'qa engineer':
      return `Looking at this from a QA perspective, we need to ensure ${documentExcerpt} is thoroughly tested. ${referenceSender ? `I agree with ${referenceSender}'s points about validation.` : ''}`;
    
    case 'tech lead':
      return `As the tech lead, I suggest we focus on the architecture implications of ${documentExcerpt}. ${referenceSender ? `Building on what ${referenceSender} said, we should also consider scalability.` : ''}`;
    
    case 'policy analyst':
      return `From a policy perspective, ${documentExcerpt} has several implications. ${referenceSender ? `I'd like to expand on ${referenceSender}'s analysis by considering long-term impacts.` : ''}`;
    
    case 'economist':
      return `The economic implications of ${documentExcerpt} are significant. ${referenceSender ? `I see ${referenceSender}'s point, but we should also consider market effects.` : ''}`;
    
    case 'legal expert':
      return `From a legal standpoint, we need to consider compliance with regulations regarding ${documentExcerpt}. ${referenceSender ? `While ${referenceSender} raised good points, there are also legal precedents to consider.` : ''}`;
    
    default:
      return `I've been reviewing ${documentExcerpt} and have some thoughts to share. ${referenceSender ? `I appreciate ${referenceSender}'s input on this matter.` : ''}`;
  }
} 

const fetchModelsFromService = async (
  baseUrl: string,
  modelsPath: string,
  chatPath: string,
  apiType: 'llmstudio' | 'ollama'
): Promise<ModelOption[]> => {
  try {
    const modelsEndpoint = `${baseUrl}${modelsPath}`;
    const apiEndpoint = apiType === 'llmstudio' ? `${baseUrl}${chatPath}` : `${baseUrl}${modelsPath.replace('/tags', '/generate')}`;
    
    const response = await fetch(modelsEndpoint);
    if (!response.ok) {
      console.warn(`Failed to fetch models from ${baseUrl}: ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    
    if (apiType === 'llmstudio') {
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: { id: string }) => ({
          id: `${baseUrl}:${model.id}`,
          name: model.id,
          description: `LLM Studio (${baseUrl}) - ${model.id}`,
          apiEndpoint,
          apiType: 'llmstudio' as const,
          source: baseUrl,
        }));
      } else {
        console.warn(`LLM Studio models response format unexpected from ${baseUrl}:`, data);
        return [];
      }
    } else {
      if (data.models && Array.isArray(data.models)) {
        return data.models.map((model: { name: string }) => ({
          id: `${baseUrl}:${model.name}`,
          name: model.name,
          description: `Ollama (${baseUrl}) - ${model.name}`,
          apiEndpoint,
          apiType: 'ollama' as const,
          source: baseUrl,
        }));
      } else {
        console.warn(`Ollama models response format unexpected from ${baseUrl}:`, data);
        return [];
      }
    }
  } catch (error) {
    console.error(`Error fetching models from ${baseUrl}:`, error);
    return [];
  }
};


export const getModels = async (config?: ServiceConfig): Promise<ModelOption[]> => {
  const serviceConfig = config || getModelServiceConfig();
  const fetchPromises: Promise<ModelOption[]>[] = [];

  // Fetch from all LLM Studio instances
  serviceConfig.llmStudio.baseUrls.forEach(baseUrl => {
    const modelsPath = serviceConfig.llmStudio.modelsPath || '/v1/models';
    const chatPath = serviceConfig.llmStudio.chatPath || '/v1/chat/completions';
    fetchPromises.push(fetchModelsFromService(baseUrl, modelsPath, chatPath, 'llmstudio'));
  });

  // Fetch from all Ollama instances
  serviceConfig.ollama.baseUrls.forEach(baseUrl => {
    const modelsPath = serviceConfig.ollama.modelsPath || '/api/tags';
    const generatePath = serviceConfig.ollama.generatePath || '/api/generate';
    fetchPromises.push(fetchModelsFromService(baseUrl, modelsPath, generatePath, 'ollama'));
  });

  // Wait for all requests to complete
  const results = await Promise.allSettled(fetchPromises);
  
  // Flatten and combine all successful results
  const allModels: ModelOption[] = [];
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      allModels.push(...result.value);
    }
  });

  return allModels;
}