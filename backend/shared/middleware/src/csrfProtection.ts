import { Elysia } from 'elysia';
import crypto from 'crypto';
import { logger } from '@uaip/utils';

interface CSRFConfig {
  headerName?: string;
  cookieName?: string;
  sessionKey?: string;
  secretLength?: number;
  skipIfSafe?: boolean;
  exemptPaths?: string[];
  exemptMethods?: string[];
}

export class CSRFProtection {
  private readonly config: Required<CSRFConfig>;

  constructor(csrfConfig: CSRFConfig = {}) {
    this.config = {
      headerName: csrfConfig.headerName || 'x-csrf-token',
      cookieName: csrfConfig.cookieName || 'csrf-token',
      sessionKey: csrfConfig.sessionKey || '_csrf',
      secretLength: csrfConfig.secretLength || 32,
      skipIfSafe: csrfConfig.skipIfSafe !== false,
      exemptPaths: csrfConfig.exemptPaths || ['/health', '/metrics', '/api/v1/auth/login'],
      exemptMethods: csrfConfig.exemptMethods || ['GET', 'HEAD', 'OPTIONS'],
    };
  }

  public generateToken(secret?: string): string {
    const tokenSecret = secret || this.generateSecret();
    const tokenValue = this.generateSecret();
    const token = `${tokenSecret}.${tokenValue}`;

    const signature = crypto.createHmac('sha256', tokenSecret).update(tokenValue).digest('hex');

    return `${token}.${signature}`;
  }

  public verifyToken(token: string, secret?: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return false;
      }

      const [tokenSecret, tokenValue, signature] = parts;
      const verifySecret = secret || tokenSecret;

      const expectedSignature = crypto
        .createHmac('sha256', verifySecret)
        .update(tokenValue)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.warn('CSRF token verification failed:', error);
      return false;
    }
  }

  private generateSecret(): string {
    return crypto.randomBytes(this.config.secretLength).toString('hex');
  }

  private extractToken(request: Request, body: any): string | null {
    // Check header first
    let token = request.headers.get(this.config.headerName);

    // Check body
    if (!token && body && body._csrf) {
      token = body._csrf;
    }

    // Check query
    if (!token) {
      const url = new URL(request.url);
      token = url.searchParams.get('_csrf');
    }

    return token || null;
  }

  // Elysia CSRF middleware plugin
  public middleware() {
    return (app: Elysia) => {
      return app.derive(({ request, body, set }) => {
        const url = new URL(request.url);

        // Skip if path is exempt
        if (this.config.exemptPaths.some((path) => url.pathname.startsWith(path))) {
          return {
            csrfToken: () => this.generateToken(),
          };
        }

        // Skip if method is safe and skipIfSafe is enabled
        if (this.config.skipIfSafe && this.config.exemptMethods.includes(request.method)) {
          return {
            csrfToken: () => this.generateToken(),
          };
        }

        // For state-changing operations, verify token
        if (!this.config.exemptMethods.includes(request.method)) {
          const token = this.extractToken(request, body);

          if (!token) {
            logger.warn('CSRF protection: Missing token', {
              method: request.method,
              path: url.pathname,
            });
            set.status = 403;
            return {
              csrfToken: () => this.generateToken(),
              csrfError: {
                success: false,
                error: {
                  code: 'CSRF_TOKEN_MISSING',
                  message: 'CSRF token is required for this operation',
                },
              },
            };
          }

          if (!this.verifyToken(token)) {
            logger.warn('CSRF protection: Invalid token', {
              method: request.method,
              path: url.pathname,
            });
            set.status = 403;
            return {
              csrfToken: () => this.generateToken(),
              csrfError: {
                success: false,
                error: {
                  code: 'CSRF_TOKEN_INVALID',
                  message: 'Invalid CSRF token',
                },
              },
            };
          }
        }

        return {
          csrfToken: () => this.generateToken(),
        };
      });
    };
  }

  // CSRF token endpoint handler
  public tokenEndpoint() {
    return async (): Promise<Response> => {
      try {
        const token = this.generateToken();

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              token,
              headerName: this.config.headerName,
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': `${this.config.cookieName}=${token}; HttpOnly=false; SameSite=Strict; Max-Age=3600`,
            },
          }
        );
      } catch (error) {
        logger.error('Error in CSRF token endpoint:', error);
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'CSRF_TOKEN_ERROR',
              message: 'Internal server error while generating CSRF token',
            },
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    };
  }
}

// Default instance
export const csrfProtection = new CSRFProtection();

// Convenience middleware
export const csrfMiddleware = csrfProtection.middleware();
export const csrfTokenEndpoint = csrfProtection.tokenEndpoint();
