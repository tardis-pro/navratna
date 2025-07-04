import { Request, Response, NextFunction } from 'express';
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

interface CSRFRequest extends Request {
  csrfToken?: () => string;
  session?: any;
}

export class CSRFProtection {
  private readonly config: Required<CSRFConfig>;

  constructor(config: CSRFConfig = {}) {
    this.config = {
      headerName: config.headerName || 'x-csrf-token',
      cookieName: config.cookieName || 'csrf-token',
      sessionKey: config.sessionKey || '_csrf',
      secretLength: config.secretLength || 32,
      skipIfSafe: config.skipIfSafe !== false,
      exemptPaths: config.exemptPaths || ['/health', '/metrics', '/api/v1/auth/login'],
      exemptMethods: config.exemptMethods || ['GET', 'HEAD', 'OPTIONS']
    };
  }

  /**
   * Generate a CSRF token
   */
  public generateToken(secret?: string): string {
    const tokenSecret = secret || this.generateSecret();
    const tokenValue = this.generateSecret();
    const token = `${tokenSecret}.${tokenValue}`;
    
    // Create HMAC signature
    const signature = crypto
      .createHmac('sha256', tokenSecret)
      .update(tokenValue)
      .digest('hex');
    
    return `${token}.${signature}`;
  }

  /**
   * Verify a CSRF token
   */
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
      
      // Use provided secret or extract from token
      const verifySecret = secret || tokenSecret;
      
      // Verify signature
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

  /**
   * Generate a cryptographically secure secret
   */
  private generateSecret(): string {
    return crypto.randomBytes(this.config.secretLength).toString('hex');
  }

  /**
   * Express middleware for CSRF protection
   */
  public middleware() {
    return (req: CSRFRequest, res: Response, next: NextFunction): void => {
      // Skip if path is exempt
      if (this.config.exemptPaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Skip if method is safe and skipIfSafe is enabled
      if (this.config.skipIfSafe && this.config.exemptMethods.includes(req.method)) {
        // Still generate token for safe methods
        this.addTokenToRequest(req, res);
        return next();
      }

      // For state-changing operations, verify token
      if (!this.config.exemptMethods.includes(req.method)) {
        const token = this.extractToken(req);
        const secret = this.getSessionSecret(req);

        if (!token) {
          logger.warn('CSRF protection: Missing token', {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
          res.status(403).json({
            success: false,
            error: {
              code: 'CSRF_TOKEN_MISSING',
              message: 'CSRF token is required for this operation'
            }
          });
          return;
        }

        if (!this.verifyToken(token, secret)) {
          logger.warn('CSRF protection: Invalid token', {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            tokenProvided: !!token
          });
          res.status(403).json({
            success: false,
            error: {
              code: 'CSRF_TOKEN_INVALID',
              message: 'Invalid CSRF token'
            }
          });
          return;
        }
      }

      // Add token generation function to request
      this.addTokenToRequest(req, res);
      next();
    };
  }

  /**
   * Extract CSRF token from request
   */
  private extractToken(req: Request): string | null {
    // Check header first
    let token = req.get(this.config.headerName);
    
    // Check body
    if (!token && req.body && req.body._csrf) {
      token = req.body._csrf;
    }

    // Check query
    if (!token && req.query._csrf) {
      token = req.query._csrf as string;
    }

    return token || null;
  }

  /**
   * Get or create session secret
   */
  private getSessionSecret(req: CSRFRequest): string {
    if (!req.session) {
      // If no session, generate a temporary secret
      return this.generateSecret();
    }

    if (!req.session[this.config.sessionKey]) {
      req.session[this.config.sessionKey] = this.generateSecret();
    }

    return req.session[this.config.sessionKey];
  }

  /**
   * Add token generation function to request
   */
  private addTokenToRequest(req: CSRFRequest, res: Response): void {
    const secret = this.getSessionSecret(req);
    
    req.csrfToken = () => {
      const token = this.generateToken(secret);
      
      // Set token in response cookie
      res.cookie(this.config.cookieName, token, {
        httpOnly: false, // Allow JavaScript access for API calls
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000 // 1 hour
      });
      
      return token;
    };
  }

  /**
   * Endpoint to get CSRF token
   */
  public tokenEndpoint() {
    return (req: CSRFRequest, res: Response): void => {
      try {
        // Ensure token is available on request
        this.addTokenToRequest(req, res);
        
        const token = req.csrfToken?.();
        
        if (!token) {
          logger.error('Failed to generate CSRF token');
          res.status(500).json({
            success: false,
            error: {
              code: 'CSRF_TOKEN_GENERATION_FAILED',
              message: 'Failed to generate CSRF token'
            }
          });
          return;
        }

        res.json({
          success: true,
          data: {
            token,
            headerName: this.config.headerName
          }
        });
      } catch (error) {
        logger.error('Error in CSRF token endpoint:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'CSRF_TOKEN_ERROR',
            message: 'Internal server error while generating CSRF token'
          }
        });
      }
    };
  }
}

// Default instance
export const csrfProtection = new CSRFProtection();

// Convenience middleware
export const csrfMiddleware = csrfProtection.middleware();
export const csrfTokenEndpoint = csrfProtection.tokenEndpoint();