import { CapabilityController } from '../controllers/capabilityController.js';
import { logger } from '@uaip/utils';

interface RouteRequest {
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  body: unknown;
  headers: Record<string, unknown>;
}

interface ControllerResponse {
  statusCode: number;
  body: unknown;
  json: (v: unknown) => unknown;
  send: (v?: unknown) => unknown;
  status: (code: number) => ControllerResponse;
}

interface RouteContext {
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
}

interface RouteGroup {
  get: (path: string, handler: (ctx: RouteContext) => Promise<unknown>) => RouteGroup;
  post: (path: string, handler: (ctx: RouteContext) => Promise<unknown>) => RouteGroup;
}

interface RouteApp {
  group: (path: string, handler: (group: RouteGroup) => RouteGroup) => RouteApp;
}

function createResponseObject() {
  const res: ControllerResponse = {
    statusCode: 200,
    body: undefined,
    json: (v: unknown) => {
      res.body = v;
      return v;
    },
    send: (v?: unknown) => {
      res.body = v;
      return v;
    },
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
  };
  return res;
}

async function invokeController(
  handler: (
    req: RouteRequest,
    res: ControllerResponse,
    next: (error?: unknown) => void
  ) => Promise<void>,
  req: RouteRequest
) {
  const res = createResponseObject();
  let nextError: unknown;

  await handler(req, res, (error?: unknown) => {
    if (error) {
      nextError = error;
    }
  });

  if (nextError) {
    throw nextError;
  }

  return res.body;
}

export function registerCapabilityRoutes(app: unknown, controller?: CapabilityController) {
  const routeApp = app as RouteApp;
  const capabilityController = controller ?? new CapabilityController();

  logger.info('Registering capability routes');
  return routeApp.group('/api/v1/capabilities', (g: RouteGroup) =>
    g
      .get('/search', async ({ query, headers }) =>
        invokeController(capabilityController.searchCapabilities.bind(capabilityController), {
          query: query ?? {},
          params: {},
          body: {},
          headers: headers ?? {},
        })
      )
      .post('/', async ({ body, headers }) =>
        invokeController(capabilityController.registerCapability.bind(capabilityController), {
          query: {},
          params: {},
          body,
          headers: headers ?? {},
        })
      )
      .get('/categories', async ({ headers }) =>
        invokeController(capabilityController.getCategories.bind(capabilityController), {
          query: {},
          params: {},
          body: {},
          headers: headers ?? {},
        })
      )
      .post('/:id/execute', async ({ params, body, headers }) =>
        invokeController(capabilityController.executeCapability.bind(capabilityController), {
          query: {},
          params: params ?? {},
          body,
          headers: headers ?? {},
        })
      )
      .get('/:id', async ({ params, headers }) =>
        invokeController(capabilityController.getCapability.bind(capabilityController), {
          query: {},
          params: params ?? {},
          body: {},
          headers: headers ?? {},
        })
      )
      .get('/', async ({ query, headers }) =>
        invokeController(capabilityController.listCapabilities.bind(capabilityController), {
          query: query ?? {},
          params: {},
          body: {},
          headers: headers ?? {},
        })
      )
  );
}
