import {
  CollaborationPattern,
  CollaborationPatternType,
  WorkflowStep,
  WorkflowStepStatus,
  AgentMessage
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { EventEmitter } from 'events';

export interface WorkflowExecutionContext {
  workflowId: string;
  pattern: CollaborationPattern;
  currentStep: number;
  stepStatuses: Map<string, WorkflowStepStatus>;
  stepOutputs: Map<string, any>;
  startTime: Date;
  endTime?: Date;
  errors: Array<{ stepId: string; error: string; timestamp: Date }>;
  metadata: any;
}

export interface AgentExecutor {
  executeStep(agentId: string, step: WorkflowStep, context: any): Promise<{ success: boolean; output?: any; error?: string }>;
  canExecute(agentId: string): Promise<boolean>;
}

export class CollaborationPatternRunner extends EventEmitter {
  private activeWorkflows = new Map<string, WorkflowExecutionContext>();
  private stepExecutionQueue = new Map<string, WorkflowStep[]>();

  constructor(
    private agentExecutor: AgentExecutor,
    private persistWorkflowStep?: (workflowId: string, step: WorkflowStep) => Promise<void>
  ) {
    super();
  }

  async executePattern(pattern: CollaborationPattern, initialData?: any): Promise<{ success: boolean; outputs: any; errors: any[] }> {
    const workflowId = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const context: WorkflowExecutionContext = {
      workflowId,
      pattern,
      currentStep: 0,
      stepStatuses: new Map(),
      stepOutputs: new Map(),
      startTime: new Date(),
      errors: [],
      metadata: { initialData }
    };

    // Initialize step statuses
    pattern.steps.forEach(step => {
      context.stepStatuses.set(step.id, WorkflowStepStatus.PENDING);
    });

    this.activeWorkflows.set(workflowId, context);
    
    try {
      logger.info(`Starting collaboration pattern execution: ${pattern.name} (${pattern.type})`);
      this.emit('workflow_started', { workflowId, pattern });

      let success = false;
      
      switch (pattern.type) {
        case CollaborationPatternType.SEQUENTIAL:
          success = await this.executeSequential(context);
          break;
        case CollaborationPatternType.PARALLEL:
          success = await this.executeParallel(context);
          break;
        case CollaborationPatternType.HIERARCHICAL:
          success = await this.executeHierarchical(context);
          break;
        case CollaborationPatternType.CONSENSUS:
          success = await this.executeConsensus(context);
          break;
        default:
          throw new Error(`Unsupported collaboration pattern type: ${pattern.type}`);
      }

      context.endTime = new Date();
      
      const result = {
        success,
        outputs: Object.fromEntries(context.stepOutputs),
        errors: context.errors
      };

      this.emit('workflow_completed', { workflowId, pattern, result });
      logger.info(`Collaboration pattern completed: ${pattern.name}, success: ${success}`);
      
      return result;
      
    } catch (error) {
      context.endTime = new Date();
      context.errors.push({
        stepId: 'workflow',
        error: error.message,
        timestamp: new Date()
      });
      
      this.emit('workflow_failed', { workflowId, pattern, error });
      logger.error(`Collaboration pattern failed: ${pattern.name}`, error);
      
      return {
        success: false,
        outputs: Object.fromEntries(context.stepOutputs),
        errors: context.errors
      };
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  private async executeSequential(context: WorkflowExecutionContext): Promise<boolean> {
    const { pattern } = context;
    let previousOutput = context.metadata.initialData;

    for (let i = 0; i < pattern.steps.length; i++) {
      const step = pattern.steps[i];
      
      // Check dependencies
      if (!this.checkDependencies(step, context)) {
        context.errors.push({
          stepId: step.id,
          error: 'Dependencies not satisfied',
          timestamp: new Date()
        });
        return false;
      }

      // Execute step
      const stepInput = { ...step.input, ...previousOutput };
      const result = await this.executeStep(step, stepInput, context);
      
      if (!result.success) {
        return false;
      }
      
      previousOutput = result.output;
    }

    return true;
  }

  private async executeParallel(context: WorkflowExecutionContext): Promise<boolean> {
    const { pattern } = context;
    const concurrency = pattern.maxConcurrency || pattern.steps.length;
    const executing = new Set<string>();
    const completed = new Set<string>();
    let hasErrors = false;

    // Group steps by dependencies to execute in waves
    const stepWaves = this.groupStepsByDependencies(pattern.steps);
    
    for (const wave of stepWaves) {
      const wavePromises: Promise<void>[] = [];
      
      for (const step of wave) {
        if (executing.size >= concurrency) {
          // Wait for a slot to open up
          await Promise.race(Array.from(executing).map(stepId => 
            this.waitForStepCompletion(stepId, context)
          ));
        }

        executing.add(step.id);
        
        const stepPromise = this.executeStepAsync(step, context, completed)
          .finally(() => {
            executing.delete(step.id);
            completed.add(step.id);
          });
        
        wavePromises.push(stepPromise);
      }
      
      // Wait for all steps in this wave to complete
      await Promise.all(wavePromises);
      
      // Check if any step failed
      const waveHasErrors = wave.some(step => 
        context.stepStatuses.get(step.id) === WorkflowStepStatus.FAILED
      );
      
      if (waveHasErrors) {
        hasErrors = true;
        break;
      }
    }

    return !hasErrors;
  }

  private async executeHierarchical(context: WorkflowExecutionContext): Promise<boolean> {
    // For hierarchical, execute parent steps first, then children
    const hierarchy = this.buildHierarchy(context.pattern.steps);
    return await this.executeHierarchyLevel(hierarchy, context);
  }

  private async executeConsensus(context: WorkflowExecutionContext): Promise<boolean> {
    // Execute all steps and require consensus on outputs
    const results = await Promise.all(
      context.pattern.steps.map(step => this.executeStep(step, context.metadata.initialData, context))
    );
    
    // Simple consensus: majority must succeed
    const successCount = results.filter(r => r.success).length;
    const threshold = Math.ceil(results.length / 2);
    
    return successCount >= threshold;
  }

  private async executeStep(step: WorkflowStep, input: any, context: WorkflowExecutionContext): Promise<{ success: boolean; output?: any; error?: string }> {
    try {
      logger.debug(`Executing step: ${step.name} (${step.id}) for agent ${step.assignedAgentId}`);
      
      // Update status
      context.stepStatuses.set(step.id, WorkflowStepStatus.IN_PROGRESS);
      step.status = WorkflowStepStatus.IN_PROGRESS;
      step.startTime = new Date();
      
      this.emit('step_started', { workflowId: context.workflowId, step });
      
      // Persist status if persistence enabled
      if (this.persistWorkflowStep) {
        await this.persistWorkflowStep(context.workflowId, step);
      }

      // Check agent availability
      const canExecute = await this.agentExecutor.canExecute(step.assignedAgentId);
      if (!canExecute) {
        throw new Error(`Agent ${step.assignedAgentId} is not available`);
      }

      // Execute the step
      const stepContext = {
        workflowId: context.workflowId,
        stepId: step.id,
        input,
        previousOutputs: Object.fromEntries(context.stepOutputs)
      };
      
      const result = await this.agentExecutor.executeStep(step.assignedAgentId, step, stepContext);
      
      step.endTime = new Date();
      step.duration = step.endTime.getTime() - step.startTime!.getTime();
      
      if (result.success) {
        context.stepStatuses.set(step.id, WorkflowStepStatus.COMPLETED);
        step.status = WorkflowStepStatus.COMPLETED;
        step.output = result.output;
        
        if (result.output) {
          context.stepOutputs.set(step.id, result.output);
        }
        
        this.emit('step_completed', { workflowId: context.workflowId, step, output: result.output });
        logger.debug(`Step completed successfully: ${step.name}`);
        
      } else {
        context.stepStatuses.set(step.id, WorkflowStepStatus.FAILED);
        step.status = WorkflowStepStatus.FAILED;
        step.errorDetails = result.error;
        
        context.errors.push({
          stepId: step.id,
          error: result.error || 'Unknown execution error',
          timestamp: new Date()
        });
        
        this.emit('step_failed', { workflowId: context.workflowId, step, error: result.error });
        logger.error(`Step failed: ${step.name} - ${result.error}`);
      }
      
      // Persist final status
      if (this.persistWorkflowStep) {
        await this.persistWorkflowStep(context.workflowId, step);
      }
      
      return result;
      
    } catch (error) {
      step.endTime = new Date();
      step.status = WorkflowStepStatus.FAILED;
      step.errorDetails = error.message;
      
      context.stepStatuses.set(step.id, WorkflowStepStatus.FAILED);
      context.errors.push({
        stepId: step.id,
        error: error.message,
        timestamp: new Date()
      });
      
      this.emit('step_failed', { workflowId: context.workflowId, step, error: error.message });
      logger.error(`Step execution error: ${step.name}`, error);
      
      if (this.persistWorkflowStep) {
        await this.persistWorkflowStep(context.workflowId, step).catch(err => 
          logger.error('Failed to persist failed step:', err)
        );
      }
      
      return { success: false, error: error.message };
    }
  }

  private async executeStepAsync(step: WorkflowStep, context: WorkflowExecutionContext, completed: Set<string>): Promise<void> {
    // Wait for dependencies
    if (step.dependsOn) {
      await this.waitForDependencies(step.dependsOn, completed);
    }
    
    const input = this.gatherStepInputs(step, context);
    await this.executeStep(step, input, context);
  }

  private checkDependencies(step: WorkflowStep, context: WorkflowExecutionContext): boolean {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return true;
    }
    
    return step.dependsOn.every(depId => 
      context.stepStatuses.get(depId) === WorkflowStepStatus.COMPLETED
    );
  }

  private groupStepsByDependencies(steps: WorkflowStep[]): WorkflowStep[][] {
    const waves: WorkflowStep[][] = [];
    const processed = new Set<string>();
    
    while (processed.size < steps.length) {
      const currentWave = steps.filter(step => 
        !processed.has(step.id) && 
        (!step.dependsOn || step.dependsOn.every(depId => processed.has(depId)))
      );
      
      if (currentWave.length === 0) {
        throw new Error('Circular dependency detected in workflow steps');
      }
      
      waves.push(currentWave);
      currentWave.forEach(step => processed.add(step.id));
    }
    
    return waves;
  }

  private buildHierarchy(steps: WorkflowStep[]): Map<string, WorkflowStep[]> {
    const hierarchy = new Map<string, WorkflowStep[]>();
    
    steps.forEach(step => {
      const parent = step.dependsOn?.[0] || 'root';
      if (!hierarchy.has(parent)) {
        hierarchy.set(parent, []);
      }
      hierarchy.get(parent)!.push(step);
    });
    
    return hierarchy;
  }

  private async executeHierarchyLevel(hierarchy: Map<string, WorkflowStep[]>, context: WorkflowExecutionContext, parent = 'root'): Promise<boolean> {
    const steps = hierarchy.get(parent) || [];
    
    for (const step of steps) {
      const input = this.gatherStepInputs(step, context);
      const result = await this.executeStep(step, input, context);
      
      if (!result.success) {
        return false;
      }
      
      // Execute children
      const childrenSuccess = await this.executeHierarchyLevel(hierarchy, context, step.id);
      if (!childrenSuccess) {
        return false;
      }
    }
    
    return true;
  }

  private gatherStepInputs(step: WorkflowStep, context: WorkflowExecutionContext): any {
    let input = { ...step.input };
    
    if (step.dependsOn) {
      step.dependsOn.forEach(depId => {
        const depOutput = context.stepOutputs.get(depId);
        if (depOutput) {
          input = { ...input, ...depOutput };
        }
      });
    }
    
    return input;
  }

  private async waitForDependencies(dependsOn: string[], completed: Set<string>): Promise<void> {
    while (!dependsOn.every(depId => completed.has(depId))) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async waitForStepCompletion(stepId: string, context: WorkflowExecutionContext): Promise<void> {
    while (context.stepStatuses.get(stepId) === WorkflowStepStatus.IN_PROGRESS) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Public methods for monitoring
  getActiveWorkflows(): string[] {
    return Array.from(this.activeWorkflows.keys());
  }

  getWorkflowStatus(workflowId: string): WorkflowExecutionContext | null {
    return this.activeWorkflows.get(workflowId) || null;
  }

  async cancelWorkflow(workflowId: string): Promise<boolean> {
    const context = this.activeWorkflows.get(workflowId);
    if (!context) return false;
    
    context.endTime = new Date();
    context.errors.push({
      stepId: 'workflow',
      error: 'Workflow cancelled',
      timestamp: new Date()
    });
    
    this.emit('workflow_cancelled', { workflowId, pattern: context.pattern });
    this.activeWorkflows.delete(workflowId);
    
    return true;
  }
}