import { Elysia } from 'elysia'
import { withRequiredAuth } from '@uaip/middleware'
import type {
  AgentIntelligenceService,
  CapabilityDiscoveryService,
} from '@uaip/shared-services'
import { logger, isRecord } from '@uaip/utils'

type CapabilityRouteDeps = Pick<
  AgentIntelligenceService,
  'getAgent' | 'analyzeContext' | 'generateExecutionPlan' | 'learnFromOperation'
>
type CapabilityDiscoveryDeps = Pick<CapabilityDiscoveryService, 'getAgentCapabilities'>


export function registerAgentCapabilityRoutes(
  agentIntelligenceService: CapabilityRouteDeps,
  capabilityDiscoveryService: CapabilityDiscoveryDeps
) {
  return new Elysia().group(
    '/api/v1/agents',
    (group) => withRequiredAuth(group)
      .get('/:agentId/capabilities', async (ctx) => {
        try {
          const capabilities = await capabilityDiscoveryService.getAgentCapabilities(
            ctx.params.agentId
          )
          return { success: true, data: capabilities }
        } catch (error) {
          logger.error('Failed to get agent capabilities', {
            error,
            agentId: ctx.params.agentId,
          })
          ctx.set.status = 500
          return { success: false, error: 'Failed to get agent capabilities' }
        }
      })
    
      .post('/:agentId/analyze', async (ctx) => {
        try {
          const agent = await agentIntelligenceService.getAgent(ctx.params.agentId)
          if (!agent) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
    
          const body = isRecord(ctx.body) ? ctx.body : {}
          const userRequest =
            typeof body.input === 'string'
              ? body.input
              : typeof body.userRequest === 'string'
                ? body.userRequest
                : null
    
          if (!userRequest) {
            ctx.set.status = 400
            return { success: false, error: 'Input is required' }
          }
    
          const analysis = await agentIntelligenceService.analyzeContext(
            agent,
            body.conversationContext ?? body.context ?? {},
            userRequest,
            body.constraints
          )
    
          return { success: true, data: analysis }
        } catch (error) {
          logger.error('Failed to analyze agent context', {
            error,
            agentId: ctx.params.agentId,
          })
          ctx.set.status = 500
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to analyze context',
          }
        }
      })
    
      .post('/:agentId/plan', async (ctx) => {
        try {
          const agent = await agentIntelligenceService.getAgent(ctx.params.agentId)
          if (!agent) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
    
          const body = isRecord(ctx.body) ? ctx.body : {}
          const analysis = isRecord(body.analysis) ? body.analysis : {}
          const userPreferences = isRecord(body.userPreferences) ? body.userPreferences : {}
          const securityContext = isRecord(body.securityContext) ? body.securityContext : {}
    
          const plan = await agentIntelligenceService.generateExecutionPlan(
            agent,
            analysis,
            userPreferences,
            securityContext
          )
    
          return { success: true, data: plan }
        } catch (error) {
          logger.error('Failed to generate agent plan', { error, agentId: ctx.params.agentId })
          ctx.set.status = 500
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate plan',
          }
        }
      })
    
      .post('/:agentId/learn', async (ctx) => {
        try {
          const body = isRecord(ctx.body) ? ctx.body : {}
          const operationId = typeof body.operationId === 'string' ? body.operationId : null
          if (!operationId) {
            ctx.set.status = 400
            return {
              success: false,
              error: 'operationId is required for shared-service learning',
            }
          }
    
          const outcomes = isRecord(body.outcomes) ? body.outcomes : {}
          const feedback = isRecord(body.feedback) ? body.feedback : {}
          const result = await agentIntelligenceService.learnFromOperation(
            ctx.params.agentId,
            operationId,
            outcomes,
            feedback
          )
    
          return { success: true, data: result }
        } catch (error) {
          logger.error('Failed to process agent learning', { error, agentId: ctx.params.agentId })
          ctx.set.status = 500
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to process learning',
          }
        }
      })
  )
}
