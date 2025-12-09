import React from 'react';
import {
  Home,
  Bot,
  Package,
  MessageSquare,
  Brain,
  Settings,
  BarChart3,
  Search,
  Target,
  TrendingUp,
  Wrench,
  Plus,
  Bell,
  User,
  Shield,
  Users,
  Database,
  Monitor,
  Globe,
  FileText,
  Code,
  Zap,
} from 'lucide-react';

export interface DesktopIconConfig {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  color: {
    primary: string;
    secondary: string;
  };
  portalType: string;
  category: 'primary' | 'secondary' | 'admin' | 'restricted';
  badge?: {
    count?: number;
    text?: string;
    status?: 'success' | 'warning' | 'error' | 'info';
  };
  description: string;
  shortcut?: string;
  requiresPermission?: string[];
  minimumRole?: 'guest' | 'user' | 'moderator' | 'admin' | 'system';
}

/**
 * Role-based desktop configuration
 * Controls which icons and portals are available to different user roles
 */
export class RoleBasedDesktopConfig {
  // Base icons available to all authenticated users
  private static baseIcons: DesktopIconConfig[] = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      icon: Home,
      color: { primary: '#3B82F6', secondary: '#2563EB' },
      portalType: 'dashboard',
      category: 'primary',
      description: 'Main dashboard and overview',
      shortcut: 'Ctrl+1',
      minimumRole: 'guest',
    },
    {
      id: 'agents',
      title: 'AI Agents',
      icon: Bot,
      color: { primary: '#8B5CF6', secondary: '#7C3AED' },
      portalType: 'agent-hub',
      category: 'primary',
      description: 'Manage AI agents and assistants',
      shortcut: 'Ctrl+2',
      minimumRole: 'user',
    },
    {
      id: 'chat',
      title: 'Chat',
      icon: MessageSquare,
      color: { primary: '#10B981', secondary: '#059669' },
      portalType: 'user-chat',
      category: 'primary',
      description: 'Direct messaging and communication',
      shortcut: 'Ctrl+3',
      minimumRole: 'user',
    },
    {
      id: 'knowledge',
      title: 'Knowledge',
      icon: Brain,
      color: { primary: '#F59E0B', secondary: '#D97706' },
      portalType: 'knowledge',
      category: 'primary',
      description: 'Knowledge base and learning resources',
      shortcut: 'Ctrl+4',
      minimumRole: 'user',
    },
    {
      id: 'search',
      title: 'Search',
      icon: Search,
      color: { primary: '#14B8A6', secondary: '#0D9488' },
      portalType: 'search',
      category: 'secondary',
      description: 'Global search across all systems',
      minimumRole: 'user',
    },
  ];

  // User-specific icons (standard users)
  private static userIcons: DesktopIconConfig[] = [
    {
      id: 'tasks',
      title: 'My Tasks',
      icon: Target,
      color: { primary: '#F97316', secondary: '#EA580C' },
      portalType: 'tasks',
      category: 'secondary',
      description: 'Personal task and workflow management',
      minimumRole: 'user',
    },
    {
      id: 'mini-browser',
      title: 'Browser',
      icon: Globe,
      color: { primary: '#0EA5E9', secondary: '#0284C7' },
      portalType: 'mini-browser',
      category: 'secondary',
      description: 'Web browser with screenshot capture',
      shortcut: 'Ctrl+B',
      minimumRole: 'user',
    },
    {
      id: 'documents',
      title: 'Documents',
      icon: FileText,
      color: { primary: '#6366F1', secondary: '#4F46E5' },
      portalType: 'documents',
      category: 'secondary',
      description: 'Document management and collaboration',
      minimumRole: 'user',
    },
  ];

  // Moderator-specific icons
  private static moderatorIcons: DesktopIconConfig[] = [
    {
      id: 'discussions',
      title: 'Discussions',
      icon: MessageSquare,
      color: { primary: '#EF4444', secondary: '#DC2626' },
      portalType: 'discussion-hub',
      category: 'primary',
      badge: { text: 'Mod' },
      description: 'Moderate discussions and conversations',
      shortcut: 'Ctrl+5',
      minimumRole: 'moderator',
    },
    {
      id: 'user-management',
      title: 'Users',
      icon: Users,
      color: { primary: '#84CC16', secondary: '#65A30D' },
      portalType: 'user-management',
      category: 'secondary',
      description: 'Basic user management',
      minimumRole: 'moderator',
    },
    {
      id: 'reports',
      title: 'Reports',
      icon: TrendingUp,
      color: { primary: '#84CC16', secondary: '#65A30D' },
      portalType: 'monitoring-hub',
      category: 'secondary',
      description: 'System reports and user metrics',
      minimumRole: 'moderator',
    },
  ];

  // Admin-specific icons
  private static adminIcons: DesktopIconConfig[] = [
    {
      id: 'system-admin',
      title: 'System Admin',
      icon: Shield,
      color: { primary: '#DC2626', secondary: '#B91C1C' },
      portalType: 'system-admin',
      category: 'admin',
      description: 'System administration and security',
      shortcut: 'Ctrl+A',
      minimumRole: 'admin',
    },
    {
      id: 'analytics',
      title: 'Analytics',
      icon: BarChart3,
      color: { primary: '#EC4899', secondary: '#DB2777' },
      portalType: 'intelligence-hub',
      category: 'admin',
      description: 'Advanced analytics and insights',
      minimumRole: 'admin',
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: Settings,
      color: { primary: '#6B7280', secondary: '#4B5563' },
      portalType: 'system-hub',
      category: 'admin',
      description: 'System configuration and settings',
      shortcut: 'Ctrl+S',
      minimumRole: 'admin',
    },
    {
      id: 'tools',
      title: 'Dev Tools',
      icon: Wrench,
      color: { primary: '#A855F7', secondary: '#9333EA' },
      portalType: 'tool-management',
      category: 'admin',
      description: 'Development tools and system utilities',
      minimumRole: 'admin',
    },
    {
      id: 'database',
      title: 'Database',
      icon: Database,
      color: { primary: '#059669', secondary: '#047857' },
      portalType: 'database-admin',
      category: 'admin',
      description: 'Database administration',
      minimumRole: 'admin',
    },
    {
      id: 'monitoring',
      title: 'Monitoring',
      icon: Monitor,
      color: { primary: '#0891B2', secondary: '#0E7490' },
      portalType: 'system-monitoring',
      category: 'admin',
      description: 'System monitoring and health',
      minimumRole: 'admin',
    },
    {
      id: 'api-management',
      title: 'APIs',
      icon: Code,
      color: { primary: '#7C2D12', secondary: '#92400E' },
      portalType: 'api-management',
      category: 'admin',
      description: 'API management and testing',
      minimumRole: 'admin',
    },
  ];

  // System-level icons (highest privilege)
  private static systemIcons: DesktopIconConfig[] = [
    {
      id: 'system-console',
      title: 'Console',
      icon: Zap,
      color: { primary: '#B91C1C', secondary: '#991B1B' },
      portalType: 'system-console',
      category: 'restricted',
      description: 'System console and direct access',
      minimumRole: 'system',
    },
    {
      id: 'create-anything',
      title: 'Create',
      icon: Plus,
      color: { primary: '#EF4444', secondary: '#DC2626' },
      portalType: 'create-anything',
      category: 'restricted',
      description: 'Create any type of resource',
      minimumRole: 'system',
    },
  ];

  /**
   * Get role hierarchy weight for comparison
   */
  private static getRoleWeight(role: string): number {
    const weights = {
      guest: 0,
      user: 1,
      moderator: 2,
      admin: 3,
      system: 4,
    };
    return weights[role as keyof typeof weights] || 0;
  }

  /**
   * Check if user has required role
   */
  private static hasRequiredRole(userRole: string, requiredRole?: string): boolean {
    if (!requiredRole) return true;
    return this.getRoleWeight(userRole) >= this.getRoleWeight(requiredRole);
  }

  /**
   * Check if user has required permissions
   */
  private static hasRequiredPermissions(
    userPermissions: string[],
    requiredPermissions?: string[]
  ): boolean {
    if (!requiredPermissions || requiredPermissions.length === 0) return true;
    return requiredPermissions.every((permission) => userPermissions.includes(permission));
  }

  /**
   * Get desktop icons based on user role and permissions
   */
  static getDesktopIcons(
    userRole: string,
    userPermissions: string[] = [],
    customPermissions: Record<string, boolean> = {}
  ): DesktopIconConfig[] {
    const allIcons = [
      ...this.baseIcons,
      ...this.userIcons,
      ...this.moderatorIcons,
      ...this.adminIcons,
      ...this.systemIcons,
    ];

    return allIcons.filter((icon) => {
      // Check minimum role requirement
      if (!this.hasRequiredRole(userRole, icon.minimumRole)) {
        return false;
      }

      // Check specific permission requirements
      if (!this.hasRequiredPermissions(userPermissions, icon.requiresPermission)) {
        return false;
      }

      // Check custom permissions (for feature flags, etc.)
      if (customPermissions[icon.id] === false) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get desktop layout based on role
   */
  static getDesktopLayout(userRole: string): {
    primaryIcons: DesktopIconConfig[];
    secondaryIcons: DesktopIconConfig[];
    adminIcons: DesktopIconConfig[];
    restrictedIcons: DesktopIconConfig[];
  } {
    const icons = this.getDesktopIcons(userRole);

    return {
      primaryIcons: icons.filter((icon) => icon.category === 'primary'),
      secondaryIcons: icons.filter((icon) => icon.category === 'secondary'),
      adminIcons: icons.filter((icon) => icon.category === 'admin'),
      restrictedIcons: icons.filter((icon) => icon.category === 'restricted'),
    };
  }

  /**
   * Get quick actions based on role
   */
  static getQuickActions(userRole: string): Array<{
    id: string;
    title: string;
    icon: React.ComponentType<any>;
    action: string;
    shortcut?: string;
  }> {
    const baseActions = [
      {
        id: 'new-chat',
        title: 'New Chat',
        icon: MessageSquare,
        action: 'open-chat',
        shortcut: 'Ctrl+N',
      },
      {
        id: 'search-global',
        title: 'Global Search',
        icon: Search,
        action: 'open-search',
        shortcut: 'Ctrl+K',
      },
    ];

    const roleActions = {
      user: [
        {
          id: 'new-document',
          title: 'New Document',
          icon: FileText,
          action: 'create-document',
        },
      ],
      moderator: [
        {
          id: 'moderate-content',
          title: 'Moderate',
          icon: Shield,
          action: 'open-moderation',
        },
      ],
      admin: [
        {
          id: 'system-status',
          title: 'System Status',
          icon: Monitor,
          action: 'check-system',
        },
        {
          id: 'user-admin',
          title: 'User Admin',
          icon: Users,
          action: 'open-user-admin',
        },
      ],
      system: [
        {
          id: 'system-console',
          title: 'Console',
          icon: Zap,
          action: 'open-console',
        },
      ],
    };

    const userWeight = this.getRoleWeight(userRole);
    let availableActions = [...baseActions];

    // Add actions based on role hierarchy
    Object.entries(roleActions).forEach(([role, actions]) => {
      if (userWeight >= this.getRoleWeight(role)) {
        availableActions.push(...actions);
      }
    });

    return availableActions;
  }

  /**
   * Get notification settings based on role
   */
  static getNotificationSettings(userRole: string): {
    categories: string[];
    defaultEnabled: string[];
    restrictedCategories: string[];
  } {
    const baseCategories = ['chat', 'agent-response', 'system-update'];

    const roleSettings = {
      guest: {
        categories: baseCategories,
        defaultEnabled: ['system-update'],
        restrictedCategories: [],
      },
      user: {
        categories: [...baseCategories, 'task-update', 'document-share'],
        defaultEnabled: ['chat', 'agent-response', 'task-update'],
        restrictedCategories: [],
      },
      moderator: {
        categories: [
          ...baseCategories,
          'task-update',
          'document-share',
          'moderation-alert',
          'user-report',
        ],
        defaultEnabled: ['chat', 'agent-response', 'moderation-alert'],
        restrictedCategories: [],
      },
      admin: {
        categories: [
          ...baseCategories,
          'task-update',
          'document-share',
          'moderation-alert',
          'user-report',
          'security-alert',
          'system-error',
        ],
        defaultEnabled: ['security-alert', 'system-error'],
        restrictedCategories: [],
      },
      system: {
        categories: [
          ...baseCategories,
          'task-update',
          'document-share',
          'moderation-alert',
          'user-report',
          'security-alert',
          'system-error',
          'critical-system',
        ],
        defaultEnabled: ['security-alert', 'system-error', 'critical-system'],
        restrictedCategories: [],
      },
    };

    return roleSettings[userRole as keyof typeof roleSettings] || roleSettings.guest;
  }

  /**
   * Get theme options based on role
   */
  static getThemeOptions(userRole: string): string[] {
    const baseThemes = ['dark', 'light'];
    const professionalThemes = ['professional', 'minimal'];
    const adminThemes = ['admin-dark', 'hacker'];
    const systemThemes = ['system-red', 'matrix'];

    const userWeight = this.getRoleWeight(userRole);
    let availableThemes = [...baseThemes];

    if (userWeight >= 1) availableThemes.push(...professionalThemes);
    if (userWeight >= 3) availableThemes.push(...adminThemes);
    if (userWeight >= 4) availableThemes.push(...systemThemes);

    return availableThemes;
  }
}
