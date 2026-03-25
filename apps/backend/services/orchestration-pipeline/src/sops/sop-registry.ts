import { SOPImportService } from '../services/sopImport.service.js';
import type { SOPDocument, SOPType, SOPWorkflow, TaskLifecycle } from '@uaip/types';

export interface AgentSOPRegistry {
  getSOP(agentId: string, type: Extract<SOPType, 'project_sop' | 'agent_soul'>): SOPDocument | null;
  getAllSOPs(): SOPDocument[];
  getWorkflow(agentId: string): SOPWorkflow | null;
  reload(): Promise<void>;
}

export class InMemorySOPRegistry implements AgentSOPRegistry {
  private sops: Map<string, SOPDocument> = new Map();
  private workflows: Map<string, SOPWorkflow> = new Map();
  private importService: SOPImportService;

  constructor(basePath?: string) {
    this.importService = new SOPImportService(basePath);
  }

  async reload(): Promise<void> {
    const importedSOPs = await this.importService.importAllSOPs();
    this.sops.clear();
    this.workflows.clear();

    for (const sop of importedSOPs) {
      this.sops.set(`${sop.agentId}-${sop.type}`, sop);

      const workflow = this.importService.parseWorkflowFromMarkdown(sop.content);
      if (workflow) {
        this.workflows.set(sop.agentId, workflow);
      }
    }
  }

  getSOP(
    agentId: string,
    type: Extract<SOPType, 'project_sop' | 'agent_soul'>
  ): SOPDocument | null {
    return this.sops.get(`${agentId}-${type}`) ?? null;
  }

  getAllSOPs(): SOPDocument[] {
    return Array.from(this.sops.values());
  }

  getWorkflow(agentId: string): SOPWorkflow | null {
    return this.workflows.get(agentId) ?? null;
  }
}

export const DEFAULT_TASK_LIFECYCLE: TaskLifecycle = {
  states: [
    'inception',
    'design_ready',
    'in_progress',
    'review_qa',
    'deploying',
    'done',
    'paused',
    'failed',
    'cancelled',
    'rollback',
  ],
  transitions: {
    inception: ['design_ready', 'cancelled'],
    design_ready: ['in_progress', 'inception'],
    in_progress: ['review_qa', 'inception', 'paused'],
    review_qa: ['deploying', 'in_progress', 'failed'],
    deploying: ['done', 'rollback'],
    done: [],
    paused: ['in_progress', 'cancelled'],
    failed: ['in_progress', 'cancelled'],
    cancelled: [],
    rollback: ['in_progress', 'failed'],
  },
  initialState: 'inception',
  terminalStates: ['done', 'cancelled'],
};
