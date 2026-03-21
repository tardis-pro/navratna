export type SOPType = 'project_sop' | 'agent_soul' | 'heartbeat';

export interface SOPDocument {
  id: string;
  agentId: string;
  type: SOPType;
  title: string;
  content: string;
  parsedAt: Date;
  version: string;
}

export interface TaskLifecycle {
  states: string[];
  transitions: Record<string, string[]>;
  initialState: string;
  terminalStates: string[];
}

export interface WorkflowStep {
  order: number;
  name: string;
  description: string;
  agent?: string;
  action: string;
  output: string;
  onSuccess?: string;
  onFailure?: string;
}

export interface SOPWorkflow {
  id: string;
  agentId: string;
  name: string;
  description: string;
  trigger: string[];
  steps: WorkflowStep[];
  lifecycle: TaskLifecycle;
}
