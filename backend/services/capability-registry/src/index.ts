import dotenv from 'dotenv';
dotenv.config();

import { CapabilityRegistryApp } from './app';
import { logger } from '@uaip/utils';

async function main() {
  try {
    const app = new CapabilityRegistryApp();
    await app.initialize();
    
    const server = app.listen();
    
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
      await app.shutdown();
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start Capability Registry service:', error);
    process.exit(1);
  }
}

main(); 