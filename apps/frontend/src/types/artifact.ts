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

// Keep only frontend-specific extensions here if any
// All core artifact types should be imported from @uaip/types
