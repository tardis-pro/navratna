import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withRequiredAuth } from './middleware/auth.plugin.js';
import { DatabaseService, DefaultUserLLMProviderSeed } from '@uaip/shared-services';

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

export function registerPersonaRoutes(app: any): any {
  return app.group('/api/v1/user/persona', (app: any) =>
    withRequiredAuth(app)
      // GET /
      .get('/', async ({ set, user }) => {
        try {
          const databaseService = DatabaseService.getInstance();
          const repo = databaseService.getUserRepository();
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
        } catch (error) {
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
          const databaseService = DatabaseService.getInstance();
          const repo = databaseService.getUserRepository();
          const entity = await repo.findById(user!.id);
          if (!entity) {
            set.status = 404;
            return { error: 'User not found' };
          }
          const { personaData, onboardingProgress, behavioralPatterns } = validation.data;
          if (personaData) entity.userPersona = { ...entity.userPersona, ...personaData } as any;
          if (onboardingProgress)
            entity.onboardingProgress = {
              ...entity.onboardingProgress,
              ...onboardingProgress,
            } as any;
          if (behavioralPatterns)
            entity.behavioralPatterns = {
              ...entity.behavioralPatterns,
              ...behavioralPatterns,
            } as any;
          await repo.update(user!.id, entity);
          logger.info('User persona updated', {
            userId: user!.id,
            updatedFields: Object.keys(body as any),
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
        } catch (error) {
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
          const databaseService = DatabaseService.getInstance();
          const repo = databaseService.getUserRepository();
          const entity = await repo.findById(user!.id);
          if (!entity) {
            set.status = 404;
            return { error: 'User not found' };
          }
          const { personaData, onboardingProgress } = validation.data;
          entity.userPersona = personaData as any;
          entity.onboardingProgress = {
            ...onboardingProgress,
            isCompleted: true,
            completedAt: new Date(),
            currentStep: onboardingProgress.currentStep || 0,
            completedSteps: onboardingProgress.completedSteps || [],
            responses: onboardingProgress.responses || {},
          } as any;
          entity.behavioralPatterns = {
            sessionDuration: 0,
            activeHours: [],
            frequentlyUsedTools: [],
            preferredAgents: [],
            workflowPatterns: [],
            interactionStyle: 'methodical',
            feedbackPreference:
              personaData.communicationPreference === 'brief' ? 'immediate' : 'summary',
          } as any;
          await repo.update(user!.id, entity);
          try {
            const dataSource = await databaseService.getDataSource();
            const userLLMProviderRepo = dataSource.getRepository('UserLLMProvider');
            const count = await userLLMProviderRepo.count({ where: { userId: user!.id } });
            if (count === 0)
              await DefaultUserLLMProviderSeed.createDefaultProvidersForUser(
                dataSource,
                user!.id,
                (entity as any).role || 'user'
              );
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
        } catch (error) {
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
          const repo = DatabaseService.getInstance().getUserRepository();
          const entity = await repo.findById(user!.id);
          if (!entity) {
            set.status = 404;
            return { error: 'User not found' };
          }
          entity.behavioralPatterns = { ...entity.behavioralPatterns, ...validation.data } as any;
          await repo.update(user!.id, entity);
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
        } catch (error) {
          set.status = 500;
          return { error: 'Internal server error' };
        }
      })

      // GET /recommendations
      .get('/recommendations', async ({ set, user }) => {
        try {
          const repo = DatabaseService.getInstance().getUserRepository();
          const entity = await repo.findById(user!.id);
          if (!entity || !entity.userPersona) {
            set.status = 400;
            return { error: 'User persona not found. Please complete onboarding first.' };
          }
          const persona: any = entity.userPersona;
          const behavioral: any = entity.behavioralPatterns;
          const recommendations = await generatePersonaRecommendations(persona, behavioral);
          return recommendations;
        } catch (error) {
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
          const { type, data, timestamp } = validation.data as any;
          await processUserInteraction(user!.id, type, data, timestamp as any);
          return { success: true };
        } catch (error) {
          set.status = 500;
          return { error: 'Internal server error' };
        }
      })

      // GET /compatible-agents
      .get('/compatible-agents', async ({ set, user }) => {
        try {
          const repo = DatabaseService.getInstance().getUserRepository();
          const entity = await repo.findById(user!.id);
          if (!entity || !entity.userPersona) {
            set.status = 400;
            return { error: 'User persona not found. Please complete onboarding first.' };
          }
          const compatible = await getCompatibleAgents(entity.userPersona as any);
          return compatible;
        } catch (error) {
          set.status = 500;
          return { error: 'Internal server error' };
        }
      })

      // GET /optimized-workspace
      .get('/optimized-workspace', async ({ set, user }) => {
        try {
          const repo = DatabaseService.getInstance().getUserRepository();
          const entity = await repo.findById(user!.id);
          if (!entity || !entity.userPersona) {
            set.status = 400;
            return { error: 'User persona not found. Please complete onboarding first.' };
          }
          const workspace = await generateOptimizedWorkspace(
            entity.userPersona as any,
            entity.behavioralPatterns as any
          );
          return workspace;
        } catch (error) {
          set.status = 500;
          return { error: 'Internal server error' };
        }
      })
  );
}

async function generatePersonaRecommendations(persona: any, behavioralPatterns: any) {
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
  } as any;
  return recommendations;
}

async function processUserInteraction(userId: string, type: string, data: any, timestamp: Date) {
  logger.info('Processed user interaction', { userId, type, timestamp });
}

async function getCompatibleAgents(persona: any) {
  return [] as any[];
}

async function generateOptimizedWorkspace(persona: any, behavioral: any) {
  return { layout: 'default', widgets: [] } as any;
}

export default registerPersonaRoutes;
