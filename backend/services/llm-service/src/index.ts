import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import llmRoutes from './routes/llmRoutes';
import userLLMRoutes from './routes/userLLMRoutes';
import healthRoutes from './routes/healthRoutes';

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/llm', llmRoutes);
app.use('/api/v1/user/llm', userLLMRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
async function startServer() {
  try {
    // Initialize database service before starting server
    logger.info('Initializing database service...');
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    logger.info('Database service initialized successfully');

    app.listen(PORT, () => {
      logger.info(`LLM Service API running on port ${PORT}`, {
        service: 'llm-service-api',
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
      });
    });
  } catch (error) {
    logger.error('Failed to start LLM Service API', { error });
    process.exit(1);
  }
}

startServer(); 