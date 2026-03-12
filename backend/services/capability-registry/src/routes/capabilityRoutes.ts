import { CapabilityController } from '../controllers/capabilityController.js';
import { logger } from '@uaip/utils';

function createResponseObject() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
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
  handler: (req: any, res: any, next: (error?: unknown) => void) => Promise<void>,
  req: any
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

export function registerCapabilityRoutes(app: any, controller?: CapabilityController) {
  const capabilityController = controller ?? new CapabilityController();

  logger.info('Registering capability routes');
  return app.group('/api/v1/capabilities', (g: any) =>
    g
      .get('/search', async ({ query, headers }: any) =>
        invokeController(capabilityController.searchCapabilities.bind(capabilityController), {
          query,
          params: {},
          body: {},
          headers,
        })
      )
      .post('/', async ({ body, headers }: any) =>
        invokeController(capabilityController.registerCapability.bind(capabilityController), {
          query: {},
          params: {},
          body,
          headers,
        })
      )
      .get('/categories', async ({ headers }: any) =>
        invokeController(capabilityController.getCategories.bind(capabilityController), {
          query: {},
          params: {},
          body: {},
          headers,
        })
      )
      .post('/:id/execute', async ({ params, body, headers }: any) =>
        invokeController(capabilityController.executeCapability.bind(capabilityController), {
          query: {},
          params,
          body,
          headers,
        })
      )
      .get('/:id', async ({ params, headers }: any) =>
        invokeController(capabilityController.getCapability.bind(capabilityController), {
          query: {},
          params,
          body: {},
          headers,
        })
      )
      .get('/', async ({ query, headers }: any) =>
        invokeController(capabilityController.listCapabilities.bind(capabilityController), {
          query,
          params: {},
          body: {},
          headers,
        })
      )
  );
}
