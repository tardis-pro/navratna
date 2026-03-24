import { logger } from '@uaip/utils';
import { WorkspaceManager } from './workspace-manager.service.js';

export interface GitHubTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>, workspaceId: string) => Promise<unknown>;
}

export class GitHubCodingExtension {
  private workspaceManager: WorkspaceManager;

  constructor(workspaceManager: WorkspaceManager) {
    this.workspaceManager = workspaceManager;
  }

  getTools(workspaceId: string): GitHubTool[] {
    return [
      {
        name: 'gh_create_pr',
        description: 'Create a GitHub Pull Request from the current branch',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR description (markdown)' },
            base: { type: 'string', description: 'Base branch to merge into', default: 'main' },
            draft: { type: 'boolean', description: 'Create as draft PR', default: false },
          },
          required: ['title'],
        },
        execute: async (params: Record<string, unknown>) => {
          const title = typeof params.title === 'string' ? params.title : '';
          const body = typeof params.body === 'string' ? params.body : '';
          const base = typeof params.base === 'string' ? params.base : 'main';
          const draft = params.draft === true;

          if (!title) return { success: false, error: 'title is required' };

          const draftFlag = draft ? '--draft' : '';
          const result = await this.workspaceManager.execInWorkspace(
            workspaceId,
            `gh pr create --title ${JSON.stringify(title)} ` +
              `--body ${JSON.stringify(body)} ` +
              `--base ${JSON.stringify(base)} ${draftFlag} 2>&1`
          );
          return { success: result.exitCode === 0, output: result.stdout + result.stderr };
        },
      },
      {
        name: 'gh_list_prs',
        description: 'List pull requests for the repository',
        parameters: {
          type: 'object',
          properties: {
            state: { type: 'string', enum: ['open', 'closed', 'merged', 'all'], default: 'open' },
            limit: { type: 'number', default: 10 },
          },
        },
        execute: async (params: Record<string, unknown>) => {
          const state =
            params.state === 'open' ||
            params.state === 'closed' ||
            params.state === 'merged' ||
            params.state === 'all'
              ? String(params.state)
              : 'open';
          const limit =
            typeof params.limit === 'number' && Number.isFinite(params.limit) ? params.limit : 10;

          const result = await this.workspaceManager.execInWorkspace(
            workspaceId,
            `gh pr list --state ${JSON.stringify(state)} --limit ${JSON.stringify(limit)} --json number,title,state,url,author,createdAt 2>&1`
          );
          try {
            return { success: true, prs: JSON.parse(result.stdout) };
          } catch (error) {
            logger.warn('Failed to parse gh pr list JSON', {
              workspaceId,
              error: error instanceof Error ? error.message : String(error),
            });
            return { success: result.exitCode === 0, output: result.stdout + result.stderr };
          }
        },
      },
      {
        name: 'gh_view_pr',
        description: 'View details of a specific pull request including diff and reviews',
        parameters: {
          type: 'object',
          properties: {
            number: { type: 'number', description: 'PR number' },
          },
          required: ['number'],
        },
        execute: async (params: Record<string, unknown>) => {
          const number = typeof params.number === 'number' ? params.number : Number.NaN;
          if (!Number.isFinite(number)) return { success: false, error: 'number is required' };

          const prInfo = await this.workspaceManager.execInWorkspace(
            workspaceId,
            `gh pr view ${JSON.stringify(number)} --json title,body,state,reviews,files,comments,author,url 2>&1`
          );
          const diff = await this.workspaceManager.execInWorkspace(
            workspaceId,
            `gh pr diff ${JSON.stringify(number)} 2>&1`
          );
          try {
            return { success: true, pr: JSON.parse(prInfo.stdout), diff: diff.stdout };
          } catch {
            return { success: prInfo.exitCode === 0, output: prInfo.stdout + prInfo.stderr };
          }
        },
      },
      {
        name: 'gh_review_pr',
        description: 'Submit a review on a pull request',
        parameters: {
          type: 'object',
          properties: {
            number: { type: 'number', description: 'PR number' },
            action: {
              type: 'string',
              enum: ['approve', 'request-changes', 'comment'],
              description: 'Review action',
            },
            body: { type: 'string', description: 'Review comment' },
          },
          required: ['number', 'action'],
        },
        execute: async (params: Record<string, unknown>) => {
          const number = typeof params.number === 'number' ? params.number : Number.NaN;
          const action =
            params.action === 'approve' ||
            params.action === 'request-changes' ||
            params.action === 'comment'
              ? String(params.action)
              : '';
          const body = typeof params.body === 'string' ? params.body : '';
          if (!Number.isFinite(number) || !action)
            return { success: false, error: 'number and action are required' };

          const actionFlag =
            action === 'approve'
              ? '--approve'
              : action === 'request-changes'
                ? '--request-changes'
                : '--comment';
          const result = await this.workspaceManager.execInWorkspace(
            workspaceId,
            `gh pr review ${JSON.stringify(number)} ${actionFlag} --body ${JSON.stringify(body)} 2>&1`
          );
          return { success: result.exitCode === 0, output: result.stdout + result.stderr };
        },
      },
      {
        name: 'gh_merge_pr',
        description: 'Merge a pull request',
        parameters: {
          type: 'object',
          properties: {
            number: { type: 'number', description: 'PR number' },
            method: { type: 'string', enum: ['merge', 'squash', 'rebase'], default: 'squash' },
            deleteAfterMerge: {
              type: 'boolean',
              description: 'Delete branch after merge',
              default: true,
            },
          },
          required: ['number'],
        },
        execute: async (params: Record<string, unknown>) => {
          const number = typeof params.number === 'number' ? params.number : Number.NaN;
          const method =
            params.method === 'merge' || params.method === 'squash' || params.method === 'rebase'
              ? String(params.method)
              : 'squash';
          const deleteAfterMerge = params.deleteAfterMerge !== false;
          if (!Number.isFinite(number)) return { success: false, error: 'number is required' };

          const methodFlag = `--${method}`;
          const deleteFlag = deleteAfterMerge ? '--delete-branch' : '';
          const result = await this.workspaceManager.execInWorkspace(
            workspaceId,
            `gh pr merge ${JSON.stringify(number)} ${methodFlag} ${deleteFlag} 2>&1`
          );
          return { success: result.exitCode === 0, output: result.stdout + result.stderr };
        },
      },
      {
        name: 'gh_create_branch',
        description: 'Create and switch to a new git branch',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Branch name' },
            from: { type: 'string', description: 'Base branch', default: 'main' },
          },
          required: ['name'],
        },
        execute: async (params: Record<string, unknown>) => {
          const name = typeof params.name === 'string' ? params.name : '';
          const from = typeof params.from === 'string' ? params.from : 'main';
          if (!name) return { success: false, error: 'name is required' };

          const result = await this.workspaceManager.execInWorkspace(
            workspaceId,
            `git fetch origin ${JSON.stringify(from)} && git checkout -b ${JSON.stringify(name)} origin/${JSON.stringify(from)} 2>&1`
          );
          return { success: result.exitCode === 0, output: result.stdout + result.stderr };
        },
      },
      {
        name: 'gh_commit_push',
        description: 'Stage all changes, commit, and push to remote',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message' },
          },
          required: ['message'],
        },
        execute: async (params: Record<string, unknown>) => {
          const message = typeof params.message === 'string' ? params.message : '';
          if (!message) return { success: false, error: 'message is required' };

          const result = await this.workspaceManager.execInWorkspace(
            workspaceId,
            `git add -A && git commit -m ${JSON.stringify(message)} && git push 2>&1`
          );
          return { success: result.exitCode === 0, output: result.stdout + result.stderr };
        },
      },
    ];
  }
}
