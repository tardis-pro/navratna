import express, { Request, Response } from 'express';
import { authMiddleware } from '@uaip/middleware';
import { DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { z } from 'zod';

const router: express.Router = express.Router();

// Validation schemas
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
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive'])
});

const OnboardingProgressSchema = z.object({
  isCompleted: z.boolean(),
  currentStep: z.number(),
  completedSteps: z.array(z.string()),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  responses: z.record(z.any())
});

const BehavioralPatternsSchema = z.object({
  sessionDuration: z.number(),
  activeHours: z.array(z.string()),
  frequentlyUsedTools: z.array(z.string()),
  preferredAgents: z.array(z.string()),
  workflowPatterns: z.array(z.string()),
  interactionStyle: z.enum(['direct', 'exploratory', 'methodical']),
  feedbackPreference: z.enum(['immediate', 'summary', 'detailed'])
});

const UpdatePersonaSchema = z.object({
  personaData: UserPersonaSchema.partial().optional(),
  onboardingProgress: OnboardingProgressSchema.partial().optional(),
  behavioralPatterns: BehavioralPatternsSchema.partial().optional()
});

const CompleteOnboardingSchema = z.object({
  personaData: UserPersonaSchema,
  onboardingProgress: OnboardingProgressSchema
});

const InteractionTrackingSchema = z.object({
  type: z.enum(['tool_usage', 'agent_interaction', 'workflow_completion', 'preference_change']),
  data: z.any(),
  timestamp: z.date()
});

// Get current user's persona data
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    const user = await userRepository.findById(userId);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const response = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userPersona: user.userPersona,
      onboardingProgress: user.onboardingProgress,
      behavioralPatterns: user.behavioralPatterns,
      updatedAt: user.updatedAt
    };

    res.json(response);
    return;
  } catch (error) {
    logger.error('Error getting user persona:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Update user persona data
router.put('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const validation = UpdatePersonaSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        error: 'Invalid request data', 
        details: validation.error.errors 
      });
      return;
    }

    const { personaData, onboardingProgress, behavioralPatterns } = validation.data;
    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    
    const user = await userRepository.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Update persona data
    if (personaData) {
      user.userPersona = { ...user.userPersona, ...personaData };
    }

    if (onboardingProgress) {
      user.onboardingProgress = { ...user.onboardingProgress, ...onboardingProgress };
    }

    if (behavioralPatterns) {
      user.behavioralPatterns = { ...user.behavioralPatterns, ...behavioralPatterns };
    }

    await userRepository.update(userId, user);

    // Log the persona update for analytics
    logger.info('User persona updated', {
      userId,
      updatedFields: Object.keys(req.body),
      timestamp: new Date()
    });

    const response = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userPersona: user.userPersona,
      onboardingProgress: user.onboardingProgress,
      behavioralPatterns: user.behavioralPatterns,
      updatedAt: user.updatedAt
    };

    res.json(response);
    return;
  } catch (error) {
    logger.error('Error updating user persona:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Complete onboarding flow
router.post('/complete-onboarding', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const validation = CompleteOnboardingSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        error: 'Invalid onboarding data', 
        details: validation.error.errors 
      });
      return;
    }

    const { personaData, onboardingProgress } = validation.data;
    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    
    const user = await userRepository.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Complete onboarding - cast to expected type
    user.userPersona = personaData as any;
    user.onboardingProgress = {
      ...onboardingProgress,
      isCompleted: true,
      completedAt: new Date(),
      currentStep: onboardingProgress.currentStep || 0,
      completedSteps: onboardingProgress.completedSteps || [],
      responses: onboardingProgress.responses || {}
    };

    // Initialize behavioral patterns
    user.behavioralPatterns = {
      sessionDuration: 0,
      activeHours: [],
      frequentlyUsedTools: [],
      preferredAgents: [],
      workflowPatterns: [],
      interactionStyle: 'methodical',
      feedbackPreference: personaData.communicationPreference === 'brief' ? 'immediate' : 'summary'
    };

    await userRepository.update(userId, user);

    // Log successful onboarding completion
    logger.info('User onboarding completed', {
      userId,
      personaData,
      timestamp: new Date()
    });

    const response = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userPersona: user.userPersona,
      onboardingProgress: user.onboardingProgress,
      behavioralPatterns: user.behavioralPatterns,
      updatedAt: user.updatedAt
    };

    res.json(response);
    return;
  } catch (error) {
    logger.error('Error completing onboarding:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Update behavioral patterns
router.put('/behavioral-patterns', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const validation = BehavioralPatternsSchema.partial().safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        error: 'Invalid behavioral patterns data', 
        details: validation.error.errors 
      });
      return;
    }

    const behavioralPatterns = validation.data;
    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    
    const user = await userRepository.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    user.behavioralPatterns = { ...user.behavioralPatterns, ...behavioralPatterns };
    await userRepository.update(userId, user);

    const response = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userPersona: user.userPersona,
      onboardingProgress: user.onboardingProgress,
      behavioralPatterns: user.behavioralPatterns,
      updatedAt: user.updatedAt
    };

    res.json(response);
    return;
  } catch (error) {
    logger.error('Error updating behavioral patterns:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Get persona-based recommendations
router.get('/recommendations', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    const user = await userRepository.findById(userId);
    
    if (!user || !user.userPersona) {
      res.status(400).json({ error: 'User persona not found. Please complete onboarding first.' });
      return;
    }

    const persona = user.userPersona;
    const behavioralPatterns = user.behavioralPatterns;

    // Generate recommendations based on persona
    const recommendations = await generatePersonaRecommendations(persona, behavioralPatterns);

    res.json(recommendations);
    return;
  } catch (error) {
    logger.error('Error getting persona recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Get persona insights and analytics
router.get('/insights', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    const user = await userRepository.findById(userId);
    
    if (!user || !user.userPersona) {
      res.status(400).json({ error: 'User persona not found. Please complete onboarding first.' });
      return;
    }

    const insights = await generatePersonaInsights(user);

    res.json(insights);
    return;
  } catch (error) {
    logger.error('Error getting persona insights:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Check onboarding status
router.get('/onboarding-status', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    const user = await userRepository.findById(userId);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const onboardingProgress = user.onboardingProgress;
    const response = {
      isRequired: !onboardingProgress?.isCompleted,
      isCompleted: onboardingProgress?.isCompleted || false,
      currentStep: onboardingProgress?.currentStep || 0
    };

    res.json(response);
    return;
  } catch (error) {
    logger.error('Error checking onboarding status:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Reset persona data
router.post('/reset', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    const user = await userRepository.findById(userId);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Reset persona data
    user.userPersona = undefined;
    user.onboardingProgress = undefined;
    user.behavioralPatterns = undefined;

    await userRepository.update(userId, user);

    logger.info('User persona reset', { userId, timestamp: new Date() });

    res.json({ success: true });
    return;
  } catch (error) {
    logger.error('Error resetting persona:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Track user interaction for behavioral learning
router.post('/track-interaction', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const validation = InteractionTrackingSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        error: 'Invalid interaction data', 
        details: validation.error.errors 
      });
      return;
    }

    const { type, data, timestamp } = validation.data;

    // Process interaction and update behavioral patterns
    await processUserInteraction(userId, type, data, timestamp);

    res.json({ success: true });
    return;
  } catch (error) {
    logger.error('Error tracking interaction:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Get persona-compatible agents
router.get('/compatible-agents', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    const user = await userRepository.findById(userId);
    
    if (!user || !user.userPersona) {
      res.status(400).json({ error: 'User persona not found. Please complete onboarding first.' });
      return;
    }

    const persona = user.userPersona;
    const compatibleAgents = await getCompatibleAgents(persona);

    res.json(compatibleAgents);
    return;
  } catch (error) {
    logger.error('Error getting compatible agents:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Get optimized workspace layout
router.get('/optimized-workspace', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const userRepository = databaseService.getUserRepository();
    const user = await userRepository.findById(userId);
    
    if (!user || !user.userPersona) {
      res.status(400).json({ error: 'User persona not found. Please complete onboarding first.' });
      return;
    }

    const persona = user.userPersona;
    const behavioralPatterns = user.behavioralPatterns;
    const optimizedWorkspace = await generateOptimizedWorkspace(persona, behavioralPatterns);

    res.json(optimizedWorkspace);
    return;
  } catch (error) {
    logger.error('Error getting optimized workspace:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

// Helper functions
async function generatePersonaRecommendations(persona: any, behavioralPatterns: any) {
  const recommendations = {
    recommendedTools: [],
    recommendedAgents: [],
    workflowSuggestions: [],
    uiCustomizations: {
      layout: persona.workStyle === 'collaborative' ? 'dashboard' : 'focused',
      density: persona.communicationPreference === 'brief' ? 'compact' : 'comfortable',
      theme: persona.problemSolvingApproach === 'creative' ? 'creative' : 'default',
      notifications: persona.communicationPreference === 'brief' ? 'minimal' : 'standard'
    }
  };

  // Generate tool recommendations based on domain expertise
  if (persona.domainExpertise) {
    const toolMapping = {
      'software-development': ['github', 'jira', 'slack', 'confluence'],
      'data-science': ['jupyter', 'github', 'slack'],
      'design': ['figma', 'slack', 'notion'],
      'product-management': ['jira', 'confluence', 'slack', 'notion'],
      'marketing': ['notion', 'slack', 'analytics'],
      'operations': ['jira', 'slack', 'confluence', 'automation']
    };

    persona.domainExpertise.forEach((domain: string) => {
      const tools = toolMapping[domain] || [];
      tools.forEach((tool: string) => {
        recommendations.recommendedTools.push({
          id: tool,
          name: tool.charAt(0).toUpperCase() + tool.slice(1),
          reason: `Recommended for ${domain} expertise`,
          priority: 'high'
        });
      });
    });
  }

  return recommendations;
}

async function generatePersonaInsights(user: any) {
  const persona = user.userPersona;
  const onboardingProgress = user.onboardingProgress;

  const insights = {
    completionRate: onboardingProgress?.isCompleted ? 100 : 0,
    strongestTraits: [],
    growthAreas: [],
    personalityType: 'Analytical Collaborator', // This would be calculated based on responses
    workStyleMatch: 85, // This would be calculated based on usage patterns
    recommendations: await generatePersonaRecommendations(persona, user.behavioralPatterns)
  };

  // Analyze strongest traits
  if (persona.workStyle === 'collaborative') {
    insights.strongestTraits.push('Team Collaboration');
  }
  if (persona.problemSolvingApproach === 'analytical') {
    insights.strongestTraits.push('Analytical Thinking');
  }
  if (persona.workflowStyle === 'structured') {
    insights.strongestTraits.push('Structured Approach');
  }

  return insights;
}

async function processUserInteraction(userId: string, type: string, data: any, timestamp: Date) {
  const databaseService = DatabaseService.getInstance();
  const user = await databaseService.getUserRepository().findById(userId);
  
  if (!user || !user.behavioralPatterns) {
    return;
  }

  const patterns = user.behavioralPatterns;

  // Update behavioral patterns based on interaction type
  switch (type) {
    case 'tool_usage':
      if (data.toolId && !patterns.frequentlyUsedTools.includes(data.toolId)) {
        patterns.frequentlyUsedTools.push(data.toolId);
      }
      break;
    case 'agent_interaction':
      if (data.agentId && !patterns.preferredAgents.includes(data.agentId)) {
        patterns.preferredAgents.push(data.agentId);
      }
      break;
    case 'workflow_completion':
      if (data.workflow && !patterns.workflowPatterns.includes(data.workflow)) {
        patterns.workflowPatterns.push(data.workflow);
      }
      break;
  }

  // Update session duration and active hours
  const hour = timestamp.getHours().toString();
  if (!patterns.activeHours.includes(hour)) {
    patterns.activeHours.push(hour);
  }

  const userRepository = databaseService.getUserRepository();
  await userRepository.update(userId, user);
}

async function getCompatibleAgents(persona: any) {
  const databaseService = DatabaseService.getInstance();
  const agentRepository = databaseService.getAgentRepository();
  
  // Get all active agents
  const allAgents = await agentRepository.getActiveAgents();
  
  // Filter agents based on persona compatibility
  const compatibleAgents = allAgents.filter(agent => {
    // Match work style
    if (persona.workStyle === 'collaborative' && agent.configuration?.workStyle === 'independent') {
      return false;
    }
    
    // Match communication preferences
    if (persona.communicationPreference === 'brief' && agent.configuration?.responseStyle === 'detailed') {
      return false;
    }
    
    // Match domain expertise
    if (persona.domainExpertise && agent.configuration?.domainExpertise) {
      const hasOverlap = persona.domainExpertise.some((domain: string) => 
        agent.configuration.domainExpertise.includes(domain)
      );
      if (!hasOverlap) {
        return false;
      }
    }
    
    return true;
  });
  
  return compatibleAgents.map(agent => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    configuration: agent.configuration,
    compatibilityScore: calculateCompatibilityScore(persona, agent),
    matchReason: getMatchReason(persona, agent)
  }));
}

async function generateOptimizedWorkspace(persona: any, behavioralPatterns: any) {
  const workspace = {
    layout: {
      type: persona.workStyle === 'collaborative' ? 'dashboard' : 'focused',
      density: persona.communicationPreference === 'brief' ? 'compact' : 'comfortable',
      theme: persona.problemSolvingApproach === 'creative' ? 'creative' : 'professional'
    },
    recommendations: {
      widgets: [],
      shortcuts: [],
      toolPlacements: [],
      agentPlacements: []
    },
    personalization: {
      notifications: persona.communicationPreference === 'brief' ? 'minimal' : 'standard',
      updateFrequency: persona.timeManagement === 'deadline-driven' ? 'realtime' : 'periodic',
      automationLevel: persona.workflowStyle === 'structured' ? 'high' : 'medium'
    }
  };

  // Add widget recommendations based on persona
  if (persona.workStyle === 'collaborative') {
    workspace.recommendations.widgets.push('team-activity', 'shared-projects', 'communication-hub');
  }
  
  if (persona.problemSolvingApproach === 'analytical') {
    workspace.recommendations.widgets.push('analytics-dashboard', 'data-insights', 'performance-metrics');
  }
  
  if (persona.workflowStyle === 'structured') {
    workspace.recommendations.widgets.push('task-list', 'schedule-view', 'progress-tracker');
  }

  // Add shortcuts based on behavioral patterns
  if (behavioralPatterns?.frequentlyUsedTools) {
    workspace.recommendations.shortcuts = behavioralPatterns.frequentlyUsedTools.map((tool: string) => ({
      tool,
      priority: 'high',
      placement: 'sidebar'
    }));
  }

  // Add agent placements based on preferences
  if (behavioralPatterns?.preferredAgents) {
    workspace.recommendations.agentPlacements = behavioralPatterns.preferredAgents.map((agentId: string) => ({
      agentId,
      placement: 'quick-access',
      priority: 'high'
    }));
  }

  return workspace;
}

function calculateCompatibilityScore(persona: any, agent: any): number {
  let score = 0;
  let totalFactors = 0;

  // Work style compatibility
  if (persona.workStyle && agent.configuration?.workStyle) {
    totalFactors++;
    if (persona.workStyle === agent.configuration.workStyle) {
      score += 30;
    } else if (persona.workStyle === 'hybrid') {
      score += 20;
    }
  }

  // Communication preference compatibility
  if (persona.communicationPreference && agent.configuration?.responseStyle) {
    totalFactors++;
    if (persona.communicationPreference === agent.configuration.responseStyle) {
      score += 25;
    } else if (persona.communicationPreference === 'detailed' && agent.configuration.responseStyle === 'comprehensive') {
      score += 20;
    }
  }

  // Domain expertise overlap
  if (persona.domainExpertise && agent.configuration?.domainExpertise) {
    totalFactors++;
    const overlap = persona.domainExpertise.filter((domain: string) => 
      agent.configuration.domainExpertise.includes(domain)
    );
    score += (overlap.length / persona.domainExpertise.length) * 25;
  }

  // Problem solving approach compatibility
  if (persona.problemSolvingApproach && agent.configuration?.problemSolvingStyle) {
    totalFactors++;
    if (persona.problemSolvingApproach === agent.configuration.problemSolvingStyle) {
      score += 20;
    }
  }

  // Return normalized score (0-100)
  return totalFactors > 0 ? Math.round(score / totalFactors * 4) : 50;
}

function getMatchReason(persona: any, agent: any): string {
  const reasons = [];

  if (persona.workStyle === agent.configuration?.workStyle) {
    reasons.push(`Matches your ${persona.workStyle} work style`);
  }

  if (persona.communicationPreference === agent.configuration?.responseStyle) {
    reasons.push(`Provides ${persona.communicationPreference} communication`);
  }

  if (persona.domainExpertise && agent.configuration?.domainExpertise) {
    const overlap = persona.domainExpertise.filter((domain: string) => 
      agent.configuration.domainExpertise.includes(domain)
    );
    if (overlap.length > 0) {
      reasons.push(`Expertise in ${overlap.join(', ')}`);
    }
  }

  return reasons.length > 0 ? reasons.join('; ') : 'General compatibility';
}

export default router;