// Local artifact types for the service
// These extend or complement the shared types

export interface ArtifactMetadata {
  id: string;
  title: string;
  description: string;
  language?: string;
  framework?: string;
  targetFile?: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  tags: string[];
}

export interface TraceabilityInfo {
  conversationId: string;
  generatedBy: string;
  generatedAt: string;
  generator: string;
  confidence: number;
  sourceMessages: string[];
}

export interface Artifact {
  type: string;
  content: string;
  metadata: ArtifactMetadata;
  traceability?: TraceabilityInfo;
  validation?: ValidationResult;
}

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

export type ValidationStatus = 'valid' | 'invalid' | 'warning';

// Renamed to avoid conflict with agent.ts ConversationContext
export interface ArtifactConversationContext {
  conversationId: string;
  messages: ArtifactMessage[];
  participants: Participant[];
  codeContext?: any;
}

// Renamed to avoid conflict with agent.ts Message
export interface ArtifactMessage {
  id: string;
  content: string;
  timestamp: string;
  author: string;
  role: string;
}

export interface Participant {
  id: string;
  name: string;
  role: string;
}

export interface GenerationTrigger {
  type: 'command' | 'pattern' | 'phase_change';
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

export interface ConversationSummary {
  keyPoints: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  participants: string[];
  phase: string;
  confidence: number;
}


export interface Decision {
  id: string;
  description: string;
  options: string[];
  chosen: string;
  reasoning: string;
  timestamp: Date;
  confidence: number;
}
export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface Requirement {
  id: string;
  type: 'functional' | 'non_functional' | 'business_rule' | 'constraint';
  description: string;
  priority: 'must_have' | 'should_have' | 'could_have' | 'wont_have';
  source: string;
  extractedAt: string;
} 