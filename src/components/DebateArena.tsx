import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import DebateMessage from "./DebateMessage";
import ModelSelector, { getModels, ModelOption } from "./ModelSelector";
import { Brain, Save, Sparkles, Zap, MessageSquare, Download, Share2, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDebatePrompts } from '../hooks/useDebatePrompts';
import { useDiscussion } from '@/contexts/DiscussionContext';
import { AgentState } from '@/types/agent';
import { AgentSelector } from './AgentSelector';

interface DebateArenaProps {
  onTopicChange: (topic: string) => void;
}

// Define the DebateMessageData type here to match DebateMessage's expectations
interface DebateMessageData {
  id: string;
  role: 'llama1' | 'llama2' | 'judge';
  content: string;
  timestamp: Date;
  modelId: string;
  apiType: 'ollama' | 'llmstudio';
}

const DebateArena: React.FC<DebateArenaProps> = ({ onTopicChange }) => {
  const { toast } = useToast();
  const messageEndRef = useRef<HTMLDivElement>(null);
  
  // Add ref to track if debate should be stopped
  const shouldStopDebateRef = useRef<boolean>(false);
  
  // Discussion manager state
  const {
    currentTurn,
    isActive,
    history,
    currentRound,
    addAgent,
    removeAgent,
    setModerator,
    start: startDiscussion,
    stop: stopDiscussion,
    addMessage,
    setInitialDocument
  } = useDiscussion();
  
  // State management
  const [topic, setTopic] = useState<string>('');
  const [rounds, setRounds] = useState<string>('3');
  const [messages, setMessages] = useState<DebateMessageData[]>([]);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isJudgeThinking, setIsJudgeThinking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [model1, setModel1] = useState<string | undefined>(undefined);
  const [model2, setModel2] = useState<string | undefined>(undefined);
  const [judgeModel, setJudgeModel] = useState<string | undefined>(undefined);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [savedDebates, setSavedDebates] = useState<{topic: string, date: Date}[]>([]);
  const [agents, setAgents] = useState<{[key: string]: AgentState}>({});

  // Add virtualization for messages
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5
  });
  
  // Get Model Display Name Utility
  const getModelName = (modelId: string | undefined): string => {
    if (!modelId) return 'AI';
    return allModels.find(m => m.id === modelId)?.name || modelId.split('-')[0] || 'AI';
  };

  // Extract prompt construction to custom hook - we'll rename to avoid conflicts
  const { constructLlamaPrompt: buildLlamaPrompt, constructJudgePrompt: buildJudgePrompt } = useDebatePrompts(
    topic,
    messages,
    currentRound,
    parseInt(rounds)
  );

  // Memoize expensive computations
  const thinkingActorName = useMemo(() => {
    if (isThinking) {
      return getModelName(currentTurn === 'llama1' ? model1 : model2);
    } else if (isJudgeThinking) {
      return getModelName(judgeModel);
    }
    return '';
  }, [isThinking, isJudgeThinking, currentTurn, model1, model2, judgeModel]);
  
  // Initialize agents when models are selected
  useEffect(() => {
    if (model1 && model2 && judgeModel) {
      // Remove any existing agents
      removeAgent('llama1');
      removeAgent('llama2');
      removeAgent('judge');

      // Add new agents
      const baseAgentState: Omit<AgentState, 'id' | 'name'> = {
        currentResponse: null,
        conversationHistory: [],
        isThinking: false,
        error: null
      };

      addAgent('llama1', { ...baseAgentState, id: 'llama1', name: getModelName(model1) });
      addAgent('llama2', { ...baseAgentState, id: 'llama2', name: getModelName(model2) });
      addAgent('judge', { ...baseAgentState, id: 'judge', name: getModelName(judgeModel) });
      
      // Set judge as moderator
      setModerator('judge');
    }
  }, [model1, model2, judgeModel, addAgent, removeAgent, setModerator, getModelName]);

  // Convert discussion history to debate messages
  useEffect(() => {
    const convertedMessages: DebateMessageData[] = history.map(msg => ({
      id: msg.id,
      role: msg.sender as 'llama1' | 'llama2' | 'judge',
      content: msg.content,
      timestamp: msg.timestamp,
      modelId: agents[msg.sender]?.modelId || '',
      apiType: agents[msg.sender]?.apiType || 'ollama'
    }));
    setMessages(convertedMessages);
  }, [history, agents]);

  const handleAgentSelect = useCallback((role: string, agent: AgentState) => {
    setAgents(prev => ({ ...prev, [role]: agent }));
    addAgent(role, agent);
    if (role === 'judge') {
      setModerator(role);
    }
  }, [addAgent, setModerator]);

  // Optimize message generation with useCallback
  const generateNextMessage = useCallback(async (role: 'llama1' | 'llama2' | 'judge') => {
    try {
      if (shouldStopDebateRef.current) return;
      
      setIsThinking(role === 'llama1' || role === 'llama2');
      setIsJudgeThinking(role === 'judge');
      
      const maxRetries = 3;
      let retryCount = 0;
      let success = false;
      
      while (retryCount < maxRetries && !success && !shouldStopDebateRef.current) {
        try {
          const prompt = role === 'judge' ? buildJudgePrompt() : buildLlamaPrompt(role);
          const response = await callModelAPI(role, prompt);
          
          if (shouldStopDebateRef.current) return;
          
          if (response) {
            addMessage(role, response);
            success = true;
          }
        } catch (err) {
          retryCount++;
          if (retryCount === maxRetries || shouldStopDebateRef.current) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to generate a response");
      stopDiscussion();
    }
    setIsThinking(false);
    setIsJudgeThinking(false);
  }, [addMessage, buildLlamaPrompt, buildJudgePrompt, stopDiscussion]);

  // Watch for turn changes
  useEffect(() => {
    if (isActive && currentTurn && !isThinking && !isJudgeThinking) {
      generateNextMessage(currentTurn as 'llama1' | 'llama2' | 'judge');
    }
  }, [isActive, currentTurn, isThinking, isJudgeThinking, generateNextMessage]);

  const callModelAPI = async (modelRole: 'llama1' | 'llama2' | 'judge', prompt: string): Promise<string> => {
    // Check if debate was already stopped
    if (shouldStopDebateRef.current) {
      throw new Error('Debate was stopped');
    }
    
    let modelId: string | undefined;
    switch (modelRole) {
      case 'llama1': modelId = model1; break;
      case 'llama2': modelId = model2; break;
      case 'judge': modelId = judgeModel; break;
    }

    if (!modelId) {
        throw new Error(`No model selected for ${modelRole}`);
    }

    try {
      const selectedModel = allModels.find(m => m.id === modelId);

      if (!selectedModel) {
        throw new Error(`Model with ID '${modelId}' not found.`);
      }

      let responseContent: string;
      const headers = { 'Content-Type': 'application/json' };

      console.log(`Calling ${selectedModel.apiType} (${selectedModel.id}) for ${modelRole} via ${selectedModel.apiEndpoint}`);

      // Add timeout promise to prevent hanging requests
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('API request timeout after 30 seconds')), 300000);
      });

      // Add a stop debate promise to abort if user stops the debate
      const stopDebatePromise = new Promise<never>((_, reject) => {
        // Check every 100ms if debate should be stopped
        const checkInterval = setInterval(() => {
          if (shouldStopDebateRef.current) {
            clearInterval(checkInterval);
            reject(new Error('Debate was stopped by user'));
          }
        }, 100);
        
        // Cleanup interval after 5 minutes max
        setTimeout(() => clearInterval(checkInterval), 300000);
      });

      if (selectedModel.apiType === 'ollama') {
        const fetchPromise = fetch(selectedModel.apiEndpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: selectedModel.id,
            prompt: prompt,
            stream: false,
            options: { temperature: 0.7, num_predict: 500 }
          }),
        });

        // Race between fetch, timeout and stop debate
        const response = await Promise.race([fetchPromise, timeout, stopDebatePromise]) as Response;

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Ollama API Error (${response.status}): ${response.statusText}. Details: ${errorBody}`);
        }
        const data = await response.json();
        responseContent = data.response;
        
        if (!responseContent) {
          throw new Error('No response received from Ollama API');
        }

      } else if (selectedModel.apiType === 'llmstudio') {
        const fetchPromise = fetch(selectedModel.apiEndpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: selectedModel.id,
            messages: [
              { role: "system", content: modelRole === 'judge' ? "You are an impartial judge evaluating a debate." : "You are a debater." },
              { role: "user", content: prompt }
            ],
            max_tokens: 150,
            temperature: 0.7,
            stream: false,
          }),
        });

        // Race between fetch, timeout and stop debate
        const response = await Promise.race([fetchPromise, timeout, stopDebatePromise]) as Response;

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`LLM Studio API Error (${response.status}): ${response.statusText}. Details: ${errorBody}`);
        }
        const data = await response.json();
        responseContent = data.choices?.[0]?.message?.content?.trim();
        
        if (!responseContent) {
          throw new Error('No response received from LLM Studio API');
        }

      } else {
        throw new Error(`Unknown apiType for model ${selectedModel.id}`);
      }

      // Check if debate was stopped during processing
      if (shouldStopDebateRef.current) {
        throw new Error('Debate was stopped by user');
      }

      // Enhanced validation of response quality
      if (responseContent.toLowerCase().includes("error") || responseContent.length < 10) {
        console.warn(`Potentially problematic response received from ${modelId}: ${responseContent}`);
        throw new Error(`Invalid response received from ${getModelName(modelId)}`);
      }
      
      // Check for repetitive responses from the same model
      const previousModelResponses = messages
        .filter(m => m.role === modelRole)
        .map(m => m.content);
      
      if (previousModelResponses.length > 0) {
        const lastResponse = previousModelResponses[previousModelResponses.length - 1];
        
        // Simple repetition check - could be enhanced
        if (lastResponse && 
            (responseContent.substring(0, 20).toLowerCase() === lastResponse.substring(0, 20).toLowerCase() ||
             responseContent.length < 15)) {
          console.warn(`Model ${modelId} is generating repetitive content`);
          throw new Error(`${getModelName(modelId)} is generating repetitive content. Try a different approach.`);
        }
      }

      return responseContent;

    } catch (error) {
      // Check if debate was stopped
      if (shouldStopDebateRef.current || 
          (error instanceof Error && error.message.includes('stopped'))) {
        console.log('API call aborted due to debate being stopped');
        throw new Error('Debate was stopped');
      }
      
      const errorMessage = error instanceof Error ? error.message : "Unknown API error";
      console.error(`API call error for ${modelRole} (${modelId}):`, errorMessage);
      
      // Add specific error message depending on the type of error
      const userFacingError = error instanceof Error && error.message.includes('timeout') 
        ? `Timeout while waiting for response from ${getModelName(modelId)}. Please check your network connection and try again.`
        : error instanceof Error && error.message.includes('repetitive') 
          ? `${errorMessage} Try stopping and restarting the debate.`
          : `Error contacting ${getModelName(modelId)}: ${errorMessage}`;
        
      setError(userFacingError);
      throw error;
    }
  };

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const fetched = await getModels();
        setAllModels(fetched);
        if (fetched.length > 0) {
           const defaultLlmStudio = fetched.find(m => m.apiType === 'llmstudio');
           const defaultOllama = fetched.find(m => m.apiType === 'ollama');

           // Set defaults intelligently
           setModel1(defaultLlmStudio?.id || fetched[0].id);
           setModel2(defaultOllama?.id || (fetched.length > 1 ? fetched.find(m => m.id !== (defaultLlmStudio?.id || fetched[0].id))?.id : fetched[0].id) || fetched[0].id);
           // Set judge default, preferably different from debaters if possible
           setJudgeModel(fetched.find(m => m.id !== model1 && m.id !== model2)?.id || defaultOllama?.id || defaultLlmStudio?.id || fetched[0].id);
        } else {
          setError("No models discovered. Please ensure Ollama and/or LLM Studio servers are running and accessible.");
        }
      } catch (error) {
        console.error("Failed to fetch models:", error);
        setError("Failed to load available models. Check console and server status.");
      }
    };
    fetchModels();
  }, []); 

  // Auto-scroll
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startDebate = async () => {
    if (!topic.trim()) {
      toast({ 
        title: "No Topic", 
        description: "Please enter a debate topic.", 
        variant: "destructive" 
      });
      return;
    }
    
    const requiredRoles = ['llama1', 'llama2', 'judge'];
    const missingRoles = requiredRoles.filter(role => !agents[role]);
    if (missingRoles.length > 0) {
      toast({ 
        title: "Agents Not Selected", 
        description: `Please select agents for: ${missingRoles.join(', ')}`, 
        variant: "destructive" 
      });
      return;
    }

    try {
      shouldStopDebateRef.current = false;
      setMessages([]);
      setError(null);
      setIsThinking(false);
      setIsJudgeThinking(false);
      setInitialDocument(topic);
      startDiscussion();
    } catch (error) {
      console.error("Failed to start debate:", error);
      toast({
        title: "Failed to Start Debate",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  const stopDebate = () => {
    shouldStopDebateRef.current = true;
    stopDiscussion();
    setIsThinking(false);
    setIsJudgeThinking(false);
    
    toast({
      title: "Debate Stopped",
      description: "The debate has been manually stopped.",
      variant: "default"
    });
  };

  const saveDebate = () => {
    if (messages.length > 0) {
      // In a real app, you might save to localStorage or a database
      const newSavedDebate = { topic, date: new Date() };
      setSavedDebates(prev => [...prev, newSavedDebate]);
      
      toast({
        title: "Debate Saved",
        description: `Your debate on "${topic}" has been saved.`,
        className: "bg-gradient-to-r from-gray-900 to-gray-800 text-white border-gray-700",
      });
    }
  };
  
  const exportDebateAsText = () => {
    if (messages.length === 0) return;
    
    let exportText = `# Debate: ${topic}\n`;
    exportText += `# Date: ${new Date().toLocaleString()}\n`;
    exportText += `# Rounds Completed: ${currentRound} / ${rounds}\n`;
    exportText += `# Debater 1: ${getModelName(model1)}\n`;
    exportText += `# Debater 2: ${getModelName(model2)}\n`;
    exportText += `# Judge: ${getModelName(judgeModel)}\n\n`;
    exportText += `## Full Transcript\n\n`;
    
    messages.forEach(msg => {
      const roleName = msg.role === 'llama1' ? getModelName(model1) :
                       msg.role === 'llama2' ? getModelName(model2) :
                       getModelName(judgeModel);
      exportText += `### ${roleName} (${msg.role}, ${msg.timestamp.toLocaleTimeString()})\n\n`;
      exportText += `${msg.content.trim()}\n\n`;
      exportText += `---\n\n`;
    });
    
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debate-${topic.replace(/[\s:]+/g, '-').toLowerCase()}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Debate Exported",
      description: "Your debate has been downloaded as a text file.",
    });
  };

  // Update topic handler
  const handleTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTopic = e.target.value;
    setTopic(newTopic);
    onTopicChange(newTopic);
  };

  return (
    <div className="flex flex-col min-h-screen w-full max-w-7xl mx-auto relative p-2 sm:p-4 md:p-6">
      {/* Animated background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900/50 via-gray-800/30 to-gray-950/60 opacity-80 z-0" />
      
      {/* Header */}
      <div className="flex flex-col space-y-2 z-10 mb-2 sm:mb-6">
        {/* Title */}
        <div className="text-center mb-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-llama1 via-gray-200 to-llama2 bg-clip-text text-transparent">
            LLaMA Debate Arena
          </h1>
          <p className="text-sm sm:text-base text-gray-400 mt-2 max-w-2xl mx-auto">
            Watch AI language models engage in a structured debate on any topic.
          </p>
        </div>

        {/* Topic Input */}
        <div className="w-full space-y-2 relative group">
          <Label htmlFor="topic" className="text-base sm:text-lg font-bold flex items-center gap-2">
            Debate Topic
            <Sparkles className="h-4 w-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-all duration-300" />
          </Label>
          <Input
            id="topic"
            value={topic}
            onChange={handleTopicChange}
            placeholder="Enter a compelling topic for the debate..."
            className="bg-black/30 border-gray-700 backdrop-blur-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-all duration-300 text-base min-h-[2.5rem]"
            disabled={isActive}
          />
        </div>
        
        {/* Controls */}
        <div className="flex flex-wrap gap-2 justify-end">
          {!isActive ? (
            <Button
              onClick={startDebate}
              disabled={!topic.trim() || Object.keys(agents).length < 3}
              className="bg-gradient-to-r from-llama1 to-llama2 hover:opacity-90 text-white relative overflow-hidden group h-10 px-4 flex-1 sm:flex-initial min-w-[120px]"
            >
              <span className="absolute inset-0 w-full h-full bg-black/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></span>
              <Brain className="mr-2 h-4 w-4 animate-pulse group-disabled:animate-none" />
              Start Debate
            </Button>
          ) : (
            <Button
              onClick={stopDebate}
              className="bg-red-600 hover:bg-red-700 text-white relative overflow-hidden group h-10 px-4 flex-1 sm:flex-initial min-w-[120px]"
            >
              <span className="absolute inset-0 w-full h-full bg-black/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></span>
              Stop Debate
            </Button>
          )}
        </div>
      </div>
      
      {/* Agent Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-4 z-10">
        <AgentSelector
          role="llama1"
          onSelect={(agent) => handleAgentSelect('llama1', agent)}
          disabled={isActive}
          label="First Debater"
        />
        <AgentSelector
          role="llama2"
          onSelect={(agent) => handleAgentSelect('llama2', agent)}
          disabled={isActive}
          label="Second Debater"
        />
        <AgentSelector
          role="judge"
          onSelect={(agent) => handleAgentSelect('judge', agent)}
          disabled={isActive}
          label="Judge"
        />
      </div>
      
      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-white flex items-start gap-2 z-10 animate-fade-in">
          <Zap className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm text-gray-300">{error}</p>
          </div>
        </div>
      )}
      
      {/* Debate Arena */}
      <div className="flex-1 bg-debateBg rounded-lg border border-gray-800 overflow-scroll backdrop-blur-sm shadow-lg relative z-10 min-h-[400px] max-h-[600px] lg:max-h-[800px] flex flex-col">
        <div className="absolute inset-0 bg-gradient-to-br from-llama1/5 via-transparent to-llama2/5 opacity-50 pointer-events-none" />
        
        {messages.length === 0 && !isThinking ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8 text-center relative">
            <div className="max-w-md w-full">
              <h3 className="text-xl sm:text-2xl font-bold mb-4 bg-gradient-to-r from-llama1 via-amber-500 to-llama2 bg-clip-text text-transparent animate-pulse">
                LLM Debate Arena
              </h3>
              <div className="flex justify-center mb-4">
                <div className="relative w-12 sm:w-16 h-12 sm:h-16">
                  <div className="absolute inset-0 rounded-full bg-llama1/20 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-llama2/20 animate-ping animation-delay-500" />
                  <div className="absolute inset-4 rounded-full bg-amber-500/20 animate-ping animation-delay-1000" />
                  <MessageSquare className="absolute inset-0 m-auto h-6 sm:h-8 w-6 sm:w-8 text-white/80" />
                </div>
              </div>
              <p className="text-gray-400 text-sm sm:text-base mb-4">
                Enter a topic, select your debaters and judge, and watch the AI debate unfold.
              </p>
            </div>
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-y-auto">
            {virtualizer.getVirtualItems().length > 0 ? (
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const message = messages[virtualRow.index];
                  return (
                    <div
                      key={message.id}
                      className="absolute top-0 left-0 w-full"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <DebateMessage
                        message={message}
                        debater1Name={agents.llama1?.name || 'Debater 1'}
                        debater2Name={agents.llama2?.name || 'Debater 2'}
                        judgeName={agents.judge?.name || 'Judge'}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              isThinking && <div className="p-4 text-center">
                <p className="text-amber-400 animate-pulse">
                  {currentTurn ? `${agents[currentTurn]?.name || 'AI'} is thinking...` : 'Thinking...'}
                </p>
              </div>
            )}
            <div ref={messageEndRef} />
          </div>
        )}
      </div>
      
      {/* Footer - Debate Status */}
      {isActive && (
        <div className="mt-4 text-center z-10">
          <div className={cn(
            "text-sm inline-block py-1 px-3 rounded-full backdrop-blur-sm transition-all duration-300",
            currentTurn === 'llama1' ? "bg-llama1/10 border border-llama1/30 text-llama1" :
            currentTurn === 'llama2' ? "bg-llama2/10 border border-llama2/30 text-llama2" :
            "bg-amber-600/10 border border-amber-500/30 text-amber-400"
          )}>
            <span className="whitespace-nowrap">
              Round {currentRound + 1} • Current turn: {agents[currentTurn || '']?.name || 'AI'}
            </span>
          </div>
        </div>
      )}
      
      {/* Saved Debates */}
      {savedDebates.length > 0 && (
        <div className="mt-6 z-10">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Save className="h-4 w-4 text-gray-400" />
            Saved Debates
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {savedDebates.map((debate, index) => (
              <Card 
                key={index} 
                className="bg-black/20 border-gray-700 cursor-pointer hover:bg-black/30 backdrop-blur-sm transition-all duration-300 group"
              >
                <div className="p-3 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-llama1/5 to-llama2/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium truncate">{debate.topic}</h4>
                    <Share2 className="h-3.5 w-3.5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-gray-400">
                    {debate.date.toLocaleDateString()} • {debate.date.toLocaleTimeString()}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DebateArena;
