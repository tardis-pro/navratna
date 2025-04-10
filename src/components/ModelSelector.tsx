import React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Brain, Sparkles, Zap, Cpu, Server, LucideIcon, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  apiEndpoint: string;
  apiType: 'ollama' | 'llmstudio';
}

interface ModelSelectorProps {
  side: 'llama1' | 'llama2' | 'judge';
  selectedModel?: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
  allModels: ModelOption[];
  label?: string;
  icon?: LucideIcon;
  className?: string;
}

export const getModels = async (): Promise<ModelOption[]> => {
  const llmStudioModelsEndpoint = 'http://192.168.1.8:1234/v1/models';
  const llmStudioApiEndpoint = 'http://192.168.1.8:1234/v1/chat/completions';
  const ollamaModelsEndpoint = 'http://192.168.1.3:11434/api/tags';
  const ollamaApiEndpoint = 'http://192.168.1.3:11434/api/generate';

  let fetchedModels: ModelOption[] = [];

  try {
    const llmStudioResponse = await fetch(llmStudioModelsEndpoint);
    if (llmStudioResponse.ok) {
      const llmStudioData = await llmStudioResponse.json();
      if (llmStudioData.data && Array.isArray(llmStudioData.data)) {
        const llmStudioModels = llmStudioData.data.map((model: any) => ({
          id: model.id,
          name: model.id,
          description: `LLM Studio - ${model.id}`,
          apiEndpoint: llmStudioApiEndpoint,
          apiType: 'llmstudio' as const,
        }));
        fetchedModels = fetchedModels.concat(llmStudioModels);
      } else {
        console.warn("LLM Studio models response format unexpected:", llmStudioData);
      }
    } else {
      console.warn(`Failed to fetch models from LLM Studio: ${llmStudioResponse.statusText}`);
    }
  } catch (error) {
    console.error("Error fetching LLM Studio models:", error);
  }

  try {
    const ollamaResponse = await fetch(ollamaModelsEndpoint);
    if (ollamaResponse.ok) {
      const ollamaData = await ollamaResponse.json();
       if (ollamaData.models && Array.isArray(ollamaData.models)) {
         const ollamaModels = ollamaData.models.map((model: any) => ({
          id: model.name,
          name: model.name,
          description: `Ollama - ${model.name}`,
          apiEndpoint: ollamaApiEndpoint,
          apiType: 'ollama' as const,
        }));
        fetchedModels = fetchedModels.concat(ollamaModels);
       } else {
         console.warn("Ollama models response format unexpected:", ollamaData);
       }
    } else {
      console.warn(`Failed to fetch models from Ollama: ${ollamaResponse.statusText}`);
    }
  } catch (error) {
    console.error("Error fetching Ollama models:", error);
  }
  
  return fetchedModels;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  side,
  selectedModel,
  onSelectModel,
  disabled = false,
  allModels,
  label,
  icon: IconComponent,
  className
}) => {
  const defaultLabel = side === 'llama1' ? 'Debater 1' : side === 'llama2' ? 'Debater 2' : 'Judge';
  const displayLabel = label || defaultLabel;
  const DefaultIcon = side === 'llama1' ? Cpu : side === 'llama2' ? Server : Scale;
  const Icon = IconComponent || DefaultIcon;

  const ollamaModels = allModels.filter(m => m.apiType === 'ollama');
  const llmStudioModels = allModels.filter(m => m.apiType === 'llmstudio');

  const borderClass =
    side === 'llama1' ? 'border-llama1/50 focus-within:border-llama1' :
    side === 'llama2' ? 'border-llama2/50 focus-within:border-llama2' :
    'border-amber-500/50 focus-within:border-amber-500';

  const gradientClass =
    side === 'llama1' ? 'from-llama1/10' :
    side === 'llama2' ? 'from-llama2/10' :
    'from-amber-600/10';

  return (
    <div className={cn(`relative p-4 rounded-lg border bg-black/20 backdrop-blur-sm transition-all duration-300 ${borderClass}`, className)}>
      <div className={`absolute inset-0 rounded-lg bg-gradient-to-r ${gradientClass} to-transparent opacity-50 pointer-events-none`} />
      <Label htmlFor={`${side}-model-select`} className="flex items-center text-sm font-medium mb-2 z-10 relative">
        <Icon className={cn("mr-2 h-4 w-4",
           side === 'llama1' ? 'text-llama1' : side === 'llama2' ? 'text-llama2' : 'text-amber-400'
        )} />
        {displayLabel}
      </Label>
      <Select
        value={selectedModel || ""}
        onValueChange={onSelectModel}
        disabled={disabled || allModels.length === 0}
      >
        <SelectTrigger id={`${side}-model-select`} className="w-full bg-black/30 border-gray-700 focus:ring-offset-0 focus:ring-transparent z-10 relative">
          <SelectValue placeholder={allModels.length === 0 ? "No models found" : "Select a model..."} />
        </SelectTrigger>
        <SelectContent className="bg-gray-900 border-gray-700 backdrop-blur-xl max-h-60 overflow-y-auto z-50">
          {ollamaModels.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-gray-400">Ollama Models</SelectLabel>
              {ollamaModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {llmStudioModels.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-gray-400">LLM Studio Models</SelectLabel>
              {llmStudioModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
           {allModels.length === 0 && (
             <div className="p-4 text-center text-gray-500 text-sm">
                No models discovered. Ensure servers are running.
             </div>
           )}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ModelSelector;
