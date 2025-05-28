# Model Service Configuration

This directory contains configuration for connecting to multiple LM Studio and Ollama instances.

## Configuration Options

### Static Configuration

Edit `modelConfig.ts` to add base URLs directly:

```typescript
export const modelServiceConfig: ServiceConfig = {
  llmStudio: {
    baseUrls: [
      'http://localhost:1234',
      'http://192.168.1.100:1234',
      'http://server2:1234',
    ],
    // ... other options
  },
  ollama: {
    baseUrls: [
      'http://192.168.1.3:11434',
      'http://localhost:11434',
      'http://192.168.1.101:11434',
    ],
    // ... other options
  }
};
```

### Environment Variables

You can also configure base URLs using environment variables:

```bash
# LM Studio instances (comma-separated)
VITE_LLM_STUDIO_URLS=http://localhost:1234,http://192.168.1.100:1234,http://server2:1234

# Ollama instances (comma-separated)
VITE_OLLAMA_URLS=http://192.168.1.3:11434,http://localhost:11434,http://192.168.1.101:11434
```

### Example Configurations

#### Development (Local Only)
```bash
VITE_LLM_STUDIO_URLS=http://localhost:1234
VITE_OLLAMA_URLS=http://localhost:11434
```

#### Production (Multiple Servers)
```bash
VITE_LLM_STUDIO_URLS=http://llm-server1:1234,http://llm-server2:1234
VITE_OLLAMA_URLS=http://ollama-server1:11434,http://ollama-server2:11434
```

## Features

- **Multiple Base URLs**: Connect to multiple instances of each service type
- **Automatic Discovery**: Models from all configured instances are automatically discovered
- **Error Resilience**: Failed connections to individual instances don't prevent others from working
- **Source Tracking**: Models are grouped by their source instance in the UI
- **Conflict Resolution**: Model IDs are prefixed with base URL to avoid naming conflicts

## Usage

The configuration is automatically loaded when calling `getModels()`:

```typescript
import { getModels } from '@/components/ModelSelector';

// Uses default configuration
const models = await getModels();

// Or provide custom configuration
const customConfig = { /* ... */ };
const models = await getModels(customConfig);
``` 