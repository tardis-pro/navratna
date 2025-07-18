import { EventBusService, DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { ApiKeyDecryptionRequest, ApiKeyDecryptionResponse } from '@uaip/llm-service';
import { UserLLMProvider } from '@uaip/shared-services';

/**
 * Handles API key decryption requests from LLM service
 */
export class ApiKeyDecryptionHandler {
  private eventBusService: EventBusService;
  private databaseService: DatabaseService;

  constructor(eventBusService: EventBusService, databaseService: DatabaseService) {
    this.eventBusService = eventBusService;
    this.databaseService = databaseService;
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for decryption requests
   */
  private setupEventHandlers(): void {
    // Subscribe to decryption requests from LLM service
    this.eventBusService.subscribe(
      'llm.apikey.decrypt.request',
      async (message) => {
        try {
          const request = message.data as ApiKeyDecryptionRequest;
          await this.handleDecryptionRequest(request);
        } catch (error) {
          logger.error('Error processing API key decryption request', { error });
        }
      },
      {
        queue: 'security-gateway-apikey-decryption',
        durable: true,
        autoAck: true
      }
    );

    logger.info('API key decryption event handlers initialized in Security Gateway');
  }

  /**
   * Handle API key decryption request
   */
  private async handleDecryptionRequest(request: ApiKeyDecryptionRequest): Promise<void> {
    logger.debug('Processing API key decryption request', { 
      requestId: request.requestId, 
      providerName: request.providerName 
    });

    const response: ApiKeyDecryptionResponse = {
      requestId: request.requestId,
      success: false,
      timestamp: new Date()
    };

    try {
      // Find the provider by ID or name with encrypted API key
      const dataSource = await this.databaseService.getDataSource();
      const userLLMProviderRepo = dataSource.getRepository(UserLLMProvider);
      
      let provider: UserLLMProvider | null = null;
      
      // Try to find by provider ID first
      if (request.providerId && request.providerId !== 'provider-id') {
        provider = await userLLMProviderRepo.findOne({
          where: { id: request.providerId }
        });
      }
      
      // If not found by ID, try to find by name and encrypted API key
      if (!provider) {
        provider = await userLLMProviderRepo.findOne({
          where: { 
            name: request.providerName,
            apiKeyEncrypted: request.encryptedApiKey
          }
        });
      }

      if (!provider) {
        response.error = `Provider not found: ${request.providerName}`;
        logger.warn('Provider not found for decryption request', { 
          requestId: request.requestId,
          providerName: request.providerName
        });
      } else {
        // Use the provider's built-in decryption method
        const decryptedKey = provider.getApiKey();
        
        if (decryptedKey) {
          response.success = true;
          response.decryptedApiKey = decryptedKey;
          logger.debug('API key decryption successful', { requestId: request.requestId });
        } else {
          response.error = 'Failed to decrypt API key';
          logger.error('API key decryption failed', { requestId: request.requestId });
        }
      }
    } catch (error) {
      response.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error during API key decryption', { 
        error, 
        requestId: request.requestId,
        providerName: request.providerName 
      });
    }

    // Send response back to LLM service
    try {
      await this.eventBusService.publish('llm.apikey.decrypt.response', response, {
        metadata: { version: '1.0' }
      });
      
      logger.debug('API key decryption response sent', { 
        requestId: request.requestId,
        success: response.success 
      });
    } catch (error) {
      logger.error('Failed to send API key decryption response', { 
        error, 
        requestId: request.requestId 
      });
    }
  }
}