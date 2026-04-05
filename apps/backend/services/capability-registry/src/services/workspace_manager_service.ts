import { EventEmitter } from 'events';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { logger, NotFoundError, ValidationError } from '@uaip/utils';

const execAsync = promisify(exec);

export interface WorkspaceConfig {
  workspaceId: string;
  projectId: string;
  userId: string;
  githubRepo: string;
  githubCloneUrl: string;
  githubToken: string;
  branchName?: string;
}

export interface WorkspaceInfo {
  workspaceId: string;
  containerId: string;
  status: 'initializing' | 'ready' | 'busy' | 'stopped' | 'error';
  workspacePath: string;
  githubRepo: string;
  branchName: string;
}

function assertSafeId(id: string, fieldName: string): void {
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
    throw new ValidationError(`${fieldName} contains unsupported characters`);
  }
}

export class WorkspaceManager extends EventEmitter {
  private static instance: WorkspaceManager;
  private workspaces = new Map<string, WorkspaceInfo>();
  private readonly baseImage = 'ubuntu:22.04';
  private readonly workspaceRoot = '/var/uaip/workspaces';

  static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }

  async provisionWorkspace(config: WorkspaceConfig): Promise<WorkspaceInfo> {
    const { workspaceId, githubRepo, githubCloneUrl, githubToken } = config;
    const branchName = config.branchName || 'main';
    const containerName = `uaip-workspace-${workspaceId}`;
    const workspacePath = `/workspace`;

    assertSafeId(workspaceId, 'workspaceId');
    assertSafeId(branchName, 'branchName');

    logger.info('Provisioning workspace', { workspaceId, githubRepo });
    this.emit('workspace:initializing', { workspaceId });

    try {
      try {
        execSync(`mkdir -p ${this.workspaceRoot}/${workspaceId}`);
      } catch (error) {
        logger.warn('Failed to pre-create workspace directory (continuing)', {
          workspaceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await execAsync(
        `docker run -d --name ${containerName} ` +
          `--memory=2g --cpus=2 ` +
          `-e GITHUB_TOKEN=${githubToken} ` +
          `-e GH_TOKEN=${githubToken} ` +
          `-v ${this.workspaceRoot}/${workspaceId}:/data ` +
          `${this.baseImage} tail -f /dev/null`
      );

      const { stdout: containerId } = await execAsync(
        `docker inspect -f '{{.Id}}' ${containerName}`
      );

      await this.execInContainer(
        containerName,
        'apt-get update -qq && apt-get install -y -qq git curl nodejs npm 2>/dev/null || true'
      );

      await this.execInContainer(
        containerName,
        'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | ' +
          'dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && ' +
          'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | ' +
          'tee /etc/apt/sources.list.d/github-cli.list > /dev/null && ' +
          'apt-get update -qq && apt-get install -y gh 2>/dev/null || true'
      );

      await this.execInContainer(
        containerName,
        `echo "${githubToken}" | gh auth login --with-token`
      );

      await this.execInContainer(
        containerName,
        `git clone ${githubCloneUrl} ${workspacePath} 2>&1`
      );

      await this.execInContainer(
        containerName,
        `cd ${workspacePath} && git config user.email "agent@uaip.local" && git config user.name "UAIP Agent"`
      );

      await this.execInContainer(
        containerName,
        `cd ${workspacePath} && git checkout ${branchName} 2>/dev/null || git checkout -b ${branchName}`
      );

      const info: WorkspaceInfo = {
        workspaceId,
        containerId: containerId.trim(),
        status: 'ready',
        workspacePath,
        githubRepo,
        branchName,
      };

      this.workspaces.set(workspaceId, info);
      this.emit('workspace:ready', { workspaceId });
      logger.info('Workspace provisioned successfully', {
        workspaceId,
        containerId: info.containerId,
      });

      return info;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to provision workspace', { workspaceId, error: errMsg });
      this.emit('workspace:error', { workspaceId, error: errMsg });
      await execAsync(`docker rm -f ${containerName}`).catch((rmErr) => {
        logger.warn('Docker cleanup failed after provision error', {
          workspaceId,
          containerName,
          error: rmErr instanceof Error ? rmErr.message : String(rmErr),
        });
      });
      throw error;
    }
  }

  async execInWorkspace(
    workspaceId: string,
    command: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const info = this.workspaces.get(workspaceId);
    if (!info) throw new NotFoundError(`Workspace ${workspaceId} not found`);

    const containerName = `uaip-workspace-${workspaceId}`;
    try {
      const { stdout, stderr } = await execAsync(
        `docker exec ${containerName} bash -c ${JSON.stringify(`cd ${info.workspacePath} && ${command}`)}`,
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
      );
      return { stdout, stderr, exitCode: 0 };
    } catch (error: unknown) {
      const isExecError = (v: unknown): v is { stdout?: string; stderr?: string; code?: number; message?: string } =>
        typeof v === 'object' && v !== null;
      const e = isExecError(error) ? error : {};
      return {
        stdout: typeof e.stdout === 'string' ? e.stdout : '',
        stderr: typeof e.stderr === 'string' ? e.stderr : typeof e.message === 'string' ? e.message : 'Workspace command failed',
        exitCode: typeof e.code === 'number' ? e.code : 1,
      };
    }
  }

  private async execInContainer(containerName: string, command: string): Promise<string> {
    const { stdout } = await execAsync(
      `docker exec ${containerName} bash -c ${JSON.stringify(command)}`,
      { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout;
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceInfo | null> {
    return this.workspaces.get(workspaceId) || null;
  }

  async stopWorkspace(workspaceId: string): Promise<void> {
    const containerName = `uaip-workspace-${workspaceId}`;
    await execAsync(`docker stop ${containerName}`).catch((err) => {
      logger.warn('Docker stop failed during workspace teardown', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    const info = this.workspaces.get(workspaceId);
    if (info) {
      info.status = 'stopped';
      this.workspaces.set(workspaceId, info);
    }
    this.emit('workspace:stopped', { workspaceId });
  }

  async destroyWorkspace(workspaceId: string): Promise<void> {
    const containerName = `uaip-workspace-${workspaceId}`;
    await execAsync(`docker rm -f ${containerName}`).catch((err) => {
      logger.warn('Docker rm failed during workspace destroy', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    this.workspaces.delete(workspaceId);
    this.emit('workspace:destroyed', { workspaceId });
  }

  listWorkspaces(): WorkspaceInfo[] {
    return Array.from(this.workspaces.values());
  }
}
