// Entity exports for the shared services package
// This file exports all TypeORM entities for use across the monorepo

// Base entity
export { BaseEntity } from './base.entity';

// Core entities
export { Agent } from './agent.entity';
export { Operation } from './operation.entity';
export { Persona } from './persona.entity';

// User System entities
export { UserEntity } from './user.entity';
export { UserPreferencesEntity } from './user-preferences.entity';
export { UserContactEntity } from './user-contact.entity';
export { UserMessageEntity } from './user-message.entity';
export { UserPresenceEntity } from './user-presence.entity';
export { RefreshTokenEntity } from './refreshToken.entity';
export { PasswordResetTokenEntity } from './passwordResetToken.entity';

// Agent System entities
export { AgentCapabilityMetric } from './agentCapabilityMetric.entity';
export { AgentActivity } from './agent-activity.entity';
export { AgentLearningRecord } from './agent-learning-record.entity';
export { ToolUsageRecord } from './toolUsageRecord.entity';
export { ConversationContext } from './conversationContext.entity';

// Operation System entities
export { OperationState } from './operationState.entity';
export { OperationCheckpoint } from './operationCheckpoint.entity';
export { StepResult } from './stepResult.entity';
export { ApprovalWorkflow } from './approvalWorkflow.entity';
export { ApprovalDecision } from './approvalDecision.entity';

// Audit System entities
export { AuditEvent } from './auditEvent.entity';

// Security System entities
export { SecurityPolicy } from './securityPolicy.entity';

// OAuth System entities
export { OAuthProviderEntity } from './oauthProvider.entity';
export { OAuthStateEntity } from './oauthState.entity';
export { AgentOAuthConnectionEntity } from './agentOAuthConnection.entity';

// MFA System entities
export { MFAChallengeEntity } from './mfaChallenge.entity';

// Session System entities
export { SessionEntity } from './session.entity';

// Tool System entities
export { ToolDefinition } from './toolDefinition.entity';
export { ToolExecution } from './toolExecution.entity';
export { ToolAssignment } from './toolAssignment.entity';
export { UserToolPreferences } from './userToolPreferences.entity';

// Artifact System entities
export { Artifact } from './artifact.entity';
export { ArtifactReview } from './artifactReview.entity';
export { ArtifactDeployment } from './artifactDeployment.entity';

// Persona System entities
export { Discussion } from './discussion.entity';
export { DiscussionParticipant } from './discussionParticipant.entity';
export { DiscussionMessage } from './discussionMessage.entity';
export { PersonaAnalytics } from './personaAnalytics.entity';

// MCP Integration entities
export { MCPServer } from './mcpServer.entity';
export { MCPToolCall } from './mcpToolCall.entity';

// LLM Integration entities
export { LLMProvider } from './llmProvider.entity';
export { UserLLMPreference } from './userLLMPreference.entity';
export { AgentLLMPreference } from './agentLLMPreference.entity';

// Knowledge Graph entities
export { KnowledgeItemEntity } from './knowledge-item.entity';
export { KnowledgeRelationshipEntity } from './knowledge-relationship.entity';

// Project System entities
export { ProjectEntity } from './project.entity';
export { ProjectMemberEntity } from './project-member.entity';
export { ProjectFileEntity } from './project-file.entity';
export { TaskEntity } from './task.entity';

// Project Management entities (from Project.ts)
export {
  Project,
  ProjectTask,
  ProjectToolUsage,
  ProjectAgent,
  ProjectWorkflow,
  TaskExecution,
} from './Project';

// Short Link System entities
export { ShortLinkEntity } from './short-link.entity';

// User LLM Integration entities
export { UserLLMProvider } from './userLLMProvider.entity';

// Integration Event entities
export { IntegrationEventEntity } from './integrationEvent.entity';

// Entity arrays for TypeORM configuration - kept for backward compatibility
export const getAllEntities = () => {
  // This function is deprecated - entities are now imported directly in typeorm.config.ts
  // Keeping for backward compatibility but not recommended for use
  throw new Error(
    'getAllEntities is deprecated. Entities are now imported directly in TypeORM config.'
  );
};
