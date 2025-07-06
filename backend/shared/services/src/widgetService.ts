import { 
  BaseWidget,
  WidgetInstance,
  WidgetRegistration,
  WidgetUpdate,
  WidgetAccessRequest,
  WidgetAccessResponse,
  WidgetRegistryQuery,
  WidgetUsage,
  WidgetError,
  WidgetPermission,
  WidgetCategory,
  WidgetStatus,
  SecurityLevel
} from '@uaip/types';
import { DatabaseService } from './databaseService.js';
import { logger } from '@uaip/utils';

export interface WidgetServiceOptions {
  enableRBAC: boolean;
  auditEnabled: boolean;
  defaultPermissions: WidgetPermission[];
  maxWidgetsPerUser: number;
  allowDynamicRegistration: boolean;
}

export class WidgetService {
  private databaseService: DatabaseService;
  private options: WidgetServiceOptions;

  constructor(
    databaseService: DatabaseService,
    options: Partial<WidgetServiceOptions> = {}
  ) {
    this.databaseService = databaseService;
    this.options = {
      enableRBAC: true,
      auditEnabled: true,
      defaultPermissions: [WidgetPermission.VIEW],
      maxWidgetsPerUser: 10,
      allowDynamicRegistration: true,
      ...options
    };
  }

  /**
   * Register a new widget
   */
  async registerWidget(registration: WidgetRegistration): Promise<BaseWidget> {
    if (!this.options.allowDynamicRegistration) {
      throw new Error('Dynamic widget registration is disabled');
    }

    logger.info('Registering new widget', { 
      name: registration.widget.name,
      category: registration.widget.category,
      registeredBy: registration.registeredBy
    });

    // Validate widget registration
    await this.validateWidgetRegistration(registration);

    // Create widget ID
    const widgetId = this.generateWidgetId();
    
    const widget: BaseWidget = {
      ...registration.widget,
      id: widgetId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Store widget in database
    await this.storeWidget(widget, registration);

    // Log audit event
    if (this.options.auditEnabled) {
      await this.logAuditEvent('widget_registered', registration.registeredBy, {
        widgetId,
        widgetName: widget.name,
        category: widget.category
      });
    }

    return widget;
  }

  /**
   * Get widgets accessible by a user
   */
  async getUserWidgets(
    userId: string, 
    query: Partial<WidgetRegistryQuery> = {}
  ): Promise<{
    widgets: BaseWidget[];
    total: number;
    page: number;
    limit: number;
  }> {
    logger.debug('Getting user widgets', { userId, query });

    // Get user context for RBAC
    const userContext = await this.getUserContext(userId);
    
    // Build database query
    const dbQuery = this.buildDatabaseQuery(query, userContext);
    
    // Execute query
    const result = await this.executeWidgetQuery(dbQuery, userContext);
    
    return result;
  }

  /**
   * Check widget access for a user
   */
  async checkWidgetAccess(
    widgetId: string, 
    userId: string
  ): Promise<WidgetAccessResponse> {
    logger.debug('Checking widget access', { widgetId, userId });

    if (!this.options.enableRBAC) {
      return {
        widgetId,
        userId,
        hasAccess: true,
        grantedPermissions: Object.values(WidgetPermission),
        deniedPermissions: [],
        accessLevel: WidgetPermission.ADMIN
      };
    }

    // Get widget and user data
    const [widget, userContext] = await Promise.all([
      this.getWidget(widgetId),
      this.getUserContext(userId)
    ]);

    if (!widget) {
      return {
        widgetId,
        userId,
        hasAccess: false,
        grantedPermissions: [],
        deniedPermissions: Object.values(WidgetPermission),
        accessLevel: WidgetPermission.VIEW,
        reason: 'Widget not found'
      };
    }

    return this.evaluateWidgetAccess(widget, userContext);
  }

  /**
   * Create a widget instance for a user
   */
  async createWidgetInstance(
    widgetId: string,
    userId: string,
    instanceConfig: {
      position: { x: number; y: number };
      size: { width: number; height: number };
      config?: any;
    }
  ): Promise<WidgetInstance> {
    logger.info('Creating widget instance', { widgetId, userId });

    // Check access
    const access = await this.checkWidgetAccess(widgetId, userId);
    if (!access.hasAccess) {
      throw new Error(`Access denied: ${access.reason}`);
    }

    // Check user widget limit
    const userInstanceCount = await this.getUserWidgetInstanceCount(userId);
    if (userInstanceCount >= this.options.maxWidgetsPerUser) {
      throw new Error(`Maximum widgets per user exceeded (${this.options.maxWidgetsPerUser})`);
    }

    // Get widget
    const widget = await this.getWidget(widgetId);
    if (!widget) {
      throw new Error('Widget not found');
    }

    // Create instance
    const instanceId = this.generateInstanceId();
    const instance: WidgetInstance = {
      ...widget,
      instanceId,
      userId,
      position: instanceConfig.position,
      size: instanceConfig.size,
      isVisible: true,
      isMinimized: false,
      isMaximized: false,
      instanceConfig: instanceConfig.config || {},
      lastInteraction: new Date(),
      sessionId: this.generateSessionId()
    };

    // Store instance
    await this.storeWidgetInstance(instance);

    // Log usage
    await this.logWidgetUsage({
      widgetId,
      userId,
      action: 'open',
      sessionId: instance.sessionId,
      timestamp: new Date()
    });

    return instance;
  }

  /**
   * Update widget instance
   */
  async updateWidgetInstance(
    instanceId: string,
    userId: string,
    updates: Partial<Pick<WidgetInstance, 'position' | 'size' | 'isVisible' | 'isMinimized' | 'isMaximized' | 'instanceConfig'>>
  ): Promise<WidgetInstance> {
    logger.debug('Updating widget instance', { instanceId, userId });

    const instance = await this.getWidgetInstance(instanceId, userId);
    if (!instance) {
      throw new Error('Widget instance not found');
    }

    const updatedInstance: WidgetInstance = {
      ...instance,
      ...updates,
      lastInteraction: new Date(),
      updatedAt: new Date()
    };

    await this.storeWidgetInstance(updatedInstance);

    // Log interaction
    await this.logWidgetUsage({
      widgetId: instance.id,
      userId,
      action: 'interact',
      sessionId: instance.sessionId,
      metadata: { updateType: Object.keys(updates) },
      timestamp: new Date()
    });

    return updatedInstance;
  }

  /**
   * Delete widget instance
   */
  async deleteWidgetInstance(instanceId: string, userId: string): Promise<boolean> {
    logger.info('Deleting widget instance', { instanceId, userId });

    const instance = await this.getWidgetInstance(instanceId, userId);
    if (!instance) {
      return false;
    }

    // Calculate session duration
    const duration = instance.lastInteraction 
      ? Math.floor((Date.now() - instance.lastInteraction.getTime()) / 1000)
      : 0;

    // Log usage
    await this.logWidgetUsage({
      widgetId: instance.id,
      userId,
      action: 'close',
      sessionId: instance.sessionId,
      duration,
      timestamp: new Date()
    });

    // Delete instance
    return await this.deleteWidgetInstanceFromDB(instanceId, userId);
  }

  /**
   * Get user's widget instances
   */
  async getUserWidgetInstances(userId: string): Promise<WidgetInstance[]> {
    logger.debug('Getting user widget instances', { userId });
    return await this.getUserWidgetInstancesFromDB(userId);
  }

  /**
   * Log widget usage
   */
  async logWidgetUsage(usage: WidgetUsage): Promise<void> {
    logger.debug('Logging widget usage', { 
      widgetId: usage.widgetId, 
      userId: usage.userId, 
      action: usage.action 
    });

    await this.storeWidgetUsage(usage);
  }

  /**
   * Log widget error
   */
  async logWidgetError(error: WidgetError): Promise<void> {
    logger.error('Widget error reported', {
      widgetId: error.widgetId,
      userId: error.userId,
      errorName: error.error.name,
      errorMessage: error.error.message,
      severity: error.severity
    });

    await this.storeWidgetError(error);
  }

  /**
   * Get widget analytics
   */
  async getWidgetAnalytics(
    widgetId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    totalUsage: number;
    uniqueUsers: number;
    averageSessionDuration: number;
    errorRate: number;
    popularActions: Array<{ action: string; count: number }>;
  }> {
    return await this.calculateWidgetAnalytics(widgetId, timeRange);
  }

  // Private methods

  private async validateWidgetRegistration(registration: WidgetRegistration): Promise<void> {
    // Check if widget name is unique
    const existingWidget = await this.getWidgetByName(registration.widget.name);
    if (existingWidget) {
      throw new Error(`Widget with name '${registration.widget.name}' already exists`);
    }

    // Validate registering user permissions
    const userContext = await this.getUserContext(registration.registeredBy);
    if (!userContext.permissions.includes('widget:register') && !userContext.permissions.includes('*')) {
      throw new Error('Insufficient permissions to register widgets');
    }

    // Validate widget structure
    if (!registration.widget.name || !registration.widget.title) {
      throw new Error('Widget must have name and title');
    }

    if (!Object.values(WidgetCategory).includes(registration.widget.category)) {
      throw new Error(`Invalid widget category: ${registration.widget.category}`);
    }
  }

  private async getUserContext(userId: string): Promise<{
    id: string;
    role: string;
    permissions: string[];
    department?: string;
    securityLevel: SecurityLevel;
  }> {
    const user = await this.databaseService.users.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // TODO: Implement getUserPermissions in UserService
    const permissions = { rolePermissions: [], directPermissions: [] };
    const allPermissions = [
      ...permissions.rolePermissions.flatMap(rp => rp.operations),
      ...permissions.directPermissions.flatMap(dp => dp.operations)
    ];

    return {
      id: user.id,
      role: user.role,
      permissions: allPermissions,
      department: user.department,
      securityLevel: user.securityClearance || SecurityLevel.MEDIUM
    };
  }

  private evaluateWidgetAccess(
    widget: BaseWidget, 
    userContext: { id: string; role: string; permissions: string[]; department?: string; securityLevel: SecurityLevel }
  ): WidgetAccessResponse {
    const rbac = widget.rbac;
    const grantedPermissions: WidgetPermission[] = [];
    const deniedPermissions: WidgetPermission[] = [];

    // Check explicit denials
    if (rbac.deniedUsers?.includes(userContext.id)) {
      return {
        widgetId: widget.id,
        userId: userContext.id,
        hasAccess: false,
        grantedPermissions: [],
        deniedPermissions: Object.values(WidgetPermission),
        accessLevel: WidgetPermission.VIEW,
        reason: 'User explicitly denied access'
      };
    }

    // Check security level
    if (rbac.requiredSecurityLevel && 
        this.getSecurityLevelValue(userContext.securityLevel) < this.getSecurityLevelValue(rbac.requiredSecurityLevel)) {
      return {
        widgetId: widget.id,
        userId: userContext.id,
        hasAccess: false,
        grantedPermissions: [],
        deniedPermissions: Object.values(WidgetPermission),
        accessLevel: WidgetPermission.VIEW,
        reason: 'Insufficient security clearance'
      };
    }

    // Check role requirements
    if (rbac.requiredRoles && rbac.requiredRoles.length > 0) {
      if (!rbac.requiredRoles.includes(userContext.role)) {
        return {
          widgetId: widget.id,
          userId: userContext.id,
          hasAccess: false,
          grantedPermissions: [],
          deniedPermissions: Object.values(WidgetPermission),
          accessLevel: WidgetPermission.VIEW,
          reason: 'Role not authorized'
        };
      }
    }

    // Check department restrictions
    if (rbac.allowedDepartments && rbac.allowedDepartments.length > 0) {
      if (!userContext.department || !rbac.allowedDepartments.includes(userContext.department)) {
        return {
          widgetId: widget.id,
          userId: userContext.id,
          hasAccess: false,
          grantedPermissions: [],
          deniedPermissions: Object.values(WidgetPermission),
          accessLevel: WidgetPermission.VIEW,
          reason: 'Department not authorized'
        };
      }
    }

    // Check explicit allowances (overrides other restrictions)
    if (rbac.allowedUsers?.includes(userContext.id)) {
      return {
        widgetId: widget.id,
        userId: userContext.id,
        hasAccess: true,
        grantedPermissions: Object.values(WidgetPermission),
        deniedPermissions: [],
        accessLevel: WidgetPermission.ADMIN,
        reason: 'User explicitly granted access'
      };
    }

    // Evaluate permissions
    const userPermissionSet = new Set(userContext.permissions);
    
    for (const permission of Object.values(WidgetPermission)) {
      const hasPermission = userPermissionSet.has(`widget:${permission}`) ||
                           userPermissionSet.has('widget:*') ||
                           userPermissionSet.has('*');

      if (hasPermission) {
        grantedPermissions.push(permission);
      } else {
        deniedPermissions.push(permission);
      }
    }

    // Check minimum required permissions
    const hasRequiredPermissions = rbac.requiredPermissions.every(reqPerm => 
      grantedPermissions.includes(reqPerm)
    );

    if (!hasRequiredPermissions) {
      return {
        widgetId: widget.id,
        userId: userContext.id,
        hasAccess: false,
        grantedPermissions,
        deniedPermissions,
        accessLevel: WidgetPermission.VIEW,
        reason: 'Insufficient permissions'
      };
    }

    // Determine access level
    let accessLevel = WidgetPermission.VIEW;
    if (grantedPermissions.includes(WidgetPermission.ADMIN)) {
      accessLevel = WidgetPermission.ADMIN;
    } else if (grantedPermissions.includes(WidgetPermission.MANAGE)) {
      accessLevel = WidgetPermission.MANAGE;
    } else if (grantedPermissions.includes(WidgetPermission.CONFIGURE)) {
      accessLevel = WidgetPermission.CONFIGURE;
    } else if (grantedPermissions.includes(WidgetPermission.INTERACT)) {
      accessLevel = WidgetPermission.INTERACT;
    }

    return {
      widgetId: widget.id,
      userId: userContext.id,
      hasAccess: true,
      grantedPermissions,
      deniedPermissions,
      accessLevel
    };
  }

  private getSecurityLevelValue(level: SecurityLevel): number {
    switch (level) {
      case SecurityLevel.LOW: return 1;
      case SecurityLevel.MEDIUM: return 2;
      case SecurityLevel.HIGH: return 3;
      case SecurityLevel.CRITICAL: return 4;
      default: return 0;
    }
  }

  private generateWidgetId(): string {
    return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateInstanceId(): string {
    return `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Database operations (to be implemented based on your database structure)
  private async storeWidget(widget: BaseWidget, registration: WidgetRegistration): Promise<void> {
    // Implementation depends on your database schema
    logger.debug('Storing widget in database', { widgetId: widget.id });
    // TODO: Implement database storage
  }

  private async getWidget(widgetId: string): Promise<BaseWidget | null> {
    // Implementation depends on your database schema
    logger.debug('Getting widget from database', { widgetId });
    // TODO: Implement database retrieval
    return null;
  }

  private async getWidgetByName(name: string): Promise<BaseWidget | null> {
    // Implementation depends on your database schema
    logger.debug('Getting widget by name from database', { name });
    // TODO: Implement database retrieval
    return null;
  }

  private buildDatabaseQuery(query: Partial<WidgetRegistryQuery>, userContext: any): any {
    // Build database-specific query
    logger.debug('Building database query', { query });
    // TODO: Implement query building
    return {};
  }

  private async executeWidgetQuery(dbQuery: any, userContext: any): Promise<{
    widgets: BaseWidget[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Execute database query
    logger.debug('Executing widget query');
    // TODO: Implement query execution
    return {
      widgets: [],
      total: 0,
      page: 1,
      limit: 20
    };
  }

  private async storeWidgetInstance(instance: WidgetInstance): Promise<void> {
    logger.debug('Storing widget instance', { instanceId: instance.instanceId });
    // TODO: Implement database storage
  }

  private async getWidgetInstance(instanceId: string, userId: string): Promise<WidgetInstance | null> {
    logger.debug('Getting widget instance', { instanceId, userId });
    // TODO: Implement database retrieval
    return null;
  }

  private async deleteWidgetInstanceFromDB(instanceId: string, userId: string): Promise<boolean> {
    logger.debug('Deleting widget instance from database', { instanceId, userId });
    // TODO: Implement database deletion
    return true;
  }

  private async getUserWidgetInstancesFromDB(userId: string): Promise<WidgetInstance[]> {
    logger.debug('Getting user widget instances from database', { userId });
    // TODO: Implement database retrieval
    return [];
  }

  private async getUserWidgetInstanceCount(userId: string): Promise<number> {
    logger.debug('Getting user widget instance count', { userId });
    // TODO: Implement database count
    return 0;
  }

  private async storeWidgetUsage(usage: WidgetUsage): Promise<void> {
    logger.debug('Storing widget usage', { widgetId: usage.widgetId, action: usage.action });
    // TODO: Implement database storage
  }

  private async storeWidgetError(error: WidgetError): Promise<void> {
    logger.error('Storing widget error', { widgetId: error.widgetId, severity: error.severity });
    // TODO: Implement database storage
  }

  private async calculateWidgetAnalytics(widgetId: string, timeRange: { start: Date; end: Date }): Promise<{
    totalUsage: number;
    uniqueUsers: number;
    averageSessionDuration: number;
    errorRate: number;
    popularActions: Array<{ action: string; count: number }>;
  }> {
    logger.debug('Calculating widget analytics', { widgetId, timeRange });
    // TODO: Implement analytics calculation
    return {
      totalUsage: 0,
      uniqueUsers: 0,
      averageSessionDuration: 0,
      errorRate: 0,
      popularActions: []
    };
  }

  private async logAuditEvent(event: string, userId: string, details: any): Promise<void> {
    logger.info('Widget audit event', { event, userId, details });
    // TODO: Implement audit logging
  }
} 