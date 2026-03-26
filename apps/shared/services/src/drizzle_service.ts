import {
  initializePlanes,
  getIntelligenceDb,
  getControlDb,
  getIntelligencePool,
  getControlPool,
  closePlanes,
  checkPlanesHealth,
  CrossPlaneGuard,
  type IntelligenceDB,
  type ControlDB,
} from './database/drizzle/clients/index';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'drizzle-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export class DrizzleService {
  private static instance: DrizzleService;
  private _initialized = false;

  private constructor() {}

  static getInstance(): DrizzleService {
    if (!DrizzleService.instance) {
      DrizzleService.instance = new DrizzleService();
    }
    return DrizzleService.instance;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    await initializePlanes();
    this._initialized = true;
    logger.info('DrizzleService initialized (both planes)');
  }

  async close(): Promise<void> {
    await closePlanes();
    this._initialized = false;
  }

  get intelligence(): IntelligenceDB {
    return getIntelligenceDb();
  }

  get control(): ControlDB {
    return getControlDb();
  }

  get guard(): typeof CrossPlaneGuard {
    return CrossPlaneGuard;
  }

  get intelligencePool() {
    return getIntelligencePool();
  }

  get controlPool() {
    return getControlPool();
  }

  async healthCheck() {
    return checkPlanesHealth();
  }

  get isInitialized(): boolean {
    return this._initialized;
  }
}

export const drizzleService = DrizzleService.getInstance();

export type { IntelligenceDB, ControlDB };
export { CrossPlaneGuard };
