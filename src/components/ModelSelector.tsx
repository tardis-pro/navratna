
import React from 'react';
import { 
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Brain, Sparkles, Zap } from "lucide-react";

export type ModelOption = {
  id: string;
  name: string;
  description: string;
  apiEndpoint: string;
};

interface ModelSelectorProps {
  side: 'llama1' | 'llama2';
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "ollama-llama3",
    name: "Ollama - LLaMA 3",
    description: "Local LLaMA 3 via Ollama",
    apiEndpoint: "http://localhost:11434/api/generate",
  },
  {
    id: "ollama-mistral",
    name: "Ollama - Mistral",
    description: "Local Mistral model via Ollama",
    apiEndpoint: "http://localhost:11434/api/generate",
  },
  {
    id: "llmstudio-llama2",
    name: "LLM Studio - LLaMA 2",
    description: "Local LLaMA 2 via LLM Studio",
    apiEndpoint: "http://localhost:8000/v1/completions",
  },
  {
    id: "llmstudio-mixtral",
    name: "LLM Studio - Mixtral",
    description: "Local Mixtral model via LLM Studio", 
    apiEndpoint: "http://localhost:8000/v1/completions",
  },
];

const ModelSelector = ({ side, selectedModel, onSelectModel, disabled = false }: ModelSelectorProps) => {
  const sideColor = side === 'llama1' ? 'text-llama1' : 'text-llama2';
  
  return (
    <div className="space-y-2 relative group">
      <div className="flex items-center gap-2">
        <Brain className={`h-4 w-4 ${sideColor} group-hover:animate-pulse transition-all duration-300`} />
        <Label className={`font-semibold ${sideColor}`}>
          {side === 'llama1' ? 'First Debater' : 'Second Debater'}
        </Label>
        <Sparkles className={`h-3 w-3 ${sideColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
      </div>
      
      <Select
        value={selectedModel}
        onValueChange={onSelectModel}
        disabled={disabled}
      >
        <SelectTrigger className={`w-full bg-black/20 border-${side} border-opacity-50 group-hover:border-opacity-100 transition-all duration-300`}>
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent className="bg-gray-900 border-gray-700 backdrop-blur-xl">
          <SelectGroup>
            {MODEL_OPTIONS.map((model) => (
              <SelectItem 
                key={model.id} 
                value={model.id}
                className="hover:bg-gray-800 transition-colors duration-200"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span>{model.name}</span>
                    {model.id.includes('ollama') && <Zap className="h-3 w-3 text-amber-400" />}
                  </div>
                  <span className="text-xs text-gray-400">{model.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};

export default ModelSelector;
