import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';

interface APIKeyConfig {
  headerName?: string;
  queryParam?: string;
  skipPaths?: string[];
  allowedServices?: string[];
  keyPrefix?: string;
}

interface APIKeyRequest extends Request {
  apiKey?: {
    id: string;
    serviceName: string;
    permissions: string[];
    scopes: string[];
  };
}

interface APIKey {
  id: string;
  name: string;
  serviceName: string;
  keyHash: string;
  permissions: string[];
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  ipRestrictions?: string[];
  rateLimitOverride?: number;
}

export class APIKeyAuthService {
  private readonly config: Required<APIKeyConfig>;
  private apiKeys = new Map<string, APIKey>();
  private keyCache = new Map<string, APIKey>();

  constructor(config: APIKeyConfig = {}) {
    this.config = {
      headerName: config.headerName || 'x-api-key',
      queryParam: config.queryParam || 'api_key',
      skipPaths: config.skipPaths || ['/health', '/metrics', '/api/v1/auth'],
      allowedServices: config.allowedServices || ['agent-intelligence', 'orchestration-pipeline', 'capability-registry', 'security-gateway', 'discussion-orchestration'],
      keyPrefix: config.keyPrefix || 'uaip'
    };

    this.initializeDefaultKeys();
  }

  /**
   * Initialize default API keys for each service
   */
  private initializeDefaultKeys(): void {
    const services = [
      'agent-intelligence',
      'orchestration-pipeline', 
      'capability-registry',
      'security-gateway',
      'discussion-orchestration',
      'llm-service',
      'artifact-service'
    ];

    for (const service of services) {
      const key = this.generateAPIKey(service, `Default ${service} service key`, [
        'read', 'write', 'execute'
      ], [`service:${service}`]);
      
      this.apiKeys.set(key.id, key);
      
      // Log the API key for service configuration (in development only)
      if (process.env.NODE_ENV === 'development') {
        const apiKeyValue = this.generateKeyValue(key.id, service);
        logger.info(`[API Key] Generated for ${service}: ${apiKeyValue}`);
      }
    }
  }

  /**
   * Generate a new API key
   */
  public generateAPIKey(
    serviceName: string, 
    name: string, 
    permissions: string[] = [],
    scopes: string[] = [],
    expiresInDays?: number
  ): APIKey {
    const id = crypto.randomBytes(16).toString('hex');
    const keyHash = this.hashKey(id, serviceName);
    
    const apiKey: APIKey = {
      id,
      name,
      serviceName,
      keyHash,
      permissions: [...permissions],
      scopes: [...scopes],
      isActive: true,
      createdAt: new Date(),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : undefined
    };

    return apiKey;
  }

  /**
   * Generate the actual API key value that clients use
   */
  public generateKeyValue(keyId: string, serviceName: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${keyId}.${serviceName}.${timestamp}`;
    const signature = crypto
      .createHmac('sha256', config.jwt.secret)
      .update(payload)
      .digest('hex')
      .substring(0, 16);
    
    return `${this.config.keyPrefix}_${Buffer.from(payload).toString('base64')}.${signature}`;
  }

  /**
   * Parse and validate API key
   */
  public parseAPIKey(apiKeyValue: string): { keyId: string; serviceName: string; timestamp: number } | null {
    try {
      if (!apiKeyValue.startsWith(`${this.config.keyPrefix}_`)) {
        return null;
      }

      const withoutPrefix = apiKeyValue.substring(`${this.config.keyPrefix}_`.length);
      const [encodedPayload, signature] = withoutPrefix.split('.');
      
      if (!encodedPayload || !signature) {
        return null;
      }

      const payload = Buffer.from(encodedPayload, 'base64').toString();
      const [keyId, serviceName, timestampStr] = payload.split('.');
      
      if (!keyId || !serviceName || !timestampStr) {
        return null;
      }

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', config.jwt.secret)
        .update(payload)
        .digest('hex')
        .substring(0, 16);

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
      }

      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        return null;
      }

      return { keyId, serviceName, timestamp };
    } catch (error) {
      logger.warn('Failed to parse API key:', error);
      return null;
    }
  }

  /**
   * Validate API key and get associated data
   */
  public async validateAPIKey(apiKeyValue: string): Promise<APIKey | null> {
    // Check cache first
    const cached = this.keyCache.get(apiKeyValue);
    if (cached) {
      return cached;
    }

    const parsed = this.parseAPIKey(apiKeyValue);
    if (!parsed) {
      return null;
    }

    const { keyId, serviceName } = parsed;
    const apiKey = this.apiKeys.get(keyId);
    
    if (!apiKey) {
      return null;
    }

    // Validate service name matches
    if (apiKey.serviceName !== serviceName) {
      return null;
    }

    // Check if key is active
    if (!apiKey.isActive) {
      return null;
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    // Update last used
    apiKey.lastUsedAt = new Date();

    // Cache for 5 minutes
    this.keyCache.set(apiKeyValue, apiKey);
    setTimeout(() => {
      this.keyCache.delete(apiKeyValue);
    }, 5 * 60 * 1000);

    return apiKey;
  }

  /**
   * Hash API key for storage
   */
  private hashKey(keyId: string, serviceName: string): string {
    return crypto
      .createHash('sha256')
      .update(`${keyId}:${serviceName}:${config.jwt.secret}`)
      .digest('hex');
  }

  /**
   * Express middleware for API key authentication
   */
  public middleware() {
    return async (req: APIKeyRequest, res: Response, next: NextFunction) => {
      // Skip authentication for certain paths
      if (this.config.skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Extract API key from header or query parameter
      const apiKeyValue = req.get(this.config.headerName) || req.query[this.config.queryParam] as string;

      if (!apiKeyValue) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'API_KEY_MISSING',
            message: 'API key is required for service-to-service communication'
          }
        });
      }

      try {
        const apiKey = await this.validateAPIKey(apiKeyValue);
        
        if (!apiKey) {
          logger.warn('Invalid API key attempt', {
            path: req.path,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            keyPrefix: apiKeyValue.substring(0, 20) + '...'
          });

          return res.status(401).json({
            success: false,
            error: {
              code: 'API_KEY_INVALID',
              message: 'Invalid or expired API key'
            }
          });
        }

        // Check service permissions
        if (!this.config.allowedServices.includes(apiKey.serviceName)) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'SERVICE_NOT_ALLOWED',
              message: `Service '${apiKey.serviceName}' is not allowed to access this endpoint`
            }
          });
        }

        // Attach API key info to request
        req.apiKey = {
          id: apiKey.id,
          serviceName: apiKey.serviceName,
          permissions: apiKey.permissions,
          scopes: apiKey.scopes
        };

        // Add service identification headers
        res.setHeader('X-Service-Auth', apiKey.serviceName);
        res.setHeader('X-API-Key-ID', apiKey.id);

        logger.info('API key authentication successful', {
          serviceName: apiKey.serviceName,
          keyId: apiKey.id,
          path: req.path,
          method: req.method
        });

        next();
      } catch (error) {
        logger.error('API key authentication error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'API_KEY_AUTH_ERROR',
            message: 'Internal error during API key authentication'
          }
        });
      }
    };
  }

  /**
   * Middleware to require specific permissions
   */
  public requirePermissions(requiredPermissions: string[]) {
    return (req: APIKeyRequest, res: Response, next: NextFunction) => {
      if (!req.apiKey) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'API_KEY_REQUIRED',
            message: 'API key authentication required'
          }
        });
      }

      const hasPermissions = requiredPermissions.every(permission => 
        req.apiKey!.permissions.includes(permission) || req.apiKey!.permissions.includes('*')
      );

      if (!hasPermissions) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Missing required permissions: ${requiredPermissions.join(', ')}`
          }
        });
      }

      next();
    };
  }

  /**
   * Middleware to require specific scopes
   */
  public requireScopes(requiredScopes: string[]) {
    return (req: APIKeyRequest, res: Response, next: NextFunction) => {
      if (!req.apiKey) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'API_KEY_REQUIRED',
            message: 'API key authentication required'
          }
        });
      }

      const hasScopes = requiredScopes.every(scope => 
        req.apiKey!.scopes.includes(scope) || req.apiKey!.scopes.includes('*')
      );

      if (!hasScopes) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_SCOPES',
            message: `Missing required scopes: ${requiredScopes.join(', ')}`
          }
        });
      }

      next();
    };
  }

  /**
   * Get API key for a service (for internal use)
   */
  public getServiceAPIKey(serviceName: string): string | null {
    for (const [keyId, apiKey] of this.apiKeys.entries()) {
      if (apiKey.serviceName === serviceName && apiKey.isActive) {
        return this.generateKeyValue(keyId, serviceName);
      }
    }
    return null;
  }
}

// Default instance
export const apiKeyAuth = new APIKeyAuthService();

// Convenience middleware exports
export const apiKeyMiddleware = apiKeyAuth.middleware();
export const requireReadPermission = apiKeyAuth.requirePermissions(['read']);
export const requireWritePermission = apiKeyAuth.requirePermissions(['write']);
export const requireExecutePermission = apiKeyAuth.requirePermissions(['execute']);

// Type exports
export type { APIKeyRequest, APIKey };