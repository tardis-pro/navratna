import { z } from 'zod';
import { withRequiredAuth } from './middleware/auth.plugin.js';
import { UserToolPreferencesService, DatabaseService } from '@uaip/shared-services';

let service: UserToolPreferencesService | null = null;
async function getService(): Promise<UserToolPreferencesService> {
  if (!service) {
    const dataSource = await DatabaseService.getInstance().getDataSource();
    service = new UserToolPreferencesService(dataSource);
  }
  return service;
}

const setPreferencesSchema = z.object({
  toolId: z.string().uuid(),
  parameterDefaults: z.record(z.any()).optional(),
  customConfig: z.record(z.any()).optional(),
  isFavorite: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  rateLimits: z.record(z.number()).optional(),
  budgetLimit: z.number().optional(),
  notifyOnCompletion: z.boolean().optional(),
  notifyOnError: z.boolean().optional()
});

export function registerToolPreferenceRoutes(app: any): any {
  return app.group('/api/v1/users', (app: any) => withRequiredAuth(app)
    // GET /:userId/tool-preferences
    .get('/:userId/tool-preferences', async ({ set, params, user }) => {
      const { userId } = params as any;
      if (user!.id !== userId && (user!.role !== 'system_admin' && user!.role !== 'admin')) { set.status = 403; return { success: false, message: 'Access denied. You can only view your own tool preferences.' }; }
      const svc = await getService();
      const toolAccess = await svc.getUserToolAccess(userId);
      return { success: true, data: toolAccess };
    })

    // GET /:userId/available-tools
    .get('/:userId/available-tools', async ({ set, params, user }) => {
      const { userId } = params as any;
      if (user!.id !== userId && (user!.role !== 'system_admin' && user!.role !== 'admin')) { set.status = 403; return { success: false, message: 'Access denied. You can only view available tools for your account.' }; }
      const svc = await getService();
      const tools = await svc.getAvailableToolsForUser(userId);
      return { success: true, data: tools };
    })

    // POST /:userId/tools/set-preferences
    .post('/:userId/tools/set-preferences', async ({ set, params, body, user }) => {
      const { userId } = params as any;
      if (user!.id !== userId && (user!.role !== 'system_admin' && user!.role !== 'admin')) { set.status = 403; return { success: false, message: 'Access denied. You can only modify your own tool preferences.' }; }
      const parsed = setPreferencesSchema.safeParse(body);
      if (!parsed.success) { set.status = 400; return { success: false, message: 'Validation failed', details: parsed.error.issues }; }
      const svc = await getService();
      const preferences = await svc.setUserToolPreferences({
        userId,
        toolId: parsed.data.toolId,
        parameterDefaults: parsed.data.parameterDefaults,
        customConfig: parsed.data.customConfig,
        isFavorite: parsed.data.isFavorite,
        isEnabled: parsed.data.isEnabled,
        autoApprove: parsed.data.autoApprove,
        rateLimits: parsed.data.rateLimits,
        budgetLimit: parsed.data.budgetLimit,
        notifyOnCompletion: parsed.data.notifyOnCompletion,
        notifyOnError: parsed.data.notifyOnError
      });
      return { success: true, data: preferences };
    })

    // GET /:userId/tool-preferences/:toolId
    .get('/:userId/tool-preferences/:toolId', async ({ set, params, user }) => {
      const { userId, toolId } = params as any;
      if (user!.id !== userId && (user!.role !== 'system_admin' && user!.role !== 'admin')) { set.status = 403; return { success: false, message: 'Access denied. You can only view your own tool preferences.' }; }
      const svc = await getService();
      const preferences = await svc.getUserToolPreferences(userId, toolId);
      if (!preferences) { set.status = 404; return { success: false, message: 'Tool preferences not found' }; }
      return { success: true, data: preferences };
    })

    // GET /:userId/favorite-tools
    .get('/:userId/favorite-tools', async ({ set, params, user }) => {
      const { userId } = params as any;
      if (user!.id !== userId && (user!.role !== 'system_admin' && user!.role !== 'admin')) { set.status = 403; return { success: false, message: 'Access denied. You can only view your own favorite tools.' }; }
      const svc = await getService();
      const favorites = await svc.getUserFavoriteTools(userId);
      return { success: true, data: favorites };
    })

    // GET /:userId/tool-usage-stats
    .get('/:userId/tool-usage-stats', async ({ set, params, user }) => {
      const { userId } = params as any;
      if (user!.id !== userId && (user!.role !== 'system_admin' && user!.role !== 'admin')) { set.status = 403; return { success: false, message: 'Access denied. You can only view your own usage statistics.' }; }
      const svc = await getService();
      const stats = await svc.getUserToolUsageStats(userId);
      return { success: true, data: stats };
    })

    // POST /:userId/tools/:toolId/check-access
    .post('/:userId/tools/:toolId/check-access', async ({ set, params, user }) => {
      const { userId, toolId } = params as any;
      if (user!.id !== userId && (user!.role !== 'system_admin' && user!.role !== 'admin')) { set.status = 403; return { success: false, message: 'Access denied. You can only check access for your own account.' }; }
      const svc = await getService();
      const canAccess = await svc.canUserAccessTool(userId, toolId);
      return { success: true, data: { canAccess, userId, toolId } };
    })
  );
}

export default registerToolPreferenceRoutes;
