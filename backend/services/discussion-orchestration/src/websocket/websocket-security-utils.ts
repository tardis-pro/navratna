import { IncomingMessage } from 'http';
import { testJWTToken } from '@uaip/middleware';
import { logger } from '@uaip/utils';

export interface AuthenticationResult {
  authenticated: boolean;
  userId?: string;
  securityLevel?: number;
  reason?: string;
}

/**
 * Authenticate WebSocket connection using JWT token
 */
export function authenticateConnection(
  request: IncomingMessage,
  connectionId: string
): AuthenticationResult {
  try {
    // Extract token from various sources
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    let token = url.searchParams.get('token');

    if (!token && request.headers.authorization) {
      const authHeader = request.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token && request.headers['sec-websocket-protocol']) {
      // Check if token is in WebSocket protocol header
      const protocols = request.headers['sec-websocket-protocol'] as string;
      const tokenMatch = protocols.match(/token\.([^,\s]+)/);
      if (tokenMatch) {
        token = tokenMatch[1];
      }
    }

    if (!token) {
      return {
        authenticated: false,
        reason: 'No authentication token provided',
      };
    }

    // Validate JWT token
    const tokenValidation = testJWTToken(token);

    if (!tokenValidation.isValid) {
      logger.warn('Invalid JWT token for WebSocket connection', {
        connectionId,
        error: tokenValidation.error,
        ip: request.socket.remoteAddress,
      });

      return {
        authenticated: false,
        reason: 'Invalid or expired token',
      };
    }

    const payload = tokenValidation.payload;

    if (!payload || !payload.userId) {
      return {
        authenticated: false,
        reason: 'Invalid token payload',
      };
    }

    if (payload.isExpired) {
      return {
        authenticated: false,
        reason: 'Token expired',
      };
    }

    return {
      authenticated: true,
      userId: payload.userId,
      securityLevel: getSecurityLevelFromRole(payload.role),
    };
  } catch (error) {
    logger.error('WebSocket authentication error', {
      connectionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.socket.remoteAddress,
    });

    return {
      authenticated: false,
      reason: 'Authentication failed',
    };
  }
}

/**
 * Get security level from user role
 */
function getSecurityLevelFromRole(role: string): number {
  switch (role) {
    case 'admin':
      return 5;
    case 'operator':
      return 4;
    case 'moderator':
      return 3;
    case 'user':
      return 2;
    default:
      return 1;
  }
}

/**
 * Validate UUID format
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Sanitize message content
 */
export function sanitizeContent(content: string): string {
  return content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

/**
 * Generate secure connection ID
 */
export function generateSecureConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

/**
 * Check rate limits for WebSocket operations
 */
export function checkWebSocketRateLimit(
  connectionId: string,
  rateLimits: Map<string, { count: number; resetTime: number }>,
  maxPerMinute: number
): boolean {
  const now = Date.now();
  let limit = rateLimits.get(connectionId);

  if (!limit) {
    limit = { count: 0, resetTime: now + 60000 };
    rateLimits.set(connectionId, limit);
  }

  // Reset if time window passed
  if (now > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = now + 60000;
  }

  if (limit.count >= maxPerMinute) {
    return false;
  }

  limit.count++;
  return true;
}

/**
 * Validate message size
 */
export function validateMessageSize(message: string, maxSize: number = 32768): boolean {
  return Buffer.byteLength(message, 'utf8') <= maxSize;
}
