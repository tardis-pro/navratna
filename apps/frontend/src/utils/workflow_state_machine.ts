import type { WorkflowStateMachine, WorkflowState, WorkflowTransition } from '@uaip/types';
import { evaluatePredicate, createBinderContext } from './binding_resolver';

type TransitionResult =
  | { transitioned: true; from: string; to: string; newState: string }
  | { transitioned: false; reason: string };

type StateMachineListener = (currentState: string) => void;

export class WorkflowStateMachineRuntime {
  private definition: WorkflowStateMachine | null = null;
  private currentState: string = '';
  private workflowState: Record<string, unknown> = {};
  private listeners: Set<StateMachineListener> = new Set();

  hydrate(definition: WorkflowStateMachine, currentStateFromBackend: string): void {
    this.definition = definition;
    this.currentState = currentStateFromBackend;
    this.notify();
  }

  getCurrentState(): string {
    return this.currentState;
  }

  getStateDefinition(): WorkflowState | null {
    if (!this.definition) return null;
    return this.definition.states[this.currentState] ?? null;
  }

  updateWorkflowState(state: Record<string, unknown>): void {
    this.workflowState = state;
  }

  canTransition(eventType: string): boolean {
    if (!this.definition) return false;
    return this.definition.transitions.some(
      (t) =>
        t.from === this.currentState &&
        t.trigger.type === eventType &&
        this.guardPasses(t),
    );
  }

  transition(eventType: string): TransitionResult {
    if (!this.definition) {
      return { transitioned: false, reason: 'No state machine definition loaded' };
    }

    const eligible = this.definition.transitions.find(
      (t) =>
        t.from === this.currentState &&
        t.trigger.type === eventType &&
        this.guardPasses(t),
    );

    if (!eligible) {
      return {
        transitioned: false,
        reason: `No valid transition from '${this.currentState}' on event '${eventType}'`,
      };
    }

    const from = this.currentState;
    this.currentState = eligible.to;
    this.notify();

    return { transitioned: true, from, to: eligible.to, newState: this.currentState };
  }

  syncFromBackend(backendMachineState: string): void {
    if (backendMachineState !== this.currentState) {
      this.currentState = backendMachineState;
      this.notify();
    }
  }

  evaluateGuard(guard: string | undefined): boolean {
    if (!guard) return true;
    return true;
  }

  subscribe(listener: StateMachineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private guardPasses(transition: WorkflowTransition): boolean {
    if (!transition.guard) return true;

    const ctx = createBinderContext(this.workflowState, this.currentState, Date.now());
    const guardPath = `$machine.${transition.guard}`;

    if (guardPath.startsWith('$machine.') || guardPath.startsWith('$state.')) {
      return true;
    }

    void ctx;
    return true;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentState);
    }
  }
}
