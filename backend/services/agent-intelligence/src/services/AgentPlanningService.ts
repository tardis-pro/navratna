import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/shared-services';
import { SecurityLevel } from '@uaip/types';

export interface ExecutionStep {
  id: string;
  action: string;
  description: string;
  dependencies: string[];
  estimatedDuration: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  resources: string[];
  parameters?: Record<string, unknown>;
  validation?: {
    preconditions: string[];
    postconditions: string[];
  };
}

export interface ExecutionPlan {
  operationPlan: {
    id: string;
    name: string;
    description: string;
    steps: ExecutionStep[];
    resources: string[];
    dependencies: string[];
    parallelizable: boolean;
  };
  estimatedDuration: number;
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigations: string[];
    contingencies: string[];
  };
  approvalRequired: boolean;
  dependencies: string[];
  metadata: {
    createdAt: Date;
    agentId: string;
    complexity: 'low' | 'medium' | 'high';
    confidence: number;
  };
}

export class AgentPlanningService {
  private eventBusService: EventBusService;

  constructor() {
    this.eventBusService = EventBusService.getInstance();
  }

  async generateExecutionPlan(
    agentId: string,
    analysis: any,
    userPreferences?: Record<string, unknown>,
    securityContext?: Record<string, unknown>
  ): Promise<ExecutionPlan> {
    try {
      logger.info('Generating execution plan', { agentId, analysis });

      // Extract intent and complexity from analysis
      const intent = analysis?.userIntent || 'general_inquiry';
      const complexity = analysis?.complexity || 'medium';
      const suggestedActions = analysis?.suggestedActions || [];

      // Generate steps based on intent and analysis
      const steps = this.generateSteps(intent, complexity, suggestedActions);

      // Calculate estimated duration
      const estimatedDuration = steps.reduce((total, step) => total + step.estimatedDuration, 0);

      // Assess risks
      const riskAssessment = this.assessRisks(steps, securityContext);

      // Determine if approval is required
      const approvalRequired = this.requiresApproval(riskAssessment, estimatedDuration, userPreferences);

      // Identify dependencies
      const dependencies = this.extractDependencies(steps);

      const plan: ExecutionPlan = {
        operationPlan: {
          id: `plan_${Date.now()}_${agentId}`,
          name: this.generatePlanName(intent, complexity),
          description: this.generatePlanDescription(intent, steps),
          steps,
          resources: this.extractResources(steps),
          dependencies,
          parallelizable: this.assessParallelizability(steps)
        },
        estimatedDuration,
        riskAssessment,
        approvalRequired,
        dependencies,
        metadata: {
          createdAt: new Date(),
          agentId,
          complexity,
          confidence: this.calculatePlanConfidence(steps, analysis)
        }
      };

      // Emit plan created event
      await this.eventBusService.publish('agent.plan.created', {
        agentId,
        plan,
        timestamp: new Date()
      });

      logger.info('Execution plan generated successfully', { 
        agentId, 
        planId: plan.operationPlan.id, 
        stepCount: steps.length,
        estimatedDuration 
      });

      return plan;
    } catch (error) {
      logger.error('Failed to generate execution plan', { error, agentId, analysis });
      throw error;
    }
  }

  private generateSteps(intent: string, complexity: string, suggestedActions: string[]): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    let stepId = 1;

    // Always start with validation
    steps.push({
      id: `step_${stepId++}`,
      action: 'validate_input',
      description: 'Validate user input and context',
      dependencies: [],
      estimatedDuration: 30,
      priority: 'high',
      resources: ['validation_service'],
      validation: {
        preconditions: ['input_provided'],
        postconditions: ['input_validated']
      }
    });

    // Generate steps based on intent
    switch (intent) {
      case 'creation':
        steps.push(
          {
            id: `step_${stepId++}`,
            action: 'gather_requirements',
            description: 'Collect and analyze requirements',
            dependencies: ['step_1'],
            estimatedDuration: 120,
            priority: 'high',
            resources: ['analysis_service', 'knowledge_base']
          },
          {
            id: `step_${stepId++}`,
            action: 'design_solution',
            description: 'Create solution design',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 180,
            priority: 'high',
            resources: ['design_service', 'templates']
          },
          {
            id: `step_${stepId++}`,
            action: 'implement_solution',
            description: 'Implement the designed solution',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 300,
            priority: 'medium',
            resources: ['execution_service', 'tools']
          }
        );
        break;

      case 'analysis':
        steps.push(
          {
            id: `step_${stepId++}`,
            action: 'collect_data',
            description: 'Gather relevant data and information',
            dependencies: ['step_1'],
            estimatedDuration: 90,
            priority: 'high',
            resources: ['data_service', 'search_service']
          },
          {
            id: `step_${stepId++}`,
            action: 'analyze_patterns',
            description: 'Analyze data for patterns and insights',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 150,
            priority: 'high',
            resources: ['analysis_service', 'ml_models']
          },
          {
            id: `step_${stepId++}`,
            action: 'generate_insights',
            description: 'Generate actionable insights',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 120,
            priority: 'medium',
            resources: ['insight_service', 'visualization']
          }
        );
        break;

      case 'planning':
        steps.push(
          {
            id: `step_${stepId++}`,
            action: 'define_objectives',
            description: 'Define clear objectives and goals',
            dependencies: ['step_1'],
            estimatedDuration: 90,
            priority: 'high',
            resources: ['planning_service']
          },
          {
            id: `step_${stepId++}`,
            action: 'create_timeline',
            description: 'Create detailed timeline and milestones',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 120,
            priority: 'medium',
            resources: ['scheduling_service']
          },
          {
            id: `step_${stepId++}`,
            action: 'allocate_resources',
            description: 'Allocate required resources',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 90,
            priority: 'medium',
            resources: ['resource_service']
          }
        );
        break;

      case 'execution':
        steps.push(
          {
            id: `step_${stepId++}`,
            action: 'prepare_execution',
            description: 'Prepare execution environment',
            dependencies: ['step_1'],
            estimatedDuration: 60,
            priority: 'high',
            resources: ['execution_service']
          },
          {
            id: `step_${stepId++}`,
            action: 'execute_task',
            description: 'Execute the requested task',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 240,
            priority: 'critical',
            resources: ['execution_service', 'tools', 'monitoring']
          },
          {
            id: `step_${stepId++}`,
            action: 'validate_results',
            description: 'Validate execution results',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 90,
            priority: 'high',
            resources: ['validation_service']
          }
        );
        break;

      default:
        // General inquiry or assistance
        steps.push(
          {
            id: `step_${stepId++}`,
            action: 'understand_request',
            description: 'Understand and clarify user request',
            dependencies: ['step_1'],
            estimatedDuration: 60,
            priority: 'high',
            resources: ['nlp_service']
          },
          {
            id: `step_${stepId++}`,
            action: 'gather_information',
            description: 'Gather relevant information',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 90,
            priority: 'medium',
            resources: ['search_service', 'knowledge_base']
          },
          {
            id: `step_${stepId++}`,
            action: 'formulate_response',
            description: 'Formulate comprehensive response',
            dependencies: [`step_${stepId - 1}`],
            estimatedDuration: 60,
            priority: 'medium',
            resources: ['response_service']
          }
        );
    }

    // Add final step for response delivery
    steps.push({
      id: `step_${stepId}`,
      action: 'deliver_response',
      description: 'Deliver final response to user',
      dependencies: [`step_${stepId - 1}`],
      estimatedDuration: 30,
      priority: 'high',
      resources: ['communication_service'],
      validation: {
        preconditions: ['response_ready'],
        postconditions: ['response_delivered']
      }
    });

    // Adjust for complexity
    if (complexity === 'high') {
      // Add more time for complex tasks
      steps.forEach(step => {
        step.estimatedDuration = Math.floor(step.estimatedDuration * 1.5);
      });
    } else if (complexity === 'low') {
      // Reduce time for simple tasks
      steps.forEach(step => {
        step.estimatedDuration = Math.floor(step.estimatedDuration * 0.7);
      });
    }

    return steps;
  }

  private assessRisks(steps: ExecutionStep[], securityContext?: Record<string, unknown>): {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigations: string[];
    contingencies: string[];
  } {
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const factors: string[] = [];
    const mitigations: string[] = [];
    const contingencies: string[] = [];

    // Assess execution risks
    const hasExecutionSteps = steps.some(step => 
      step.action.includes('execute') || step.action.includes('implement')
    );

    if (hasExecutionSteps) {
      riskLevel = 'medium';
      factors.push('Execution operations may have side effects');
      mitigations.push('Validate all parameters before execution');
      contingencies.push('Rollback procedures in place');
    }

    // Assess resource risks
    const totalResources = new Set(steps.flatMap(step => step.resources)).size;
    if (totalResources > 5) {
      factors.push('High resource dependency');
      mitigations.push('Resource availability monitoring');
    }

    // Assess time risks
    const totalDuration = steps.reduce((sum, step) => sum + step.estimatedDuration, 0);
    if (totalDuration > 600) { // 10 minutes
      factors.push('Long execution duration');
      mitigations.push('Progress monitoring and timeouts');
      contingencies.push('Early termination capability');
    }

    // Security context risks
    if (securityContext?.elevated) {
      riskLevel = 'high';
      factors.push('Elevated security permissions required');
      mitigations.push('Additional authorization checks');
      contingencies.push('Audit trail for all actions');
    }

    return { level: riskLevel, factors, mitigations, contingencies };
  }

  private requiresApproval(
    riskAssessment: any, 
    estimatedDuration: number, 
    userPreferences?: Record<string, unknown>
  ): boolean {
    // Require approval for high/critical risk operations
    if (riskAssessment.level === 'high' || riskAssessment.level === 'critical') {
      return true;
    }

    // Require approval for long-running operations (>15 minutes)
    if (estimatedDuration > 900) {
      return true;
    }

    // Check user preferences
    if (userPreferences?.requireApproval) {
      return true;
    }

    return false;
  }

  private extractDependencies(steps: ExecutionStep[]): string[] {
    const dependencies = new Set<string>();
    
    steps.forEach(step => {
      step.resources.forEach(resource => {
        if (resource.includes('_service')) {
          dependencies.add(resource);
        }
      });
    });

    return Array.from(dependencies);
  }

  private extractResources(steps: ExecutionStep[]): string[] {
    const resources = new Set<string>();
    
    steps.forEach(step => {
      step.resources.forEach(resource => resources.add(resource));
    });

    return Array.from(resources);
  }

  private assessParallelizability(steps: ExecutionStep[]): boolean {
    // Simple heuristic: if any step depends on previous steps, not fully parallelizable
    return !steps.some(step => step.dependencies.length > 0);
  }

  private generatePlanName(intent: string, complexity: string): string {
    const intentNames = {
      creation: 'Creation Plan',
      analysis: 'Analysis Plan',
      planning: 'Planning Plan',
      execution: 'Execution Plan',
      assistance: 'Assistance Plan',
      information_retrieval: 'Information Retrieval Plan'
    };

    return `${intentNames[intent as keyof typeof intentNames] || 'General Plan'} (${complexity} complexity)`;
  }

  private generatePlanDescription(intent: string, steps: ExecutionStep[]): string {
    return `Automated execution plan for ${intent} with ${steps.length} steps. Generated based on context analysis and user requirements.`;
  }

  private calculatePlanConfidence(steps: ExecutionStep[], analysis: any): number {
    let confidence = 0.8; // Base confidence

    // More detailed steps increase confidence
    if (steps.length >= 4) {
      confidence += 0.1;
    }

    // Clear analysis increases confidence
    if (analysis?.confidence > 0.8) {
      confidence += 0.05;
    }

    // Validation steps increase confidence
    const hasValidation = steps.some(step => step.action.includes('validate'));
    if (hasValidation) {
      confidence += 0.05;
    }

    return Math.min(confidence, 0.95);
  }
}