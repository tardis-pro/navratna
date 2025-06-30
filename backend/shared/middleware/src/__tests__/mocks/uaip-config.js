module.exports = {
  config: {
    jwt: {
      secret: 'test-secret',
      expiresIn: '1h',
      refreshSecret: 'test-refresh-secret',
      refreshExpiresIn: '7d'
    },
    server: {
      port: 3000,
      host: 'localhost',
      cors: {
        origin: '*',
        credentials: true
      }
    },
    rateLimiter: {
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many requests'
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false
    },
    monitoring: {
      metricsEnabled: true
    },
    metrics: {
      enabled: true,
      port: 9090,
      endpoint: '/metrics'
    }
  },
  getJwtConfig: function() {
    return this.config.jwt;
  },
  getRateLimiterConfig: function() {
    return this.config.rateLimiter;
  },
  getMetricsConfig: function() {
    return this.config.metrics;
  }
};