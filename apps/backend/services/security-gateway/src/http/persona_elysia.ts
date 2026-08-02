import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withRequiredAuth } from '@uaip/middleware';
import {
  agents,
  and,
  DefaultUserLLMProviderSeed,
  eq,
  getIntelligenceDb,
  inArray,
  UserAgentAssignmentRepository,
  UserService,
} from '@uaip/shared-services';

import { getAuthUser, getErrorMessage } from './context_helpers.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const userService = UserService.getInstance();

const defaultOnboardingProgress = {
  isCompleted: false,
  currentStep: 0,
  completedSteps: [],
  responses: {},
};

const defaultBehavioralPatterns = {
  sessionDuration: 0,
  activeHours: [],
  frequentlyUsedTools: [],
  preferredAgents: [],
  workflowPatterns: [],
  interactionStyle: 'methodical' as const,
  feedbackPreference: 'summary' as const,
};

const UserPersonaSchema = z.object({
  workStyle: z.enum(['collaborative', 'independent', 'hybrid']),
  communicationPreference: z.enum(['brief', 'detailed', 'visual']),
  domainExpertise: z.array(z.string()),
  toolPreferences: z.array(z.string()),
  workflowStyle: z.enum(['structured', 'flexible', 'experimental']),
  problemSolvingApproach: z.enum(['analytical', 'creative', 'pragmatic']),
  decisionMaking: z.enum(['quick', 'deliberate', 'consensus']),
  learningStyle: z.enum(['hands-on', 'theoretical', 'collaborative']),
  timeManagement: z.enum(['deadline-driven', 'flexible', 'time-blocked']),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']),
});

const OnboardingProgressSchema = z.object({
  isCompleted: z.boolean(),
  currentStep: z.number(),
  completedSteps: z.array(z.string()),
  startedAt: z
    .string()
    .datetime()
    .transform((str) => new Date(str))
    .optional(),
  completedAt: z
    .string()
    .datetime()
    .transform((str) => new Date(str))
    .optional(),
  responses: z.record(z.any()),
});

const BehavioralPatternsSchema = z.object({
  sessionDuration: z.number().optional(),
  activeHours: z.array(z.string()).optional(),
  frequentlyUsedTools: z.array(z.string()).optional(),
  preferredAgents: z.array(z.string()).optional(),
  workflowPatterns: z.array(z.string()).optional(),
  interactionStyle: z.enum(['direct', 'exploratory', 'methodical']).optional(),
  feedbackPreference: z.enum(['immediate', 'summary', 'detailed']).optional(),
});

const UpdatePersonaSchema = z.object({
  personaData: UserPersonaSchema.partial().optional(),
  onboardingProgress: OnboardingProgressSchema.partial().optional(),
  behavioralPatterns: BehavioralPatternsSchema.partial().optional(),
});

const CompleteOnboardingSchema = z.object({
  personaData: UserPersonaSchema,
  onboardingProgress: OnboardingProgressSchema,
});

const InteractionTrackingSchema = z.object({
  type: z.enum(['tool_usage', 'agent_interaction', 'workflow_completion', 'preference_change']),
  data: z.any(),
  timestamp: z
    .string()
    .datetime()
    .transform((str) => new Date(str)),
});

export function registerPersonaRoutes() {
  return new Elysia().group('/api/v1/users/persona', (app) => withRequiredAuth(app)
    // GET /
    .get('/', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set } = ctx;
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user.id);
        if (!entity) {
          set.status = 404;
          return { error: 'User not found' };
        }
        return {
          id: entity.id,
          email: entity.email,
          firstName: entity.firstName,
          lastName: entity.lastName,
          userPersona: entity.userPersona,
          onboardingProgress: entity.onboardingProgress,
          behavioralPatterns: entity.behavioralPatterns,
          updatedAt: entity.updatedAt,
        };
      } catch (e) {
        logger.error('Failed to get user persona', { error: getErrorMessage(e), userId: user.id });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // PUT /
    .put('/', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, body } = ctx;
      const validation = UpdatePersonaSchema.safeParse(body);
      if (!validation.success) {
        set.status = 400;
        return { error: 'Invalid request data', details: validation.error.errors };
      }
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user.id);
        if (!entity) {
          set.status = 404;
          return { error: 'User not found' };
        }
        const { personaData, onboardingProgress, behavioralPatterns } = validation.data;
        if (personaData && entity.userPersona) {
          // Spreading partial updates onto an existing complete persona preserves all required fields.
          // The cast is safe: entity.userPersona provides all required fields; personaData only overrides.
          entity.userPersona = { ...entity.userPersona, ...personaData } as typeof entity.userPersona;
        }
        if (onboardingProgress)
          entity.onboardingProgress = {
            ...defaultOnboardingProgress,
            ...entity.onboardingProgress,
            ...onboardingProgress,
          };
        if (behavioralPatterns)
          entity.behavioralPatterns = {
            ...defaultBehavioralPatterns,
            ...entity.behavioralPatterns,
            ...behavioralPatterns,
          };
        await repo.updateUser(user.id, {
          userPersona: entity.userPersona,
          onboardingProgress: entity.onboardingProgress,
          behavioralPatterns: entity.behavioralPatterns,
        });
        logger.info('User persona updated', {
          userId: user.id,
          updatedFields: Object.keys(validation.data),
        });
        return {
          id: entity.id,
          email: entity.email,
          firstName: entity.firstName,
          lastName: entity.lastName,
          userPersona: entity.userPersona,
          onboardingProgress: entity.onboardingProgress,
          behavioralPatterns: entity.behavioralPatterns,
          updatedAt: entity.updatedAt,
        };
      } catch (e) {
        logger.error('Failed to update user persona', { error: getErrorMessage(e), userId: user.id });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // POST /complete-onboarding
    .post('/complete-onboarding', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, body } = ctx;
      const validation = CompleteOnboardingSchema.safeParse(body);
      if (!validation.success) {
        set.status = 400;
        return { error: 'Invalid onboarding data', details: validation.error.errors };
      }
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user.id);
        if (!entity) {
          set.status = 404;
          return { error: 'User not found' };
        }
        const { personaData, onboardingProgress } = validation.data;
        entity.userPersona = { ...entity.userPersona, ...personaData };
        entity.onboardingProgress = {
          ...defaultOnboardingProgress,
          ...onboardingProgress,
          isCompleted: true,
          completedAt: new Date(),
          currentStep: onboardingProgress.currentStep || 0,
          completedSteps: onboardingProgress.completedSteps || [],
          responses: onboardingProgress.responses || {},
        };
        entity.behavioralPatterns = {
          ...defaultBehavioralPatterns,
          interactionStyle: 'methodical',
          feedbackPreference:
            personaData.communicationPreference === 'brief' ? 'immediate' : 'summary',
        };
        await repo.updateUser(user.id, {
          userPersona: entity.userPersona,
          onboardingProgress: entity.onboardingProgress,
          behavioralPatterns: entity.behavioralPatterns,
        });
        try {
          const providerRepo = UserService.getInstance().getUserLLMProviderRepository();
          const providers = await providerRepo.findByUserId(user.id);
          if (providers.length === 0)
            await DefaultUserLLMProviderSeed.createDefaultProvidersForUser(user.id);
        } catch (e) {
          logger.error('Default providers creation failed', e);
        }
        return {
          id: entity.id,
          email: entity.email,
          firstName: entity.firstName,
          lastName: entity.lastName,
          userPersona: entity.userPersona,
          onboardingProgress: entity.onboardingProgress,
          behavioralPatterns: entity.behavioralPatterns,
          updatedAt: entity.updatedAt,
        };
      } catch (e) {
        logger.error('Failed to complete onboarding', { error: getErrorMessage(e), userId: user.id });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // GET /onboarding-status
    .get('/onboarding-status', async (ctx) => {
      const { set } = ctx;
      try {
        const user = getAuthUser(ctx);
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user.id);
        if (!entity) {
          set.status = 404;
          return { error: 'User not found' };
        }
        const progress = entity.onboardingProgress ?? defaultOnboardingProgress;
        const isCompleted = Boolean((progress as Record<string, unknown>).isCompleted);
        const currentStep = Number((progress as Record<string, unknown>).currentStep ?? 0);
        return {
          isRequired: !isCompleted,
          isCompleted,
          currentStep,
        };
      } catch (e) {
        const message = getErrorMessage(e);
        if (message.includes('Authentication required')) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
        logger.error('Failed to get onboarding status', { error: message });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })

    // PUT /behavioral-patterns
    .put('/behavioral-patterns', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, body } = ctx;
      const validation = BehavioralPatternsSchema.safeParse(body);
      if (!validation.success) {
        set.status = 400;
        return { error: 'Invalid behavioral patterns data', details: validation.error.errors };
      }
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user.id);
        if (!entity) {
          set.status = 404;
          return { error: 'User not found' };
        }
        entity.behavioralPatterns = {
          ...defaultBehavioralPatterns,
          ...entity.behavioralPatterns,
          ...validation.data,
        };
        await repo.updateUser(user.id, {
          behavioralPatterns: entity.behavioralPatterns,
        });
        return {
          id: entity.id,
          email: entity.email,
          firstName: entity.firstName,
          lastName: entity.lastName,
          userPersona: entity.userPersona,
          onboardingProgress: entity.onboardingProgress,
          behavioralPatterns: entity.behavioralPatterns,
          updatedAt: entity.updatedAt,
        };
      } catch (e) {
        logger.error('Failed to update behavioral patterns', { error: getErrorMessage(e), userId: user.id });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // GET /recommendations
    .get('/recommendations', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set } = ctx;
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user.id);
        if (!entity || !entity.userPersona) {
          set.status = 400;
          return { error: 'User persona not found. Please complete onboarding first.' };
        }
        const persona: Record<string, unknown> = isRecord(entity.userPersona) ? entity.userPersona : {};
        const behavioral: Record<string, unknown> = isRecord(entity.behavioralPatterns) ? entity.behavioralPatterns : {};
        const recommendations = await generatePersonaRecommendations(persona, behavioral);
        return recommendations;
      } catch (e) {
        logger.error('Failed to get persona recommendations', { error: getErrorMessage(e), userId: user.id });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // POST /track-interaction
    .post('/track-interaction', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, body } = ctx;
      const validation = InteractionTrackingSchema.safeParse(body);
      if (!validation.success) {
        set.status = 400;
        return { error: 'Invalid interaction data', details: validation.error.errors };
      }
      try {
        const { type, data, timestamp } = validation.data;
        await processUserInteraction(user.id, type, data, timestamp);
        return { success: true };
      } catch (e) {
        logger.error('Failed to track user interaction', { error: getErrorMessage(e), userId: user.id });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // GET /compatible-agents
    .get('/compatible-agents', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set } = ctx;
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user.id);
        if (!entity || !entity.userPersona) {
          set.status = 400;
          return { error: 'User persona not found. Please complete onboarding first.' };
        }
        const compatible = await getCompatibleAgents(user.id, user.organizationId);
        return compatible;
      } catch (e) {
        logger.error('Failed to get compatible agents', { error: getErrorMessage(e), userId: user.id });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // GET /optimized-workspace
    .get('/optimized-workspace', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set } = ctx;
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user.id);
        if (!entity || !entity.userPersona) {
          set.status = 400;
          return { error: 'User persona not found. Please complete onboarding first.' };
        }
        const personaRec: Record<string, unknown> = isRecord(entity.userPersona) ? entity.userPersona : {};
        const behavioralRec: Record<string, unknown> = isRecord(entity.behavioralPatterns) ? entity.behavioralPatterns : {};
        const workspace = await generateOptimizedWorkspace(personaRec, behavioralRec);
        return workspace;
      } catch (e) {
        logger.error('Failed to get optimized workspace', { error: getErrorMessage(e), userId: user.id });
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  );

}

type PersonaRecommendations = {
  recommendedTools: unknown[];
  recommendedAgents: unknown[];
  workflowSuggestions: unknown[];
  uiCustomizations: {
    layout: string;
    density: string;
    theme: string;
    notifications: string;
  };
};

async function generatePersonaRecommendations(
  persona: Record<string, unknown>,
  _behavioralPatterns: Record<string, unknown>
): Promise<PersonaRecommendations> {
  return {
    recommendedTools: [],
    recommendedAgents: [],
    workflowSuggestions: [],
    uiCustomizations: {
      layout: persona.workStyle === 'collaborative' ? 'dashboard' : 'focused',
      density: persona.communicationPreference === 'brief' ? 'compact' : 'comfortable',
      theme: persona.problemSolvingApproach === 'creative' ? 'creative' : 'default',
      notifications: persona.communicationPreference === 'brief' ? 'minimal' : 'standard',
    },
  };
}

async function processUserInteraction(
  userId: string,
  type: string,
  data: unknown,
  timestamp: Date
) {
  logger.info('Processed user interaction', { userId, type, timestamp });
}

type CompatibleAgent = {
  id: string;
  name: string;
  description: string | null;
  role: string | null;
  capabilities: string[];
};

/**
 * "Compatible" is not a heuristic — it is the grant. user_agent_assignments is
 * the authoritative answer to "which agents are this user's", written by
 * onboarding provisioning and by agent creation.
 *
 * CROSS-PLANE: assignments are CONTROL plane, agents are INTELLIGENCE plane —
 * physically separable hosts, so the ids are fetched first and hydrated
 * second. A single joining statement would fail wherever the planes differ.
 */
async function getCompatibleAgents(
  userId: string,
  organizationId: string
): Promise<CompatibleAgent[]> {
  const agentIds = await new UserAgentAssignmentRepository().findAgentIdsForUser(
    userId,
    organizationId
  );

  // inArray(id, []) is a SQL error in some dialects and a full scan in others.
  if (agentIds.length === 0) return [];

  const rows = await getIntelligenceDb()
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      role: agents.role,
      capabilities: agents.capabilities,
    })
    .from(agents)
    .where(and(inArray(agents.id, agentIds), eq(agents.isActive, true)));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: typeof row.description === 'string' ? row.description : null,
    role: typeof row.role === 'string' ? row.role : null,
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
  }));
}

type OptimizedWorkspace = { layout: string; widgets: unknown[] };

async function generateOptimizedWorkspace(
  _persona: Record<string, unknown>,
  _behavioral: Record<string, unknown>
): Promise<OptimizedWorkspace> {
  return { layout: 'default', widgets: [] };
}

export default registerPersonaRoutes;
