import HyperExpress from 'hyper-express';

/**
 * HyperExpress Express Compatibility Polyfill
 * Makes HyperExpress behave like Express for existing middleware
 */
export class HyperExpressPolyfill {
  private server: HyperExpress.Server;
  public locals: { [key: string]: any } = {};
  private globalMiddleware: any[] = [];

  constructor(options?: HyperExpress.ServerConstructorOptions) {
    this.server = new HyperExpress.Server(options);
  }

  // Express-compatible middleware/route mounting
  use(pathOrMiddleware: any, ...middlewares: any[]): void {
    if (typeof pathOrMiddleware === 'string') {
      // Route mounting: app.use('/path', router)
      const path = pathOrMiddleware;
      const middleware = middlewares[0];

      if (middleware && typeof middleware === 'object' && middleware.stack) {
        // Express Router - mount its routes
        this.mountRouter(path, middleware);
      } else if (typeof middleware === 'function') {
        // Single middleware function
        this.server.use(path, this.wrapMiddleware(middleware));
      } else if (middlewares.length > 1) {
        // Multiple middlewares
        middlewares.forEach(mw => {
          if (typeof mw === 'function') {
            this.server.use(path, this.wrapMiddleware(mw));
          }
        });
      }
    } else if (typeof pathOrMiddleware === 'function') {
      // Global middleware: app.use(middleware)
      const wrappedMiddleware = this.wrapMiddleware(pathOrMiddleware);
      this.globalMiddleware.push(wrappedMiddleware);
      this.server.use(wrappedMiddleware);
    } else if (pathOrMiddleware && typeof pathOrMiddleware === 'object' && pathOrMiddleware.stack) {
      // Express Router at root
      this.mountRouter('', pathOrMiddleware);
    }
  }

  // Route methods - Express compatible
  get(path: string, ...handlers: any[]): void {
    const wrappedHandlers = handlers.map(h => this.wrapHandler(h));
    this.server.get(path, ...wrappedHandlers);
  }

  post(path: string, ...handlers: any[]): void {
    const wrappedHandlers = handlers.map(h => this.wrapHandler(h));
    this.server.post(path, ...wrappedHandlers);
  }

  put(path: string, ...handlers: any[]): void {
    const wrappedHandlers = handlers.map(h => this.wrapHandler(h));
    this.server.put(path, ...wrappedHandlers);
  }

  delete(path: string, ...handlers: any[]): void {
    const wrappedHandlers = handlers.map(h => this.wrapHandler(h));
    this.server.delete(path, ...wrappedHandlers);
  }

  patch(path: string, ...handlers: any[]): void {
    const wrappedHandlers = handlers.map(h => this.wrapHandler(h));
    this.server.patch(path, ...wrappedHandlers);
  }

  all(path: string, ...handlers: any[]): void {
    const wrappedHandlers = handlers.map(h => this.wrapHandler(h));
    // HyperExpress doesn't have .all(), so register for all methods
    const methods = ['get', 'post', 'put', 'delete', 'patch'];
    methods.forEach(method => {
      this.server[method](path, ...wrappedHandlers);
    });
  }

  // Listen method
  listen(port: number, host?: string | (() => void), callback?: () => void): Promise<void> {
    // Handle different Express signatures
    let listenHost = '0.0.0.0';
    let listenCallback = callback;
    
    if (typeof host === 'string') {
      listenHost = host;
    } else if (typeof host === 'function') {
      listenCallback = host;
    }
    
    return this.server.listen(port, listenHost).then(() => {
      if (listenCallback) listenCallback();
    });
  }

  // Additional Express methods
  set(key: string, value: any): void {
    this.locals[key] = value;
  }

  getSetting(key: string): any {
    return this.locals[key];
  }

  enable(setting: string): void {
    this.locals[setting] = true;
  }

  disable(setting: string): void {
    this.locals[setting] = false;
  }

  enabled(setting: string): boolean {
    return !!this.locals[setting];
  }

  disabled(setting: string): boolean {
    return !this.locals[setting];
  }

  // Expose the underlying HyperExpress server
  get hyperExpress(): HyperExpress.Server {
    return this.server;
  }

  private wrapHandler(handler: any) {
    return (request: HyperExpress.Request, response: HyperExpress.Response) => {
      const req = this.createExpressRequest(request);
      const res = this.createExpressResponse(response);
      return handler(req, res);
    };
  }

  private wrapMiddleware(middleware: any) {
    return (request: HyperExpress.Request, response: HyperExpress.Response) => {
      const req = this.createExpressRequest(request);
      const res = this.createExpressResponse(response);

      return new Promise<void>((resolve, reject) => {
        // Create next function that can handle errors
        const next: any = (error?: any) => {
          if (error) {
            // If there's an error, we need to look for error-handling middleware
            // Error middleware has 4 parameters (err, req, res, next)
            const errorMiddleware = this.findErrorMiddleware(middleware);
            if (errorMiddleware) {
              try {
                const result = errorMiddleware(error, req, res, next);
                if (result && typeof result.then === 'function') {
                  result.then(resolve).catch(reject);
                } else if (result === undefined) {
                  setTimeout(resolve, 0);
                }
              } catch (err) {
                console.error('Error in error middleware:', err);
                reject(err);
              }
            } else {
              // No error middleware found, reject the promise
              reject(error);
            }
          } else {
            resolve();
          }
        };

        // Make next bindable like Express next function
        next.bind = (_: any) => next;

        try {
          // Check if this is error middleware (has 4 parameters)
          const isErrorMiddleware = middleware.length === 4;

          let result;
          if (isErrorMiddleware) {
            // This is error middleware, but we don't have an error yet
            // We'll let the regular flow continue, and the error will be handled
            // by the next() function when an error occurs
            resolve();
            return;
          } else {
            // Regular middleware
            result = middleware(req, res, next);
          }

          // If middleware returns a promise, handle it
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          } else if (result === undefined) {
            // Synchronous middleware that doesn't call next() - assume success
            // This handles middleware that just sets properties and returns
            setTimeout(resolve, 0);
          }
        } catch (error) {
          console.error('Middleware error in HyperExpressPolyfill:', {
            errorMessage: error?.message,
            errorType: error?.constructor?.name,
            hasStack: !!error?.stack,
            requestPath: request.path,
            requestMethod: request.method
          });
          reject(error);
        }
      });
    };
  }

  // Helper method to find error middleware in the stack
  private findErrorMiddleware(currentMiddleware: any): any {
    // In a real implementation, this would search through the middleware stack
    // For now, we'll just return the middleware if it's an error middleware
    return currentMiddleware.length === 4 ? currentMiddleware : null;
  }

  private mountRouter(basePath: string, router: any): void {
    if (!router || !router.stack) {
      console.warn('HyperExpress: Invalid router or missing stack');
      return;
    }

    console.log(`HyperExpress: Mounting router at base path: "${basePath}", stack size: ${router.stack.length}`);

    // Mount each route from the Express router
    router.stack.forEach((layer: any, index: number) => {
      if (layer.route) {
        // This is a route layer
        const route = layer.route;
        const fullPath = basePath + route.path;

        // Get the HTTP methods for this route
        const methods = Object.keys(route.methods);
        console.log(`HyperExpress: Route ${fullPath} has methods: ${methods.join(', ')}`);
        methods.forEach((method: string) => {
          const methodLower = method.toLowerCase();
          if (!this.server[methodLower]) {
            console.warn(`HyperExpress: Unsupported method ${methodLower}`);
            return;
          }
          
          // Collect all middlewares and handlers for this route
          const allHandlers: any[] = [];
          
          // Add route-level middlewares (all but the last one)
          if (route.stack && route.stack.length > 1) {
            route.stack.slice(0, -1).forEach((stackLayer: any) => {
              if (stackLayer.handle) {
                allHandlers.push(this.wrapHandler(stackLayer.handle));
              }
            });
          }
          
          // Add the final handler
          const finalHandler = route.stack[route.stack.length - 1]?.handle;
          if (finalHandler) {
            allHandlers.push(this.wrapHandler(finalHandler));
          }
          
          if (allHandlers.length > 0) {
            this.server[methodLower](fullPath, ...allHandlers);
          }
        });
      } else if (layer.handle && typeof layer.handle === 'function') {
        // This is a router-level middleware layer
        const middlewarePath = basePath + (layer.regexp ? layer.regexp.source.replace(/^\^\\?|\\?\$$|\\\//g, '').replace(/\.\*/, '*') : '');
        
        // Apply middleware to the base path pattern
        if (middlewarePath === basePath || middlewarePath === basePath + '*') {
          // Apply to all routes under this base path
          this.server.use(basePath || '/', this.wrapMiddleware(layer.handle));
        } else {
          // Apply to specific path pattern
          this.server.use(middlewarePath, this.wrapMiddleware(layer.handle));
        }
        
        console.log(`HyperExpress: Mounted router middleware at ${middlewarePath || basePath || '/'}`);
      }
    });
  }

  private createExpressRequest(request: HyperExpress.Request): any {
    // Ensure headers is always an object with proper case-insensitive access
    let headers = {};
    if (request.headers && typeof request.headers === 'object') {
      // Normalize headers to lowercase keys for consistent access
      headers = Object.keys(request.headers).reduce((acc, key) => {
        acc[key.toLowerCase()] = request.headers[key];
        return acc;
      }, {} as any);
    }

    const expressReq = {
      ...request,
      body: request.body || {},
      params: request.params || {},
      query: request.query || {},
      headers: headers, // Always an object with normalized keys
      method: request.method,
      path: request.path,
      url: request.url,
      route: (request as any).route || null,
      user: (request as any).user || null,
      id: (request as any).id || null,
      ip: request.ip || '127.0.0.1',
      // Add HTTP version properties for morgan compatibility
      httpVersion: '1.1', // Default to HTTP/1.1 as HyperExpress doesn't expose this
      httpVersionMajor: 1,
      httpVersionMinor: 1,
      // Add common Express request properties that might be missing
      get: (name: string) => {
        return headers[name.toLowerCase()];
      },
      // Add connection object for compatibility
      connection: {
        remoteAddress: request.ip || '127.0.0.1'
      }
    };

    return expressReq;
  }

  private createExpressResponse(response: HyperExpress.Response): any {
    let currentStatusCode = 200;

    const expressRes = {
      json: (data: any) => response.json(data),
      send: (data: any) => response.send(data),
      end: (data?: any, encoding?: BufferEncoding, cb?: () => void) => {
        if (data) {
          response.send(data);
        }
        if (cb) cb();
        return expressRes;
      },
      status: (code: number) => {
        currentStatusCode = code;
        response.status(code);
        return expressRes; // Return the Express-like object for chaining
      },
      setHeader: (name: string, value: string) => response.header(name, value),
      header: (name: string, value: string) => response.header(name, value),
      getHeader: (name: string) => {
        // Morgan needs this to get response headers
        return (response as any).headers?.[name] || undefined;
      },
      removeHeader: (name: string) => {
        // HyperExpress has a built-in removeHeader method
        response.removeHeader(name);
        return expressRes;
      },
      get statusCode() {
        return currentStatusCode;
      },
      set statusCode(code: number) {
        currentStatusCode = code;
        response.status(code);
      },
      headersSent: false, // Placeholder - should be updated to reflect actual HyperExpress state
      locals: {}, // Express locals object
      // Add event emitter-like methods that Express response has
      on: (event: string, callback: () => void) => {
        // Mock implementation for middleware compatibility
        if (event === 'finish') {
          // Call immediately for now - could be enhanced later
          setTimeout(callback, 0);
        }
      }
    };

    // Make end method bindable
    expressRes.end = expressRes.end.bind(expressRes);

    return expressRes;
  }
}

// Factory function to replace express()
export function createHyperExpressApp(options?: HyperExpress.ServerConstructorOptions): HyperExpressPolyfill {
  return new HyperExpressPolyfill(options);
}

// Express Router replacement
export class HyperExpressRouter {
  public stack: any[] = [];
  private routes: { method: string; path: string; handlers: any[] }[] = [];

  use(pathOrMiddleware: any, ...middlewares: any[]): void {
    if (typeof pathOrMiddleware === 'string') {
      const path = pathOrMiddleware;
      middlewares.forEach(mw => {
        this.stack.push({
          route: null,
          handle: mw,
          regexp: new RegExp('^' + path.replace(/\//g, '\\/').replace(/\*/g, '.*') + '.*$'),
          keys: [],
          params: undefined,
          path: undefined,
          method: undefined
        });
      });
    } else if (typeof pathOrMiddleware === 'function') {
      this.stack.push({
        route: null,
        handle: pathOrMiddleware,
        regexp: /^.*$/,
        keys: [],
        params: undefined,
        path: undefined,
        method: undefined
      });
    }
  }

  get(path: string, ...handlers: any[]): void {
    this.addRoute('get', path, handlers);
  }

  post(path: string, ...handlers: any[]): void {
    this.addRoute('post', path, handlers);
  }

  put(path: string, ...handlers: any[]): void {
    this.addRoute('put', path, handlers);
  }

  delete(path: string, ...handlers: any[]): void {
    this.addRoute('delete', path, handlers);
  }

  patch(path: string, ...handlers: any[]): void {
    this.addRoute('patch', path, handlers);
  }

  all(path: string, ...handlers: any[]): void {
    const methods = ['get', 'post', 'put', 'delete', 'patch'];
    methods.forEach(method => this.addRoute(method, path, handlers));
  }

  private addRoute(method: string, path: string, handlers: any[]): void {
    // Create route structure similar to Express
    const route = {
      path: path,
      methods: { [method]: true },
      stack: handlers.map(handler => ({
        handle: handler,
        method: method,
        name: handler.name || 'anonymous'
      }))
    };

    this.stack.push({
      route: route,
      handle: (req: any, res: any, next: any) => {
        // This is a simplified route handler
        const handler = handlers[handlers.length - 1];
        return handler(req, res, next);
      },
      regexp: new RegExp('^' + path.replace(/\//g, '\\/').replace(/:\w+/g, '([^/]+)').replace(/\*/g, '.*') + '$'),
      keys: [],
      params: undefined,
      path: undefined,
      method: undefined
    });

    this.routes.push({ method, path, handlers });
  }
}

// Express-compatible default export function
export default function hyperExpress(options?: HyperExpress.ServerConstructorOptions): HyperExpressPolyfill {
  return new HyperExpressPolyfill(options);
}

// Router factory function
hyperExpress.Router = (): HyperExpressRouter => {
  return new HyperExpressRouter();
};

// Named exports for compatibility
export const Router = (): HyperExpressRouter => {
  return new HyperExpressRouter();
};