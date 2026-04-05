import { logger } from '@/utils/browser_logger';

export interface CSRFToken {
  token: string;
  headerName: string;
  expiresAt: Date;
}

export class CSRFService {
  private static instance: CSRFService;
  private currentToken: CSRFToken | null = null;
  private tokenPromise: Promise<CSRFToken> | null = null;
  private readonly storageKey = 'uaip-csrf-token';

  private constructor() {
    this.loadStoredToken();
  }

  public static getInstance(): CSRFService {
    if (!CSRFService.instance) {
      CSRFService.instance = new CSRFService();
    }
    return CSRFService.instance;
  }

  /**
   * Get current CSRF token, fetching new one if needed
   */
  public async getToken(): Promise<string> {
    const token = await this.getValidToken();
    return token.token;
  }

  /**
   * Get header name for CSRF token
   */
  public async getHeaderName(): Promise<string> {
    const token = await this.getValidToken();
    return token.headerName;
  }

  /**
   * Get headers object with CSRF token
   */
  public async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getValidToken();
    return {
      [token.headerName]: token.token,
    };
  }

  /**
   * Check if we have a valid token
   */
  public hasValidToken(): boolean {
    return this.currentToken !== null && this.currentToken.expiresAt > new Date();
  }

  /**
   * Force refresh of CSRF token
   */
  public async refreshToken(): Promise<CSRFToken> {
    this.currentToken = null;
    this.tokenPromise = null;
    this.clearStoredToken();
    return this.getValidToken();
  }

  /**
   * Clear stored token (e.g., on logout)
   */
  public clearToken(): void {
    this.currentToken = null;
    this.tokenPromise = null;
    this.clearStoredToken();
  }

  /**
   * Get valid token, fetching new one if needed
   */
  private async getValidToken(): Promise<CSRFToken> {
    // Return existing valid token
    if (this.hasValidToken()) {
      return this.currentToken!;
    }

    // Return existing promise if already fetching
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Fetch new token
    this.tokenPromise = this.fetchNewToken();
    return this.tokenPromise;
  }

  /**
   * Fetch new CSRF token from server
   */
  private async fetchNewToken(): Promise<CSRFToken> {
    try {
      const baseUrl = this.getAPIBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/auth/csrf-token`, {
        method: 'GET',
        credentials: 'include', // Include cookies for session
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch CSRF token: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success || !data.data) {
        throw new Error('Invalid CSRF token response format');
      }

      const token: CSRFToken = {
        token: data.data.token,
        headerName: data.data.headerName || 'x-csrf-token',
        expiresAt: new Date(Date.now() + 50 * 60 * 1000), // 50 minutes (token expires in 1 hour)
      };

      this.currentToken = token;
      this.tokenPromise = null;
      this.storeToken(token);

      logger.info('[CSRF] Successfully fetched new CSRF token');
      return token;
    } catch (error) {
      this.tokenPromise = null;
      logger.error('[CSRF] Failed to fetch CSRF token:', error);
      throw error;
    }
  }

  /**
   * Get API base URL
   */
  private getAPIBaseUrl(): string {
    if (typeof window !== 'undefined') {
      // Frontend environment
      return window.location.hostname === 'localhost'
        ? 'http://localhost:8081'
        : window.location.origin;
    }
    return 'http://localhost:8081'; // Fallback for server-side
  }

  /**
   * Store token in localStorage
   */
  private storeToken(token: CSRFToken): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          this.storageKey,
          JSON.stringify({
            token: token.token,
            headerName: token.headerName,
            expiresAt: token.expiresAt.toISOString(),
          })
        );
      } catch (error) {
        logger.warn('[CSRF] Failed to store token in localStorage:', error);
      }
    }
  }

  /**
   * Load token from localStorage
   */
  private loadStoredToken(): void {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          const tokenData = JSON.parse(stored);
          const token: CSRFToken = {
            token: tokenData.token,
            headerName: tokenData.headerName,
            expiresAt: new Date(tokenData.expiresAt),
          };

          // Only use if not expired
          if (token.expiresAt > new Date()) {
            this.currentToken = token;
          } else {
            this.clearStoredToken();
          }
        }
      } catch (error) {
        logger.warn('[CSRF] Failed to load stored token:', error);
        this.clearStoredToken();
      }
    }
  }

  /**
   * Clear stored token from localStorage
   */
  private clearStoredToken(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (error) {
        logger.warn('[CSRF] Failed to clear stored token:', error);
      }
    }
  }
}

export const csrfService = CSRFService.getInstance();

/**
 * Higher-order function to add CSRF protection to API calls
 */
function injectCSRFHeaders(args: unknown[], headers: Record<string, string>): void {
  const lastArg = args[args.length - 1];
  if (lastArg !== null && typeof lastArg === 'object') {
    // @ts-expect-error -- lastArg is narrowed to object but TS can't index unknown objects without a cast
    const argObj: Record<string, unknown> = lastArg;
    if (argObj['headers'] !== null && typeof argObj['headers'] === 'object') {
      Object.assign(argObj['headers'], headers);
    } else {
      argObj['headers'] = { ...headers };
    }
  } else {
    args.push({ headers });
  }
}

async function injectAndCall(
  args: unknown[],
  fn: (...args: unknown[]) => Promise<unknown>
): Promise<unknown> {
  injectCSRFHeaders(args, await csrfService.getHeaders());
  return await fn(...args);
}

export function withCSRFProtection<T extends (...args: unknown[]) => Promise<unknown>>(
  apiFunction: T
): T {
  return (async (...args: unknown[]) => {
    try {
      return await injectAndCall(args, apiFunction);
    } catch (error) {
      if (error instanceof Error && error.message.includes('CSRF')) {
        try {
          await csrfService.refreshToken();
          return await injectAndCall(args, apiFunction);
        } catch (retryError) {
          logger.error('[CSRF] Failed to retry with refreshed token:', retryError);
          throw retryError;
        }
      }
      throw error;
    }
  }) as T;
}
