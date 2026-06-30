import axios, { type AxiosInstance } from 'axios';
import { logger } from '@uaip/utils';
import type { SourceControlAdapter } from '../types/source_control_adapter.js';
import type { AdapterConfigSchema, AdapterCapability, AdapterHealth } from '../types/base_adapter.js';
import type { GetFileParams, CreatePRParams, GetCommitsParams, GetDiffParams, SourceFile, Commit, PullRequest } from '../types/source_control_adapter.js';

const GITHUB_CONFIG_SCHEMA: AdapterConfigSchema = {
  fields: [
    { name: 'token', type: 'secret', required: true, description: 'GitHub personal access token', envVar: 'GITHUB_TOKEN' },
    { name: 'baseUrl', type: 'url', required: false, description: 'GitHub API base URL', defaultValue: 'https://api.github.com' },
  ],
  validate(config: Record<string, unknown>): void {
    if (!config['token']) throw new Error('GitHubSourceControlAdapter: token required');
  },
};

const GITHUB_CAPABILITIES: AdapterCapability[] = [
  { type: 'get_file', supportsRealtime: true, supportsHistorical: true },
  { type: 'create_pr', supportsRealtime: true, supportsHistorical: false },
  { type: 'get_commits', supportsRealtime: false, supportsHistorical: true, maxLookbackDays: 365 },
];

export class GitHubSourceControlAdapter implements SourceControlAdapter {
  readonly id = 'github';
  readonly type = 'source-control';

  private http: AxiosInstance | null = null;

  getConfigSchema(): AdapterConfigSchema {
    return GITHUB_CONFIG_SCHEMA;
  }

  getCapabilities(): AdapterCapability[] {
    return GITHUB_CAPABILITIES;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    GITHUB_CONFIG_SCHEMA.validate(config);
    const token = String(config['token'] ?? process.env.GITHUB_TOKEN ?? '');
    const baseUrl = String(config['baseUrl'] ?? 'https://api.github.com');

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 30_000,
    });

    logger.info('GitHubSourceControlAdapter initialized', { baseUrl });
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      await this.http?.get('/user');
      return { healthy: true, latencyMs: Date.now() - start, checkedAt: new Date() };
    } catch (err) {
      return { healthy: false, error: err instanceof Error ? err.message : 'unknown', checkedAt: new Date() };
    }
  }

  async shutdown(): Promise<void> {
    this.http = null;
  }

  async getFile(params: GetFileParams): Promise<SourceFile> {
    if (!this.http) throw new Error('GitHubSourceControlAdapter not initialized');
    const ref = params.ref ?? 'HEAD';
    const res = await this.http.get(`/repos/${params.repo}/contents/${params.path}`, { params: { ref } });
    const data = res.data as { content: string; encoding: string; size: number; sha: string; name: string };
    return {
      path: params.path,
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      encoding: 'utf-8',
      size: data.size,
      sha: data.sha,
    };
  }

  async createPR(params: CreatePRParams): Promise<PullRequest> {
    if (!this.http) throw new Error('GitHubSourceControlAdapter not initialized');
    const res = await this.http.post(`/repos/${params.repo}/pulls`, {
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
      draft: params.draft ?? false,
    });
    const data = res.data as { number: number; html_url: string; title: string; state: string; head: { ref: string }; base: { ref: string }; created_at: string; merged_at?: string };
    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state as 'open' | 'closed' | 'merged',
      head: data.head.ref,
      base: data.base.ref,
      createdAt: new Date(data.created_at),
      mergedAt: data.merged_at ? new Date(data.merged_at) : undefined,
    };
  }

  async getCommitsSince(params: GetCommitsParams): Promise<Commit[]> {
    if (!this.http) throw new Error('GitHubSourceControlAdapter not initialized');
    const res = await this.http.get(`/repos/${params.repo}/commits`, {
      params: {
        since: params.since.toISOString(),
        until: params.until?.toISOString(),
        sha: params.branch,
        path: params.path,
        per_page: 100,
      },
    });
    const commits = res.data as Array<{ sha: string; commit: { message: string; author: { name: string; date: string } }; html_url: string }>;
    return commits.map((c): Commit => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      timestamp: new Date(c.commit.author.date),
      url: c.html_url,
    }));
  }

  async getDiff(params: GetDiffParams): Promise<string> {
    if (!this.http) throw new Error('GitHubSourceControlAdapter not initialized');
    const res = await this.http.get(`/repos/${params.repo}/compare/${params.base}...${params.head}`, {
      headers: { Accept: 'application/vnd.github.diff' },
    });
    return String(res.data);
  }

  async addPRComment(ref: PullRequest, _comment: string): Promise<void> {
    logger.warn('GitHubSourceControlAdapter.addPRComment: repo required — use PR URL to extract repo', { prUrl: ref.url });
  }
}
