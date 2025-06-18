// Core interfaces for Artifact Generation System
// Epic 4 Implementation

import { 
  Artifact, 
  ConversationContext, 
  ValidationResult, 
  GenerationResult,
  SecurityValidation,
  Template
} from '@/types/artifact';

/**
 * Core interface for artifact generators
 * Follows the Strategy pattern for different artifact types
 */
export interface ArtifactGenerator {
  /**
   * Check if this generator can handle the given context
   */
  canHandle(context: ConversationContext): boolean;

  /**
   * Generate an artifact from the conversation context
   */
  generate(context: ConversationContext): Promise<Artifact>;

  /**
   * Validate a generated artifact
   */
  validate(artifact: Artifact): ValidationResult;

  /**
   * Get confidence score for handling this context
   */
  getConfidence?(context: ConversationContext): number;

  /**
   * Get supported artifact type
   */
  getSupportedType(): string;
}

/**
 * Interface for artifact validation
 */
export interface ArtifactValidator {
  /**
   * Validate an artifact and return detailed results
   */
  validate(artifact: Artifact): ValidationResult;

  /**
   * Get validation rules for a specific artifact type
   */
  getRules(artifactType: string): ValidationRule[];

  /**
   * Run security validation
   */
  validateSecurity(artifact: Artifact): SecurityValidation;
}

/**
 * Interface for template management
 */
export interface TemplateManager {
  /**
   * Get template by ID
   */
  getTemplate(id: string): Template | null;

  /**
   * Get templates by artifact type
   */
  getTemplatesByType(type: string): Template[];

  /**
   * Register a new template
   */
  registerTemplate(template: Template): void;

  /**
   * Render template with variables
   */
  renderTemplate(templateId: string, variables: Record<string, any>): string;

  /**
   * Validate template variables
   */
  validateVariables(templateId: string, variables: Record<string, any>): ValidationResult;
}

/**
 * Interface for conversation analysis
 */
export interface ConversationAnalyzer {
  /**
   * Detect generation triggers in conversation
   */
  detectTriggers(context: ConversationContext): GenerationTrigger[];

  /**
   * Analyze conversation phase
   */
  analyzePhase(context: ConversationContext): ConversationPhase;

  /**
   * Extract requirements from conversation
   */
  extractRequirements(context: ConversationContext): Requirement[];

  /**
   * Get conversation summary
   */
  summarize(context: ConversationContext): ConversationSummary;
}

/**
 * VCS (Version Control System) adapter interface
 */
export interface VCSAdapter {
  /**
   * Create a new branch
   */
  createBranch(repository: string, branchName: string, baseBranch?: string): Promise<BranchInfo>;

  /**
   * Create a draft pull request
   */
  createDraftPR(request: CreatePRRequest): Promise<PRInfo>;

  /**
   * Add a comment to a PR or commit
   */
  addComment(repository: string, target: string, comment: string, line?: number): Promise<void>;

  /**
   * Get repository permissions for current user
   */
  getRepositoryPermissions(repository: string): Promise<string[]>;

  /**
   * Get file content from repository
   */
  getFileContent(repository: string, filePath: string, branch?: string): Promise<string>;

  /**
   * Create or update a file in repository
   */
  updateFile(repository: string, filePath: string, content: string, branch: string, message: string): Promise<void>;
}

/**
 * CI/CD adapter interface
 */
export interface CIAdapter {
  /**
   * Trigger a pipeline/workflow
   */
  triggerPipeline(repository: string, branch: string, workflow: string): Promise<PipelineResult>;

  /**
   * Get pipeline status
   */
  getPipelineStatus(pipelineId: string): Promise<PipelineResult>;

  /**
   * Cancel a running pipeline
   */
  cancelPipeline(pipelineId: string): Promise<void>;

  /**
   * Get pipeline logs
   */
  getPipelineLogs(pipelineId: string): Promise<string>;
}

/**
 * Security manager interface
 */
export interface SecurityManager {
  /**
   * Validate user access for operation
   */
  validateAccess(userId: string, operation: string, resource: string): Promise<boolean>;

  /**
   * Get user permissions
   */
  getUserPermissions(userId: string): Promise<string[]>;

  /**
   * Audit log for security events
   */
  auditLog(event: SecurityEvent): Promise<void>;

  /**
   * Validate and refresh credentials
   */
  validateCredentials(provider: string): Promise<boolean>;
}

/**
 * Notification service interface
 */
export interface NotificationService {
  /**
   * Notify about artifact generation
   */
  notifyArtifactGenerated(artifact: Artifact, recipients: string[]): Promise<void>;

  /**
   * Notify about review requests
   */
  notifyReviewRequest(request: ReviewRequest, reviewers: string[]): Promise<void>;

  /**
   * Notify about deployment status
   */
  notifyDeployment(deployment: DeploymentResult, recipients: string[]): Promise<void>;

  /**
   * Notify about errors
   */
  notifyError(error: ErrorNotification, recipients: string[]): Promise<void>;
}

// Supporting types
export interface ValidationRule {
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  validator: (artifact: Artifact) => ValidationResult;
}

export interface GenerationTrigger {
  type: 'pattern' | 'command' | 'phase_change';
  confidence: number;
  artifactType: string;
  context: string;
  detectedAt: string;
}

export interface ConversationPhase {
  current: string;
  confidence: number;
  suggestedActions: string[];
}

export interface Requirement {
  type: 'functional' | 'non_functional' | 'business' | 'technical';
  description: string;
  priority: 'must_have' | 'should_have' | 'could_have' | 'wont_have';
  source: string; // message ID or context
  confidence: number;
}

export interface ConversationSummary {
  keyPoints: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  participants: string[];
  phase: string;
  confidence: number;
}

export interface Decision {
  description: string;
  rationale: string;
  participants: string[];
  timestamp: string;
  confidence: number;
}

export interface ActionItem {
  description: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface BranchInfo {
  name: string;
  url: string;
  sha: string;
}

export interface CreatePRRequest {
  repository: string;
  title: string;
  body: string;
  branch: string;
  baseBranch?: string;
  reviewers?: string[];
  draft?: boolean;
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

export interface SecurityEvent {
  type: 'access_granted' | 'access_denied' | 'credential_used' | 'violation_detected';
  userId: string;
  resource: string;
  operation: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ReviewRequest {
  artifactId: string;
  reviewers: string[];
  deadline?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  context: string;
}

export interface ErrorNotification {
  type: 'generation_failed' | 'deployment_failed' | 'validation_failed' | 'security_violation';
  message: string;
  details: string;
  artifactId?: string;
  userId?: string;
  timestamp: string;
} 