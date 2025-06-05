// Entity exports for the shared services package
// This file exports all TypeORM entities for use across the monorepo

// Base entity
// export { BaseEntity } from './base.entity.js';

// Core entities
export { Agent } from './agent.entity.js';
export { Operation } from './operation.entity.js';
export { Persona } from './persona.entity.js';

// User System entities
export { UserEntity } from './user.entity.js';
export { RefreshTokenEntity } from './refreshToken.entity.js';
export { PasswordResetTokenEntity } from './passwordResetToken.entity.js';

// Agent System entities
export { AgentCapabilityMetric } from './agentCapabilityMetric.entity.js';
export { ToolUsageRecord } from './toolUsageRecord.entity.js';
export { ConversationContext } from './conversationContext.entity.js';

// Operation System entities
export { OperationState } from './operationState.entity.js';
export { OperationCheckpoint } from './operationCheckpoint.entity.js';
export { StepResult } from './stepResult.entity.js';
export { ApprovalWorkflow } from './approvalWorkflow.entity.js';
export { ApprovalDecision } from './approvalDecision.entity.js';

// Audit System entities
export { AuditEvent } from './auditEvent.entity.js';

// Security System entities
export { SecurityPolicy } from './securityPolicy.entity.js';

// Tool System entities
export { ToolDefinition } from './toolDefinition.entity.js';
export { ToolExecution } from './toolExecution.entity.js';

// Artifact System entities
export { Artifact } from './artifact.entity.js';
export { ArtifactReview } from './artifactReview.entity.js';
export { ArtifactDeployment } from './artifactDeployment.entity.js';

// Persona System entities
export { DiscussionParticipant } from './discussionParticipant.entity.js';
export { PersonaAnalytics } from './personaAnalytics.entity.js';

// MCP Integration entities
export { MCPServer } from './mcpServer.entity.js';
export { MCPToolCall } from './mcpToolCall.entity.js';

// Entity arrays for TypeORM configuration - using lazy loading to avoid circular dependencies
export const getAllEntities = () => [
  // Import entities dynamically to avoid circular dependencies
  require('./base.entity.js').BaseEntity,
  require('./agent.entity.js').Agent,
  require('./operation.entity.js').Operation,
  require('./persona.entity.js').Persona,
  require('./user.entity.js').UserEntity,
  require('./refreshToken.entity.js').RefreshTokenEntity,
  require('./passwordResetToken.entity.js').PasswordResetTokenEntity,
  require('./agentCapabilityMetric.entity.js').AgentCapabilityMetric,
  require('./toolUsageRecord.entity.js').ToolUsageRecord,
  require('./conversationContext.entity.js').ConversationContext,
  require('./operationState.entity.js').OperationState,
  require('./operationCheckpoint.entity.js').OperationCheckpoint,
  require('./stepResult.entity.js').StepResult,
  require('./approvalWorkflow.entity.js').ApprovalWorkflow,
  require('./approvalDecision.entity.js').ApprovalDecision,
  require('./auditEvent.entity.js').AuditEvent,
  require('./securityPolicy.entity.js').SecurityPolicy,
  require('./toolDefinition.entity.js').ToolDefinition,
  require('./toolExecution.entity.js').ToolExecution,
  require('./artifact.entity.js').Artifact,
  require('./artifactReview.entity.js').ArtifactReview,
  require('./artifactDeployment.entity.js').ArtifactDeployment,
  require('./discussionParticipant.entity.js').DiscussionParticipant,
  require('./personaAnalytics.entity.js').PersonaAnalytics,
  require('./mcpServer.entity.js').MCPServer,
  require('./mcpToolCall.entity.js').MCPToolCall,
]; 