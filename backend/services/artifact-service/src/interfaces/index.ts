import { 
  Artifact, 
  ConversationContext, 
  ValidationStatus 
} from '@uaip/types';

// Core interfaces for the artifact service
export interface ArtifactGenerator {
  getSupportedType(): string;
  canHandle(context: ConversationContext): boolean;
  generate(context: ConversationContext): Promise<Artifact>;
  getConfidence?(context: ConversationContext): number;
}

export interface ArtifactValidator {
  validate(artifact: Artifact): ValidationResult;
  validateSecurity(artifact: Artifact): SecurityValidationResult;
}

export interface SecurityManager {
  validateAccess(userId: string, operation: string, resource: string): Promise<boolean>;
  auditLog(event: AuditEvent): Promise<void>;
}

export interface ConversationAnalyzer {
  detectTriggers(context: ConversationContext): TriggerResult[];
  analyzePhase(context: ConversationContext): PhaseAnalysis;
  summarize(context: ConversationContext): ConversationSummary;
}

// Supporting types
export interface ValidationResult {
  status: ValidationStatus;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  score: number;
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'warning';
}

export interface SecurityValidationResult {
  status: 'pass' | 'fail' | 'warning';
  findings: SecurityFinding[];
}

export interface SecurityFinding {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  recommendation?: string;
}

export interface AuditEvent {
  type: string;
  userId: string;
  resource: string;
  operation: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface TriggerResult {
  artifactType: string;
  confidence: number;
  reason: string;
  context: Record<string, any>;
}

export interface PhaseAnalysis {
  current: string;
  confidence: number;
  suggestedActions: string[];
}

export interface ConversationSummary {
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
  participants: string[];
  phase: string;
  confidence: number;
} 