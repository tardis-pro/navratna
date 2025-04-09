
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
import { Brain } from "lucide-react";

export type ModelOption = {
  id: string;
  name: string;
  description: string;
};

interface ModelSelectorProps {
  side: 'llama1' | 'llama2';
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "llama-3-8b",
    name: "LLaMA 3 (8B)",
    description: "Smaller, faster model with good performance",
  },
  {
    id: "llama-3-70b",
    name: "LLaMA 3 (70B)",
    description: "Balanced size and performance",
  },
  {
    id: "llama-3-405b",
    name: "LLaMA 3 (405B)",
    description: "Largest and most capable model",
  },
  {
    id: "llama-2-70b",
    name: "LLaMA 2 (70B)",
    description: "Previous generation model",
  },
];

const ModelSelector = ({ side, selectedModel, onSelectModel, disabled = false }: ModelSelectorProps) => {
  const sideColor = side === 'llama1' ? 'text-llama1' : 'text-llama2';
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Brain className={`h-4 w-4 ${sideColor}`} />
        <Label className={`font-semibold ${sideColor}`}>
          {side === 'llama1' ? 'First Debater' : 'Second Debater'}
        </Label>
      </div>
      
      <Select
        value={selectedModel}
        onValueChange={onSelectModel}
        disabled={disabled}
      >
        <SelectTrigger className={`w-full bg-black/20 border-${side} border-opacity-50`}>
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent className="bg-gray-900 border-gray-700">
          <SelectGroup>
            {MODEL_OPTIONS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex flex-col">
                  <span>{model.name}</span>
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
