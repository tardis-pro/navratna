import { z } from 'zod';
import { config as sharedConfig } from '@uaip/config';

// Discussion orchestration specific configuration schema
const DiscussionOrchestrationConfigSchema = z.object({
  port: z.number().default(3003),
  host: z.string().default('0.0.0.0'),
  
  // WebSocket configuration
  websocket: z.object({
    enabled: z.boolean().default(true),
    cors: z.object({
      origin: z.union([z.string(), z.array(z.string())]).default('*'),
      credentials: z.boolean().default(true)
    }),
    pingTimeout: z.number().default(60000),
    pingInterval: z.number().default(25000),
    maxConnections: z.number().default(1000),
    connectionTimeout: z.number().default(20000)
  }),

  // Turn management configuration
  turnManagement: z.object({
    defaultTimeout: z.number().default(300), // 5 minutes in seconds
    maxTimeout: z.number().default(1800), // 30 minutes in seconds
    minTimeout: z.number().default(30), // 30 seconds
    gracePeriod: z.number().default(30), // 30 seconds grace period
    autoAdvance: z.boolean().default(true),
    notificationThreshold: z.number().default(60) // Notify 1 minute before timeout
  }),

  // Discussion limits
  limits: z.object({
    maxParticipants: z.number().default(50),
    maxConcurrentDiscussions: z.number().default(100),
    maxMessageLength: z.number().default(10000),
    maxMessagesPerMinute: z.number().default(60),
    maxDiscussionDuration: z.number().default(86400) // 24 hours in seconds
  }),

  // Real-time features
  realTime: z.object({
    enableTypingIndicators: z.boolean().default(true),
    enablePresenceTracking: z.boolean().default(true),
    enableMessageDeliveryReceipts: z.boolean().default(true),
    messageBufferSize: z.number().default(100),
    presenceUpdateInterval: z.number().default(30000) // 30 seconds
  }),

  // Integration settings
  integrations: z.object({
    agentIntelligence: z.object({
      baseUrl: z.string().default('http://localhost:3001'),
      timeout: z.number().default(30000),
      retries: z.number().default(3)
    }),
    orchestrationPipeline: z.object({
      baseUrl: z.string().default('http://localhost:3002'),
      timeout: z.number().default(30000),
      retries: z.number().default(3)
    })
  }),

  // Performance settings
  performance: z.object({
    enableCaching: z.boolean().default(true),
    cacheTimeout: z.number().default(300), // 5 minutes
    enableCompression: z.boolean().default(true),
    enableMetrics: z.boolean().default(true),
    metricsInterval: z.number().default(60000) // 1 minute
  }),

  // Security settings
  security: z.object({
    enableRateLimiting: z.boolean().default(true),
    rateLimitWindow: z.number().default(900000), // 15 minutes
    rateLimitMax: z.number().default(100),
    enableInputSanitization: z.boolean().default(true),
    maxFileSize: z.number().default(10485760), // 10MB
    allowedFileTypes: z.array(z.string()).default([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/markdown'
    ])
  })
});

type DiscussionOrchestrationConfig = z.infer<typeof DiscussionOrchestrationConfigSchema>;

// Load and validate configuration
const loadConfig = (): DiscussionOrchestrationConfig => {
  const envConfig = {
    port: process.env.DISCUSSION_ORCHESTRATION_PORT ? parseInt(process.env.DISCUSSION_ORCHESTRATION_PORT) : undefined,
    host: process.env.DISCUSSION_ORCHESTRATION_HOST,
    
    websocket: {
      enabled: process.env.WEBSOCKET_ENABLED === 'true',
      cors: {
        origin: process.env.WEBSOCKET_CORS_ORIGIN?.split(',') || process.env.WEBSOCKET_CORS_ORIGIN,
        credentials: process.env.WEBSOCKET_CORS_CREDENTIALS === 'true'
      },
      pingTimeout: process.env.WEBSOCKET_PING_TIMEOUT ? parseInt(process.env.WEBSOCKET_PING_TIMEOUT) : undefined,
      pingInterval: process.env.WEBSOCKET_PING_INTERVAL ? parseInt(process.env.WEBSOCKET_PING_INTERVAL) : undefined,
      maxConnections: process.env.WEBSOCKET_MAX_CONNECTIONS ? parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS) : undefined,
      connectionTimeout: process.env.WEBSOCKET_CONNECTION_TIMEOUT ? parseInt(process.env.WEBSOCKET_CONNECTION_TIMEOUT) : undefined
    },

    turnManagement: {
      defaultTimeout: process.env.TURN_DEFAULT_TIMEOUT ? parseInt(process.env.TURN_DEFAULT_TIMEOUT) : undefined,
      maxTimeout: process.env.TURN_MAX_TIMEOUT ? parseInt(process.env.TURN_MAX_TIMEOUT) : undefined,
      minTimeout: process.env.TURN_MIN_TIMEOUT ? parseInt(process.env.TURN_MIN_TIMEOUT) : undefined,
      gracePeriod: process.env.TURN_GRACE_PERIOD ? parseInt(process.env.TURN_GRACE_PERIOD) : undefined,
      autoAdvance: process.env.TURN_AUTO_ADVANCE === 'true',
      notificationThreshold: process.env.TURN_NOTIFICATION_THRESHOLD ? parseInt(process.env.TURN_NOTIFICATION_THRESHOLD) : undefined
    },

    limits: {
      maxParticipants: process.env.MAX_PARTICIPANTS ? parseInt(process.env.MAX_PARTICIPANTS) : undefined,
      maxConcurrentDiscussions: process.env.MAX_CONCURRENT_DISCUSSIONS ? parseInt(process.env.MAX_CONCURRENT_DISCUSSIONS) : undefined,
      maxMessageLength: process.env.MAX_MESSAGE_LENGTH ? parseInt(process.env.MAX_MESSAGE_LENGTH) : undefined,
      maxMessagesPerMinute: process.env.MAX_MESSAGES_PER_MINUTE ? parseInt(process.env.MAX_MESSAGES_PER_MINUTE) : undefined,
      maxDiscussionDuration: process.env.MAX_DISCUSSION_DURATION ? parseInt(process.env.MAX_DISCUSSION_DURATION) : undefined
    },

    realTime: {
      enableTypingIndicators: process.env.ENABLE_TYPING_INDICATORS === 'true',
      enablePresenceTracking: process.env.ENABLE_PRESENCE_TRACKING === 'true',
      enableMessageDeliveryReceipts: process.env.ENABLE_MESSAGE_DELIVERY_RECEIPTS === 'true',
      messageBufferSize: process.env.MESSAGE_BUFFER_SIZE ? parseInt(process.env.MESSAGE_BUFFER_SIZE) : undefined,
      presenceUpdateInterval: process.env.PRESENCE_UPDATE_INTERVAL ? parseInt(process.env.PRESENCE_UPDATE_INTERVAL) : undefined
    },

    integrations: {
      agentIntelligence: {
        baseUrl: process.env.AGENT_INTELLIGENCE_BASE_URL,
        timeout: process.env.AGENT_INTELLIGENCE_TIMEOUT ? parseInt(process.env.AGENT_INTELLIGENCE_TIMEOUT) : undefined,
        retries: process.env.AGENT_INTELLIGENCE_RETRIES ? parseInt(process.env.AGENT_INTELLIGENCE_RETRIES) : undefined
      },
      orchestrationPipeline: {
        baseUrl: process.env.ORCHESTRATION_PIPELINE_BASE_URL,
        timeout: process.env.ORCHESTRATION_PIPELINE_TIMEOUT ? parseInt(process.env.ORCHESTRATION_PIPELINE_TIMEOUT) : undefined,
        retries: process.env.ORCHESTRATION_PIPELINE_RETRIES ? parseInt(process.env.ORCHESTRATION_PIPELINE_RETRIES) : undefined
      }
    },

    performance: {
      enableCaching: process.env.ENABLE_CACHING === 'true',
      cacheTimeout: process.env.CACHE_TIMEOUT ? parseInt(process.env.CACHE_TIMEOUT) : undefined,
      enableCompression: process.env.ENABLE_COMPRESSION === 'true',
      enableMetrics: process.env.ENABLE_METRICS === 'true',
      metricsInterval: process.env.METRICS_INTERVAL ? parseInt(process.env.METRICS_INTERVAL) : undefined
    },

    security: {
      enableRateLimiting: process.env.ENABLE_RATE_LIMITING === 'true',
      rateLimitWindow: process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW) : undefined,
      rateLimitMax: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : undefined,
      enableInputSanitization: process.env.ENABLE_INPUT_SANITIZATION === 'true',
      maxFileSize: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) : undefined,
      allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(',')
    }
  };

  // Remove undefined values to let defaults take effect
  const cleanConfig = JSON.parse(JSON.stringify(envConfig, (key, value) => value === undefined ? undefined : value));
  
  return DiscussionOrchestrationConfigSchema.parse(cleanConfig);
};

export const config = {
  ...sharedConfig,
  discussionOrchestration: loadConfig()
};

export type { DiscussionOrchestrationConfig }; 