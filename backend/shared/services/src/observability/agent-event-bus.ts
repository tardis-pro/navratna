import { EventEmitter } from 'events';
import { logger } from '@uaip/utils';
import { 
  AgentOperationalState, 
  AgentStateTransition,
  ActionRecommendation,
  WorkflowStep,
  CollaborationPattern
} from '@uaip/types';

export interface AgentEvent {
  eventType: string;
  agentId?: string;
  timestamp: Date;
  data: any;
  metadata?: any;
}

export interface StateChangedEvent extends AgentEvent {
  eventType: 'state.changed';
  agentId: string;
  data: {
    from: AgentOperationalState;
    to: AgentOperationalState;
    trigger: string;
    context?: any;
  };
}

export interface DecisionMadeEvent extends AgentEvent {
  eventType: 'decision.made';
  agentId: string;
  data: {
    selectedAction: ActionRecommendation | null;
    alternatives: ActionRecommendation[];
    confidence: number;
    reasoning: string;
    duration: number;
  };
}

export interface MemorySavedEvent extends AgentEvent {
  eventType: 'memory.saved';
  agentId: string;
  data: {
    memoryType: 'working' | 'episodic' | 'semantic';
    entryId: string;
    significance: number;
    content: any;
  };
}

export interface WorkflowStepEvent extends AgentEvent {
  eventType: 'workflow.step.started' | 'workflow.step.completed' | 'workflow.step.failed';
  agentId: string;
  data: {
    workflowId: string;
    stepId: string;
    stepName: string;
    status: string;
    duration?: number;
    output?: any;
    error?: string;
  };
}

export interface ToolExecutionEvent extends AgentEvent {
  eventType: 'tool.execution.started' | 'tool.execution.completed' | 'tool.execution.failed';
  agentId: string;
  data: {
    toolId: string;
    toolName: string;
    duration?: number;
    success?: boolean;
    output?: any;
    error?: string;
  };
}

export interface PerformanceMetricEvent extends AgentEvent {
  eventType: 'performance.metric';
  agentId?: string;
  data: {
    metricName: string;
    value: number;
    unit: string;
    tags?: Record<string, string>;
  };
}

export class AgentEventBus extends EventEmitter {
  private eventHistory: AgentEvent[] = [];
  private maxHistorySize: number;
  private metricsBuffer: PerformanceMetricEvent[] = [];
  private subscribers = new Map<string, Array<(event: AgentEvent) => void>>();

  constructor(maxHistorySize = 1000) {
    super();
    this.maxHistorySize = maxHistorySize;
    this.setupEventLogging();
  }

  private setupEventLogging(): void {
    // Log all events for debugging
    this.on('*', (event: AgentEvent) => {
      this.eventHistory.push(event);
      
      // Trim history if it gets too large
      if (this.eventHistory.length > this.maxHistorySize) {
        this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
      }

      // Console logging based on event type
      switch (event.eventType) {
        case 'state.changed':
          logger.info(`Agent ${event.agentId}: ${(event as StateChangedEvent).data.from} → ${(event as StateChangedEvent).data.to} (${(event as StateChangedEvent).data.trigger})`);
          break;
        
        case 'decision.made':
          const decisionEvent = event as DecisionMadeEvent;
          logger.info(`Agent ${event.agentId} decided: ${decisionEvent.data.selectedAction?.type || 'no action'} (confidence: ${decisionEvent.data.confidence}, ${decisionEvent.data.duration}ms)`);
          break;
        
        case 'memory.saved':
          const memoryEvent = event as MemorySavedEvent;
          logger.debug(`Agent ${event.agentId} saved ${memoryEvent.data.memoryType} memory: ${memoryEvent.data.entryId} (significance: ${memoryEvent.data.significance})`);
          break;
        
        case 'workflow.step.started':
        case 'workflow.step.completed':
        case 'workflow.step.failed':
          const stepEvent = event as WorkflowStepEvent;
          const status = stepEvent.eventType.includes('completed') ? 'completed' : 
                        stepEvent.eventType.includes('failed') ? 'failed' : 'started';
          logger.info(`Workflow step ${status}: ${stepEvent.data.stepName} (${stepEvent.data.workflowId})`);
          break;
        
        case 'tool.execution.started':
        case 'tool.execution.completed':
        case 'tool.execution.failed':
          const toolEvent = event as ToolExecutionEvent;
          const toolStatus = toolEvent.eventType.includes('completed') ? 'completed' : 
                            toolEvent.eventType.includes('failed') ? 'failed' : 'started';
          logger.debug(`Tool ${toolStatus}: ${toolEvent.data.toolName} ${toolEvent.data.duration ? `(${toolEvent.data.duration}ms)` : ''}`);
          break;
        
        case 'performance.metric':
          const perfEvent = event as PerformanceMetricEvent;
          logger.debug(`Performance: ${perfEvent.data.metricName} = ${perfEvent.data.value}${perfEvent.data.unit}`);
          break;
        
        default:
          logger.debug(`Agent event: ${event.eventType}`, event.data);
      }
    });
  }

  // Event emission methods
  emitStateChanged(agentId: string, from: AgentOperationalState, to: AgentOperationalState, trigger: string, context?: any): void {
    const event: StateChangedEvent = {
      eventType: 'state.changed',
      agentId,
      timestamp: new Date(),
      data: { from, to, trigger, context }
    };
    this.emit('state.changed', event);
    this.emit('*', event);
  }

  emitDecisionMade(
    agentId: string, 
    selectedAction: ActionRecommendation | null, 
    alternatives: ActionRecommendation[], 
    confidence: number, 
    reasoning: string,
    duration: number
  ): void {
    const event: DecisionMadeEvent = {
      eventType: 'decision.made',
      agentId,
      timestamp: new Date(),
      data: { selectedAction, alternatives, confidence, reasoning, duration }
    };
    this.emit('decision.made', event);
    this.emit('*', event);
  }

  emitMemorySaved(agentId: string, memoryType: 'working' | 'episodic' | 'semantic', entryId: string, significance: number, content: any): void {
    const event: MemorySavedEvent = {
      eventType: 'memory.saved',
      agentId,
      timestamp: new Date(),
      data: { memoryType, entryId, significance, content }
    };
    this.emit('memory.saved', event);
    this.emit('*', event);
  }

  emitWorkflowStepStarted(agentId: string, workflowId: string, step: WorkflowStep): void {
    const event: WorkflowStepEvent = {
      eventType: 'workflow.step.started',
      agentId,
      timestamp: new Date(),
      data: {
        workflowId,
        stepId: step.id,
        stepName: step.name,
        status: step.status
      }
    };
    this.emit('workflow.step.started', event);
    this.emit('*', event);
  }

  emitWorkflowStepCompleted(agentId: string, workflowId: string, step: WorkflowStep, duration: number, output?: any): void {
    const event: WorkflowStepEvent = {
      eventType: 'workflow.step.completed',
      agentId,
      timestamp: new Date(),
      data: {
        workflowId,
        stepId: step.id,
        stepName: step.name,
        status: step.status,
        duration,
        output
      }
    };
    this.emit('workflow.step.completed', event);
    this.emit('*', event);
  }

  emitWorkflowStepFailed(agentId: string, workflowId: string, step: WorkflowStep, error: string): void {
    const event: WorkflowStepEvent = {
      eventType: 'workflow.step.failed',
      agentId,
      timestamp: new Date(),
      data: {
        workflowId,
        stepId: step.id,
        stepName: step.name,
        status: step.status,
        error
      }
    };
    this.emit('workflow.step.failed', event);
    this.emit('*', event);
  }

  emitToolExecutionStarted(agentId: string, toolId: string, toolName: string): void {
    const event: ToolExecutionEvent = {
      eventType: 'tool.execution.started',
      agentId,
      timestamp: new Date(),
      data: { toolId, toolName }
    };
    this.emit('tool.execution.started', event);
    this.emit('*', event);
  }

  emitToolExecutionCompleted(agentId: string, toolId: string, toolName: string, duration: number, output?: any): void {
    const event: ToolExecutionEvent = {
      eventType: 'tool.execution.completed',
      agentId,
      timestamp: new Date(),
      data: { toolId, toolName, duration, success: true, output }
    };
    this.emit('tool.execution.completed', event);
    this.emit('*', event);
  }

  emitToolExecutionFailed(agentId: string, toolId: string, toolName: string, duration: number, error: string): void {
    const event: ToolExecutionEvent = {
      eventType: 'tool.execution.failed',
      agentId,
      timestamp: new Date(),
      data: { toolId, toolName, duration, success: false, error }
    };
    this.emit('tool.execution.failed', event);
    this.emit('*', event);
  }

  emitPerformanceMetric(metricName: string, value: number, unit: string, agentId?: string, tags?: Record<string, string>): void {
    const event: PerformanceMetricEvent = {
      eventType: 'performance.metric',
      agentId,
      timestamp: new Date(),
      data: { metricName, value, unit, tags }
    };
    
    this.metricsBuffer.push(event);
    this.emit('performance.metric', event);
    this.emit('*', event);
  }

  // Subscription methods
  subscribe(eventType: string, callback: (event: AgentEvent) => void): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push(callback);
    this.on(eventType, callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(eventType);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
      this.removeListener(eventType, callback);
    };
  }

  // Query methods
  getEventHistory(filter?: { 
    agentId?: string; 
    eventType?: string; 
    since?: Date; 
    limit?: number 
  }): AgentEvent[] {
    let events = this.eventHistory;

    if (filter) {
      if (filter.agentId) {
        events = events.filter(e => e.agentId === filter.agentId);
      }
      if (filter.eventType) {
        events = events.filter(e => e.eventType === filter.eventType);
      }
      if (filter.since) {
        events = events.filter(e => e.timestamp >= filter.since!);
      }
      if (filter.limit) {
        events = events.slice(-filter.limit);
      }
    }

    return events;
  }

  getMetrics(filter?: { 
    metricName?: string; 
    agentId?: string; 
    since?: Date 
  }): PerformanceMetricEvent[] {
    let metrics = this.metricsBuffer;

    if (filter) {
      if (filter.metricName) {
        metrics = metrics.filter(m => m.data.metricName === filter.metricName);
      }
      if (filter.agentId) {
        metrics = metrics.filter(m => m.agentId === filter.agentId);
      }
      if (filter.since) {
        metrics = metrics.filter(m => m.timestamp >= filter.since!);
      }
    }

    return metrics;
  }

  getAgentActivitySummary(agentId: string, since?: Date): {
    stateChanges: number;
    decisions: number;
    memorySaves: number;
    toolExecutions: number;
    workflowSteps: number;
    averageDecisionTime: number;
    averageToolExecutionTime: number;
  } {
    const events = this.getEventHistory({ agentId, since });
    
    const stateChanges = events.filter(e => e.eventType === 'state.changed').length;
    const decisions = events.filter(e => e.eventType === 'decision.made').length;
    const memorySaves = events.filter(e => e.eventType === 'memory.saved').length;
    const toolExecutions = events.filter(e => e.eventType.startsWith('tool.execution')).length;
    const workflowSteps = events.filter(e => e.eventType.startsWith('workflow.step')).length;

    const decisionTimes = events
      .filter(e => e.eventType === 'decision.made')
      .map(e => (e as DecisionMadeEvent).data.duration);
    const averageDecisionTime = decisionTimes.length > 0 
      ? decisionTimes.reduce((sum, time) => sum + time, 0) / decisionTimes.length 
      : 0;

    const toolTimes = events
      .filter(e => e.eventType === 'tool.execution.completed' || e.eventType === 'tool.execution.failed')
      .map(e => (e as ToolExecutionEvent).data.duration || 0);
    const averageToolExecutionTime = toolTimes.length > 0 
      ? toolTimes.reduce((sum, time) => sum + time, 0) / toolTimes.length 
      : 0;

    return {
      stateChanges,
      decisions,
      memorySaves,
      toolExecutions,
      workflowSteps,
      averageDecisionTime,
      averageToolExecutionTime
    };
  }

  // Cleanup methods
  clearHistory(): void {
    this.eventHistory = [];
    this.metricsBuffer = [];
  }

  clearOldEvents(olderThan: Date): void {
    this.eventHistory = this.eventHistory.filter(e => e.timestamp >= olderThan);
    this.metricsBuffer = this.metricsBuffer.filter(e => e.timestamp >= olderThan);
  }
}