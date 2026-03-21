import * as fs from 'fs/promises';
import * as path from 'path';

type SkillCategory = 'behavior' | 'meta' | 'tool' | 'workflow';

interface SkillActionParameter {
  type: string;
  required: boolean;
  default?: unknown;
}

interface SkillAction {
  name: string;
  description: string;
  parameters?: Record<string, SkillActionParameter>;
  returns?: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  owner?: string;
  triggerEvents?: string[];
  actions: SkillAction[];
  metadata: {
    origin: 'openclaw';
    commit?: string;
    importedAt: string;
  };
}

interface SkillManifest {
  skills: Skill[];
}

interface DirEntryLike {
  isDirectory: () => boolean;
  name: string;
}

const OPENCLAW_SKILL_IDS = [
  'anti-ai-writing',
  'capability-evolver',
  'project-context-sync',
  'persona-adapter',
] as const;

const CATEGORY_BY_SKILL: Record<string, SkillCategory> = {
  'anti-ai-writing': 'behavior',
  'capability-evolver': 'meta',
  'project-context-sync': 'workflow',
  'persona-adapter': 'behavior',
};

const OPENCLAW_SKILLS_PATH = '/Users/pronitdas/workspaces/bmad-navratna/openclaw-infra/skills';

const OPENCLAW_MANIFEST_PATH =
  '/Users/pronitdas/workspaces/bmad-navratna/navratna/backend/services/capability-registry/src/skills/openclaw-skills.json';

export class SkillImportService {
  private readonly skillsPath: string;
  private readonly manifestPath: string;
  private cachedManifest: SkillManifest | null = null;

  constructor(skillsPath: string = OPENCLAW_SKILLS_PATH, manifestPath: string = OPENCLAW_MANIFEST_PATH) {
    this.skillsPath = skillsPath;
    this.manifestPath = manifestPath;
  }

  public async importSkill(skillId: string): Promise<Skill | null> {
    const manifestSkill = await this.getManifestSkill(skillId);
    const skillPath = path.join(this.skillsPath, skillId);

    const [meta, skillMarkdown] = await Promise.all([
      this.readMeta(skillPath),
      this.readText(path.join(skillPath, 'SKILL.md')),
    ]);

    if (!manifestSkill && !meta && !skillMarkdown) {
      return null;
    }

    const frontmatter = this.extractFrontmatter(skillMarkdown || '');

    return {
      id: skillId,
      name:
        (meta?.displayName as string | undefined) ||
        (meta?.name as string | undefined) ||
        frontmatter.name ||
        manifestSkill?.name ||
        this.titleFromSlug(skillId),
      description:
        frontmatter.description ||
        (meta?.description as string | undefined) ||
        manifestSkill?.description ||
        '',
      category:
        (meta?.category as SkillCategory | undefined) ||
        manifestSkill?.category ||
        CATEGORY_BY_SKILL[skillId] ||
        this.categoryFromTags(frontmatter.tags),
      version:
        (meta?.latest?.version as string | undefined) ||
        (meta?.version as string | undefined) ||
        manifestSkill?.version ||
        '1.0',
      owner: (meta?.owner as string | undefined) || manifestSkill?.owner,
      triggerEvents:
        (meta?.triggerEvents as string[] | undefined) || manifestSkill?.triggerEvents || [],
      actions: (meta?.actions as SkillAction[] | undefined) || manifestSkill?.actions || [],
      metadata: {
        origin: 'openclaw',
        commit:
          (meta?.latest?.commit as string | undefined) ||
          (meta?.commit as string | undefined) ||
          manifestSkill?.metadata.commit,
        importedAt: new Date().toISOString(),
      },
    };
  }

  public async importAllSkills(): Promise<Skill[]> {
    const dirEntries = await fs
      .readdir(this.skillsPath, { withFileTypes: true })
      .catch((): DirEntryLike[] => []);
    const skillIds = dirEntries
      .filter((entry: DirEntryLike) => entry.isDirectory())
      .map((entry: DirEntryLike) => entry.name);

    const imported = await Promise.all(skillIds.map((skillId: string) => this.importSkill(skillId)));
    return imported.filter((skill: Skill | null): skill is Skill => skill !== null);
  }

  public async importOpenClawSkills(): Promise<Skill[]> {
    const imported = await Promise.all(OPENCLAW_SKILL_IDS.map((skillId) => this.importSkill(skillId)));
    return imported.filter((skill: Skill | null): skill is Skill => skill !== null);
  }

  private async getManifestSkill(skillId: string): Promise<Skill | undefined> {
    const manifest = await this.getManifest();
    return manifest.skills.find((skill) => skill.id === skillId);
  }

  private async getManifest(): Promise<SkillManifest> {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }

    const content = await this.readText(this.manifestPath);
    if (!content) {
      this.cachedManifest = { skills: [] };
      return this.cachedManifest;
    }

    try {
      const parsed = JSON.parse(content) as SkillManifest;
      this.cachedManifest = {
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      };
      return this.cachedManifest;
    } catch {
      this.cachedManifest = { skills: [] };
      return this.cachedManifest;
    }
  }

  private async readMeta(skillPath: string): Promise<Record<string, any> | null> {
    const metaPath = path.join(skillPath, '_meta.json');
    const skillJsonPath = path.join(skillPath, 'skill.json');

    const [metaContent, skillJsonContent] = await Promise.all([
      this.readText(metaPath),
      this.readText(skillJsonPath),
    ]);

    const content = metaContent || skillJsonContent;
    if (!content) {
      return null;
    }

    try {
      return JSON.parse(content) as Record<string, any>;
    } catch {
      return null;
    }
  }

  private async readText(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  private extractFrontmatter(markdown: string): {
    name?: string;
    description?: string;
    tags?: string[];
  } {
    const match = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return {};
    }

    const data: { name?: string; description?: string; tags?: string[] } = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const [rawKey, ...rest] = line.split(':');
      if (!rawKey || rest.length === 0) {
        continue;
      }

      const key = rawKey.trim();
      const value = rest.join(':').trim();

      if (key === 'name') {
        data.name = value;
      } else if (key === 'description') {
        data.description = value;
      } else if (key === 'tags') {
        data.tags = value
          .replace(/^\[/, '')
          .replace(/\]$/, '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
    }

    return data;
  }

  private categoryFromTags(tags?: string[]): SkillCategory {
    if (!tags || tags.length === 0) {
      return 'tool';
    }

    if (tags.some((tag) => tag.toLowerCase() === 'meta')) {
      return 'meta';
    }

    if (tags.some((tag) => tag.toLowerCase() === 'workflow')) {
      return 'workflow';
    }

    if (tags.some((tag) => tag.toLowerCase() === 'behavior')) {
      return 'behavior';
    }

    return 'tool';
  }

  private titleFromSlug(slug: string): string {
    return slug
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
