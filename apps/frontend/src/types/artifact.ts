// Re-export artifact types from shared types
// All artifact types are now centralized in @uaip/types

export {
  type ArtifactType,
  type ConversationPhase,
  type ValidationStatus,
  type ValidationError,
  type ValidationWarning,
  type ValidationResult,
  type ArtifactMetadata,
  type Artifact,
  type TraceabilityInfo,
  type AgentPreferences,
} from '@uaip/types';

export interface ConversationContext {
  conversationId: string;
  messages: Array<{
    id: string;
    content: string;
    sender: string;
    timestamp: string;
    type?: string;
  }>;
  phase: string;
  participants: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export interface Participant {
  id: string;
  name: string;
  role: string;
}

export interface GenerationResult {
  success: boolean;
  artifact?: Artifact;
  error?: string;
}

export interface ArtifactFactoryOptions {
  type: string;
  context: ConversationContext;
}
