// Browser-compatible logger to replace Winston for frontend use

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
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.warn(`[DEBUG] ${message}`, ...args);
    }
  }
}

export const logger = new BrowserLogger();
