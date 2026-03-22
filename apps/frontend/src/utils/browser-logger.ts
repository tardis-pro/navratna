// Browser-compatible logger to replace Winston for frontend use

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

class BrowserLogger implements Logger {
  private isDevelopment = import.meta.env.DEV;

  info(_message: string, ..._args: unknown[]): void {
    if (this.isDevelopment) {
    }
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }

  debug(_message: string, ..._args: unknown[]): void {
    if (this.isDevelopment) {
    }
  }
}

export const logger = new BrowserLogger();
