import { Message, AgentState } from '../types/agent';
import { DocumentContext } from '../types/document';
import { LLMService } from '../services/llm';
import { generateAgentResponse } from '../services/llm';
import { AgentContextValue } from '../types/agent';

export interface DiscussionContext {
  topic: string;
  initialDocument?: string;
  maxRounds: number;
  currentRound: number;
  isActive: boolean;
  agents: Map<string, AgentState>;
  history: Message[];
}

export type TurnStrategy = 'round-robin' | 'moderated' | 'context-aware';

export interface DiscussionState {
  isRunning: boolean;
  currentSpeakerId: string | null;
  turnQueue: string[];
  messageHistory: Message[];
  currentRound: number;
  lastError: string | null;
}

export interface IDiscussionManager {
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  addAgent: (agent: AgentState) => void;
  removeAgent: (agentId: string) => void;
  updateDocument: (document: DocumentContext | null) => void;
  overrideTurn: (agentId: string) => void;
  detectAgreementDisagreement: () => { agrees: string[], disagrees: string[] };
  createCheckpoint: () => string;
  restoreCheckpoint: (checkpointId: string) => boolean;
  summarizeDiscussion: () => Promise<string>;
  addDocument: (document: DocumentContext) => void;
  removeDocument: (documentId: string) => void;
  getDocuments: () => DocumentContext[];
}

export class DiscussionManager implements IDiscussionManager {
  private context: DiscussionContext;
  private turnStrategy: TurnStrategy;
  private currentTurn: string | null;
  private moderatorId?: string;
  private state: DiscussionState;
  private document: DocumentContext | null;
  private updateCallback: (state: DiscussionState) => void;
  private responseCallback: (agentId: string, response: string) => void;
  private abortController: AbortController | null = null;
  private checkpoints: Map<string, DiscussionState> = new Map();
  private documents: DocumentContext[] = [];
  private agentContext: AgentContextValue;

  constructor(
    agents: Record<string, AgentState>,
    document: DocumentContext | null,
    updateCallback: (state: DiscussionState) => void,
    responseCallback: (agentId: string, response: string) => void,
    agentContext: AgentContextValue
  ) {
    this.context = {
      topic: '',
      maxRounds: 3,
      currentRound: 0,
      isActive: false,
      agents: new Map(),  // We'll use agentContext instead
      history: []
    };
    this.turnStrategy = 'round-robin';
    this.currentTurn = null;
    this.document = document;
    this.updateCallback = updateCallback;
    this.responseCallback = responseCallback;
    this.agentContext = agentContext;
    this.state = {
      isRunning: false,
      currentSpeakerId: null,
      turnQueue: [],
      messageHistory: [],
      currentRound: 0,
      lastError: null,
    };
    
    // Initialize documents array with primary document if available
    if (document) {
      this.documents = [document];
    }
  }

  private get agents(): Record<string, AgentState> {
    return this.agentContext.agents;
  }

  public addAgent(agent: AgentState): void {
    this.agentContext.addAgent(agent);
    if (this.state.isRunning) {
      this.state.turnQueue.push(agent.id);
    }
  }

  public removeAgent(agentId: string): void {
    this.agentContext.removeAgent(agentId);
    this.state.turnQueue = this.state.turnQueue.filter(id => id !== agentId);
    if (this.state.currentSpeakerId === agentId) {
      this.moveToNextTurn();
    }
  }

  public setModerator(agentId: string): void {
    if (!this.context.agents.has(agentId)) {
      throw new Error('Moderator must be a registered agent');
    }
    this.moderatorId = agentId;
  }

  public start(): void {
    if (Object.keys(this.agents).length < 2) {
      this.state.lastError = 'At least two agents are required to start a discussion.';
      this.updateCallback(this.state);
      return;
    }

    if (!this.document) {
      this.state.lastError = 'A document must be loaded to start a discussion.';
      this.updateCallback(this.state);
      return;
    }

    // Initialize the discussion
    this.state = {
      isRunning: true,
      currentSpeakerId: null,
      turnQueue: this.initializeTurnQueue(),
      messageHistory: [],
      currentRound: 0,
      lastError: null,
    };
    
    this.updateCallback(this.state);
    this.processNextTurn();
  }

  public stop(): void {
    this.context.isActive = false;
    this.currentTurn = null;
  }

  public addMessage(agentId: string, content: string): void {
    if (!this.state.isRunning) {
      throw new Error('Discussion is not active');
    }
    if (agentId !== this.state.currentSpeakerId) {
      throw new Error('Not this agent\'s turn to speak');
    }

    const agent = this.agents[agentId];
    if (!agent) {
      throw new Error('Agent not found');
    }

    const message: Message = {
      id: Date.now().toString(),
      content,
      sender: agent.name,
      timestamp: new Date(),
      type: 'response'
    };

    // Update message history in state
    this.state.messageHistory.push(message);
    
    // Update agent's conversation history
    if (this.agentContext) {
      this.agentContext.updateAgentState(message.sender, {
        conversationHistory: [...this.state.messages]
      });
    }
    
    // Notify callbacks
    this.updateCallback(this.state);
    this.responseCallback(agentId, content);
    
    // Move to next turn
    this.moveToNextTurn();
  }

  private moveToNextTurn(): void {
    if (!this.state.isRunning) return;

    // Remove current speaker from queue
    if (this.state.currentSpeakerId) {
      this.state.turnQueue = this.state.turnQueue.filter(id => id !== this.state.currentSpeakerId);
    }

    // If queue is empty, refill it
    if (this.state.turnQueue.length === 0) {
      this.state.turnQueue = this.initializeTurnQueue();
      this.state.currentRound++;
    }

    // Get next speaker
    this.state.currentSpeakerId = this.state.turnQueue[0];
    this.updateCallback(this.state);
  }

  private progressDiscussion(): void {
    if (this.turnStrategy === 'moderated' && this.moderatorId) {
      // In moderated mode, always go back to moderator after each message
      this.currentTurn = this.moderatorId;
    } else {
      this.determineNextTurn();
    }
  }

  private determineNextTurn(): void {
    if (!this.context.isActive) return;

    switch (this.turnStrategy) {
      case 'round-robin':
        this.handleRoundRobinTurn();
        break;
      case 'context-aware':
        this.handleContextAwareTurn();
        break;
      case 'moderated':
        this.handleModeratedTurn();
        break;
    }
  }

  private handleRoundRobinTurn(): void {
    const agents = Array.from(this.context.agents.keys())
      .filter(id => id !== this.moderatorId);

    if (!this.currentTurn) {
      // Start with first agent
      this.currentTurn = agents[0];
      return;
    }

    const currentIndex = agents.indexOf(this.currentTurn);
    if (currentIndex === agents.length - 1) {
      // End of round
      this.context.currentRound++;
      if (this.context.currentRound >= this.context.maxRounds) {
        this.stop();
        return;
      }
      this.currentTurn = agents[0];
    } else {
      this.currentTurn = agents[currentIndex + 1];
    }
  }

  private handleContextAwareTurn(): void {
    // Implement more sophisticated turn-taking based on context
    if (this.state.messageHistory.length === 0) {
      // If this is the first message, start with a random agent
      const agents = Object.keys(this.agents);
      this.currentTurn = agents[Math.floor(Math.random() * agents.length)];
      return;
    }

    // Get the last message
    const lastMessage = this.state.messageHistory[this.state.messageHistory.length - 1];
    
    // Check if the message explicitly mentions another agent
    const agents = Object.values(this.agents);
    const mentioned = agents.find(agent => {
      // Check if the message mentions the agent by name
      if (lastMessage.content.includes(agent.name)) {
        // Don't select the agent who just spoke
        return agent.id !== lastMessage.sender;
      }
      return false;
    });

    if (mentioned) {
      // If another agent was mentioned, give them the next turn
      this.currentTurn = mentioned.id;
      return;
    }

    // Check if the message ends with a question
    if (lastMessage.content.trim().endsWith('?')) {
      // If question, select an agent with expertise related to the question
      // For now, just select a different agent than the last speaker
      const otherAgents = Object.keys(this.agents).filter(id => id !== lastMessage.sender);
      if (otherAgents.length > 0) {
        this.currentTurn = otherAgents[Math.floor(Math.random() * otherAgents.length)];
        return;
      }
    }

    // If no specific context cues, fall back to round-robin
    this.handleRoundRobinTurn();
  }

  private handleModeratedTurn(): void {
    if (!this.moderatorId) {
      throw new Error('Moderated discussions require a moderator');
    }
    // Always set turn to moderator who will then decide next speaker
    this.currentTurn = this.moderatorId;
  }

  public getCurrentTurn(): string | null {
    return this.currentTurn;
  }

  public getContext(): DiscussionContext {
    return { ...this.context };
  }

  public getHistory(): Message[] {
    return [...this.context.history];
  }

  public setInitialDocument(document: string): void {
    this.context.initialDocument = document;
  }

  private initializeTurnQueue(): string[] {
    return Object.keys(this.agents);
  }

  private async processNextTurn(): Promise<void> {
    if (!this.state.isRunning) return;
    
    if (this.state.turnQueue.length === 0) {
      this.state.turnQueue = this.initializeTurnQueue();
    }
    
    const agentId = this.state.turnQueue.shift() as string;
    this.state.currentSpeakerId = agentId;
    this.updateCallback(this.state);
    
    try {
      await this.generateResponse(agentId);
      
      // Queue the next turn
      setTimeout(() => this.processNextTurn(), 500);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Handle abort - do nothing, as this is expected during pause
      } else {
        this.setError(`Error generating response: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async generateResponse(agentId: string): Promise<void> {
    const agent = this.agents[agentId];
    if (!agent) return Promise.resolve();
    
    // Create a new abort controller for this response
    this.abortController = new AbortController();
    
    // Set agent to thinking state
    this.agentContext.updateAgentState(agentId, { 
      isThinking: true, 
      error: null,
      currentResponse: null 
    });
    
    // Generate the "thinking" message
    const thinkingMessage: Message = {
      id: crypto.randomUUID(),
      sender: agent.name,
      content: "Thinking...",
      type: "thought",
      timestamp: new Date(),
    };
    
    // Add thinking message to state
    this.state.messageHistory.push(thinkingMessage);
    this.updateCallback(this.state);

    return new Promise(async (resolve, reject) => {
      try {
        // Generate the agent's response based on context
        const documentContent = this.getCombinedDocumentContent();
        
        // Get optimized conversation history
        const conversationHistory = this.getOptimizedHistory(agent);
        
        const response = await generateAgentResponse(
          agent,
          documentContent,
          conversationHistory,
          this.abortController?.signal
        );
        
        // Create response message
        const responseMessage: Message = {
          id: crypto.randomUUID(),
          sender: agent.name,
          content: response,
          type: "response",
          timestamp: new Date(),
        };
        
        // Remove thinking message from state
        this.state.messageHistory = this.state.messageHistory.filter(m => m.id !== thinkingMessage.id);
        
        // Add response message to state
        this.state.messageHistory.push(responseMessage);
        
        // Update agent state with new message and response
        this.agentContext.updateAgentState(agentId, {
          isThinking: false,
          currentResponse: response,
          error: null,
          conversationHistory: [...(this.agents[agentId]?.conversationHistory || []), responseMessage]
        });
        
        this.updateCallback(this.state);
        
        // Notify parent component
        this.responseCallback(agentId, response);
        resolve();
      } catch (error) {
        // Remove thinking message from state
        this.state.messageHistory = this.state.messageHistory.filter(m => m.id !== thinkingMessage.id);
        
        // Update agent state to error
        this.agentContext.updateAgentState(agentId, {
          isThinking: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          currentResponse: null
        });
        
        this.updateCallback(this.state);
        
        reject(error);
      }
    });
  }

  /**
   * Gets optimized conversation history for context windows
   * Implements memory management strategies for long discussions
   */
  private getOptimizedHistory(currentAgent: AgentState): Message[] {
    const MAX_HISTORY_LENGTH = 10; // Maximum number of messages to keep in context
    const ALWAYS_INCLUDE_LAST = 3; // Always include the most recent messages
    
    // Filter out thinking messages
    const conversationHistory = this.state.messageHistory.filter(m => m.type !== "thought");
    
    // If conversation is short enough, return all of it
    if (conversationHistory.length <= MAX_HISTORY_LENGTH) {
      return conversationHistory;
    }
    
    // Keep the initial context (first message, typically document summary/topic)
    const initialContext = conversationHistory.slice(0, 1);
    
    // Keep messages relevant to the current agent (directed at them or from them)
    const relevantMessages = conversationHistory.slice(1, -ALWAYS_INCLUDE_LAST).filter(message => {
      // Keep messages from the current agent
      if (message.sender === currentAgent.name) return true;
      
      // Keep messages that mention the current agent
      if (message.content.includes(currentAgent.name)) return true;
      
      // Otherwise, only keep messages with high importance
      // (Could implement importance scoring here)
      return false;
    });
    
    // Always include the most recent messages
    const recentMessages = conversationHistory.slice(-ALWAYS_INCLUDE_LAST);
    
    // Combine optimized history
    const optimizedHistory = [
      ...initialContext,
      ...relevantMessages.slice(-MAX_HISTORY_LENGTH + initialContext.length + recentMessages.length),
      ...recentMessages
    ];
    
    // Add a summary if we had to remove messages
    if (optimizedHistory.length < conversationHistory.length) {
      const removedCount = conversationHistory.length - optimizedHistory.length;
      const summaryMessage: Message = {
        id: crypto.randomUUID(),
        sender: "system",
        content: `[${removedCount} earlier messages omitted for brevity]`,
        type: "system",
        timestamp: new Date(),
      };
      
      // Insert the summary after the initial context
      optimizedHistory.splice(initialContext.length, 0, summaryMessage);
    }
    
    return optimizedHistory;
  }

  private setError(errorMessage: string): void {
    this.state.lastError = errorMessage;
    this.updateCallback(this.state);
  }

  public pause(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.state.isRunning = false;
    this.updateCallback(this.state);
  }

  public resume(): void {
    if (!this.state.isRunning) {
      this.state.isRunning = true;
      this.updateCallback(this.state);
      this.processNextTurn();
    }
  }

  public reset(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.state = {
      isRunning: false,
      currentSpeakerId: null,
      turnQueue: [],
      messageHistory: [],
      currentRound: 0,
      lastError: null,
    };
    
    this.updateCallback(this.state);
  }

  public updateDocument(document: DocumentContext | null): void {
    this.document = document;
    
    // Update documents array
    if (document) {
      this.addDocument(document);
    }
  }

  public overrideTurn(agentId: string): void {
    if (!this.agents[agentId]) {
      this.setError(`Agent ${agentId} not found.`);
      return;
    }

    // Cancel any in-progress response generation
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Set the current speaker to the specified agent
    this.state.currentSpeakerId = agentId;
    
    // Update turn queue to prioritize this agent
    this.state.turnQueue = this.state.turnQueue.filter(id => id !== agentId);
    this.state.turnQueue.unshift(agentId);
    
    this.updateCallback(this.state);
    
    // Resume if paused
    if (!this.state.isRunning) {
      this.resume();
    } else {
      // Otherwise, process the next turn immediately
      this.processNextTurn();
    }
  }

  /**
   * Analyzes recent messages to detect agreement and disagreement between agents
   * @returns Object containing arrays of agent IDs that agree or disagree
   */
  public detectAgreementDisagreement(): { agrees: string[], disagrees: string[] } {
    const result = {
      agrees: [] as string[],
      disagrees: [] as string[]
    };
    
    // Only analyze if we have enough messages
    if (this.state.messageHistory.length < 3) {
      return result;
    }
    
    // Get the last few messages for analysis
    const recentMessages = this.state.messageHistory
      .filter(m => m.type === 'response')
      .slice(-5);
    
    // Simple keyword-based detection
    const agreementKeywords = [
      'agree', 'concur', 'correct', 'right', 'yes', 'indeed',
      'good point', 'I support', 'makes sense'
    ];
    
    const disagreementKeywords = [
      'disagree', 'incorrect', 'wrong', 'no', 'however', 'but',
      'I don\'t think', 'not necessarily', 'I\'m not sure', 'on the contrary'
    ];
    
    // Check each agent's last message
    Object.values(this.agents).forEach(agent => {
      // Find the agent's most recent message
      const lastMessage = recentMessages.find(m => m.sender === agent.name);
      if (!lastMessage) return;
      
      // Check for agreement
      if (agreementKeywords.some(keyword => 
        lastMessage.content.toLowerCase().includes(keyword)
      )) {
        result.agrees.push(agent.id);
      }
      
      // Check for disagreement
      if (disagreementKeywords.some(keyword => 
        lastMessage.content.toLowerCase().includes(keyword)
      )) {
        result.disagrees.push(agent.id);
      }
    });
    
    return result;
  }

  /**
   * Creates a checkpoint of the current discussion state
   * @returns The ID of the created checkpoint
   */
  public createCheckpoint(): string {
    const checkpointId = `checkpoint-${Date.now()}`;
    
    // Deep clone the current state to preserve it
    const stateClone: DiscussionState = {
      isRunning: this.state.isRunning,
      currentSpeakerId: this.state.currentSpeakerId,
      turnQueue: [...this.state.turnQueue],
      messageHistory: this.state.messageHistory.map(msg => ({...msg})),
      currentRound: this.state.currentRound,
      lastError: this.state.lastError,
    };
    
    this.checkpoints.set(checkpointId, stateClone);
    
    // Keep only the last 5 checkpoints to save memory
    const checkpointKeys = Array.from(this.checkpoints.keys());
    if (checkpointKeys.length > 5) {
      const oldestKey = checkpointKeys[0];
      this.checkpoints.delete(oldestKey);
    }
    
    return checkpointId;
  }
  
  /**
   * Restores the discussion state from a checkpoint
   * @param checkpointId The ID of the checkpoint to restore
   * @returns True if restoration was successful, false otherwise
   */
  public restoreCheckpoint(checkpointId: string): boolean {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      this.setError(`Checkpoint ${checkpointId} not found.`);
      return false;
    }
    
    // Pause any ongoing processes
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    // Restore state from checkpoint
    this.state = {
      isRunning: false, // Always restore in paused state for safety
      currentSpeakerId: checkpoint.currentSpeakerId,
      turnQueue: [...checkpoint.turnQueue],
      messageHistory: checkpoint.messageHistory.map(msg => ({...msg})),
      currentRound: checkpoint.currentRound,
      lastError: null,
    };
    
    this.updateCallback(this.state);
    return true;
  }
  
  /**
   * Generates a summary of the current discussion
   * @returns A promise that resolves to the summary text
   */
  public async summarizeDiscussion(): Promise<string> {
    if (this.state.messageHistory.length === 0) {
      return "No discussion to summarize yet.";
    }
    
    // Use the first available agent to generate the summary
    const summarizingAgent = Object.values(this.agents)[0];
    if (!summarizingAgent) {
      return "No agents available to generate summary.";
    }
    
    // Create a copy of the agent with system prompt for summarization
    const summaryAgent: AgentState = {
      ...summarizingAgent,
      systemPrompt: `You are a helpful assistant that summarizes discussions. 
      Please provide a concise summary of the following discussion, 
      highlighting the key points, agreements, and disagreements.`
    };
    
    // Only include response messages (not thoughts or system)
    const conversationHistory = this.state.messageHistory.filter(
      m => m.type === 'response'
    );
    
    try {
      const documentContent = this.document?.content || "";
      const summary = await generateAgentResponse(
        summaryAgent,
        documentContent,
        conversationHistory,
        null
      );
      
      // Create a system message with the summary
      const summaryMessage: Message = {
        id: crypto.randomUUID(),
        sender: "system",
        content: `## Discussion Summary\n\n${summary}`,
        type: "system",
        timestamp: new Date(),
      };
      
      // Add summary message to both state and all agent histories
      this.state.messageHistory.push(summaryMessage);
      Object.values(this.agents).forEach(agent => {
        agent.conversationHistory.push(summaryMessage);
      });
      
      this.updateCallback(this.state);
      
      return summary;
    } catch (error) {
      this.setError(`Error generating summary: ${error instanceof Error ? error.message : String(error)}`);
      return "Failed to generate summary.";
    }
  }

  /**
   * Adds a document to the discussion
   * @param document The document to add
   */
  public addDocument(document: DocumentContext): void {
    // Check if document already exists
    const existingIndex = this.documents.findIndex(doc => doc.id === document.id);
    if (existingIndex >= 0) {
      // Update existing document
      this.documents[existingIndex] = document;
    } else {
      // Add new document
      this.documents.push(document);
    }
    
    // If no primary document is set, set this as primary
    if (!this.document) {
      this.document = document;
    }
  }
  
  /**
   * Removes a document from the discussion
   * @param documentId The ID of the document to remove
   */
  public removeDocument(documentId: string): void {
    this.documents = this.documents.filter(doc => doc.id !== documentId);
    
    // If we removed the primary document, update it
    if (this.document?.id === documentId) {
      this.document = this.documents.length > 0 ? this.documents[0] : null;
    }
  }
  
  /**
   * Gets all documents in the discussion
   * @returns Array of document contexts
   */
  public getDocuments(): DocumentContext[] {
    return [...this.documents];
  }
  
  /**
   * Combines content from all documents into a single context for the discussion
   * @returns Combined document content
   */
  private getCombinedDocumentContent(): string {
    if (this.documents.length === 0) {
      return "";
    }
    
    if (this.documents.length === 1) {
      return this.documents[0].content || "";
    }
    
    // Combine documents with headers
    return this.documents.map(doc => {
      return `## Document: ${doc.title || 'Untitled'}\n\n${doc.content}\n\n`;
    }).join('---\n\n');
  }
} 