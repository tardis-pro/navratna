export type SOPType =
  | 'project_sop'
  | 'agent_soul'
  | 'heartbeat'
  | 'identity'
  | 'tools'
  | 'agents_config'
  | 'user_context'
  | 'bootstrap'
  | 'process'
  | 'memory'
  | 'sop'
  | 'context_document';

export interface SOPDocument {
  id: string;
  agentId: string; // folder name (e.g., "tardis", "pm")
  agentOperationalName: string | null; // seed name (e.g., "Tardis", "Bhagwan") or null if not in seed
  type: SOPType;
  title: string;
  content: string; // FULL markdown content INCLUDING frontmatter
  frontmatter: Record<string, unknown>; // extracted frontmatter
  fileName: string; // original filename for context_document types
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
