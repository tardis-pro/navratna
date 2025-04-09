
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
import { Brain, Save } from "lucide-react";

interface DebateMessage {
  id: string;
  model: 'llama1' | 'llama2';
  content: string;
  timestamp: Date;
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

  // Mock function to simulate API calls to LLaMA endpoints
  const callLlamaAPI = async (model: 'llama1' | 'llama2', prompt: string): Promise<string> => {
    // In a real app, you would make actual API calls to your LLaMA endpoints
    setIsThinking(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
    
    const responses = {
      llama1: [
        "I believe this is a complex issue that requires careful consideration of multiple perspectives.",
        "Looking at the historical data, we can observe several patterns that support my position.",
        "While I understand the opposing viewpoint, the evidence suggests a different conclusion.",
        "Analyzing this from an ethical framework, we must consider the long-term implications.",
        "The fundamental principles at stake here cannot be compromised for short-term gains.",
      ],
      llama2: [
        "Let me challenge that assumption with concrete examples from recent research.",
        "That perspective overlooks several critical factors that I'll outline now.",
        "I'd argue that we need to completely reframe how we're approaching this problem.",
        "The logical conclusion of your argument leads to outcomes that are demonstrably problematic.",
        "When we examine real-world applications, we find that theory often differs from practice.",
      ]
    };
    
    // Get a somewhat contextual response based on the topic and previous messages
    const modelResponses = responses[model];
    const responseIndex = currentRound % modelResponses.length;
    let response = modelResponses[responseIndex];
    
    // Add some contextual elements based on the topic
    response = response.replace("this issue", `the topic of ${topic}`);
    
    // If there are previous messages, reference them
    if (messages.length > 0) {
      const lastOpponentMessage = messages.filter(m => m.model !== model).pop();
      if (lastOpponentMessage) {
        response += ` In response to the point about "${lastOpponentMessage.content.split(' ').slice(0, 5).join(' ')}...", I would counter that this perspective fails to account for the nuanced reality of ${topic}.`;
      }
    }
    
    setIsThinking(false);
    return response;
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
    
    // Simulate the first message
    generateNextMessage('llama1');
  };

  const generateNextMessage = async (model: 'llama1' | 'llama2') => {
    try {
      const prompt = constructPrompt(model);
      const response = await callLlamaAPI(model, prompt);
      
      const newMessage: DebateMessage = {
        id: Date.now().toString(),
        model,
        content: response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, newMessage]);
      
      // Determine the next step in the debate
      const totalRounds = parseInt(rounds);
      if (model === 'llama2') {
        // After llama2 responds, increment the round counter
        const nextRound = currentRound + 1;
        setCurrentRound(nextRound);
        
        if (nextRound >= totalRounds) {
          // Debate is complete
          setIsDebating(false);
          toast({
            title: "Debate Complete",
            description: `The ${totalRounds} round debate on "${topic}" has concluded.`
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
        description: "Failed to generate a response. Please try again.",
        variant: "destructive"
      });
      setIsDebating(false);
    }
  };

  const constructPrompt = (model: 'llama1' | 'llama2'): string => {
    // In a real implementation, you would craft specific prompts for each model
    // based on the debate context
    let prompt = `Debate on the topic: ${topic}.\n\n`;
    
    // Add the conversation history
    if (messages.length > 0) {
      prompt += "Previous arguments:\n";
      messages.forEach(msg => {
        prompt += `${msg.model === 'llama1' ? 'Llama Model 1' : 'Llama Model 2'}: ${msg.content}\n`;
      });
    }
    
    // Add specific instructions based on which model's turn it is
    if (model === 'llama1') {
      prompt += `\nYou are Llama Model 1. Provide your perspective on this topic.`;
      if (currentRound > 0) {
        prompt += ` Respond to the previous argument from Llama Model 2.`;
      }
    } else {
      prompt += `\nYou are Llama Model 2. Challenge the perspective presented by Llama Model 1.`;
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
        description: `Your debate on "${topic}" has been saved.`
      });
    }
  };

  // Auto-scroll to the bottom when new messages are added
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="w-full space-y-2">
          <Label htmlFor="topic" className="text-lg font-bold">Debate Topic</Label>
          <Input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic for the debate..."
            className="bg-black/20 border-gray-700"
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
              <SelectTrigger className="bg-black/20 border-gray-700">
                <SelectValue placeholder="Rounds" />
              </SelectTrigger>
              <SelectContent>
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
            className="bg-gradient-to-r from-llama1 to-llama2 hover:opacity-90 text-white"
          >
            <Brain className="mr-2 h-4 w-4" />
            Start Debate
          </Button>
          
          <Button
            variant="outline"
            onClick={saveDebate}
            disabled={messages.length === 0}
            className="border-gray-700 text-white hover:bg-gray-800"
          >
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
      
      {/* Debate Arena */}
      <div className="flex-1 bg-debateBg rounded-lg border border-gray-800 overflow-hidden">
        {messages.length === 0 && !isThinking ? (
          <div className="h-full flex items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-llama1 to-llama2 bg-clip-text text-transparent">
                LLaMA Debate Arena
              </h3>
              <p className="text-gray-400">
                Enter a topic above and watch as two LLaMA models debate with each other.
                Each model will take turns presenting arguments based on the chosen topic.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col overflow-y-auto p-4">
            {messages.map((message) => (
              <DebateMessage 
                key={message.id} 
                message={message} 
              />
            ))}
            
            {isThinking && (
              <div className={`self-${currentModel === 'llama1' ? 'start' : 'end'} mb-4`}>
                <Card className={`max-w-md bg-gray-900/80 border-${currentModel} border-opacity-50`}>
                  <div className="p-4">
                    <div className="flex items-center">
                      <div className={`text-${currentModel} font-semibold`}>
                        {currentModel === 'llama1' ? 'LLaMA Model 1' : 'LLaMA Model 2'} is thinking
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
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-400">
            Round {currentRound + 1} of {rounds} • 
            Current turn: <span className={`text-${currentModel} font-semibold`}>
              {currentModel === 'llama1' ? 'LLaMA Model 1' : 'LLaMA Model 2'}
            </span>
          </p>
        </div>
      )}
      
      {/* Saved Debates */}
      {savedDebates.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Saved Debates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {savedDebates.map((debate, index) => (
              <Card key={index} className="bg-black/20 border-gray-700 cursor-pointer hover:bg-black/30">
                <div className="p-3">
                  <h4 className="font-medium truncate">{debate.topic}</h4>
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
