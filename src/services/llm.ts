import { getModelInfo } from '@/components/ModelSelector';
import { AgentState, Message } from '../types/agent';
import { DocumentContext } from '../types/document';

interface LLMResponse {
  content: string;
  error?: string;
}

// Default URLs - can be overridden by environment variables
const OLLAMA_URL = 'http://192.168.1.3:1234/chat/completions';
const LLM_STUDIO_URL = '/v1/chat/completions';

export class LLMService {
  private static async callOllama(
    prompt: string,
    systemPrompt: string,
    modelId: string
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
    modelId: string
  ): Promise<LLMResponse> {
    try {
      const { serverUrl, modelName } = getModelInfo(modelId);
      const response = await fetch(serverUrl  +LLM_STUDIO_URL, {
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

    // Use agent's system prompt, or fall back to persona-based prompt
    const systemPrompt = agent.systemPrompt || `You are ${agent.name}, a ${agent.role}. 
Respond in a way that reflects your expertise and role.
Keep responses concise and focused on the topic at hand.
Also speak as little as possible - only give answers to the question, not everything.
If you find they are asking too many questions, please ask the user to break down into 3-4 questions, 
and then respond. Your answer should be 200 words or less.`;

    // Call appropriate LLM service
    return agent.apiType === 'ollama'
      ? this.callOllama(prompt, systemPrompt, agent.modelId)
      : this.callLLMStudio(prompt, systemPrompt, agent.modelId);
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