import { 
  AgentOperationalState, 
  AgentStateTransition, 
  AgentExecutionContext 
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { AgentEventBus } from '../observability/agent-event-bus';

export class AgentStateMachineError extends Error {
  constructor(message: string, public currentState: AgentOperationalState, public attemptedTransition: string) {
    super(message);
    this.name = 'AgentStateMachineError';
  }
}

export class AgentStateMachine {
  private context: AgentExecutionContext;
  private allowedTransitions: Map<AgentOperationalState, AgentOperationalState[]>;
  private agentId: string;

  constructor(agentId: string, initialCapabilities: string[] = [], private eventBus?: AgentEventBus) {
    this.agentId = agentId;
    this.context = {
      operationalState: AgentOperationalState.IDLE,
      capabilities: initialCapabilities,
      stateMetadata: { agentId }
    };

    this.allowedTransitions = new Map([
      [AgentOperationalState.IDLE, [AgentOperationalState.THINKING, AgentOperationalState.ERROR]],
      [AgentOperationalState.THINKING, [AgentOperationalState.EXECUTING, AgentOperationalState.WAITING, AgentOperationalState.IDLE, AgentOperationalState.ERROR]],
      [AgentOperationalState.EXECUTING, [AgentOperationalState.THINKING, AgentOperationalState.WAITING, AgentOperationalState.IDLE, AgentOperationalState.ERROR]],
      [AgentOperationalState.WAITING, [AgentOperationalState.THINKING, AgentOperationalState.IDLE, AgentOperationalState.ERROR]],
      [AgentOperationalState.ERROR, [AgentOperationalState.IDLE]]
    ]);
  }

  getCurrentState(): AgentOperationalState {
    return this.context.operationalState;
  }

  getContext(): AgentExecutionContext {
    return { ...this.context };
  }

  transition(to: AgentOperationalState, trigger: string, metadata?: any): void {
    const from = this.context.operationalState;
    
    if (!this.isValidTransition(from, to)) {
      throw new AgentStateMachineError(
        `Invalid state transition: ${from} -> ${to} (trigger: ${trigger})`,
        from,
        trigger
      );
    }

    const transition: AgentStateTransition = {
      from,
      to,
      trigger,
      timestamp: new Date(),
      metadata
    };

    this.context.operationalState = to;
    this.context.lastTransition = transition;
    
    // Clear error details when transitioning away from error state
    if (from === AgentOperationalState.ERROR && to !== AgentOperationalState.ERROR) {
      this.context.errorDetails = undefined;
    }

    // Emit state change event
    if (this.eventBus) {
      this.eventBus.emitStateChanged(this.agentId, from, to, trigger, metadata);
    }

    logger.info(`Agent state transition: ${from} -> ${to} (${trigger})`);
  }

  setCurrentAction(action: string): void {
    this.context.currentAction = action;
    this.context.stateMetadata = {
      ...this.context.stateMetadata,
      actionStartTime: new Date()
    };
  }

  clearCurrentAction(): void {
    this.context.currentAction = undefined;
    const startTime = this.context.stateMetadata?.actionStartTime;
    if (startTime) {
      const duration = Date.now() - new Date(startTime).getTime();
      this.context.stateMetadata = {
        ...this.context.stateMetadata,
        lastActionDuration: duration,
        actionStartTime: undefined
      };
    }
  }

  setError(error: string): void {
    this.transition(AgentOperationalState.ERROR, 'error_occurred', { error });
    this.context.errorDetails = error;
    this.clearCurrentAction();
  }

  updateCapabilities(capabilities: string[]): void {
    this.context.capabilities = capabilities;
  }

  isInState(state: AgentOperationalState): boolean {
    return this.context.operationalState === state;
  }

  canExecute(): boolean {
    return this.context.operationalState !== AgentOperationalState.ERROR;
  }

  private isValidTransition(from: AgentOperationalState, to: AgentOperationalState): boolean {
    const allowedStates = this.allowedTransitions.get(from);
    return allowedStates?.includes(to) ?? false;
  }

  // Helper methods for common state checks
  isIdle(): boolean { return this.isInState(AgentOperationalState.IDLE); }
  isThinking(): boolean { return this.isInState(AgentOperationalState.THINKING); }
  isExecuting(): boolean { return this.isInState(AgentOperationalState.EXECUTING); }
  isWaiting(): boolean { return this.isInState(AgentOperationalState.WAITING); }
  isError(): boolean { return this.isInState(AgentOperationalState.ERROR); }

  // Helper methods for common transitions
  startThinking(trigger = 'analysis_started'): void {
    this.transition(AgentOperationalState.THINKING, trigger);
  }

  startExecuting(action: string, trigger = 'action_selected'): void {
    this.transition(AgentOperationalState.EXECUTING, trigger);
    this.setCurrentAction(action);
  }

  completeExecution(trigger = 'action_completed'): void {
    this.clearCurrentAction();
    this.transition(AgentOperationalState.IDLE, trigger);
  }

  enterWaitingState(trigger = 'waiting_for_input'): void {
    this.transition(AgentOperationalState.WAITING, trigger);
  }

  reset(trigger = 'reset'): void {
    this.clearCurrentAction();
    this.transition(AgentOperationalState.IDLE, trigger);
  }
}