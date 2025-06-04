import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';

import { ArtifactFactory } from './ArtifactFactory.js';
import { ArtifactService } from './ArtifactService.js';
import { artifactRoutes } from './routes/artifactRoutes.js';

const app: Express = express();
const PORT = config.services?.artifactService?.port || 3004;

// Initialize core services
const artifactFactory = new ArtifactFactory();
const artifactService = new ArtifactService();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const factoryStatus = artifactFactory.getSystemStatus();
  const serviceHealth = artifactService.getServiceHealth();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'artifact-service',
    version: '1.0.0',
    factory: factoryStatus,
    serviceHealth: serviceHealth
  });
});

// API routes
app.use('/api/v1/artifacts', artifactRoutes(artifactService));

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Artifact Service running on port ${PORT}`);
  logger.info(`📊 Health check available at http://localhost:${PORT}/health`);
  logger.info(`🔧 API endpoints available at http://localhost:${PORT}/api/v1/artifacts`);
});

export { app, artifactFactory, artifactService }; 