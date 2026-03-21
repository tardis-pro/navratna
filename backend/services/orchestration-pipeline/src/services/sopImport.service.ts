import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import type { SOPDocument, SOPType, SOPWorkflow } from '../sops/sop-types.js';

const DEFAULT_BASE_PATH = '/Users/pronitdas/workspaces/bmad-navratna/openclaw-infra/agents';

const SOP_FILE_CONFIG: Array<{ fileName: string; type: SOPType; idSuffix: string; fallbackTitle: string }> = [
  {
    fileName: 'PROJECT_SOP.md',
    type: 'project_sop',
    idSuffix: 'project-sop',
    fallbackTitle: 'Project SOP',
  },
  {
    fileName: 'SOUL.md',
    type: 'agent_soul',
    idSuffix: 'soul',
    fallbackTitle: 'Soul',
  },
];

export class SOPImportService {
  private basePath: string;

  constructor(basePath: string = DEFAULT_BASE_PATH) {
    this.basePath = basePath;
  }

  async importSOPForAgent(agentId: string): Promise<SOPDocument[]> {
    const agentPath = path.join(this.basePath, agentId);
    const sops: SOPDocument[] = [];

    for (const config of SOP_FILE_CONFIG) {
      const sopPath = path.join(agentPath, config.fileName);

      if (!(await this.fileExists(sopPath))) {
        continue;
      }

      const content = await fs.readFile(sopPath, 'utf-8');
      const { data, content: markdown } = matter(content);

      sops.push({
        id: `${agentId}-${config.idSuffix}`,
        agentId,
        type: config.type,
        title: this.resolveTitle(data?.title, agentId, config.fallbackTitle),
        content: markdown,
        parsedAt: new Date(),
        version: this.resolveVersion(data?.version),
      });
    }

    return sops;
  }

  async importAllSOPs(): Promise<SOPDocument[]> {
    const allSOPs: SOPDocument[] = [];
    const agentIds = await this.listAgentDirectories();

    for (const agentId of agentIds) {
      const sops = await this.importSOPForAgent(agentId);
      allSOPs.push(...sops);
    }

    return allSOPs;
  }

  parseWorkflowFromMarkdown(markdown: string): SOPWorkflow | null {
    const workflowMatch = markdown.match(/```workflow\s*\n([\s\S]*?)```/i);
    if (!workflowMatch) {
      return null;
    }

    try {
      return JSON.parse(workflowMatch[1].trim()) as SOPWorkflow;
    } catch {
      return null;
    }
  }

  private async listAgentDirectories(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  private resolveTitle(value: unknown, agentId: string, fallbackTitle: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    return `${agentId} ${fallbackTitle}`;
  }

  private resolveVersion(value: unknown): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    if (typeof value === 'number') {
      return String(value);
    }

    return '1.0';
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
