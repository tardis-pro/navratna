module.exports = {
  config: {
    database: {
      postgres: {
        host: 'localhost',
        port: 5432,
        user: 'test_user',
        password: 'test_password',
        database: 'test_db',
        synchronize: false,
        logging: false,
        ssl: false,
        retryAttempts: 3,
        retryDelay: 3000,
        maxConnections: 10,
        dropSchema: false
      },
      redis: {
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0
      },
      neo4j: {
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'password'
      }
    },
    rabbitmq: {
      url: 'amqp://localhost:5672',
      exchange: 'uaip.events',
      queues: {
        operations: 'operations',
        agents: 'agents',
        notifications: 'notifications'
      }
    },
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
    getRedisConfig: function() {
      return {
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0
      };
    },
    getStateConfig: function() {
      return {
        compressionEnabled: true,
        maxCheckpointSize: 1024000
      };
    }
  }
};