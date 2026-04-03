import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withRequiredAuth } from '@uaip/middleware';
import { DefaultUserLLMProviderSeed, UserService } from '@uaip/shared-services';

import { getAuthUser, getErrorMessage } from './context_helpers.js';

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
    .get('/', async ({ set, user }) => {
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user!.id);
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
      } catch {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // PUT /
    .put('/', async ({ set, body, user }) => {
      const validation = UpdatePersonaSchema.safeParse(body);
      if (!validation.success) {
        set.status = 400;
        return { error: 'Invalid request data', details: validation.error.errors };
      }
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user!.id);
        if (!entity) {
          set.status = 404;
          return { error: 'User not found' };
        }
        const { personaData, onboardingProgress, behavioralPatterns } = validation.data;
        if (personaData)
          entity.userPersona = { ...entity.userPersona, ...personaData };
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
        await repo.updateUser(user!.id, {
          userPersona: entity.userPersona,
          onboardingProgress: entity.onboardingProgress,
          behavioralPatterns: entity.behavioralPatterns,
        });
        logger.info('User persona updated', {
          userId: user!.id,
          updatedFields: Object.keys(body as unknown),
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
      } catch {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // POST /complete-onboarding
    .post('/complete-onboarding', async ({ set, body, user }) => {
      const validation = CompleteOnboardingSchema.safeParse(body);
      if (!validation.success) {
        set.status = 400;
        return { error: 'Invalid onboarding data', details: validation.error.errors };
      }
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user!.id);
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
        await repo.updateUser(user!.id, {
          userPersona: entity.userPersona,
          onboardingProgress: entity.onboardingProgress,
          behavioralPatterns: entity.behavioralPatterns,
        });
        try {
          const providerRepo = UserService.getInstance().getUserLLMProviderRepository();
          const providers = await providerRepo.findByUserId(user!.id);
          if (providers.length === 0)
            await DefaultUserLLMProviderSeed.createDefaultProvidersForUser(user!.id);
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
      } catch {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // PUT /behavioral-patterns
    .put('/behavioral-patterns', async ({ set, body, user }) => {
      const validation = BehavioralPatternsSchema.safeParse(body);
      if (!validation.success) {
        set.status = 400;
        return { error: 'Invalid behavioral patterns data', details: validation.error.errors };
      }
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user!.id);
        if (!entity) {
          set.status = 404;
          return { error: 'User not found' };
        }
        entity.behavioralPatterns = {
          ...defaultBehavioralPatterns,
          ...entity.behavioralPatterns,
          ...validation.data,
        };
        await repo.updateUser(user!.id, {
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
      } catch {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // GET /recommendations
    .get('/recommendations', async ({ set, user }) => {
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user!.id);
        if (!entity || !entity.userPersona) {
          set.status = 400;
          return { error: 'User persona not found. Please complete onboarding first.' };
        }
        const persona = entity.userPersona as Record<string, unknown>;
        const behavioral = entity.behavioralPatterns as Record<string, unknown>;
        const recommendations = await generatePersonaRecommendations(persona, behavioral);
        return recommendations;
      } catch {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // POST /track-interaction
    .post('/track-interaction', async ({ set, body, user }) => {
      const validation = InteractionTrackingSchema.safeParse(body);
      if (!validation.success) {
        set.status = 400;
        return { error: 'Invalid interaction data', details: validation.error.errors };
      }
      try {
        const { type, data, timestamp } = validation.data;
        await processUserInteraction(user!.id, type, data, timestamp);
        return { success: true };
      } catch {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // GET /compatible-agents
    .get('/compatible-agents', async ({ set, user }) => {
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user!.id);
        if (!entity || !entity.userPersona) {
          set.status = 400;
          return { error: 'User persona not found. Please complete onboarding first.' };
        }
        // @ts-expect-error -- Argument type mismatch
        const compatible = await getCompatibleAgents(entity.userPersona as unknown);
        return compatible;
      } catch {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  
    // GET /optimized-workspace
    .get('/optimized-workspace', async ({ set, user }) => {
      try {
        const repo = userService.getUserRepository();
        const entity = await repo.findById(user!.id);
        if (!entity || !entity.userPersona) {
          set.status = 400;
          return { error: 'User persona not found. Please complete onboarding first.' };
        }
        const workspace = await generateOptimizedWorkspace(
          // @ts-expect-error -- Argument type mismatch
          entity.userPersona as unknown,
          entity.behavioralPatterns as unknown
        );
        return workspace;
      } catch {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    })
  );

}

async function generatePersonaRecommendations(
  persona: Record<string, unknown>,
  _behavioralPatterns: Record<string, unknown>
) {
  const recommendations = {
    recommendedTools: [],
    recommendedAgents: [],
    workflowSuggestions: [],
    uiCustomizations: {
      layout: persona.workStyle === 'collaborative' ? 'dashboard' : 'focused',
      density: persona.communicationPreference === 'brief' ? 'compact' : 'comfortable',
      theme: persona.problemSolvingApproach === 'creative' ? 'creative' : 'default',
      notifications: persona.communicationPreference === 'brief' ? 'minimal' : 'standard',
    },
  } as unknown;
  return recommendations;
}

async function processUserInteraction(
  userId: string,
  type: string,
  data: unknown,
  timestamp: Date
) {
  logger.info('Processed user interaction', { userId, type, timestamp });
}

async function getCompatibleAgents(_persona: Record<string, unknown>) {
  return [] as unknown[];
}

async function generateOptimizedWorkspace(
  _persona: Record<string, unknown>,
  _behavioral: Record<string, unknown>
) {
  return { layout: 'default', widgets: [] } as unknown;
}

export default registerPersonaRoutes;
