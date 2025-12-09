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
  // Development Projects
  SOFTWARE_DEVELOPMENT = 'software_development',
  API_DEVELOPMENT = 'api_development',
  FRONTEND_DEVELOPMENT = 'frontend_development',
  BACKEND_DEVELOPMENT = 'backend_development',
  MOBILE_DEVELOPMENT = 'mobile_development',
  DEVOPS = 'devops',

  // Business Projects
  BUSINESS_ANALYSIS = 'business_analysis',
  PRODUCT_MANAGEMENT = 'product_management',
  MARKETING_CAMPAIGN = 'marketing_campaign',
  SALES_STRATEGY = 'sales_strategy',
  CONSULTING = 'consulting',

  // Creative Projects
  CONTENT_CREATION = 'content_creation',
  DESIGN = 'design',
  MEDIA_PRODUCTION = 'media_production',
  CREATIVE_WRITING = 'creative_writing',

  // Research & Analysis
  DATA_ANALYSIS = 'data_analysis',
  RESEARCH = 'research',
  POLICY_ANALYSIS = 'policy_analysis',
  ACADEMIC_STUDY = 'academic_study',

  // Specialized Projects
  HEALTHCARE = 'healthcare',
  FINANCE = 'finance',
  LEGAL = 'legal',
  EDUCATION = 'education',
  GOVERNANCE = 'governance',
  MANUFACTURING = 'manufacturing',

  // Collaboration
  BRAINSTORMING = 'brainstorming',
  DISCUSSION = 'discussion',
  REVIEW = 'review',
  PLANNING = 'planning',

  // General
  GENERAL = 'general',
  OTHER = 'other',
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
  recommendedAgents?: string[]; // Agent IDs that are recommended for this project type
  createdAt: Date;
  updatedAt: Date;
}
