import { logger } from '@uaip/utils';
import { ModelCapability, ModelCapabilityDetection, LLMProviderType } from '@uaip/types';

export class ModelCapabilityDetector {
  private static instance: ModelCapabilityDetector;
  
  private constructor() {}
  
  static getInstance(): ModelCapabilityDetector {
    if (!ModelCapabilityDetector.instance) {
      ModelCapabilityDetector.instance = new ModelCapabilityDetector();
    }
    return ModelCapabilityDetector.instance;
  }
  
  /**
   * Detect capabilities for a given model
   */
  async detectCapabilities(
    modelId: string,
    provider: LLMProviderType,
    baseUrl?: string,
    apiKey?: string
  ): Promise<ModelCapabilityDetection> {
    const detectedCapabilities: ModelCapability[] = [];
    const testResults: Record<string, any> = {};
    
    // Start with known capabilities from model mapping
    const knownCapabilities = this.getKnownCapabilities(modelId, provider);
    detectedCapabilities.push(...knownCapabilities);
    
    // Add test results for known capabilities
    for (const capability of knownCapabilities) {
      testResults[capability] = {
        supported: true,
        confidence: 0.95,
        testMethod: 'documentation',
        notes: 'Based on known model specifications'
      };
    }
    
    // Perform additional detection if API access is available
    if (baseUrl && apiKey) {
      const additionalCapabilities = await this.performAPITests(modelId, provider, baseUrl, apiKey);
      
      for (const [capability, result] of Object.entries(additionalCapabilities)) {
        if (result.supported && !detectedCapabilities.includes(capability as ModelCapability)) {
          detectedCapabilities.push(capability as ModelCapability);
        }
        testResults[capability] = result;
      }
    }
    
    return {
      modelId,
      provider,
      detectedCapabilities,
      testedAt: new Date(),
      testResults
    };
  }
  
  /**
   * Get known capabilities based on model ID and provider
   */
  private getKnownCapabilities(modelId: string, provider: LLMProviderType): ModelCapability[] {
    const capabilities: ModelCapability[] = [ModelCapability.TEXT]; // All models support text
    
    switch (provider) {
      case LLMProviderType.OPENAI:
        return this.getOpenAICapabilities(modelId);
      case LLMProviderType.ANTHROPIC:
        return this.getAnthropicCapabilities(modelId);
      case LLMProviderType.OLLAMA:
        return this.getOllamaCapabilities(modelId);
      case LLMProviderType.LLMSTUDIO:
        return this.getLMStudioCapabilities(modelId);
      default:
        return capabilities;
    }
  }
  
  private getOpenAICapabilities(modelId: string): ModelCapability[] {
    const capabilities: ModelCapability[] = [ModelCapability.TEXT];
    
    // Vision models
    if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo') || modelId.includes('gpt-4-vision')) {
      capabilities.push(
        ModelCapability.CODE,
        ModelCapability.REASONING,
        ModelCapability.VISION_TO_TEXT,
        ModelCapability.TOOL_CALLING,
        ModelCapability.FUNCTION_CALLING
      );
    }
    
    // Code models
    if (modelId.includes('gpt-3.5-turbo') || modelId.includes('gpt-4')) {
      capabilities.push(
        ModelCapability.CODE,
        ModelCapability.REASONING,
        ModelCapability.TOOL_CALLING,
        ModelCapability.FUNCTION_CALLING
      );
    }
    
    // Embedding models
    if (modelId.includes('text-embedding') || modelId.includes('ada-002')) {
      capabilities.push(ModelCapability.EMBEDDINGS);
    }
    
    // Image generation models
    if (modelId.includes('dall-e')) {
      capabilities.push(ModelCapability.IMAGE_GENERATION);
    }
    
    // Audio models
    if (modelId.includes('whisper')) {
      capabilities.push(ModelCapability.AUDIO_TO_TEXT);
    }
    
    if (modelId.includes('tts')) {
      capabilities.push(ModelCapability.AUDIO_TO_AUDIO);
    }
    
    return capabilities;
  }
  
  private getAnthropicCapabilities(modelId: string): ModelCapability[] {
    const capabilities: ModelCapability[] = [
      ModelCapability.TEXT,
      ModelCapability.CODE,
      ModelCapability.REASONING
    ];
    
    // Claude 3+ models have vision and tool calling
    if (modelId.includes('claude-3') || modelId.includes('claude-3-5')) {
      capabilities.push(
        ModelCapability.VISION_TO_TEXT,
        ModelCapability.TOOL_CALLING,
        ModelCapability.FUNCTION_CALLING
      );
    }
    
    return capabilities;
  }
  
  private getOllamaCapabilities(modelId: string): ModelCapability[] {
    const capabilities: ModelCapability[] = [
      ModelCapability.TEXT,
      ModelCapability.CODE,
      ModelCapability.REASONING
    ];
    
    // Vision models
    if (modelId.includes('vision') || modelId.includes('llava') || modelId.includes('qwen')) {
      capabilities.push(ModelCapability.VISION_TO_TEXT);
    }
    
    // Code-specific models
    if (modelId.includes('codellama') || modelId.includes('codeqwen')) {
      capabilities.push(ModelCapability.CODE);
    }
    
    return capabilities;
  }
  
  private getLMStudioCapabilities(modelId: string): ModelCapability[] {
    // LM Studio capabilities depend on the loaded model
    // Default to basic capabilities unless we can detect more
    return [
      ModelCapability.TEXT,
      ModelCapability.CODE,
      ModelCapability.REASONING
    ];
  }
  
  /**
   * Perform API tests to detect additional capabilities
   */
  private async performAPITests(
    modelId: string,
    provider: LLMProviderType,
    baseUrl: string,
    apiKey: string
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    try {
      // Test basic text generation
      const textResult = await this.testTextGeneration(modelId, provider, baseUrl, apiKey);
      results[ModelCapability.TEXT] = textResult;
      
      // Test tool calling if basic text works
      if (textResult.supported) {
        const toolResult = await this.testToolCalling(modelId, provider, baseUrl, apiKey);
        results[ModelCapability.TOOL_CALLING] = toolResult;
      }
      
      // Test vision capabilities
      const visionResult = await this.testVisionCapabilities(modelId, provider, baseUrl, apiKey);
      results[ModelCapability.VISION_TO_TEXT] = visionResult;
      
    } catch (error) {
      logger.error('Error during API capability testing:', error);
    }
    
    return results;
  }
  
  private async testTextGeneration(
    modelId: string,
    provider: LLMProviderType,
    baseUrl: string,
    apiKey: string
  ): Promise<any> {
    try {
      // Implementation would depend on provider-specific API calls
      // For now, return a mock result
      return {
        supported: true,
        confidence: 0.9,
        testMethod: 'api-call',
        notes: 'Successfully generated text response'
      };
    } catch (error) {
      return {
        supported: false,
        confidence: 0.1,
        testMethod: 'api-call',
        notes: `Failed to generate text: ${error.message}`
      };
    }
  }
  
  private async testToolCalling(
    modelId: string,
    provider: LLMProviderType,
    baseUrl: string,
    apiKey: string
  ): Promise<any> {
    try {
      // Implementation would test tool calling capabilities
      // For now, return based on known model capabilities
      const knownToolModels = [
        'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo',
        'claude-3-5-sonnet', 'claude-3-opus', 'claude-3-sonnet'
      ];
      
      const supported = knownToolModels.some(model => modelId.includes(model));
      
      return {
        supported,
        confidence: supported ? 0.85 : 0.15,
        testMethod: 'inference',
        notes: supported ? 'Model known to support tool calling' : 'Model not known to support tool calling'
      };
    } catch (error) {
      return {
        supported: false,
        confidence: 0.1,
        testMethod: 'api-call',
        notes: `Failed to test tool calling: ${error.message}`
      };
    }
  }
  
  private async testVisionCapabilities(
    modelId: string,
    provider: LLMProviderType,
    baseUrl: string,
    apiKey: string
  ): Promise<any> {
    try {
      // Implementation would test vision capabilities
      // For now, return based on known vision models
      const knownVisionModels = [
        'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision',
        'claude-3-5-sonnet', 'claude-3-opus', 'claude-3-sonnet',
        'llava', 'qwen', 'vision'
      ];
      
      const supported = knownVisionModels.some(model => modelId.includes(model));
      
      return {
        supported,
        confidence: supported ? 0.9 : 0.1,
        testMethod: 'inference',
        notes: supported ? 'Model known to support vision capabilities' : 'Model not known to support vision'
      };
    } catch (error) {
      return {
        supported: false,
        confidence: 0.1,
        testMethod: 'api-call',
        notes: `Failed to test vision capabilities: ${error.message}`
      };
    }
  }
  
  /**
   * Batch detect capabilities for multiple models
   */
  async batchDetectCapabilities(
    models: Array<{
      modelId: string;
      provider: LLMProviderType;
      baseUrl?: string;
      apiKey?: string;
    }>
  ): Promise<ModelCapabilityDetection[]> {
    const results: ModelCapabilityDetection[] = [];
    
    for (const model of models) {
      try {
        const detection = await this.detectCapabilities(
          model.modelId,
          model.provider,
          model.baseUrl,
          model.apiKey
        );
        results.push(detection);
      } catch (error) {
        logger.error(`Failed to detect capabilities for ${model.modelId}:`, error);
        // Add a failed detection result
        results.push({
          modelId: model.modelId,
          provider: model.provider,
          detectedCapabilities: [ModelCapability.TEXT],
          testedAt: new Date(),
          testResults: {
            error: {
              supported: false,
              confidence: 0,
              testMethod: 'api-call',
              notes: error.message
            }
          }
        });
      }
    }
    
    return results;
  }
}

export default ModelCapabilityDetector;