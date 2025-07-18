import { EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { ApiKeyDecryptionRequest, ApiKeyDecryptionResponse } from '../interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for handling API key decryption via event-driven communication with Security Gateway
 */
export class ApiKeyDecryptionService {
  private static instance: ApiKeyDecryptionService | null = null;
  private eventBusService: EventBusService | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: string | undefined) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  private constructor() {}

  public static getInstance(): ApiKeyDecryptionService {
    if (!ApiKeyDecryptionService.instance) {
      ApiKeyDecryptionService.instance = new ApiKeyDecryptionService();
    }
    return ApiKeyDecryptionService.instance;
  }

  public setEventBusService(eventBusService: EventBusService): void {
    this.eventBusService = eventBusService;
    this.setupEventHandlers();
  }

  /**
   * Request API key decryption from Security Gateway
   */
  public async decryptApiKey(
    providerId: string,
    providerName: string,
    encryptedApiKey: string,
    timeoutMs: number = 5000
  ): Promise<string | undefined> {
    if (!this.eventBusService) {
      logger.error('EventBusService not initialized for API key decryption');
      return undefined;
    }

    const requestId = uuidv4();
    
    return new Promise<string | undefined>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`API key decryption timeout for provider ${providerName}`));
      }, timeoutMs);

      // Store promise handlers
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout
      });

      // Send decryption request event
      const request: ApiKeyDecryptionRequest = {
        providerId,
        providerName,
        encryptedApiKey,
        requestId,
        timestamp: new Date()
      };

      this.eventBusService.publish('llm.apikey.decrypt.request', request, {
        metadata: { version: '1.0' }
      }).catch(error => {
        logger.error('Failed to publish API key decryption request', { error, requestId, providerName });
        this.pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      });

      logger.debug('API key decryption request sent', { requestId, providerName });
    });
  }

  /**
   * Set up event handlers for decryption responses
   */
  private setupEventHandlers(): void {
    if (!this.eventBusService) {
      return;
    }

    // Subscribe to decryption responses from Security Gateway
    this.eventBusService.subscribe(
      'llm.apikey.decrypt.response',
      async (message) => {
        try {
          const response = message.data as ApiKeyDecryptionResponse;
          
          const pendingRequest = this.pendingRequests.get(response.requestId);
          if (!pendingRequest) {
            logger.warn('Received decryption response for unknown request', { requestId: response.requestId });
            return;
          }

          // Clear timeout and remove from pending
          clearTimeout(pendingRequest.timeout);
          this.pendingRequests.delete(response.requestId);

          if (response.success && response.decryptedApiKey) {
            logger.debug('API key decryption successful', { requestId: response.requestId });
            pendingRequest.resolve(response.decryptedApiKey);
          } else {
            logger.error('API key decryption failed', { 
              requestId: response.requestId, 
              error: response.error 
            });
            pendingRequest.reject(new Error(response.error || 'Decryption failed'));
          }
        } catch (error) {
          logger.error('Error processing API key decryption response', { error });
        }
      },
      {
        queue: 'llm-service-apikey-decryption',
        durable: true,
        autoAck: true
      }
    );

    logger.info('API key decryption event handlers initialized');
  }

  /**
   * Cleanup method to clear pending requests and timeouts
   */
  public cleanup(): void {
    for (const [requestId, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Service shutdown'));
    }
    this.pendingRequests.clear();
  }
}