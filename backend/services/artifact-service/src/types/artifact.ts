// Re-export artifact types from shared types
// All artifact types are now centralized in @uaip/types

export {
  type ArtifactType,
  type ValidationStatus,
  type ValidationError,
  type ValidationWarning,
  type ValidationResult,
  type ArtifactMetadata,
  type Artifact,
  type AgentPreferences
} from '@uaip/types';

// Import types that are also used but defined elsewhere
export {
  type Agent,
  type Persona,
  type Message
} from '@uaip/types';

// Keep only service-specific extensions here if any
// All core artifact types should be imported from @uaip/types