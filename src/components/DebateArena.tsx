
import React, { useState, useEffect, useRef } from 'react';
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
import ThinkingIndicator from "./ThinkingIndicator";
import ModelSelector, { MODEL_OPTIONS } from "./ModelSelector";
import { Brain, Save, Sparkles, Zap, MessageSquare, Download, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DebateMessage {
  id: string;
  model: 'llama1' | 'llama2';
  content: string;
  timestamp: Date;
  modelId: string;
}

const DebateArena = () => {
  const { toast } = useToast();
  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState('3');
  const [currentRound, setCurrentRound] = useState(0);
  const [isDebating, setIsDebating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [currentModel, setCurrentModel] = useState<'llama1' | 'llama2'>('llama1');
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [savedDebates, setSavedDebates] = useState<{topic: string, date: Date}[]>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const [model1, setModel1] = useState("ollama-llama3");
  const [model2, setModel2] = useState("llmstudio-llama2");
  const [error, setError] = useState<string | null>(null);

  // Real API integration with Ollama and LLM Studio
  const callModelAPI = async (modelSide: 'llama1' | 'llama2', prompt: string): Promise<string> => {
    try {
      setIsThinking(true);
      setError(null);
      
      const modelId = modelSide === 'llama1' ? model1 : model2;
      const selectedModel = MODEL_OPTIONS.find(m => m.id === modelId);
      
      if (!selectedModel) {
        throw new Error(`Model with ID ${modelId} not found`);
      }

      if (selectedModel.id.includes('ollama')) {
        // Call Ollama API
        const modelName = selectedModel.id === 'ollama-llama3' ? 'llama3' : 'mistral';
        
        const response = await fetch(selectedModel.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            prompt: prompt,
            stream: false,
            max_tokens: 500,
          }),
        });

        if (!response.ok) {
          throw new Error(`Error calling Ollama API: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || "No response generated.";
      } 
      else if (selectedModel.id.includes('llmstudio')) {
        // Call LLM Studio API
        const modelName = selectedModel.id === 'llmstudio-llama2' ? 'llama2' : 'mixtral';
        
        const response = await fetch(selectedModel.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt,
            model: modelName,
            max_tokens: 500,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          throw new Error(`Error calling LLM Studio API: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices && data.choices[0] && data.choices[0].text 
          ? data.choices[0].text 
          : "No response generated.";
      }
      
      throw new Error("Unknown model type");
    } 
    catch (error) {
      console.error("API call error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setError(errorMessage);
      return `[Error: ${errorMessage}. Please check that your local model is running correctly and try again.]`;
    } 
    finally {
      setIsThinking(false);
    }
  };

  const startDebate = async () => {
    if (!topic.trim()) {
      toast({
        title: "No Topic Provided",
        description: "Please enter a debate topic to begin.",
        variant: "destructive"
      });
      return;
    }
    
    // Reset the debate state
    setMessages([]);
    setCurrentRound(0);
    setCurrentModel('llama1');
    setIsDebating(true);
    setError(null);
    
    // Start with first message
    generateNextMessage('llama1');
  };

  const generateNextMessage = async (modelSide: 'llama1' | 'llama2') => {
    try {
      const prompt = constructPrompt(modelSide);
      const response = await callModelAPI(modelSide, prompt);
      
      const modelId = modelSide === 'llama1' ? model1 : model2;
      
      const newMessage: DebateMessage = {
        id: Date.now().toString(),
        model: modelSide,
        content: response,
        timestamp: new Date(),
        modelId
      };
      
      setMessages(prev => [...prev, newMessage]);
      
      // Determine the next step in the debate
      const totalRounds = parseInt(rounds);
      if (modelSide === 'llama2') {
        // After llama2 responds, increment the round counter
        const nextRound = currentRound + 1;
        setCurrentRound(nextRound);
        
        if (nextRound >= totalRounds) {
          // Debate is complete
          setIsDebating(false);
          toast({
            title: "Debate Complete",
            description: `The ${totalRounds} round debate on "${topic}" has concluded.`,
            className: "bg-gradient-to-r from-llama1/80 to-llama2/80 text-white font-medium border-none",
          });
        } else {
          // Continue to next round
          setCurrentModel('llama1');
          setTimeout(() => generateNextMessage('llama1'), 1000);
        }
      } else {
        // After llama1 responds, it's llama2's turn
        setCurrentModel('llama2');
        setTimeout(() => generateNextMessage('llama2'), 1000);
      }
    } catch (error) {
      console.error("Error generating response:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate a response. Please try again.",
        variant: "destructive"
      });
      setIsDebating(false);
    }
  };

  const constructPrompt = (modelSide: 'llama1' | 'llama2'): string => {
    let prompt = `You are participating in a debate on the topic: ${topic}.\n\n`;
    
    // Add system instruction for better responses
    prompt += `Instructions: Provide a reasoned, thoughtful argument. Be persuasive but respectful. Keep your response concise (100-200 words).\n\n`;
    
    // Add the conversation history
    if (messages.length > 0) {
      prompt += "Previous arguments:\n";
      messages.forEach(msg => {
        const modelName = MODEL_OPTIONS.find(m => m.id === msg.modelId)?.name || 'Unknown Model';
        prompt += `${modelName}: ${msg.content.trim()}\n\n`;
      });
    }
    
    // Add specific instructions based on which model's turn it is
    if (modelSide === 'llama1') {
      const modelName = MODEL_OPTIONS.find(m => m.id === model1)?.name || 'First Debater';
      prompt += `\nYou are ${modelName}. ${currentRound === 0 ? "Open the debate with your position on this topic." : "Respond to the previous argument and strengthen your position."}\n`;
    } else {
      const modelName = MODEL_OPTIONS.find(m => m.id === model2)?.name || 'Second Debater';
      prompt += `\nYou are ${modelName}. ${currentRound === 0 ? "Present a counterargument to the opening position." : "Challenge the previous argument and support your own position."}\n`;
    }
    
    return prompt;
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
    exportText += `# Rounds: ${currentRound}\n\n`;
    
    messages.forEach(msg => {
      const modelName = MODEL_OPTIONS.find(m => m.id === msg.modelId)?.name || 'Unknown Model';
      exportText += `## ${modelName} (${msg.timestamp.toLocaleTimeString()})\n\n`;
      exportText += `${msg.content.trim()}\n\n`;
    });
    
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debate-${topic.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Debate Exported",
      description: "Your debate has been downloaded as a text file.",
    });
  };

  // Auto-scroll to the bottom when new messages are added
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto relative">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/50 via-gray-800/30 to-gray-950/60 opacity-80 z-0 animate-[pulse_8s_ease-in-out_infinite]" />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 z-10">
        <div className="w-full space-y-2 relative group">
          <Label htmlFor="topic" className="text-lg font-bold flex items-center gap-2">
            Debate Topic
            <Sparkles className="h-4 w-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-all duration-300" />
          </Label>
          <Input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic for the debate..."
            className="bg-black/30 border-gray-700 backdrop-blur-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-all duration-300"
            disabled={isDebating}
          />
        </div>
        
        <div className="flex gap-4 items-end">
          <div className="w-24">
            <Label htmlFor="rounds" className="text-sm">Rounds</Label>
            <Select
              disabled={isDebating}
              value={rounds}
              onValueChange={setRounds}
            >
              <SelectTrigger className="bg-black/30 border-gray-700 backdrop-blur-sm">
                <SelectValue placeholder="Rounds" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700 backdrop-blur-xl">
                <SelectGroup>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={startDebate} 
            disabled={isDebating || !topic.trim()}
            className="bg-gradient-to-r from-llama1 to-llama2 hover:opacity-90 text-white relative overflow-hidden group"
          >
            <span className="absolute inset-0 w-full h-full bg-black/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></span>
            <Brain className="mr-2 h-4 w-4 animate-pulse" />
            Start Debate
          </Button>
          
          <Button
            variant="outline"
            onClick={saveDebate}
            disabled={messages.length === 0}
            className="border-gray-700 text-white hover:bg-gray-800 transition-colors duration-300"
          >
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          
          <Button
            variant="outline"
            onClick={exportDebateAsText}
            disabled={messages.length === 0}
            className="border-gray-700 text-white hover:bg-gray-800 transition-colors duration-300"
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>
      
      {/* Model Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 z-10">
        <ModelSelector 
          side="llama1" 
          selectedModel={model1} 
          onSelectModel={setModel1} 
          disabled={isDebating}
        />
        <ModelSelector 
          side="llama2" 
          selectedModel={model2} 
          onSelectModel={setModel2} 
          disabled={isDebating}
        />
      </div>
      
      {/* Connection Error Alert */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-white flex items-start gap-2 z-10 animate-fade-in">
          <Zap className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Connection Error</p>
            <p className="text-sm text-gray-300">{error}</p>
            <p className="text-xs text-gray-400 mt-1">Make sure your Ollama/LLM Studio servers are running and accessible.</p>
          </div>
        </div>
      )}
      
      {/* Debate Arena */}
      <div className="flex-1 bg-debateBg rounded-lg border border-gray-800 overflow-hidden backdrop-blur-sm shadow-lg relative z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-llama1/5 to-llama2/5 opacity-50" />
        
        {messages.length === 0 && !isThinking ? (
          <div className="h-full flex items-center justify-center p-8 text-center relative">
            <div className="max-w-md">
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-llama1 to-llama2 bg-clip-text text-transparent">
                LLaMA Debate Arena
              </h3>
              <div className="flex justify-center mb-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full bg-llama1/20 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-llama2/20 animate-ping animation-delay-500" />
                  <div className="absolute inset-4 rounded-full bg-amber-500/20 animate-ping animation-delay-1000" />
                  <MessageSquare className="absolute inset-0 m-auto h-8 w-8 text-white/80" />
                </div>
              </div>
              <p className="text-gray-400">
                Enter a topic above and watch as two AI models debate with each other.
                Select your models from the dropdown menus and start the debate.
              </p>
              <div className="mt-4 text-xs text-gray-500 bg-gray-800/50 p-2 rounded">
                Requires running instances of Ollama and/or LLM Studio on your local machine
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col overflow-y-auto p-4 relative">
            {messages.map((message) => (
              <DebateMessage 
                key={message.id} 
                message={message} 
              />
            ))}
            
            {isThinking && (
              <div className={`self-${currentModel === 'llama1' ? 'start' : 'end'} mb-4`}>
                <Card className={cn(
                  "max-w-md bg-gray-900/80 border-opacity-50 backdrop-blur-sm",
                  currentModel === 'llama1' ? "border-llama1/50" : "border-llama2/50"
                )}>
                  <div className="p-4">
                    <div className="flex items-center">
                      <div className={cn(
                        "font-semibold",
                        currentModel === 'llama1' ? "text-llama1" : "text-llama2"
                      )}>
                        {MODEL_OPTIONS.find(m => m.id === (currentModel === 'llama1' ? model1 : model2))?.name || 'AI'} is thinking
                      </div>
                      <ThinkingIndicator />
                    </div>
                  </div>
                </Card>
              </div>
            )}
            
            <div ref={messageEndRef} />
          </div>
        )}
      </div>
      
      {/* Footer - Debate Status */}
      {isDebating && (
        <div className="mt-4 text-center z-10">
          <div className={cn(
            "text-sm inline-block py-1 px-3 rounded-full backdrop-blur-sm transition-all duration-300",
            currentModel === 'llama1' 
              ? "bg-llama1/10 border border-llama1/30 text-llama1"
              : "bg-llama2/10 border border-llama2/30 text-llama2"
          )}>
            Round {currentRound + 1} of {rounds} • 
            Current turn: <span className="font-semibold">
              {MODEL_OPTIONS.find(m => m.id === (currentModel === 'llama1' ? model1 : model2))?.name || 'AI'}
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
