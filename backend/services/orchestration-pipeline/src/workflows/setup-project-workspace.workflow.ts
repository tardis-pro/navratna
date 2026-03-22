import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/infra/eventBus';

export interface SetupProjectWorkspaceInput {
  projectId: string;
  userId: string;
  projectName: string;
  githubToken: string;
  repoName: string;
  repoVisibility: 'public' | 'private';
  llmCredentials?: Array<{ provider: string; type: 'api_key' | 'oauth'; apiKey?: string }>;
}

export interface SetupProjectWorkspaceResult {
  workspaceId: string;
  githubRepo: string;
  githubCloneUrl: string;
  status: 'success' | 'partial' | 'failed';
  steps: Array<{ name: string; status: 'success' | 'skipped' | 'failed'; detail?: string }>;
}

export class SetupProjectWorkspaceWorkflow {
  constructor(private eventBus: EventBusService) {}

  async execute(input: SetupProjectWorkspaceInput): Promise<SetupProjectWorkspaceResult> {
    const { projectId, userId, projectName, githubToken, repoName, repoVisibility } = input;
    const steps: SetupProjectWorkspaceResult['steps'] = [];
    let githubRepo = '';
    let githubCloneUrl = '';
    const workspaceId = `ws_${projectId}_${Date.now()}`;

    logger.info('Starting SETUP_PROJECT_WORKSPACE workflow', { projectId, repoName });

    try {
      const repoResult = await this.createGitHubRepo(
        githubToken,
        repoName,
        repoVisibility,
        projectName
      );
      githubRepo = repoResult.fullName;
      githubCloneUrl = repoResult.cloneUrl;
      steps.push({ name: 'create_github_repo', status: 'success', detail: githubRepo });
      logger.info('GitHub repo created', { githubRepo });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ name: 'create_github_repo', status: 'failed', detail: message });
      logger.error('Failed to create GitHub repo', { projectId, error });
      await this.eventBus.publish('project.workspace.failed', {
        projectId,
        userId,
        error: message,
        step: 'create_github_repo',
      });
      return { workspaceId, githubRepo, githubCloneUrl, status: 'failed', steps };
    }

    try {
      await this.initializeRepo(githubToken, githubRepo, projectName);
      steps.push({ name: 'initialize_repo', status: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ name: 'initialize_repo', status: 'failed', detail: message });
      logger.warn('Failed to initialize repo (continuing)', { error });
    }

    try {
      await this.provisionWorkspaceContainer(
        workspaceId,
        projectId,
        userId,
        githubRepo,
        githubCloneUrl,
        githubToken
      );
      steps.push({ name: 'provision_workspace', status: 'success', detail: workspaceId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ name: 'provision_workspace', status: 'failed', detail: message });
      logger.error('Failed to provision workspace container', { workspaceId, error });
    }

    await this.eventBus.publish('project.workspace.ready', {
      projectId,
      userId,
      workspaceId,
      githubRepo,
      githubCloneUrl,
    });

    logger.info('SETUP_PROJECT_WORKSPACE workflow complete', {
      projectId,
      workspaceId,
      githubRepo,
    });

    return {
      workspaceId,
      githubRepo,
      githubCloneUrl,
      status: steps.every((s) => s.status !== 'failed') ? 'success' : 'partial',
      steps,
    };
  }

  private async createGitHubRepo(
    token: string,
    repoName: string,
    visibility: 'public' | 'private',
    description: string
  ): Promise<{ fullName: string; cloneUrl: string }> {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repoName,
        description,
        private: visibility === 'private',
        auto_init: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API error: ${error.message || response.statusText}`);
    }

    const repo = (await response.json()) as { full_name: string; clone_url: string };
    return {
      fullName: repo.full_name,
      cloneUrl: repo.clone_url,
    };
  }

  private async initializeRepo(
    token: string,
    fullName: string,
    projectName: string
  ): Promise<void> {
    const content = Buffer.from(
      `# ${projectName}\n\nThis project is managed by UAIP coding agents.\n\n## Guidelines\n\n- Write clean, well-documented code\n- Follow existing patterns in the codebase\n- Create meaningful commit messages\n- Always create feature branches for new work\n`
    ).toString('base64');

    const [owner, repo] = fullName.split('/');
    await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/AGENTS.md`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'chore: initialize project with AGENTS.md',
        content,
      }),
    });
  }

  private async provisionWorkspaceContainer(
    workspaceId: string,
    projectId: string,
    userId: string,
    githubRepo: string,
    githubCloneUrl: string,
    githubToken: string
  ): Promise<void> {
    const capabilityRegistryUrl = process.env.CAPABILITY_REGISTRY_URL || 'http://localhost:3003';
    const response = await fetch(`${capabilityRegistryUrl}/api/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        projectId,
        userId,
        githubRepo,
        githubCloneUrl,
        githubToken,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Workspace provision failed: ${err}`);
    }
  }
}
