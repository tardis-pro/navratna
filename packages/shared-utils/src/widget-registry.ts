import {
  BaseWidget,
  WidgetAccessResponse,
  WidgetPermission,
  WidgetCategory,
  WidgetStatus,
  WidgetRegistryQuery,
  WidgetRBAC,
  SecurityLevel,
} from '@uaip/types';

export interface UserContext {
  id: string;
  role: string;
  permissions: string[];
  department?: string;
  securityLevel: SecurityLevel;
  ipAddress?: string;
  userAgent?: string;
}

export interface WidgetRegistryOptions {
  enableRBAC: boolean;
  defaultPermissions: WidgetPermission[];
  allowDynamicRegistration: boolean;
  auditEnabled: boolean;
}

export class WidgetRegistry {
  private widgets: Map<string, BaseWidget> = new Map();
  private userAccess: Map<string, Map<string, WidgetAccessResponse>> = new Map();
  private options: WidgetRegistryOptions;

  constructor(options: Partial<WidgetRegistryOptions> = {}) {
    this.options = {
      enableRBAC: true,
      defaultPermissions: [WidgetPermission.VIEW],
      allowDynamicRegistration: true,
      auditEnabled: true,
      ...options,
    };
  }

  /**
   * Register a new widget in the registry
   */
  registerWidget(widget: BaseWidget): void {
    if (!this.options.allowDynamicRegistration) {
      throw new Error('Dynamic widget registration is disabled');
    }

    // Validate widget structure
    this.validateWidget(widget);

    // Store widget
    this.widgets.set(widget.id, widget);

    // Clear access cache for this widget
    this.clearWidgetAccessCache(widget.id);
  }

  /**
   * Unregister a widget
   */
  unregisterWidget(widgetId: string): boolean {
    const removed = this.widgets.delete(widgetId);
    if (removed) {
      this.clearWidgetAccessCache(widgetId);
    }
    return removed;
  }

  /**
   * Get all registered widgets
   */
  getAllWidgets(): BaseWidget[] {
    return Array.from(this.widgets.values());
  }

  /**
   * Get widgets accessible by a user
   */
  getAccessibleWidgets(userContext: UserContext): BaseWidget[] {
    if (!this.options.enableRBAC) {
      return this.getAllWidgets().filter((w) => w.status === WidgetStatus.ACTIVE);
    }

    return this.getAllWidgets().filter((widget) => {
      const access = this.checkWidgetAccess(widget.id, userContext);
      return access.hasAccess && widget.status === WidgetStatus.ACTIVE;
    });
  }

  /**
   * Query widgets with filters
   */
  queryWidgets(
    query: WidgetRegistryQuery,
    userContext?: UserContext
  ): {
    widgets: BaseWidget[];
    total: number;
    page: number;
    limit: number;
  } {
    let widgets = this.getAllWidgets();

    // Apply user access filter if RBAC is enabled and user context provided
    if (this.options.enableRBAC && userContext) {
      widgets = widgets.filter((widget) => {
        const access = this.checkWidgetAccess(widget.id, userContext);
        return access.hasAccess;
      });
    }

    // Apply filters
    if (query.category) {
      widgets = widgets.filter((w) => w.category === query.category);
    }

    if (query.status) {
      widgets = widgets.filter((w) => w.status === query.status);
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      widgets = widgets.filter(
        (w) =>
          w.name.toLowerCase().includes(searchLower) ||
          w.title.toLowerCase().includes(searchLower) ||
          w.metadata.description?.toLowerCase().includes(searchLower) ||
          w.metadata.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    if (query.tags && query.tags.length > 0) {
      const queryTags = query.tags;
      widgets = widgets.filter((w) => queryTags.some((tag) => w.metadata.tags?.includes(tag)));
    }

    // Sort widgets
    widgets.sort((a, b) => {
      let aValue: string | Date, bValue: string | Date;

      switch (query.sortBy) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'category':
          aValue = a.category;
          bValue = b.category;
          break;
        case 'createdAt':
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (query.sortOrder === 'desc') {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });

    const total = widgets.length;
    const startIndex = (query.page - 1) * query.limit;
    const paginatedWidgets = widgets.slice(startIndex, startIndex + query.limit);

    return {
      widgets: paginatedWidgets,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Check if user has access to a specific widget
   */
  checkWidgetAccess(widgetId: string, userContext: UserContext): WidgetAccessResponse {
    if (!this.options.enableRBAC) {
      return {
        widgetId,
        userId: userContext.id,
        hasAccess: true,
        grantedPermissions: Object.values(WidgetPermission),
        deniedPermissions: [],
        accessLevel: WidgetPermission.ADMIN,
      };
    }

    // Check cache first
    const userAccessMap = this.userAccess.get(userContext.id);
    if (userAccessMap?.has(widgetId)) {
      const cachedAccess = userAccessMap.get(widgetId);
      if (cachedAccess) {
        return cachedAccess;
      }
    }

    const widget = this.widgets.get(widgetId);
    if (!widget) {
      return {
        widgetId,
        userId: userContext.id,
        hasAccess: false,
        grantedPermissions: [],
        deniedPermissions: Object.values(WidgetPermission),
        accessLevel: WidgetPermission.VIEW,
        reason: 'Widget not found',
      };
    }

    const accessResponse = this.evaluateWidgetAccess(widget, userContext);

    // Cache the result
    if (!this.userAccess.has(userContext.id)) {
      this.userAccess.set(userContext.id, new Map());
    }
    const accessMap = this.userAccess.get(userContext.id);
    if (accessMap) {
      accessMap.set(widgetId, accessResponse);
    }

    return accessResponse;
  }

  /**
   * Get a specific widget by ID
   */
  getWidget(widgetId: string): BaseWidget | undefined {
    return this.widgets.get(widgetId);
  }

  /**
   * Update a widget
   */
  updateWidget(widgetId: string, updates: Partial<BaseWidget>): boolean {
    const widget = this.widgets.get(widgetId);
    if (!widget) {
      return false;
    }

    const updatedWidget = { ...widget, ...updates, updatedAt: new Date() };
    this.validateWidget(updatedWidget);

    this.widgets.set(widgetId, updatedWidget);
    this.clearWidgetAccessCache(widgetId);

    return true;
  }

  /**
   * Clear access cache for all users
   */
  clearAccessCache(): void {
    this.userAccess.clear();
  }

  /**
   * Clear access cache for a specific widget
   */
  private clearWidgetAccessCache(widgetId: string): void {
    for (const userAccessMap of this.userAccess.values()) {
      userAccessMap.delete(widgetId);
    }
  }

  /**
   * Validate widget structure
   */
  private validateWidget(widget: BaseWidget): void {
    if (!widget.id || !widget.name || !widget.title) {
      throw new Error('Widget must have id, name, and title');
    }

    if (!Object.values(WidgetCategory).includes(widget.category)) {
      throw new Error(`Invalid widget category: ${widget.category}`);
    }

    if (!Object.values(WidgetStatus).includes(widget.status)) {
      throw new Error(`Invalid widget status: ${widget.status}`);
    }
  }

  /**
   * Evaluate widget access based on RBAC rules
   */
  private evaluateWidgetAccess(widget: BaseWidget, userContext: UserContext): WidgetAccessResponse {
    const rbac = widget.rbac;
    const grantedPermissions: WidgetPermission[] = [];
    const deniedPermissions: WidgetPermission[] = [];

    // Check if user is explicitly denied
    if (rbac.deniedUsers?.includes(userContext.id)) {
      return {
        widgetId: widget.id,
        userId: userContext.id,
        hasAccess: false,
        grantedPermissions: [],
        deniedPermissions: Object.values(WidgetPermission),
        accessLevel: WidgetPermission.VIEW,
        reason: 'User explicitly denied access',
      };
    }

    // Check security level requirement
    if (
      rbac.requiredSecurityLevel &&
      this.getSecurityLevelValue(userContext.securityLevel) <
        this.getSecurityLevelValue(rbac.requiredSecurityLevel)
    ) {
      return {
        widgetId: widget.id,
        userId: userContext.id,
        hasAccess: false,
        grantedPermissions: [],
        deniedPermissions: Object.values(WidgetPermission),
        accessLevel: WidgetPermission.VIEW,
        reason: 'Insufficient security clearance',
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
          reason: 'Role not authorized',
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
          reason: 'Department not authorized',
        };
      }
    }

    // Check if user is explicitly allowed (overrides other restrictions)
    if (rbac.allowedUsers?.includes(userContext.id)) {
      return {
        widgetId: widget.id,
        userId: userContext.id,
        hasAccess: true,
        grantedPermissions: Object.values(WidgetPermission),
        deniedPermissions: [],
        accessLevel: WidgetPermission.ADMIN,
        reason: 'User explicitly granted access',
      };
    }

    // Evaluate permissions based on user permissions and widget requirements
    const userPermissionSet = new Set(userContext.permissions);

    for (const permission of Object.values(WidgetPermission)) {
      // Check if user has the specific permission or a wildcard permission
      const hasPermission =
        userPermissionSet.has(`widget:${permission}`) ||
        userPermissionSet.has('widget:*') ||
        userPermissionSet.has('*');

      if (hasPermission) {
        grantedPermissions.push(permission);
      } else {
        deniedPermissions.push(permission);
      }
    }

    // Check if user has minimum required permissions
    const hasRequiredPermissions = rbac.requiredPermissions.every((reqPerm) =>
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
        reason: 'Insufficient permissions',
      };
    }

    // Determine access level (highest granted permission)
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

    // Check conditional access restrictions
    const restrictions = this.evaluateConditionalAccess(rbac, userContext);

    return {
      widgetId: widget.id,
      userId: userContext.id,
      hasAccess: true,
      grantedPermissions,
      deniedPermissions,
      accessLevel,
      restrictions,
    };
  }

  /**
   * Evaluate conditional access restrictions
   */
  private evaluateConditionalAccess(
    rbac: WidgetRBAC,
    userContext: UserContext
  ): {
    timeRestricted: boolean;
    ipRestricted: boolean;
    deviceRestricted: boolean;
  } {
    const restrictions = {
      timeRestricted: false,
      ipRestricted: false,
      deviceRestricted: false,
    };

    if (rbac.conditionalAccess) {
      // Time restrictions
      if (rbac.conditionalAccess.timeRestrictions) {
        // Implementation would check current time against restrictions
        // This is a simplified version
        restrictions.timeRestricted = true;
      }

      // IP restrictions
      if (rbac.conditionalAccess.ipRestrictions && userContext.ipAddress) {
        const ipAddress = userContext.ipAddress;
        const isAllowedIP = rbac.conditionalAccess.ipRestrictions.some((allowedIP) =>
          this.matchesIPPattern(ipAddress, allowedIP)
        );
        restrictions.ipRestricted = !isAllowedIP;
      }

      // Device restrictions
      if (rbac.conditionalAccess.deviceRestrictions && userContext.userAgent) {
        const userAgent = userContext.userAgent;
        const isAllowedDevice = rbac.conditionalAccess.deviceRestrictions.some((allowedDevice) =>
          userAgent.includes(allowedDevice)
        );
        restrictions.deviceRestricted = !isAllowedDevice;
      }
    }

    return restrictions;
  }

  /**
   * Check if IP matches a pattern (supports CIDR notation)
   */
  private matchesIPPattern(ip: string, pattern: string): boolean {
    // Simplified IP matching - in production, use a proper CIDR library
    if (pattern.includes('/')) {
      // CIDR notation - simplified check
      const [networkIP] = pattern.split('/');
      return ip.startsWith(networkIP.substring(0, networkIP.lastIndexOf('.')));
    }
    return ip === pattern;
  }

  /**
   * Convert security level to numeric value for comparison
   */
  private getSecurityLevelValue(level: SecurityLevel): number {
    switch (level) {
      case SecurityLevel.LOW:
        return 1;
      case SecurityLevel.MEDIUM:
        return 2;
      case SecurityLevel.HIGH:
        return 3;
      case SecurityLevel.CRITICAL:
        return 4;
      default:
        return 0;
    }
  }
}

// Singleton instance for global widget registry
export const globalWidgetRegistry = new WidgetRegistry();
