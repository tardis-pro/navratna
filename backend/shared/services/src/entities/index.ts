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
export { LLMModel } from './llmModel.entity';
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


// Short Link System entities
export { ShortLinkEntity } from './short-link.entity';

// User LLM Integration entities
export { UserLLMProvider } from './userLLMProvider.entity';

// Integration Event entities
export { IntegrationEventEntity } from './integrationEvent.entity';

// All entities for TypeORM DataSource initialization.
// Used by domain services via registerEntities(allEntities).
// TODO: When per-plane databases are implemented, split this into plane-specific lists
//       and remove cross-plane TypeORM @OneToMany/@ManyToOne relations from entity classes.
import { Agent } from './agent.entity';
import { Operation } from './operation.entity';
import { Persona } from './persona.entity';
import { UserEntity } from './user.entity';
import { UserPreferencesEntity } from './user-preferences.entity';
import { UserContactEntity } from './user-contact.entity';
import { UserMessageEntity } from './user-message.entity';
import { UserPresenceEntity } from './user-presence.entity';
import { RefreshTokenEntity } from './refreshToken.entity';
import { PasswordResetTokenEntity } from './passwordResetToken.entity';
import { AgentCapabilityMetric } from './agentCapabilityMetric.entity';
import { AgentActivity } from './agent-activity.entity';
import { AgentLearningRecord } from './agent-learning-record.entity';
import { ToolUsageRecord } from './toolUsageRecord.entity';
import { ConversationContext } from './conversationContext.entity';
import { OperationState } from './operationState.entity';
import { OperationCheckpoint } from './operationCheckpoint.entity';
import { StepResult } from './stepResult.entity';
import { ApprovalWorkflow } from './approvalWorkflow.entity';
import { ApprovalDecision } from './approvalDecision.entity';
import { AuditEvent } from './auditEvent.entity';
import { SecurityPolicy } from './securityPolicy.entity';
import { ToolDefinition } from './toolDefinition.entity';
import { ToolExecution } from './toolExecution.entity';
import { ToolAssignment } from './toolAssignment.entity';
import { UserToolPreferences } from './userToolPreferences.entity';
import { Artifact } from './artifact.entity';
import { ArtifactReview } from './artifactReview.entity';
import { ArtifactDeployment } from './artifactDeployment.entity';
import { Discussion } from './discussion.entity';
import { DiscussionParticipant } from './discussionParticipant.entity';
import { DiscussionMessage } from './discussionMessage.entity';
import { PersonaAnalytics } from './personaAnalytics.entity';
import { MCPServer } from './mcpServer.entity';
import { MCPToolCall } from './mcpToolCall.entity';
import { KnowledgeItemEntity } from './knowledge-item.entity';
import { KnowledgeRelationshipEntity } from './knowledge-relationship.entity';
import { LLMProvider } from './llmProvider.entity';
import { LLMModel } from './llmModel.entity';
import { UserLLMProvider } from './userLLMProvider.entity';
import { UserLLMPreference } from './userLLMPreference.entity';
import { AgentLLMPreference } from './agentLLMPreference.entity';
import { IntegrationEventEntity } from './integrationEvent.entity';
import { OAuthProviderEntity } from './oauthProvider.entity';
import { OAuthStateEntity } from './oauthState.entity';
import { AgentOAuthConnectionEntity } from './agentOAuthConnection.entity';
import { MFAChallengeEntity } from './mfaChallenge.entity';
import { SessionEntity } from './session.entity';
import { ShortLinkEntity } from './short-link.entity';
import { ProjectEntity } from './project.entity';
import { ProjectMemberEntity } from './project-member.entity';
import { ProjectFileEntity } from './project-file.entity';
import { TaskEntity } from './task.entity';

export const allEntities = [
  Agent, Operation, Persona,
  UserEntity, UserPreferencesEntity, UserContactEntity, UserMessageEntity, UserPresenceEntity,
  RefreshTokenEntity, PasswordResetTokenEntity,
  AgentCapabilityMetric, AgentActivity, AgentLearningRecord,
  ToolUsageRecord, ConversationContext,
  OperationState, OperationCheckpoint, StepResult,
  ApprovalWorkflow, ApprovalDecision,
  AuditEvent, SecurityPolicy,
  ToolDefinition, ToolExecution, ToolAssignment, UserToolPreferences,
  Artifact, ArtifactReview, ArtifactDeployment,
  Discussion, DiscussionParticipant, DiscussionMessage, PersonaAnalytics,
  MCPServer, MCPToolCall,
  KnowledgeItemEntity, KnowledgeRelationshipEntity,
  LLMProvider, LLMModel, UserLLMProvider, UserLLMPreference, AgentLLMPreference,
  IntegrationEventEntity,
  OAuthProviderEntity, OAuthStateEntity, AgentOAuthConnectionEntity,
  MFAChallengeEntity, SessionEntity, ShortLinkEntity,
  ProjectEntity, ProjectMemberEntity, ProjectFileEntity, TaskEntity,
];
