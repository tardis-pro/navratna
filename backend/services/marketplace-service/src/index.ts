import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import marketplaceRoutes from './routes/marketplaceRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.MARKETPLACE_SERVICE_PORT || 3006;

// Initialize database
const databaseService = new DatabaseService();

// Middleware
app.use(helmet());
// CORS is handled by nginx API gateway - disable service-level CORS
// app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1/marketplace', marketplaceRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'marketplace-service',
    timestamp: new Date().toISOString() 
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
async function startServer() {
  try {
    // Initialize database connection
    await databaseService.connect();
    logger.info('Database connected successfully');

    app.listen(PORT, () => {
      logger.info(`🚀 Marketplace Service running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🏪 Marketplace API: http://localhost:${PORT}/api/v1/marketplace`);
    });
  } catch (error) {
    logger.error('Failed to start Marketplace Service:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await databaseService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await databaseService.disconnect();
  process.exit(0);
});

startServer();