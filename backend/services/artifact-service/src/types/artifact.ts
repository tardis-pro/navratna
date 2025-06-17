// Local artifact types for the service
// These extend or complement the shared types

export type ArtifactType = 'code' | 'test' | 'documentation' | 'prd';

export interface AgentPreferences {
  codeStyle?: string;
  testingFramework?: string;
  documentationFormat?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
}

export interface Agent {
  id: string;
  capabilities: string[];
  preferences: AgentPreferences;
}

export interface Persona {
  id: string;
  role: string;
  expertise: string[];
  communicationStyle: string;
}

export interface Message {
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

export type DiscussionPhase = 'requirements' | 'design' | 'implementation' | 'testing' | 'review';

export interface Discussion {
  id: string;
  messages: Message[];
  participants: Participant[];
  phase: DiscussionPhase;
}

export interface TechnicalContext {
  language?: string;
  framework?: string;
  platform?: string;
  constraints?: string[];
}

export interface GenerationContext {
  agent: Agent;
  persona: Persona;
  discussion: Discussion;
  technical: TechnicalContext;
  conversationId?: string;
}

export interface ArtifactGenerationRequest {
  type: ArtifactType;
  context: GenerationContext;
  options?: {
    template?: string;
    style?: string;
    complexity?: 'simple' | 'moderate' | 'complex';
    language?: string;
    framework?: string;
  };
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  line?: number;
  column?: number;
}

export interface ValidationResult {
  status: 'valid' | 'invalid' | 'warning';
  isValid: boolean;
  issues: ValidationIssue[];
  score: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  suggestions: string[];
}

export interface ArtifactMetadata {
  generatedBy: number;
  template?: string;
  language?: string;
  framework?: string;
  createdAt: Date;
}

export interface GeneratedArtifact {
  id: string;
  type: ArtifactType;
  content: string;
  metadata: ArtifactMetadata;
  validation: ValidationResult;
}

export interface ArtifactGenerationResponse {
  success: boolean;
  artifact?: GeneratedArtifact;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface ArtifactTemplate {
  id: string;
  name: string;
  type: ArtifactType;
  language?: string;
  framework?: string;
  template: string;
  variables: string[];
}

export interface TemplateFilters {
  type?: ArtifactType;
  language?: string;
  framework?: string;
}
