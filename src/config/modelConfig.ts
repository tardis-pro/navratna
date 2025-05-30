import { ServiceConfig } from '@/components/ModelSelector';

// Configuration for model services
export const modelServiceConfig: ServiceConfig = {
  llmStudio: {
    baseUrls: [
      'http://localhost:1234',
      'http://192.168.1.2:1234',
      // Add more LM Studio instances here
      // 'http://192.168.1.100:1234',
      // 'http://server2:1234',
    ],
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions'
  },
  ollama: {
    baseUrls: [
      // Add more Ollama instances here
      // 'http://localhost:11434',
      // 'http://192.168.1.101:11434',
    ],
    modelsPath: '/api/tags',
    generatePath: '/api/generate'
  }
};

// Environment-based configuration override
export const getModelServiceConfig = (): ServiceConfig => {
  // Check for environment variables to override default config
  const envConfig: ServiceConfig = { ...modelServiceConfig };

  // LM Studio base URLs from environment
  const llmStudioUrls = import.meta.env.VITE_LLM_STUDIO_URLS;
  if (llmStudioUrls) {
    envConfig.llmStudio.baseUrls = llmStudioUrls.split(',').map(url => url.trim());
  }

  // Ollama base URLs from environment
  const ollamaUrls = import.meta.env.VITE_OLLAMA_URLS;
  if (ollamaUrls) {
    envConfig.ollama.baseUrls = ollamaUrls.split(',').map(url => url.trim());
  }

  return envConfig;
};

// Helper function to validate URLs
export const validateServiceConfig = (config: ServiceConfig): boolean => {
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const allUrls = [
    ...config.llmStudio.baseUrls,
    ...config.ollama.baseUrls
  ];

  return allUrls.every(isValidUrl);
}; 