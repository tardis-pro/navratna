/**
 * Circuit Breaker — inline implementation (no opossum dependency).
 *
 * Protects MCP calls and federation crawls from cascading failures by
 * tracking consecutive errors and temporarily refusing requests when a
 * downstream is unhealthy.
 *
 * States:
 *   closed    -> normal operation, calls pass through
 *   open      -> downstream unhealthy, calls rejected immediately
 *   half-open -> probing downstream; limited successes needed to close
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening the circuit (default 5) */
  failureThreshold: number;
  /** Time in ms the circuit stays open before transitioning to half-open (default 60 000) */
  resetTimeoutMs: number;
  /** Consecutive successes needed in half-open state to close the circuit (default 2) */
  halfOpenMaxAttempts: number;
}

export interface CircuitBreakerSnapshot {
  name: string;
  state: CircuitState;
  failureCount: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 2,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CircuitOpenError extends Error {
  constructor(circuitName: string) {
    super(`Circuit breaker "${circuitName}" is open — call rejected`);
    this.name = 'CircuitOpenError';
  }
}

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(
    private readonly name: string,
    options?: Partial<CircuitBreakerOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute `fn` through the circuit breaker.
   * Throws {@link CircuitOpenError} when the circuit is open and the reset
   * timeout has not yet elapsed.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Return a snapshot suitable for health / monitoring endpoints. */
  getState(): CircuitBreakerSnapshot {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
    };
  }

  // ── internal ──────────────────────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenMaxAttempts) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      // In closed state a success resets consecutive failure count.
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Any failure in half-open immediately re-opens.
      this.state = 'open';
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }
}

// ---------------------------------------------------------------------------
// CircuitBreakerRegistry — singleton map keyed by logical name
// ---------------------------------------------------------------------------

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /** Get an existing breaker or lazily create one with the given options. */
  getOrCreate(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /** Return all registered breakers — useful for a /health or /metrics endpoint. */
  getAll(): Map<string, CircuitBreaker> {
    return this.breakers;
  }
}
