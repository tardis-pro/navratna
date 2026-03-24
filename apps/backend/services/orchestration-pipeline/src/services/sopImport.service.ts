import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import type { SOPDocument, SOPType, SOPWorkflow } from '../sops/sop-types.js';

const DEFAULT_BASE_PATH = '/Users/pronitdas/workspaces/bmad-navratna/openclaw-infra/markdowns';

const FOLDER_TO_SEED_NAME: Record<string, string | null> = {
  tardis: 'Tardis',
  pm: 'Bhagwan',
  comms: 'Amy',
  growth: 'Karna',
  research: 'Mahadev',
  nidra: 'Nidra',
  content: 'Rishi',
  devops: 'Sharma',
  'code-review': 'Veda',
  'browser-test': 'Rana',
  mirror: 'Mirror',
  'lead-converter': null,
  'test-writer': 'Qadir',
  coder: null,
  pixel: 'Pixel',
  'pronit-mirror': 'Pronit-Mirror',
  main: null,
};

const KNOWN_FILE_TYPES: Record<string, { type: SOPType; idSuffix: string }> = {
  'SOUL.md': { type: 'agent_soul', idSuffix: 'soul' },
  'IDENTITY.md': { type: 'identity', idSuffix: 'identity' },
  'TOOLS.md': { type: 'tools', idSuffix: 'tools' },
  'AGENTS.md': { type: 'agents_config', idSuffix: 'agents-config' },
  'USER.md': { type: 'user_context', idSuffix: 'user-context' },
  'HEARTBEAT.md': { type: 'heartbeat', idSuffix: 'heartbeat' },
  'BOOTSTRAP.md': { type: 'bootstrap', idSuffix: 'bootstrap' },
  'PROCESS.md': { type: 'process', idSuffix: 'process' },
  'MEMORY.md': { type: 'memory', idSuffix: 'memory' },
  'PROJECT_SOP.md': { type: 'project_sop', idSuffix: 'project-sop' },
  'SOP.md': { type: 'sop', idSuffix: 'sop' },
};

export class SOPImportService {
  private basePath: string;

  constructor(basePath: string = DEFAULT_BASE_PATH) {
    this.basePath = basePath;
  }

  async importAllSOPs(): Promise<SOPDocument[]> {
    const allSOPs: SOPDocument[] = [];
    const agentIds = await this.listAgentDirectories();

    for (const agentId of agentIds) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const sops = await this.importSOPsForAgent(agentId);
      allSOPs.push(...sops);
    }

    return allSOPs;
  }

  async importSOPsForAgent(agentId: string): Promise<SOPDocument[]> {
    const agentPath = path.join(this.basePath, agentId);
    const sops: SOPDocument[] = [];

    const mdFiles = await this.listMarkdownFiles(agentPath);

    for (const fileName of mdFiles) {
      const filePath = path.join(agentPath, fileName);
      const knownType = KNOWN_FILE_TYPES[fileName];

      let type: SOPType;
      let idSuffix: string;

      if (knownType) {
        type = knownType.type;
        idSuffix = knownType.idSuffix;
      } else {
        type = 'context_document';
        idSuffix = this.slugifyFileName(fileName);
      }

      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(content);

      const title = this.resolveTitle(parsed.data?.title, agentId, fileName);
      const version = this.resolveVersion(parsed.data?.version);

      sops.push({
        id: `${agentId}-${idSuffix}`,
        agentId,
        agentOperationalName: this.getAgentOperationalName(agentId),
        type,
        title,
        content,
        frontmatter: parsed.data || {},
        fileName,
        parsedAt: new Date(),
        version,
      });
    }

    return sops;
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

  getAgentOperationalName(folderName: string): string | null {
    return FOLDER_TO_SEED_NAME[folderName] ?? null;
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

  private async listMarkdownFiles(agentPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(agentPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.name.endsWith('.md'))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  private resolveTitle(value: string | undefined, agentId: string, fallbackTitle: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return `${agentId} ${fallbackTitle}`;
  }

  private resolveVersion(value: string | number | undefined): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return '1.0';
  }

  private slugifyFileName(fileName: string): string {
    return fileName
      .replace(/\.md$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
