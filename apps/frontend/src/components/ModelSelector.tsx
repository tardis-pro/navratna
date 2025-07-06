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
import { getModelServiceConfig } from "@/config/modelConfig";

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  source?: string;
  apiEndpoint?: string;
  apiType?: 'llmstudio' | 'ollama';
}

export interface ServiceConfig {
  llmStudio: {
    baseUrls: string[];
    modelsPath?: string;
    chatPath?: string;
  };
  ollama: {
    baseUrls: string[];
    modelsPath?: string;
    generatePath?: string;
  };
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


// Helper function to create a short server identifier
const getServerIdentifier = (baseUrl: string): string => {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname;
    const port = url.port;
    
    // If it's localhost, use port to differentiate
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return port ? `:${port}` : ':80';
    }
    
    // For IP addresses, use last octet + port
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      const lastOctet = hostname.split('.').pop();
      return port ? `.${lastOctet}:${port}` : `.${lastOctet}`;
    }
    
    // For hostnames, use first part + port
    const hostPart = hostname.split('.')[0];
    return port ? `${hostPart}:${port}` : hostPart;
  } catch {
    // Fallback: use last part of URL
    return baseUrl.split('/').pop() || baseUrl.substring(0, 10);
  }
};

// Helper function to get display name with server info
const getModelDisplayName = (model: ModelOption): string => {
  if (!model.source) return model.name;
  
  const serverInfo = getServerIdentifier(model.source);
  return `${model.name} (${serverInfo})`;
};

// Helper function to get group label with cleaner server info
const getGroupLabel = (apiType: string, source: string): string => {
  const serviceType = apiType === 'ollama' ? 'Ollama' : 'LLM Studio';
  const serverInfo = getServerIdentifier(source);
  return `${serviceType} ${serverInfo}`;
};

// Helper function to extract just the model name from a server-prefixed ID
export const extractModelName = (modelId: string): string => {
  // If it's a server-prefixed ID (contains ":"), extract the part after the last ":"
  if (modelId.includes(':')) {
    const parts = modelId.split(':');
    return parts[parts.length - 1];
  }
  return modelId;
};

// Helper function to find a model by name (without server prefix)
export const findModelByName = (allModels: ModelOption[], modelName: string): ModelOption | undefined => {
  return allModels.find(model => extractModelName(model.id) === modelName);
};

// Helper function to find all models with a specific name across all servers
export const findModelsByName = (allModels: ModelOption[], modelName: string): ModelOption[] => {
  return allModels.filter(model => extractModelName(model.id) === modelName);
};

// Helper function to get model info from a server-prefixed ID
export const getModelInfo = (modelId: string): { serverUrl: string | null; modelName: string } => {
  if (modelId.includes(':')) {
    const lastColonIndex = modelId.lastIndexOf(':');
    const serverUrl = modelId.substring(0, lastColonIndex);
    const modelName = modelId.substring(lastColonIndex + 1);
    return { serverUrl, modelName };
  }
  return { serverUrl: null, modelName: modelId };
};

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

  // Find the selected model to show its display name
  const selectedModelObj = allModels.find(model => model.id === selectedModel);

  // Group models by API type and source
  const groupedModels = allModels.reduce((acc, model) => {
    const sourceId = model.source || `fallback-${model.id || Math.random().toString(36).substr(2, 9)}`;
    const key = `${model.apiType}-${sourceId}`;
    if (!acc[key]) {
      acc[key] = {
        apiType: model.apiType,
        source: model.source || 'Unknown Source',
        models: []
      };
    }
    acc[key].models.push(model);
    return acc;
  }, {} as Record<string, { apiType: string; source: string; models: ModelOption[] }>);

  const borderClass =
    side === 'llama1' ? 'border-llama1/50 focus-within:border-llama1' :
    side === 'llama2' ? 'border-llama2/50 focus-within:border-llama2' :
    'border-amber-500/50 focus-within:border-amber-500';

  const gradientClass =
    side === 'llama1' ? 'from-llama1/10' :
    side === 'llama2' ? 'from-llama2/10' :
    'from-amber-600/10';

  const handleModelChange = (modelId: string) => {
    onSelectModel(modelId);
  };

  const handleApiTypeChange = (value: string) => {
    // Implementation of handleApiTypeChange
  };

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
        onValueChange={handleModelChange}
        disabled={disabled || allModels.length === 0}
      >
        <SelectTrigger id={`${side}-model-select`} className="w-full bg-black/30 border-gray-700 focus:ring-offset-0 focus:ring-transparent z-10 relative">
          <SelectValue placeholder={allModels.length === 0 ? "No models found" : "Select a model..."}>
            {selectedModelObj ? getModelDisplayName(selectedModelObj) : ""}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-gray-900 border-gray-700 backdrop-blur-xl max-h-60 overflow-y-auto z-50">
          {Object.entries(groupedModels).map(([key, group]) => (
            <SelectGroup key={key}>
              <SelectLabel className="text-gray-400">
                {getGroupLabel(group.apiType, group.source)}
              </SelectLabel>
              {group.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {getModelDisplayName(model)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
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
