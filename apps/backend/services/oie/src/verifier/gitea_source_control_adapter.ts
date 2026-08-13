import axios, { type AxiosInstance } from 'axios';
import { logger } from '@uaip/utils';
import type { SourceControlAdapter } from '../types/source_control_adapter.js';
import type { AdapterConfigSchema, AdapterCapability, AdapterHealth } from '../types/base_adapter.js';
import type {
  GetFileParams,
  CreatePRParams,
  GetCommitsParams,
  GetDiffParams,
  SourceFile,
  Commit,
  PullRequest,
} from '../types/source_control_adapter.js';

/**
 * Gitea source-control adapter.
 *
 * Gitea's REST API is GitHub-SHAPED but not GitHub-COMPATIBLE, so the GitHub
 * adapter cannot simply be pointed at a Gitea base URL. Verified against Gitea
 * 1.27.1, the differences that matter here are:
 *
 *  - Pagination uses `limit` (capped server-side by MAX_RESPONSE_ITEMS,
 *    default 50). GitHub's `per_page` is silently IGNORED, so a GitHub-style
 *    request quietly returns only the first default-sized page.
 *  - There is no range-diff endpoint. `/compare/{base}...{head}` returns JSON
 *    metadata only, and `Accept: application/vnd.github.diff` does nothing.
 *    Raw diffs exist per commit (`/git/commits/{sha}.diff`) and per pull
 *    request (`/pulls/{index}.diff`) — so a range diff must be assembled.
 *  - Authorization is `token <t>`, not `Bearer <t>`.
 */

const GITEA_CONFIG_SCHEMA: AdapterConfigSchema = {
  fields: [
    {
      name: 'baseUrl',
      type: 'url',
      required: true,
      description: 'Gitea base URL (no /api/v1 suffix)',
      envVar: 'GITEA_URL',
    },
    {
      name: 'token',
      type: 'secret',
      required: true,
      description: 'Gitea access token',
      envVar: 'GITEA_TOKEN',
    },
  ],
  validate(config: Record<string, unknown>): void {
    if (!config['baseUrl']) throw new Error('GiteaSourceControlAdapter: baseUrl required');
    if (!config['token']) throw new Error('GiteaSourceControlAdapter: token required');
  },
};

const GITEA_CAPABILITIES: AdapterCapability[] = [
  { type: 'get_file', supportsRealtime: true, supportsHistorical: true },
  { type: 'create_pr', supportsRealtime: true, supportsHistorical: false },
  { type: 'get_commits', supportsRealtime: false, supportsHistorical: true, maxLookbackDays: 365 },
];

/** Gitea's default MAX_RESPONSE_ITEMS. Asking for more is silently truncated. */
const MAX_PAGE_SIZE = 50;

/**
 * Upper bound on per-commit diff fetches for one range diff. A range is
 * assembled one request per commit, so an unbounded range would issue an
 * unbounded number of calls against the Gitea instance.
 */
const MAX_DIFF_COMMITS = 20;

interface GiteaCommitResponse {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
  files?: Array<{ filename: string }>;
}

interface GiteaPullResponse {
  number: number;
  html_url: string;
  title: string;
  state: string;
  head: { ref: string };
  base: { ref: string };
  created_at: string;
  merged_at?: string | null;
}

function isGiteaCommit(value: unknown): value is GiteaCommitResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['sha'] === 'string' && typeof record['commit'] === 'object';
}

/**
 * Recover `owner/repo` and the PR index from a Gitea PR web URL, e.g.
 * `https://git.example.com/acme/widgets/pulls/12` -> `acme/widgets` + 12.
 *
 * The shared PullRequest type carries only a URL, so this is the sole way to
 * address the PR's comment endpoint without widening that interface.
 */
function parsePullRequestUrl(url: string): { repo: string; index: number } | null {
  const match = /\/([^/]+\/[^/]+)\/pulls\/(\d+)\/?$/.exec(url);
  if (!match?.[1] || !match[2]) return null;
  const index = Number.parseInt(match[2], 10);
  return Number.isFinite(index) ? { repo: match[1], index } : null;
}

export class GiteaSourceControlAdapter implements SourceControlAdapter {
  readonly id = 'gitea';
  readonly type = 'source-control';

  private http: AxiosInstance | null = null;

  getConfigSchema(): AdapterConfigSchema {
    return GITEA_CONFIG_SCHEMA;
  }

  getCapabilities(): AdapterCapability[] {
    return GITEA_CAPABILITIES;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    const baseUrl = String(config['baseUrl'] ?? process.env.GITEA_URL ?? '');
    const token = String(config['token'] ?? process.env.GITEA_TOKEN ?? '');
    GITEA_CONFIG_SCHEMA.validate({ baseUrl, token });

    // Callers configure the instance root (https://git.example.com); tolerate a
    // trailing slash or an already-suffixed /api/v1 so both forms work.
    const root = baseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/, '');

    this.http = axios.create({
      baseURL: `${root}/api/v1`,
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    logger.info('GiteaSourceControlAdapter initialized', { baseUrl: root });
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      // /version is unauthenticated and always present; /user requires a token
      // scope this adapter does not need, and would report a false negative.
      await this.http?.get('/version');
      return { healthy: true, latencyMs: Date.now() - start, checkedAt: new Date() };
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : 'unknown',
        checkedAt: new Date(),
      };
    }
  }

  async shutdown(): Promise<void> {
    this.http = null;
  }

  private client(): AxiosInstance {
    if (!this.http) throw new Error('GiteaSourceControlAdapter not initialized');
    return this.http;
  }

  async getFile(params: GetFileParams): Promise<SourceFile> {
    const res = await this.client().get(`/repos/${params.repo}/contents/${params.path}`, {
      params: params.ref ? { ref: params.ref } : undefined,
    });
    const data = res.data as { content?: string; size?: number | string; sha?: string };
    const content = typeof data.content === 'string' ? data.content : '';

    return {
      path: params.path,
      content: Buffer.from(content, 'base64').toString('utf-8'),
      encoding: 'utf-8',
      size: Number(data.size ?? 0),
      sha: String(data.sha ?? ''),
    };
  }

  async createPR(params: CreatePRParams): Promise<PullRequest> {
    const res = await this.client().post(`/repos/${params.repo}/pulls`, {
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
      ...(params.labels && params.labels.length > 0 ? { labels: params.labels } : {}),
    });
    const data = res.data as GiteaPullResponse;

    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state === 'merged' ? 'merged' : data.state === 'closed' ? 'closed' : 'open',
      head: data.head.ref,
      base: data.base.ref,
      createdAt: new Date(data.created_at),
      ...(data.merged_at ? { mergedAt: new Date(data.merged_at) } : {}),
    };
  }

  async getCommitsSince(params: GetCommitsParams): Promise<Commit[]> {
    const res = await this.client().get(`/repos/${params.repo}/commits`, {
      params: {
        since: params.since.toISOString(),
        ...(params.until ? { until: params.until.toISOString() } : {}),
        ...(params.branch ? { sha: params.branch } : {}),
        ...(params.path ? { path: params.path } : {}),
        limit: MAX_PAGE_SIZE,
      },
    });

    const commits = Array.isArray(res.data) ? res.data : [];
    return commits.filter(isGiteaCommit).map((commit): Commit => {
      const files = commit.files?.map((file) => file.filename);
      return {
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author.name,
        timestamp: new Date(commit.commit.author.date),
        url: commit.html_url,
        ...(files && files.length > 0 ? { filesChanged: files } : {}),
      };
    });
  }

  /**
   * Assemble a range diff from per-commit diffs.
   *
   * Gitea exposes no range-diff endpoint, so this resolves the range to its
   * commit list and concatenates each commit's raw diff, oldest first, to match
   * the reading order of a normal `git diff base..head`.
   */
  async getDiff(params: GetDiffParams): Promise<string> {
    const compare = await this.client().get(
      `/repos/${params.repo}/compare/${params.base}...${params.head}`
    );
    const body = compare.data as { commits?: unknown };
    const commits = (Array.isArray(body.commits) ? body.commits : []).filter(isGiteaCommit);

    if (commits.length === 0) return '';

    const truncated = commits.length > MAX_DIFF_COMMITS;
    if (truncated) {
      logger.warn('GiteaSourceControlAdapter.getDiff: range truncated', {
        repo: params.repo,
        commits: commits.length,
        limit: MAX_DIFF_COMMITS,
      });
    }

    const selected = commits.slice(0, MAX_DIFF_COMMITS).reverse();

    // Bounded by MAX_DIFF_COMMITS, so this fans out a fixed, small number of
    // requests. allSettled keeps the results positional, so a failed commit
    // diff drops out without shifting the rest out of commit order.
    const settled = await Promise.allSettled(
      selected.map((commit) =>
        this.client().get(`/repos/${params.repo}/git/commits/${commit.sha}.diff`)
      )
    );

    const parts: string[] = [];
    settled.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        parts.push(String(outcome.value.data));
        return;
      }
      logger.warn('GiteaSourceControlAdapter.getDiff: commit diff failed', {
        repo: params.repo,
        sha: selected[index]?.sha,
        error: outcome.reason instanceof Error ? outcome.reason.message : outcome.reason,
      });
    });

    if (truncated) {
      parts.push(
        `\n[diff truncated: ${commits.length} commits in range, first ${MAX_DIFF_COMMITS} shown]\n`
      );
    }

    return parts.join('\n');
  }

  async addPRComment(ref: PullRequest, comment: string): Promise<void> {
    const target = parsePullRequestUrl(ref.url);
    if (!target) {
      logger.warn('GiteaSourceControlAdapter.addPRComment: could not parse repo from PR URL', {
        prUrl: ref.url,
      });
      return;
    }

    // PR comments live on the issue timeline in Gitea, same as GitHub.
    await this.client().post(`/repos/${target.repo}/issues/${target.index}/comments`, {
      body: comment,
    });
  }
}
