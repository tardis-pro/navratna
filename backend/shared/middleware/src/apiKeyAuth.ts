import { Elysia } from 'elysia';
import crypto from 'crypto';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { APIKeyContext, ElysiaSet } from '@uaip/types';

interface APIKeyConfig {
  headerName?: string;
  queryParam?: string;
  skipPaths?: string[];
  allowedServices?: string[];
  keyPrefix?: string;
}

export interface APIKey {
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

export type { APIKeyContext };

export class APIKeyAuthService {
  private readonly config: Required<APIKeyConfig>;
  private apiKeys = new Map<string, APIKey>();
  private keyCache = new Map<string, APIKey>();

  constructor(apiKeyConfig: APIKeyConfig = {}) {
    this.config = {
      headerName: apiKeyConfig.headerName || 'x-api-key',
      queryParam: apiKeyConfig.queryParam || 'api_key',
      skipPaths: apiKeyConfig.skipPaths || ['/health', '/metrics', '/api/v1/auth'],
      allowedServices: apiKeyConfig.allowedServices || [
        'agent-intelligence',
        'orchestration-pipeline',
        'capability-registry',
        'security-gateway',
        'discussion-orchestration',
      ],
      keyPrefix: apiKeyConfig.keyPrefix || 'uaip',
    };

    this.initializeDefaultKeys();
  }

  private initializeDefaultKeys(): void {
    const services = [
      'agent-intelligence',
      'orchestration-pipeline',
      'capability-registry',
      'security-gateway',
      'discussion-orchestration',
      'llm-service',
      'artifact-service',
    ];

    for (const service of services) {
      const key = this.generateAPIKey(
        service,
        `Default ${service} service key`,
        ['read', 'write', 'execute'],
        [`service:${service}`]
      );

      this.apiKeys.set(key.id, key);

      if (process.env.NODE_ENV === 'development') {
        const apiKeyValue = this.generateKeyValue(key.id, service);
        logger.info(`[API Key] Generated for ${service}: ${apiKeyValue}`);
      }
    }
  }

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
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
    };

    return apiKey;
  }

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

  public parseAPIKey(
    apiKeyValue: string
  ): { keyId: string; serviceName: string; timestamp: number } | null {
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

  public async validateAPIKey(apiKeyValue: string): Promise<APIKey | null> {
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

    if (apiKey.serviceName !== serviceName) {
      return null;
    }

    if (!apiKey.isActive) {
      return null;
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    apiKey.lastUsedAt = new Date();

    // Cache for 5 minutes
    this.keyCache.set(apiKeyValue, apiKey);
    setTimeout(
      () => {
        this.keyCache.delete(apiKeyValue);
      },
      5 * 60 * 1000
    );

    return apiKey;
  }

  private hashKey(keyId: string, serviceName: string): string {
    return crypto
      .createHash('sha256')
      .update(`${keyId}:${serviceName}:${config.jwt.secret}`)
      .digest('hex');
  }

  // Elysia middleware plugin
  public middleware() {
    return (app: Elysia) => {
      return app.derive(async ({ request, set }) => {
        const url = new URL(request.url);

        // Skip authentication for certain paths
        if (this.config.skipPaths.some((path) => url.pathname.startsWith(path))) {
          return { apiKey: null as APIKeyContext | null };
        }

        // Extract API key from header or query parameter
        const apiKeyValue =
          request.headers.get(this.config.headerName) ||
          url.searchParams.get(this.config.queryParam);

        if (!apiKeyValue) {
          set.status = 401;
          return {
            apiKey: null as APIKeyContext | null,
            apiKeyError: {
              success: false,
              error: {
                code: 'API_KEY_MISSING',
                message: 'API key is required for service-to-service communication',
              },
            },
          };
        }

        try {
          const apiKey = await this.validateAPIKey(apiKeyValue);

          if (!apiKey) {
            logger.warn('Invalid API key attempt', {
              path: url.pathname,
              method: request.method,
              keyPrefix: apiKeyValue.substring(0, 20) + '...',
            });

            set.status = 401;
            return {
              apiKey: null as APIKeyContext | null,
              apiKeyError: {
                success: false,
                error: {
                  code: 'API_KEY_INVALID',
                  message: 'Invalid or expired API key',
                },
              },
            };
          }

          if (!this.config.allowedServices.includes(apiKey.serviceName)) {
            set.status = 403;
            return {
              apiKey: null as APIKeyContext | null,
              apiKeyError: {
                success: false,
                error: {
                  code: 'SERVICE_NOT_ALLOWED',
                  message: `Service '${apiKey.serviceName}' is not allowed to access this endpoint`,
                },
              },
            };
          }

          set.headers['X-Service-Auth'] = apiKey.serviceName;
          set.headers['X-API-Key-ID'] = apiKey.id;

          logger.info('API key authentication successful', {
            serviceName: apiKey.serviceName,
            keyId: apiKey.id,
            path: url.pathname,
            method: request.method,
          });

          return {
            apiKey: {
              id: apiKey.id,
              serviceName: apiKey.serviceName,
              permissions: apiKey.permissions,
              scopes: apiKey.scopes,
            } as APIKeyContext,
          };
        } catch (error) {
          logger.error('API key authentication error:', error);
          set.status = 500;
          return {
            apiKey: null as APIKeyContext | null,
            apiKeyError: {
              success: false,
              error: {
                code: 'API_KEY_AUTH_ERROR',
                message: 'Internal error during API key authentication',
              },
            },
          };
        }
      });
    };
  }

  // Elysia guard to require specific permissions
  public requirePermissions(requiredPermissions: string[]) {
    return (app: Elysia) => {
      return app.guard({
        beforeHandle(ctx) {
          const { apiKey, set } = ctx as unknown as {
            apiKey: APIKeyContext | null;
            set: { status: number };
          };
          if (!apiKey) {
            set.status = 401;
            return {
              success: false,
              error: {
                code: 'API_KEY_REQUIRED',
                message: 'API key authentication required',
              },
            };
          }

          const hasPermissions = requiredPermissions.every(
            (permission) =>
              apiKey.permissions.includes(permission) || apiKey.permissions.includes('*')
          );

          if (!hasPermissions) {
            set.status = 403;
            return {
              success: false,
              error: {
                code: 'INSUFFICIENT_PERMISSIONS',
                message: `Missing required permissions: ${requiredPermissions.join(', ')}`,
              },
            };
          }
        },
      });
    };
  }

  // Elysia guard to require specific scopes
  public requireScopes(requiredScopes: string[]) {
    return (app: Elysia) => {
      return app.guard({
        beforeHandle(ctx) {
          const { apiKey, set } = ctx as unknown as {
            apiKey: APIKeyContext | null;
            set: { status: number };
          };
          if (!apiKey) {
            set.status = 401;
            return {
              success: false,
              error: {
                code: 'API_KEY_REQUIRED',
                message: 'API key authentication required',
              },
            };
          }

          const hasScopes = requiredScopes.every(
            (scope) => apiKey.scopes.includes(scope) || apiKey.scopes.includes('*')
          );

          if (!hasScopes) {
            set.status = 403;
            return {
              success: false,
              error: {
                code: 'INSUFFICIENT_SCOPES',
                message: `Missing required scopes: ${requiredScopes.join(', ')}`,
              },
            };
          }
        },
      });
    };
  }

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
