import { logger } from '@uaip/utils';
import { EventEmitter } from 'events';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
  halfOpenRetries: number;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface HealthCheckOptions {
  timeout: number;
  interval: number;
  retries: number;
  gracefulShutdownTimeout: number;
}

export interface MetricsOptions {
  collectSystemMetrics: boolean;
  collectBusinessMetrics: boolean;
  metricsRetentionDays: number;
  aggregationIntervals: number[];
}

export interface SecurityOptions {
  maxFileSize: number;
  allowedMimeTypes: string[];
  maxFilesPerBatch: number;
  scanForMalware: boolean;
  validateContent: boolean;
  sanitizeInput: boolean;
  rateLimiting: RateLimitOptions;
}

/**
 * Circuit Breaker Pattern Implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;
  private lastFailTime = 0;
  private nextAttempt = 0;
  private halfOpenRetries = 0;

  constructor(
    private readonly fn: (...args: any[]) => Promise<any>,
    private readonly options: CircuitBreakerOptions
  ) {
    super();
  }

  async execute(...args: any[]): Promise<any> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
      this.halfOpenRetries = 0;
    }

    try {
      const result = await this.fn(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.halfOpenRetries = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.emit('closed');
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.halfOpenRetries++;
      if (this.halfOpenRetries >= this.options.halfOpenRetries) {
        this.state = 'OPEN';
        this.nextAttempt = Date.now() + this.options.resetTimeout;
        this.emit('opened');
      }
    } else if (this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      this.emit('opened');
    }
  }

  getState(): string {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailTime: this.lastFailTime,
      nextAttempt: this.nextAttempt
    };
  }
}

/**
 * Retry Pattern with Exponential Backoff
 */
export class RetryManager {
  constructor(private readonly options: RetryOptions) {}

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt);
          logger.debug(`Retry attempt ${attempt} after ${delay}ms`, { context });
          await this.sleep(delay);
        }

        const result = await fn();
        
        if (attempt > 0) {
          logger.info(`Operation succeeded after ${attempt} retries`, { context });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (this.isRetryableError(error)) {
          logger.warn(`Attempt ${attempt + 1} failed, retrying...`, {
            context,
            error: error.message,
            retriesLeft: this.options.maxRetries - attempt
          });
        } else {
          logger.error('Non-retryable error encountered', {
            context,
            error: error.message
          });
          throw error;
        }
      }
    }

    logger.error(`All retry attempts exhausted`, {
      context,
      attempts: this.options.maxRetries + 1,
      error: lastError.message
    });
    
    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    let delay = this.options.baseDelay * Math.pow(this.options.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, this.options.maxDelay);
    
    if (this.options.jitter) {
      delay *= (0.5 + Math.random() * 0.5); // Add ±25% jitter
    }
    
    return Math.floor(delay);
  }

  private isRetryableError(error: Error): boolean {
    // Define which errors are retryable
    const retryablePatterns = [
      /timeout/i,
      /connection/i,
      /network/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i,
      /503/i,
      /502/i,
      /504/i,
      /rate.limit/i,
      /too.many.requests/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Advanced Rate Limiter
 */
export class RateLimiter {
  private windows = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly options: RateLimitOptions) {
    // Cleanup expired windows every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const window = this.windows.get(key);

    if (!window || now >= window.resetTime) {
      // New window
      const resetTime = now + this.options.windowMs;
      this.windows.set(key, { count: 1, resetTime });
      
      return {
        allowed: true,
        remaining: this.options.maxRequests - 1,
        resetTime
      };
    }

    if (window.count >= this.options.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: window.resetTime
      };
    }

    window.count++;
    
    return {
      allowed: true,
      remaining: this.options.maxRequests - window.count,
      resetTime: window.resetTime
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, window] of this.windows.entries()) {
      if (now >= window.resetTime) {
        this.windows.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.windows.clear();
  }
}

/**
 * Health Check Manager
 */
export class HealthCheckManager extends EventEmitter {
  private healthChecks = new Map<string, HealthCheck>();
  private overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  private checkInterval: NodeJS.Timeout;

  constructor(private readonly options: HealthCheckOptions) {
    super();
    
    // Run health checks periodically
    this.checkInterval = setInterval(() => {
      this.runAllChecks();
    }, this.options.interval);
  }

  addHealthCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.healthChecks.set(name, {
      name,
      check,
      lastResult: null,
      lastRun: 0,
      consecutiveFailures: 0
    });
  }

  async runAllChecks(): Promise<HealthCheckSummary> {
    const results: Record<string, HealthCheckResult> = {};
    const promises: Promise<void>[] = [];

    for (const [name, healthCheck] of this.healthChecks.entries()) {
      promises.push(this.runSingleCheck(name, healthCheck).then(result => {
        results[name] = result;
      }));
    }

    await Promise.allSettled(promises);

    const summary = this.calculateOverallHealth(results);
    
    if (summary.status !== this.overallHealth) {
      this.overallHealth = summary.status;
      this.emit('healthChanged', summary);
    }

    return summary;
  }

  private async runSingleCheck(name: string, healthCheck: HealthCheck): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        healthCheck.check(),
        this.timeout(this.options.timeout)
      ]);

      healthCheck.lastResult = result;
      healthCheck.lastRun = Date.now();
      healthCheck.consecutiveFailures = result.status === 'unhealthy' ? healthCheck.consecutiveFailures + 1 : 0;

      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        status: 'unhealthy',
        details: { error: error.message },
        responseTime: Date.now() - startTime
      };

      healthCheck.lastResult = result;
      healthCheck.lastRun = Date.now();
      healthCheck.consecutiveFailures++;

      logger.warn(`Health check failed: ${name}`, {
        error: error.message,
        consecutiveFailures: healthCheck.consecutiveFailures
      });

      return result;
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), ms);
    });
  }

  private calculateOverallHealth(results: Record<string, HealthCheckResult>): HealthCheckSummary {
    const checks = Object.values(results);
    const healthy = checks.filter(c => c.status === 'healthy').length;
    const degraded = checks.filter(c => c.status === 'degraded').length;
    const unhealthy = checks.filter(c => c.status === 'unhealthy').length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    
    if (unhealthy > 0) {
      status = 'unhealthy';
    } else if (degraded > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      checks: results,
      summary: {
        total: checks.length,
        healthy,
        degraded,
        unhealthy
      },
      timestamp: new Date()
    };
  }

  getHealthStatus(): HealthCheckSummary {
    const results: Record<string, HealthCheckResult> = {};
    
    for (const [name, healthCheck] of this.healthChecks.entries()) {
      if (healthCheck.lastResult) {
        results[name] = healthCheck.lastResult;
      }
    }

    return this.calculateOverallHealth(results);
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

/**
 * Metrics Collector
 */
export class MetricsCollector {
  private metrics = new Map<string, Metric>();
  private timers = new Map<string, number>();

  constructor(private readonly options: MetricsOptions) {}

  // Counter metrics
  increment(name: string, value = 1, tags: Record<string, string> = {}): void {
    this.updateMetric(name, 'counter', value, tags);
  }

  // Gauge metrics
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    this.updateMetric(name, 'gauge', value, tags);
  }

  // Histogram metrics
  histogram(name: string, value: number, tags: Record<string, string> = {}): void {
    this.updateMetric(name, 'histogram', value, tags);
  }

  // Timer metrics
  startTimer(name: string): string {
    const id = `${name}_${Date.now()}_${Math.random()}`;
    this.timers.set(id, Date.now());
    return id;
  }

  endTimer(id: string, tags: Record<string, string> = {}): number {
    const startTime = this.timers.get(id);
    if (!startTime) {
      logger.warn('Timer not found', { id });
      return 0;
    }

    this.timers.delete(id);
    const duration = Date.now() - startTime;
    
    // Extract metric name from timer id
    const metricName = id.split('_')[0];
    this.histogram(`${metricName}.duration`, duration, tags);
    
    return duration;
  }

  // Get metrics
  getMetrics(): Record<string, Metric> {
    const result: Record<string, Metric> = {};
    for (const [name, metric] of this.metrics.entries()) {
      result[name] = { ...metric };
    }
    return result;
  }

  // Reset metrics
  reset(): void {
    this.metrics.clear();
    this.timers.clear();
  }

  private updateMetric(name: string, type: string, value: number, tags: Record<string, string>): void {
    const key = this.generateKey(name, tags);
    const existing = this.metrics.get(key);

    if (existing) {
      if (type === 'counter') {
        existing.value += value;
      } else if (type === 'gauge') {
        existing.value = value;
      } else if (type === 'histogram') {
        existing.count++;
        existing.sum += value;
        existing.min = Math.min(existing.min || value, value);
        existing.max = Math.max(existing.max || value, value);
        existing.value = existing.sum / existing.count; // Average
      }
      existing.lastUpdated = Date.now();
    } else {
      this.metrics.set(key, {
        name,
        type,
        value,
        tags,
        count: type === 'histogram' ? 1 : undefined,
        sum: type === 'histogram' ? value : undefined,
        min: type === 'histogram' ? value : undefined,
        max: type === 'histogram' ? value : undefined,
        lastUpdated: Date.now()
      });
    }
  }

  private generateKey(name: string, tags: Record<string, string>): string {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    
    return tagString ? `${name}{${tagString}}` : name;
  }
}

/**
 * Security Validator
 */
export class SecurityValidator {
  constructor(private readonly options: SecurityOptions) {}

  async validateFile(file: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // File size validation
    if (file.size > this.options.maxFileSize) {
      errors.push(`File size ${file.size} exceeds maximum allowed size ${this.options.maxFileSize}`);
    }

    // MIME type validation
    if (this.options.allowedMimeTypes.length > 0 && 
        !this.options.allowedMimeTypes.includes(file.mimetype)) {
      errors.push(`File type ${file.mimetype} is not allowed`);
    }

    // Content validation
    if (this.options.validateContent) {
      const contentValidation = await this.validateContent(file.buffer || file.content);
      errors.push(...contentValidation.errors);
      warnings.push(...contentValidation.warnings);
    }

    // Malware scanning
    if (this.options.scanForMalware) {
      const malwareResult = await this.scanForMalware(file.buffer || file.content);
      if (!malwareResult.clean) {
        errors.push('File failed malware scan');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      securityScore: this.calculateSecurityScore(errors, warnings)
    };
  }

  sanitizeInput(input: string): string {
    if (!this.options.sanitizeInput) {
      return input;
    }

    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/&lt;script/gi, '') // Remove encoded script tags
      .trim();
  }

  private async validateContent(content: string | Buffer): Promise<{ errors: string[], warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /eval\(/i,
      /document\.write/i,
      /window\.location/i
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(text)) {
        warnings.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    }

    // Check for excessive size
    if (text.length > 1000000) { // 1MB
      warnings.push('File content is very large and may impact performance');
    }

    return { errors, warnings };
  }

  private async scanForMalware(content: string | Buffer): Promise<{ clean: boolean, threats: string[] }> {
    // Simplified malware scanning - in production, integrate with actual malware scanner
    const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
    const threats: string[] = [];

    // Basic signature-based detection
    const malwareSignatures = [
      /eval\s*\(\s*["'][\w\W]*["']\s*\)/gi,
      /document\.write\s*\(\s*unescape/gi,
      /String\.fromCharCode\s*\(/gi,
      /ActiveXObject/gi
    ];

    for (const signature of malwareSignatures) {
      if (signature.test(text)) {
        threats.push(`Malware signature detected: ${signature.source}`);
      }
    }

    return {
      clean: threats.length === 0,
      threats
    };
  }

  private calculateSecurityScore(errors: string[], warnings: string[]): number {
    let score = 100;
    score -= errors.length * 25; // Each error reduces score by 25
    score -= warnings.length * 5; // Each warning reduces score by 5
    return Math.max(0, score);
  }
}

// Type definitions
interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
  lastResult: HealthCheckResult | null;
  lastRun: number;
  consecutiveFailures: number;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details?: Record<string, any>;
  responseTime?: number;
}

interface HealthCheckSummary {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthCheckResult>;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
  timestamp: Date;
}

interface Metric {
  name: string;
  type: string;
  value: number;
  tags: Record<string, string>;
  count?: number;
  sum?: number;
  min?: number;
  max?: number;
  lastUpdated: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  securityScore: number;
}

/**
 * Production Hardening Orchestrator
 */
export class ProductionHardeningService {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private retryManager: RetryManager;
  private rateLimiter: RateLimiter;
  private healthCheckManager: HealthCheckManager;
  private metricsCollector: MetricsCollector;
  private securityValidator: SecurityValidator;

  constructor(
    retryOptions: RetryOptions = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true
    },
    rateLimitOptions: RateLimitOptions = {
      windowMs: 60000, // 1 minute
      maxRequests: 100
    },
    healthCheckOptions: HealthCheckOptions = {
      timeout: 5000,
      interval: 30000,
      retries: 3,
      gracefulShutdownTimeout: 30000
    },
    metricsOptions: MetricsOptions = {
      collectSystemMetrics: true,
      collectBusinessMetrics: true,
      metricsRetentionDays: 7,
      aggregationIntervals: [60, 300, 900] // 1min, 5min, 15min
    },
    securityOptions: SecurityOptions = {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedMimeTypes: ['text/plain', 'application/json', 'text/csv'],
      maxFilesPerBatch: 20,
      scanForMalware: true,
      validateContent: true,
      sanitizeInput: true,
      rateLimiting: rateLimitOptions
    }
  ) {
    this.retryManager = new RetryManager(retryOptions);
    this.rateLimiter = new RateLimiter(rateLimitOptions);
    this.healthCheckManager = new HealthCheckManager(healthCheckOptions);
    this.metricsCollector = new MetricsCollector(metricsOptions);
    this.securityValidator = new SecurityValidator(securityOptions);

    this.setupDefaultHealthChecks();
    this.setupGracefulShutdown();
  }

  // Circuit breaker management
  createCircuitBreaker(name: string, fn: (...args: any[]) => Promise<any>, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    const defaultOptions: CircuitBreakerOptions = {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringWindow: 600000,
      halfOpenRetries: 3
    };

    const breaker = new CircuitBreaker(fn, { ...defaultOptions, ...options });
    this.circuitBreakers.set(name, breaker);

    // Add metrics tracking
    breaker.on('opened', () => {
      this.metricsCollector.increment('circuit_breaker.opened', 1, { name });
      logger.warn(`Circuit breaker opened: ${name}`);
    });

    breaker.on('closed', () => {
      this.metricsCollector.increment('circuit_breaker.closed', 1, { name });
      logger.info(`Circuit breaker closed: ${name}`);
    });

    return breaker;
  }

  // Retry with metrics
  async executeWithRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    const timer = this.metricsCollector.startTimer(`retry.${context}`);
    
    try {
      const result = await this.retryManager.execute(fn, context);
      this.metricsCollector.increment(`retry.${context}.success`);
      return result;
    } catch (error) {
      this.metricsCollector.increment(`retry.${context}.failure`);
      throw error;
    } finally {
      this.metricsCollector.endTimer(timer, { context });
    }
  }

  // Rate limiting
  async checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const result = await this.rateLimiter.checkLimit(key);
    
    this.metricsCollector.increment('rate_limit.checks', 1, { 
      allowed: result.allowed.toString() 
    });

    if (!result.allowed) {
      this.metricsCollector.increment('rate_limit.blocked');
    }

    return result;
  }

  // Health checks
  addHealthCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.healthCheckManager.addHealthCheck(name, check);
  }

  async getHealthStatus(): Promise<HealthCheckSummary> {
    return this.healthCheckManager.getHealthStatus();
  }

  // Metrics
  getMetrics(): Record<string, Metric> {
    return this.metricsCollector.getMetrics();
  }

  recordMetric(name: string, value: number, type: 'counter' | 'gauge' | 'histogram' = 'counter', tags: Record<string, string> = {}): void {
    switch (type) {
      case 'counter':
        this.metricsCollector.increment(name, value, tags);
        break;
      case 'gauge':
        this.metricsCollector.gauge(name, value, tags);
        break;
      case 'histogram':
        this.metricsCollector.histogram(name, value, tags);
        break;
    }
  }

  // Security
  async validateFile(file: any): Promise<ValidationResult> {
    const timer = this.metricsCollector.startTimer('security.file_validation');
    
    try {
      const result = await this.securityValidator.validateFile(file);
      
      this.metricsCollector.increment('security.file_validation.total');
      this.metricsCollector.increment('security.file_validation.result', 1, {
        valid: result.valid.toString()
      });
      this.metricsCollector.gauge('security.score', result.securityScore);

      return result;
    } finally {
      this.metricsCollector.endTimer(timer);
    }
  }

  sanitizeInput(input: string): string {
    return this.securityValidator.sanitizeInput(input);
  }

  // Graceful shutdown
  private setupGracefulShutdown(): void {
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      // Stop accepting new requests
      this.rateLimiter.destroy();
      this.healthCheckManager.destroy();
      
      // Wait for ongoing operations to complete
      setTimeout(() => {
        logger.info('Graceful shutdown completed');
        process.exit(0);
      }, 5000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  private setupDefaultHealthChecks(): void {
    // Memory health check
    this.addHealthCheck('memory', async () => {
      const memUsage = process.memoryUsage();
      const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      if (memUsagePercent > 90) {
        return { status: 'unhealthy', details: { memUsagePercent } };
      } else if (memUsagePercent > 75) {
        return { status: 'degraded', details: { memUsagePercent } };
      } else {
        return { status: 'healthy', details: { memUsagePercent } };
      }
    });

    // Event loop lag health check
    this.addHealthCheck('event_loop', async () => {
      const start = Date.now();
      
      return new Promise<HealthCheckResult>((resolve) => {
        setImmediate(() => {
          const lag = Date.now() - start;
          
          if (lag > 100) {
            resolve({ status: 'unhealthy', details: { lag }, responseTime: lag });
          } else if (lag > 50) {
            resolve({ status: 'degraded', details: { lag }, responseTime: lag });
          } else {
            resolve({ status: 'healthy', details: { lag }, responseTime: lag });
          }
        });
      });
    });
  }

  // Get system status
  async getSystemStatus(): Promise<SystemStatus> {
    const health = await this.getHealthStatus();
    const metrics = this.getMetrics();
    const circuitBreakerStats: Record<string, any> = {};
    
    for (const [name, breaker] of this.circuitBreakers.entries()) {
      circuitBreakerStats[name] = breaker.getStats();
    }

    return {
      health,
      metrics,
      circuitBreakers: circuitBreakerStats,
      timestamp: new Date(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  // Cleanup resources
  destroy(): void {
    this.rateLimiter.destroy();
    this.healthCheckManager.destroy();
    this.metricsCollector.reset();
  }
}

interface SystemStatus {
  health: HealthCheckSummary;
  metrics: Record<string, Metric>;
  circuitBreakers: Record<string, any>;
  timestamp: Date;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
}

// Export singleton instance
export const productionHardening = new ProductionHardeningService();