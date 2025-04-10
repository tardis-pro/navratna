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

// Define the DebateMessageData type here to match DebateMessage's expectations
interface DebateMessageData {
  id: string;
  role: 'llama1' | 'llama2' | 'judge';
  content: string;
  timestamp: Date;
  modelId: string;
  apiType: 'ollama' | 'llmstudio';
}

const DebateArena = () => {
  const { toast } = useToast();
  const messageEndRef = useRef<HTMLDivElement>(null);
  
  // State management
  const [topic, setTopic] = useState<string>('');
  const [rounds, setRounds] = useState<string>('3');
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [currentTurn, setCurrentTurn] = useState<'llama1' | 'llama2' | 'judge'>('llama1');
  const [messages, setMessages] = useState<DebateMessageData[]>([]);
  const [isDebating, setIsDebating] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isJudgeThinking, setIsJudgeThinking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [model1, setModel1] = useState<string | undefined>(undefined);
  const [model2, setModel2] = useState<string | undefined>(undefined);
  const [judgeModel, setJudgeModel] = useState<string | undefined>(undefined);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [savedDebates, setSavedDebates] = useState<{topic: string, date: Date}[]>([]);

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
  
  // Optimize message generation with useCallback
  const generateNextMessage = useCallback(async (role: 'llama1' | 'llama2' | 'judge') => {
    try {
      setIsThinking(role === 'llama1' || role === 'llama2');
      setIsJudgeThinking(role === 'judge');
      
      // Add retry logic
      const maxRetries = 3;
      let retryCount = 0;
      let success = false;
      
      while (retryCount < maxRetries && !success) {
        try {
          const prompt = role === 'judge' 
            ? buildJudgePrompt() 
            : buildLlamaPrompt(role);
          
          const response = await callModelAPI(role, prompt);
          
          if (response) {
            const modelForRole = role === 'llama1' ? model1 : role === 'llama2' ? model2 : judgeModel;
            const selectedModel = allModels.find(m => m.id === modelForRole);
            const apiType = selectedModel?.apiType === 'ollama' ? 'ollama' : 'llmstudio';
            
            const newMessage: DebateMessageData = {
              id: Date.now().toString(),
              role,
              content: response,
              timestamp: new Date(),
              modelId: modelForRole || '',
              apiType
            };
            
            setMessages(prev => [...prev, newMessage]);
            success = true;
            
            // After message is added, progress to next turn
            if (role !== 'judge') {
              const nextRole = role === 'llama1' ? 'llama2' : 'llama1';
              
              // If we've completed a round (both llama1 and llama2 have spoken)
              const isRoundComplete = role === 'llama2';
              
              if (isRoundComplete) {
                // Move to the next round
                const nextRound = currentRound + 1;
                setCurrentRound(nextRound);
                
                // If we've completed all rounds, it's time for the judge
                if (nextRound >= parseInt(rounds)) {
                  setCurrentTurn('judge');
                  // Generate judge's evaluation
                  setTimeout(() => generateNextMessage('judge'), 500);
                } else {
                  // Otherwise, start the next round with llama1
                  setCurrentTurn('llama1');
                  // Automatically generate llama1's next message
                  setTimeout(() => generateNextMessage('llama1'), 500);
                }
              } else {
                // Move to the next debater's turn
                setCurrentTurn(nextRole);
                // Automatically generate the next debater's message
                setTimeout(() => generateNextMessage(nextRole), 500);
              }
            } else {
              // Judge has spoken, debate is over
              setIsDebating(false);
            }
          }
        } catch (err) {
          retryCount++;
          if (retryCount === maxRetries) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to generate a response");
      setIsDebating(false);
    } finally {
      setIsThinking(false);
      setIsJudgeThinking(false);
    }
  }, [buildLlamaPrompt, buildJudgePrompt, model1, model2, judgeModel, allModels, currentRound, rounds]);

  const callModelAPI = async (modelRole: 'llama1' | 'llama2' | 'judge', prompt: string): Promise<string> => {
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

        // Race between fetch and timeout
        const response = await Promise.race([fetchPromise, timeout]) as Response;

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
            max_tokens: 50,
            temperature: 0.7,
            stream: false,
          }),
        });

        // Race between fetch and timeout
        const response = await Promise.race([fetchPromise, timeout]) as Response;

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

      // Basic validation of response
      if (responseContent.toLowerCase().includes("error") || responseContent.length < 10) {
        console.warn(`Potentially problematic response received from ${modelId}: ${responseContent}`);
        throw new Error(`Invalid response received from ${getModelName(modelId)}`);
      }

      return responseContent;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown API error";
      console.error(`API call error for ${modelRole} (${modelId}):`, errorMessage);
      
      // Add specific error message depending on the type of error
      const userFacingError = error instanceof Error && error.message.includes('timeout') 
        ? `Timeout while waiting for response from ${getModelName(modelId)}. Please check your network connection and try again.`
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
    if (!model1 || !model2 || !judgeModel) {
      toast({ 
        title: "Models Not Selected", 
        description: "Please select models for both debaters and the judge.", 
        variant: "destructive" 
      });
      return;
    }

    try {
      // Reset the debate state
      setMessages([]);
      setCurrentRound(0);
      setCurrentTurn('llama1');
      setIsDebating(true);
      setError(null);
      setIsThinking(false);
      setIsJudgeThinking(false);

      // Add a slight delay to allow state to update before starting
      setTimeout(() => {
        // Start the debate with the first debater (llama1)
        generateNextMessage('llama1');
      }, 100);
    } catch (error) {
      console.error("Failed to start debate:", error);
      setIsDebating(false);
      toast({
        title: "Failed to Start Debate",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    }
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
            Watch two AI language models engage in a structured debate on any topic. Enter a subject and
            see how different LLaMA models approach the same conversation.
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
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a compelling topic for the debate..."
            className="bg-black/30 border-gray-700 backdrop-blur-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-all duration-300 text-base min-h-[2.5rem]"
            disabled={isDebating}
          />
        </div>
        
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <div className="w-full sm:w-24 flex-shrink-0">
            <Label htmlFor="rounds" className="text-xs font-medium text-gray-400 block mb-1">Rounds</Label>
            <Select
              disabled={isDebating}
              value={rounds}
              onValueChange={setRounds}
            >
              <SelectTrigger id="rounds" className="bg-black/30 border-gray-700 backdrop-blur-sm h-10 w-full">
                <SelectValue placeholder="Rounds" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700 backdrop-blur-xl">
                <SelectGroup>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex flex-wrap gap-2 flex-1 justify-start sm:justify-end">
            <Button
              onClick={startDebate}
              disabled={isDebating || !topic.trim() || !model1 || !model2 || !judgeModel}
              className="bg-gradient-to-r from-llama1 to-llama2 hover:opacity-90 text-white relative overflow-hidden group h-10 px-4 flex-1 sm:flex-initial min-w-[120px]"
            >
              <span className="absolute inset-0 w-full h-full bg-black/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></span>
              <Brain className="mr-2 h-4 w-4 animate-pulse group-disabled:animate-none" />
              {isDebating ? 'Debating...' : 'Start Debate'}
            </Button>
            
            <Button
              variant="outline"
              onClick={saveDebate}
              disabled={messages.length === 0 || isDebating}
              className="border-gray-700 text-white hover:bg-gray-800 transition-colors duration-300 h-10 px-3 flex-1 sm:flex-initial min-w-[100px]"
              title="Save Debate"
            >
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
            
            <Button
              variant="outline"
              onClick={exportDebateAsText}
              disabled={messages.length === 0}
              className="border-gray-700 text-white hover:bg-gray-800 transition-colors duration-300 h-10 px-3 flex-1 sm:flex-initial min-w-[100px]"
              title="Export as Text"
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>
      
      {/* Model Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-4 z-10">
        <ModelSelector
          side="llama1"
          selectedModel={model1}
          onSelectModel={setModel1}
          disabled={isDebating}
          allModels={allModels}
          className="min-h-[60px]"
        />
        <ModelSelector
          side="llama2"
          selectedModel={model2}
          onSelectModel={setModel2}
          disabled={isDebating}
          allModels={allModels}
          className="min-h-[60px]"
        />
        <ModelSelector
          side="judge"
          label="Judge"
          icon={Scale}
          selectedModel={judgeModel}
          onSelectModel={setJudgeModel}
          disabled={isDebating}
          allModels={allModels}
          className="col-span-1 sm:col-span-2 lg:col-span-1 min-h-[60px]"
        />
      </div>
      
      {/* Connection Error Alert */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-white flex items-start gap-2 z-10 animate-fade-in">
          <Zap className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">API Error</p>
            <p className="text-sm text-gray-300">{error}</p>
            <p className="text-xs text-gray-400 mt-1">Check server status, model selection, and API endpoints.</p>
          </div>
        </div>
      )}
      
      {/* Debate Arena */}
      <div className="flex-1 bg-debateBg rounded-lg border border-gray-800 overflow-hidden backdrop-blur-sm shadow-lg relative z-10 min-h-[400px] max-h-[2600px] lg:max-h-[1800px] flex flex-col">
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
              {allModels.length === 0 && !error && (
                 <div className="flex items-center justify-center space-x-2 text-amber-400">
                   <div className="animate-spin h-4 w-4 border-2 border-amber-400 rounded-full border-t-transparent"></div>
                   <p className="text-sm">Fetching available models...</p>
                 </div>
              )}
              {allModels.length === 0 && error && (
                 <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-red-400 text-sm">
                   Could not fetch models. {error}
                 </div>
              )}
               {allModels.length > 0 && (
                 <div className="mt-4 text-xs bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-green-400">
                    Models loaded successfully! Ready to start the debate.
                 </div>
               )}
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
                        debater1Name={getModelName(model1)}
                        debater2Name={getModelName(model2)}
                        judgeName={getModelName(judgeModel)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              isThinking && <div className="p-4 text-center">
                <p className="text-amber-400 animate-pulse">
                  {thinkingActorName ? `${thinkingActorName} is thinking...` : 'Thinking...'}
                </p>
              </div>
            )}
            <div ref={messageEndRef} />
          </div>
        )}
      </div>
      
      {/* Footer - Debate Status */}
      {(isDebating || isThinking) && (
        <div className="mt-4 text-center z-10">
          <div className={cn(
            "text-sm inline-block py-1 px-3 rounded-full backdrop-blur-sm transition-all duration-300",
            currentTurn === 'llama1' ? "bg-llama1/10 border border-llama1/30 text-llama1" :
            currentTurn === 'llama2' ? "bg-llama2/10 border border-llama2/30 text-llama2" :
            "bg-amber-600/10 border border-amber-500/30 text-amber-400"
          )}>
             <span className="whitespace-nowrap">
               {isDebating ? `Round ${currentRound + 1} of ${rounds} • ` : 'Processing... • '}
               Current turn: <span className="font-semibold">
                  {currentTurn === 'llama1' ? getModelName(model1) :
                   currentTurn === 'llama2' ? getModelName(model2) :
                   getModelName(judgeModel)} ({currentTurn})
               </span>
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
