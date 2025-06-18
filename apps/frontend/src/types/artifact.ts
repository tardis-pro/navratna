// Core types for Artifact Generation and DevOps Integration
// Epic 4 Implementation

export type ArtifactType = 'code-diff' | 'test' | 'prd' | 'documentation' | 'config' | 'workflow';

export type ConversationPhase = 'discussion' | 'clarification' | 'decision' | 'implementation' | 'review';

export type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'warning';

export interface TraceabilityInfo {
  conversationId: string;
  generatedBy: string;
  generatedAt: string;
  generator: string;
  confidence: number;
  sourceMessages: string[];
}

export interface ArtifactMetadata {
  id: string;
  title: string;
  description?: string;
  language?: string;
  framework?: string;
  targetFile?: string;
  estimatedEffort?: 'low' | 'medium' | 'high';
  tags: string[];
}

export interface Artifact {
  type: ArtifactType;
  content: string;
  metadata: ArtifactMetadata;
  traceability: TraceabilityInfo;
  validation?: ValidationResult;
}

export interface ValidationResult {
  status: ValidationStatus;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  score: number; // 0-1 confidence score
}

export interface ValidationError {
  code: string;
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationWarning {
  code: string;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface GenerationTrigger {
  type: 'pattern' | 'command' | 'phase_change';
  confidence: number;
  artifactType: ArtifactType;
  context: string;
  detectedAt: string;
}

export interface ConversationContext {
  conversationId: string;
  messages: Message[];
  phase: ConversationPhase;
  participants: Participant[];
  metadata: Record<string, any>;
  documentContext?: DocumentContext;
  codeContext?: CodeContext;
}

export interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  type: 'user' | 'agent' | 'system';
  metadata?: Record<string, any>;
}

export interface Participant {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface DocumentContext {
  id: string;
  title: string;
  content: string;
  type: string;
  metadata: {
    createdAt: Date;
    lastModified: Date;
    author: string;
  };
  tags: string[];
}

export interface CodeContext {
  repository: string;
  branch: string;
  filePath: string;
  language: string;
  framework?: string;
  dependencies: string[];
  currentContent?: string;
}

export interface GenerationRequest {
  type: ArtifactType;
  context: ConversationContext;
  user: Participant;
  parameters: Record<string, any>;
  templates?: string[];
}

export interface GenerationResult {
  success: boolean;
  artifact?: Artifact;
  errors: string[];
  warnings: string[];
  confidence: number;
}

// Template System Types
export interface Template {
  id: string;
  name: string;
  type: ArtifactType;
  description: string;
  template: string;
  variables: TemplateVariable[];
  examples?: string[];
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  validation?: string; // regex pattern
}

// DevOps Integration Types
export interface VCSConfig {
  provider: 'github' | 'gitlab' | 'bitbucket';
  baseUrl: string;
  token: string;
  organization?: string;
  defaultReviewer?: string[];
}

export interface CIConfig {
  provider: 'github_actions' | 'gitlab_ci' | 'jenkins' | 'circleci';
  baseUrl?: string;
  token?: string;
  defaultWorkflows: string[];
}

export interface DeploymentConfig {
  repository: string;
  branch?: string;
  reviewers: string[];
  triggerCI: boolean;
  pipelineConfig?: Record<string, any>;
  autoApprove?: boolean;
  autoApproveThreshold?: number;
}

export interface PRInfo {
  number: number;
  url: string;
  title: string;
  branch: string;
  status: 'draft' | 'open' | 'merged' | 'closed';
}

export interface PipelineResult {
  id: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'cancelled';
  url: string;
  logs?: string;
  duration?: number;
}

export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  pr?: PRInfo;
  pipelineResult?: PipelineResult;
  errors?: string[];
}

// Security Types
export interface SecurityValidation {
  scanType: 'static' | 'dependency' | 'secret' | 'permission';
  status: 'pass' | 'fail' | 'warning';
  findings: SecurityFinding[];
}

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  file?: string;
  line?: number;
  remediation?: string;
}

// Review and Feedback Types
export interface ReviewRequest {
  artifactId: string;
  reviewers: string[];
  deadline?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  context: string;
}

export interface ReviewResult {
  reviewerId: string;
  decision: 'approve' | 'reject' | 'request_changes';
  comments: string;
  timestamp: string;
  suggestions?: string[];
}

export interface FeedbackData {
  artifactId: string;
  userId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  feedback: string;
  timestamp: string;
  category: 'quality' | 'accuracy' | 'usefulness' | 'performance';
} 