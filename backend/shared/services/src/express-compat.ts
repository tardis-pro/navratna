/**
 * Express Compatibility Layer for HyperExpress
 * Import this instead of 'express' to use HyperExpress with Express-like APIs
 */

export {
  HyperExpressPolyfill as Application,
  HyperExpressRouter as Router,
  createHyperExpressApp,
  Router as RouterFactory
} from './HyperExpressPolyfill.js';

import hyperExpress from './HyperExpressPolyfill.js';

// Export types from Express for compatibility
export type Request = any;
export type Response = any;
export type NextFunction = (error?: any) => void;
export type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;

// Default export
export default hyperExpress;