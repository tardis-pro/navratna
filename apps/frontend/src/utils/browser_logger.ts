// Browser-compatible logger to replace Winston for frontend use
import { captureFrontendException } from './sentry';

const hasReactComponentStack = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'componentStack' in value &&
  typeof value.componentStack === 'string';

// An API 401 is an expected state (session expired, user not logged in) that
// the app already handles via the `auth:unauthorized` event — reporting it to
// Sentry buries real errors under one event per expired-cookie visitor.
// Duck-typed on statusCode rather than importing EdenClientError: eden.ts
// reaches this module through c_s_r_f_service, so the import would be a cycle.
const isExpectedAuthError = (value: unknown): boolean =>
  value instanceof Error && 'statusCode' in value && value.statusCode === 401;

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

class BrowserLogger implements Logger {
  private isDevelopment = import.meta.env.DEV;

  info(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.warn(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
    if (args.some(hasReactComponentStack)) return;
    if (args.some(isExpectedAuthError)) return;

    const error = args.find((arg): arg is Error => arg instanceof Error) ?? new Error(message);
    captureFrontendException(
      error,
      { source: 'browser_logger' },
      { message, args: args.map((arg) => (arg instanceof Error ? arg.message : arg)) },
    );
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.warn(`[DEBUG] ${message}`, ...args);
    }
  }
}

export const logger = new BrowserLogger();
