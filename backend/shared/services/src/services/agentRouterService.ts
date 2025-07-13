import { Repository } from 'typeorm';
import { Agent } from '../entities/agent.entity.js';
import { LLMPreferenceResolutionService } from './llmPreferenceResolutionService.js';
import { 
  RoutingRequest, 
  RoutingResponse, 
  DiscussionDomain, 
  DiscussionAction,
  LLMTaskType,
  AgentRole 
} from '@uaip/types';

export interface AgentCandidate {
  agent: Agent;
  score: number;
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
}

export interface RoutingDecision {
  primaryAgent: Agent;
  supportingAgents: Agent[];
  confidence: number;
  reasoning: string;
  estimatedDuration: number; // minutes
  riskLevel: 'low' | 'medium' | 'high';
  alternatives: AgentCandidate[];
}

export class AgentRouterService {
  constructor(
    private agentRepository: Repository<Agent>,
    private llmPreferenceService: LLMPreferenceResolutionService
  ) {}

  /**
   * Main routing method - finds optimal agent(s) for a given request
   */
  async routeRequest(request: RoutingRequest, userId?: string): Promise<RoutingResponse> {
    // Get available agents (user-specific or all active)
    const availableAgents = await this.getAvailableAgents(userId);
    
    if (availableAgents.length === 0) {
      throw new Error('No available agents found for routing');
    }

    // Score all agents for this request
    const candidates = await this.scoreAgents(availableAgents, request);
    
    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Select primary agent and support agents
    const primaryAgent = candidates[0].agent;
    const supportingAgents = this.selectSupportingAgents(candidates, request);

    // Calculate confidence and risk
    const confidence = this.calculateConfidence(candidates[0].score, candidates);
    const riskAssessment = this.assessRisk(request, candidates[0]);

    // Estimate duration based on complexity and agent performance
    const estimatedDuration = this.estimateDuration(request, candidates[0]);

    return {
      primaryAgent: primaryAgent.id,
      supportingAgents: supportingAgents.map(agent => agent.id),
      confidence,
      reasoning: candidates[0].reasoning,
      estimatedDuration,
      requiredCapabilities: this.extractRequiredCapabilities(request),
      riskAssessment: {
        level: riskAssessment.level,
        factors: riskAssessment.factors
      },
      fallbackOptions: candidates.slice(1, 4).map(candidate => ({
        agent: candidate.agent.id,
        reason: candidate.reasoning
      })),
      routedAt: new Date()
    };
  }

  /**
   * Score agents based on their suitability for the request
   */
  private async scoreAgents(agents: Agent[], request: RoutingRequest): Promise<AgentCandidate[]> {
    const candidates: AgentCandidate[] = [];

    for (const agent of agents) {
      const score = await this.calculateAgentScore(agent, request);
      const evaluation = this.evaluateAgent(agent, request);
      
      candidates.push({
        agent,
        score: score.total,
        reasoning: score.reasoning,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses
      });
    }

    return candidates;
  }

  /**
   * Calculate comprehensive score for an agent
   */
  private async calculateAgentScore(agent: Agent, request: RoutingRequest): Promise<{
    total: number;
    reasoning: string;
    breakdown: Record<string, number>;
  }> {
    const scores = {
      domain: 0,
      action: 0,
      expertise: 0,
      workload: 0,
      tools: 0,
      performance: 0,
      llmOptimization: 0
    };

    // 1. Domain expertise matching (25%)
    scores.domain = this.scoreDomainMatch(agent, request.domain);

    // 2. Action capability matching (20%)
    scores.action = this.scoreActionCapability(agent, request.action);

    // 3. Expertise alignment (20%)
    scores.expertise = this.scoreExpertiseAlignment(agent, request);

    // 4. Current workload (15%)
    scores.workload = this.scoreWorkload(agent);

    // 5. Tool availability (10%)
    scores.tools = this.scoreToolCapability(agent, request);

    // 6. Historical performance (10%)
    scores.performance = await this.scoreHistoricalPerformance(agent, request);

    // 7. LLM optimization for task (bonus)
    scores.llmOptimization = await this.scoreLLMOptimization(agent, request);

    // Calculate weighted total
    const weights = {
      domain: 0.25,
      action: 0.20,
      expertise: 0.20,
      workload: 0.15,
      tools: 0.10,
      performance: 0.10,
      llmOptimization: 0.05 // Bonus points
    };

    const total = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + (score * (weights[key as keyof typeof weights] || 0));
    }, 0);

    const reasoning = this.generateScoreReasoning(agent, scores, request);

    return {
      total: Math.min(1, Math.max(0, total)),
      reasoning,
      breakdown: scores
    };
  }

  /**
   * Score domain expertise match
   */
  private scoreDomainMatch(agent: Agent, domain: DiscussionDomain): number {
    // Check if agent has relevant capabilities for this domain
    const relevantCapabilities = this.getDomainExpertise(domain);
    
    if (!agent.capabilities || agent.capabilities.length === 0) {
      return 0.3; // Default score for agents without defined capabilities
    }

    const matches = agent.capabilities.filter(cap => 
      relevantCapabilities.includes(cap.toLowerCase())
    );

    if (matches.length === 0) {
      // Check for partial matches or related skills
      const partialMatches = agent.capabilities.filter(cap =>
        relevantCapabilities.some(rel => rel.includes(cap.toLowerCase()) || cap.toLowerCase().includes(rel))
      );
      return partialMatches.length > 0 ? 0.4 : 0.2;
    }

    // Full matches get higher scores
    return Math.min(1, 0.6 + (matches.length * 0.2));
  }

  /**
   * Score action capability alignment
   */
  private scoreActionCapability(agent: Agent, action: DiscussionAction): number {
    const roleActionMapping: Record<AgentRole, DiscussionAction[]> = {
      [AgentRole.ASSISTANT]: [DiscussionAction.EXECUTE, DiscussionAction.COORDINATE, DiscussionAction.DOCUMENT],
      [AgentRole.ANALYZER]: [DiscussionAction.ANALYZE, DiscussionAction.SYNTHESIZE, DiscussionAction.VALIDATE],
      [AgentRole.ORCHESTRATOR]: [DiscussionAction.COORDINATE, DiscussionAction.FACILITATE, DiscussionAction.ESCALATE],
      [AgentRole.SPECIALIST]: [DiscussionAction.ANALYZE, DiscussionAction.VALIDATE, DiscussionAction.TROUBLESHOOT],
      [AgentRole.EXECUTOR]: [DiscussionAction.EXECUTE, DiscussionAction.STEP_EXECUTION, DiscussionAction.PROCESS_CREATION],
      [AgentRole.ADVISOR]: [DiscussionAction.PLAN, DiscussionAction.DECIDE, DiscussionAction.BRAINSTORM],
      [AgentRole.STRATEGIST]: [DiscussionAction.PLAN, DiscussionAction.BRAINSTORM, DiscussionAction.PROCESS_OPTIMIZATION],
      [AgentRole.COMMUNICATOR]: [DiscussionAction.STAKEHOLDER_COMMUNICATION, DiscussionAction.MEDIATE, DiscussionAction.FACILITATE],
      [AgentRole.VALIDATOR]: [DiscussionAction.VALIDATE, DiscussionAction.REVIEW, DiscussionAction.COMPLIANCE_CHECK],
      [AgentRole.ARCHITECT]: [DiscussionAction.PLAN, DiscussionAction.ANALYZE, DiscussionAction.SYNTHESIZE],
      [AgentRole.REVIEWER]: [DiscussionAction.REVIEW, DiscussionAction.VALIDATE, DiscussionAction.AUDIT_TRAIL],
      [AgentRole.DESIGNER]: [DiscussionAction.BRAINSTORM, DiscussionAction.PLAN, DiscussionAction.SYNTHESIZE]
    };

    const roleActions = roleActionMapping[agent.role] || [];
    
    if (roleActions.includes(action)) {
      return 0.9; // High score for perfect role match
    }

    // Check for related actions
    const relatedActions = this.getRelatedActions(action);
    const relatedMatches = roleActions.filter(ra => relatedActions.includes(ra));
    
    return relatedMatches.length > 0 ? 0.6 : 0.3;
  }

  /**
   * Score expertise alignment with request context
   */
  private scoreExpertiseAlignment(agent: Agent, request: RoutingRequest): number {
    if (!request.context?.expertise || !agent.capabilities) {
      return 0.5; // Neutral score when no specific expertise required
    }

    const requiredExpertise = request.context.expertise;
    const agentCapabilities = agent.capabilities;

    const directMatches = requiredExpertise.filter(req => 
      agentCapabilities.some(cap => cap.toLowerCase().includes(req.toLowerCase()))
    );

    if (directMatches.length === 0) {
      return 0.2;
    }

    return Math.min(1, 0.4 + (directMatches.length / requiredExpertise.length) * 0.6);
  }

  /**
   * Score based on current workload (using agent status as proxy)
   */
  private scoreWorkload(agent: Agent): number {
    // Use agent status as a proxy for workload since currentWorkload field doesn't exist
    switch (agent.status) {
      case 'idle': return 1.0;           // Available
      case 'active': return 0.7;         // Moderately busy  
      case 'busy': return 0.3;           // High load
      case 'error': return 0.1;          // Problematic
      case 'offline': return 0.0;        // Unavailable
      case 'shutting_down': return 0.0;  // Unavailable
      case 'inactive': return 0.0;       // Unavailable
      case 'deleted': return 0.0;        // Unavailable
      case 'initializing': return 0.5;   // Limited availability
      default: return 0.5;               // Unknown status
    }
  }

  /**
   * Score tool capability match
   */
  private scoreToolCapability(agent: Agent, request: RoutingRequest): number {
    if (!request.context?.requiredTools || !agent.capabilities) {
      return 0.7; // Neutral score when no tools specified
    }

    const requiredTools = request.context.requiredTools;
    const agentCapabilities = agent.capabilities;

    const availableTools = requiredTools.filter(tool => 
      agentCapabilities.includes(tool)
    );

    return availableTools.length / requiredTools.length;
  }

  /**
   * Score based on historical performance for similar tasks
   */
  private async scoreHistoricalPerformance(agent: Agent, request: RoutingRequest): Promise<number> {
    // This would integrate with agent metrics service
    // For now, return a baseline score based on agent status
    if (agent.status === 'ACTIVE') return 0.8;
    if (agent.status === 'IDLE') return 0.9;
    return 0.3;
  }

  /**
   * Score LLM optimization for the task
   */
  private async scoreLLMOptimization(agent: Agent, request: RoutingRequest): Promise<number> {
    try {
      // Determine task type from domain/action
      const taskType = this.mapToLLMTaskType(request.domain, request.action);
      
      // Get LLM preference for this agent and task
      const preference = await this.llmPreferenceService.resolveLLMPreference(agent.id, taskType, request);
      
      // Higher confidence in LLM choice = better optimization
      return preference.confidence;
    } catch (error) {
      return 0.5; // Neutral score if unable to determine LLM optimization
    }
  }

  // Helper methods
  private getDomainExpertise(domain: DiscussionDomain): string[] {
    const domainMap: Record<DiscussionDomain, string[]> = {
      [DiscussionDomain.TECHNICAL_ARCHITECTURE]: ['architecture', 'system design', 'technical', 'engineering'],
      [DiscussionDomain.PROJECT_MANAGEMENT]: ['project management', 'planning', 'coordination', 'agile'],
      [DiscussionDomain.CODE_REVIEW]: ['code review', 'programming', 'software development', 'quality assurance'],
      [DiscussionDomain.STRATEGIC_PLANNING]: ['strategy', 'business analysis', 'planning', 'consulting'],
      [DiscussionDomain.CRISIS_RESPONSE]: ['crisis management', 'incident response', 'emergency', 'troubleshooting'],
      [DiscussionDomain.KNOWLEDGE_SYNTHESIS]: ['research', 'analysis', 'documentation', 'synthesis'],
      [DiscussionDomain.USER_EXPERIENCE]: ['ux', 'ui', 'design', 'user research', 'usability'],
      [DiscussionDomain.SECURITY_ANALYSIS]: ['security', 'cybersecurity', 'compliance', 'risk assessment'],
      [DiscussionDomain.PERFORMANCE_OPTIMIZATION]: ['performance', 'optimization', 'scaling', 'efficiency'],
      [DiscussionDomain.COMPLIANCE_AUDIT]: ['compliance', 'audit', 'regulatory', 'governance'],
      [DiscussionDomain.CREATIVE_BRAINSTORMING]: ['creative', 'brainstorming', 'innovation', 'ideation'],
      [DiscussionDomain.TECHNICAL_SUPPORT]: ['support', 'troubleshooting', 'customer service', 'technical'],
      [DiscussionDomain.BUSINESS_PROCESS]: ['business process', 'workflow', 'operations', 'automation'],
      [DiscussionDomain.CUSTOMER_ONBOARDING]: ['customer service', 'onboarding', 'training', 'communication'],
      [DiscussionDomain.INVOICE_PROCESSING]: ['finance', 'accounting', 'billing', 'invoicing'],
      [DiscussionDomain.EMPLOYEE_ONBOARDING]: ['hr', 'human resources', 'onboarding', 'training'],
      [DiscussionDomain.VENDOR_MANAGEMENT]: ['vendor management', 'procurement', 'contracts', 'relationships'],
      [DiscussionDomain.QUALITY_ASSURANCE]: ['quality assurance', 'testing', 'qa', 'quality control'],
      [DiscussionDomain.FINANCIAL_REPORTING]: ['finance', 'accounting', 'reporting', 'financial analysis']
    };

    return domainMap[domain] || [];
  }

  private getRelatedActions(action: DiscussionAction): DiscussionAction[] {
    const relatedMap: Partial<Record<DiscussionAction, DiscussionAction[]>> = {
      [DiscussionAction.ANALYZE]: [DiscussionAction.SYNTHESIZE, DiscussionAction.VALIDATE],
      [DiscussionAction.PLAN]: [DiscussionAction.COORDINATE, DiscussionAction.BRAINSTORM],
      [DiscussionAction.EXECUTE]: [DiscussionAction.STEP_EXECUTION, DiscussionAction.COORDINATE],
      [DiscussionAction.REVIEW]: [DiscussionAction.VALIDATE, DiscussionAction.AUDIT_TRAIL],
      // Add more mappings as needed
    };

    return relatedMap[action] || [];
  }

  private mapToLLMTaskType(domain: DiscussionDomain, action: DiscussionAction): LLMTaskType {
    // Map domain/action combinations to LLM task types
    if (action === DiscussionAction.ANALYZE || action === DiscussionAction.SYNTHESIZE) {
      return LLMTaskType.REASONING;
    }
    
    if (domain === DiscussionDomain.CODE_REVIEW || action === DiscussionAction.REVIEW) {
      return LLMTaskType.CODE_GENERATION;
    }
    
    if (action === DiscussionAction.BRAINSTORM || domain === DiscussionDomain.CREATIVE_BRAINSTORMING) {
      return LLMTaskType.CREATIVE_WRITING;
    }

    if (action === DiscussionAction.DOCUMENT || action === DiscussionAction.AUDIT_TRAIL) {
      return LLMTaskType.SUMMARIZATION;
    }

    return LLMTaskType.REASONING; // Default
  }

  private generateScoreReasoning(agent: Agent, scores: Record<string, number>, request: RoutingRequest): string {
    const strengths: string[] = [];
    const concerns: string[] = [];

    if (scores.domain > 0.7) strengths.push(`strong domain expertise in ${request.domain}`);
    if (scores.action > 0.7) strengths.push(`well-suited for ${request.action} actions`);
    if (scores.workload > 0.8) strengths.push('low current workload');
    if (scores.tools > 0.8) strengths.push('has required tool capabilities');

    if (scores.domain < 0.4) concerns.push('limited domain expertise');
    if (scores.workload < 0.5) concerns.push('high current workload');
    if (scores.tools < 0.6) concerns.push('missing some required tools');

    let reasoning = `Agent ${agent.name} (${agent.role})`;
    
    if (strengths.length > 0) {
      reasoning += ` - Strengths: ${strengths.join(', ')}`;
    }
    
    if (concerns.length > 0) {
      reasoning += ` - Concerns: ${concerns.join(', ')}`;
    }

    return reasoning;
  }

  private evaluateAgent(agent: Agent, request: RoutingRequest): { strengths: string[]; weaknesses: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Add more detailed evaluation logic here
    if (agent.capabilities && agent.capabilities.length > 0) {
      strengths.push(`Capabilities: ${agent.capabilities.join(', ')}`);
    } else {
      weaknesses.push('No defined capabilities');
    }

    if (agent.status === 'busy' || agent.status === 'error') {
      weaknesses.push(`Current status: ${agent.status}`);
    }

    if (agent.status === 'idle') {
      strengths.push('Available and ready');
    }

    return { strengths, weaknesses };
  }

  private selectSupportingAgents(candidates: AgentCandidate[], request: RoutingRequest): Agent[] {
    // Select 1-2 supporting agents based on complementary skills
    const maxSupporting = request.preferences?.maxAgents ? request.preferences.maxAgents - 1 : 2;
    
    return candidates
      .slice(1, maxSupporting + 1) // Skip primary agent
      .filter(candidate => candidate.score > 0.5) // Only reasonably good candidates
      .map(candidate => candidate.agent);
  }

  private calculateConfidence(primaryScore: number, allCandidates: AgentCandidate[]): number {
    if (allCandidates.length === 1) return primaryScore;
    
    const secondBestScore = allCandidates[1]?.score || 0;
    const gap = primaryScore - secondBestScore;
    
    // Higher confidence when there's a clear winner
    return Math.min(0.95, primaryScore + (gap * 0.3));
  }

  private assessRisk(request: RoutingRequest, primaryCandidate: AgentCandidate): {
    level: 'low' | 'medium' | 'high';
    factors: string[];
  } {
    const factors: string[] = [];
    let riskScore = 0;

    if (primaryCandidate.score < 0.6) {
      factors.push('Low agent suitability score');
      riskScore += 0.3;
    }

    if (request.context?.urgency === 'critical') {
      factors.push('Critical urgency level');
      riskScore += 0.2;
    }

    if (request.context?.complexity === 'high') {
      factors.push('High complexity task');
      riskScore += 0.2;
    }

    if (primaryCandidate.agent.status === 'busy' || primaryCandidate.agent.status === 'error') {
      factors.push(`Agent status: ${primaryCandidate.agent.status}`);
      riskScore += 0.2;
    }

    const level = riskScore > 0.6 ? 'high' : riskScore > 0.3 ? 'medium' : 'low';
    
    return { level, factors };
  }

  private estimateDuration(request: RoutingRequest, primaryCandidate: AgentCandidate): number {
    let baseDuration = 30; // 30 minutes baseline

    // Adjust for complexity
    if (request.context?.complexity === 'high') baseDuration *= 2;
    if (request.context?.complexity === 'low') baseDuration *= 0.5;

    // Adjust for urgency (urgent tasks might be done faster but with more resources)
    if (request.context?.urgency === 'critical') baseDuration *= 0.7;

    // Adjust for agent performance
    baseDuration *= (2 - primaryCandidate.score); // Better agents work faster

    return Math.round(baseDuration);
  }

  private extractRequiredCapabilities(request: RoutingRequest): string[] {
    const capabilities: string[] = [];
    
    if (request.context?.requiredTools) {
      capabilities.push(...request.context.requiredTools);
    }

    // Add domain-specific capabilities
    capabilities.push(request.domain);
    capabilities.push(request.action);

    return [...new Set(capabilities)]; // Remove duplicates
  }

  private async getAvailableAgents(userId?: string): Promise<Agent[]> {
    const whereConditions: any = {
      status: 'ACTIVE'
    };

    if (userId) {
      whereConditions.userId = userId;
    }

    return this.agentRepository.find({
      where: whereConditions,
      order: { name: 'ASC' }
    });
  }
}