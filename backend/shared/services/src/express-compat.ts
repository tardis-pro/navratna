/**
 * Express Compatibility Layer for HyperExpress
 * Import this instead of 'express' to use HyperExpress with Express-like APIs
 */

export { HyperExpressPolyfill as Application, createHyperExpressApp } from './HyperExpressPolyfill.js';

import hyperExpress, { HyperExpressRouter } from './HyperExpressPolyfill.js';

// Export types from Express for compatibility
export interface Request {
  body?: any;
  params?: { [key: string]: string };
  query?: { [key: string]: string | string[] };
  headers?: { [key: string]: string | string[] };
  method?: string;
  path?: string;
  url?: string;
  route?: any;
  user?: any;
  id?: string;
  ip?: string;
  get?: (name: string) => string | undefined;
  session?: any;
  csrfToken?: () => string;
  [key: string]: any;
}

export interface Response {
  status?: (code: number) => Response;
  json?: (obj: any) => void;
  send?: (data: any) => void;
  cookie?: (name: string, value: string, options?: any) => Response;
  redirect?: (url: string) => void;
  render?: (view: string, locals?: any) => void;
  end?: () => void;
  [key: string]: any;
}

export type NextFunction = (error?: any) => void;
export type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;
export type RouterType = HyperExpressRouter;

// Router factory function
export const Router = (): HyperExpressRouter => {
  return new HyperExpressRouter();
};

// Default export
export default hyperExpress;