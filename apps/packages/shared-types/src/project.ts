export enum ProjectStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

export enum ProjectPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ProjectVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  INTERNAL = 'internal',
  RESTRICTED = 'restricted',
}

export enum ProjectType {
  SOFTWARE_DEVELOPMENT = 'software_development',
  API_DEVELOPMENT = 'api_development',
  FRONTEND_DEVELOPMENT = 'frontend_development',
  BACKEND_DEVELOPMENT = 'backend_development',
  MOBILE_DEVELOPMENT = 'mobile_development',
  DEVOPS = 'devops',
  BUSINESS_ANALYSIS = 'business_analysis',
  PRODUCT_MANAGEMENT = 'product_management',
  MARKETING_CAMPAIGN = 'marketing_campaign',
  SALES_STRATEGY = 'sales_strategy',
  CONSULTING = 'consulting',
  CONTENT_CREATION = 'content_creation',
  DESIGN = 'design',
  MEDIA_PRODUCTION = 'media_production',
  CREATIVE_WRITING = 'creative_writing',
  DATA_ANALYSIS = 'data_analysis',
  RESEARCH = 'research',
  POLICY_ANALYSIS = 'policy_analysis',
  ACADEMIC_STUDY = 'academic_study',
  HEALTHCARE = 'healthcare',
  FINANCE = 'finance',
  LEGAL = 'legal',
  EDUCATION = 'education',
  GOVERNANCE = 'governance',
  MANUFACTURING = 'manufacturing',
  BRAINSTORMING = 'brainstorming',
  DISCUSSION = 'discussion',
  REVIEW = 'review',
  PLANNING = 'planning',
  GENERAL = 'general',
  OTHER = 'other',
  QUESTIONFORGE = 'questionforge',
  BASEBENCH_META = 'basebench_meta',
}

// Project member entity enums
export enum ProjectRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum MemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  type: ProjectType;
  status: ProjectStatus;
  priority: ProjectPriority;
  visibility: ProjectVisibility;
  ownerId: string;
  organizationId?: string;
  recommendedAgents?: string[];
  githubRepo?: string;
  githubCloneUrl?: string;
  workspaceId?: string;
  isCodeProject?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Project entity interface
export interface ProjectEntity {
  id: string;
  name: string;
  description?: string;
  slug: string;
  ownerId: string;
  type?: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  tags?: string[];
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  fileCount?: number;
  artifactCount?: number;
  totalSizeBytes?: number;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMemberEntity {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  status: MemberStatus;
  permissions?: Record<string, boolean>;
  joinedAt: Date;
  invitedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Project Lifecycle Types (moved from backend/shared/services)
export interface ProjectHealthCheck {
  projectId: string;
  overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
  budgetHealth: 'on-track' | 'over-budget' | 'critical';
  scheduleHealth: 'on-time' | 'delayed' | 'overdue';
  taskHealth: 'progressing' | 'stalled' | 'blocked';
  agentHealth: 'active' | 'inactive' | 'overloaded';
  recommendations: string[];
  metrics: {
    budgetUtilization: number;
    completionRate: number;
    averageTaskDuration: number;
    activeAgents: number;
    blockedTasks: number;
    overdueTasksCount: number;
  };
}

export interface ProjectAlert {
  id: string;
  projectId: string;
  type: 'budget' | 'schedule' | 'task' | 'agent' | 'security';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  actionRequired?: string;
  triggeredAt: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
}

export interface ProjectAutomation {
  id: string;
  projectId: string;
  type: 'budget_threshold' | 'task_overdue' | 'agent_idle' | 'completion_trigger';
  trigger: {
    condition: string;
    threshold?: number;
    schedule?: string;
  };
  actions: Array<{
    type: 'notify' | 'reassign' | 'pause' | 'escalate' | 'archive';
    config: unknown;
  }>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Project Management Types (moved from backend/shared/services)
export interface CreateProjectData {
  name: string;
  description?: string;
  ownerId: string;
  organizationId?: string;
  type?: ProjectType;
  category?: string;
  tags?: string[];
  priority?: string;
  visibility?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskData {
  projectId: string;
  title: string;
  description?: string;
  priority?: string;
  assignedAgentId?: string;
  assignedUserId?: string;
  requirements?: unknown;
  tools?: string[];
  estimatedCost?: number;
  estimatedDuration?: number;
  dueDate?: Date;
}

export interface ProjectAnalytics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalBudget: number;
  totalSpent: number;
  averageCompletionTime: number;
  topCategories: Array<{ category: string; count: number }>;
  budgetUtilization: number;
  overBudgetProjects: number;
  overdueProjects: number;
}

export interface ProjectMetrics {
  completionRate: number;
  budgetUtilization: number;
  taskCompletionRate: number;
  averageTaskDuration: number;
  toolUsageStats: Array<{
    toolId: string;
    toolName: string;
    usageCount: number;
    successRate: number;
    averageCost: number;
  }>;
  agentPerformance: Array<{
    agentId: string;
    tasksCompleted: number;
    successRate: number;
    averageTaskTime: number;
    toolsUsed: number;
  }>;
}
