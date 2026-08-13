import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const create = vi.fn(() => ({ get, post }));

vi.mock('axios', () => ({ default: { create: (...args: unknown[]) => create(...(args as [])) } }));
vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { GiteaSourceControlAdapter } = await import('../../verifier/gitea_source_control_adapter.js');

const BASE = 'https://git.example.com';
const REPO = 'acme/widgets';

function commit(sha: string, message = 'msg') {
  return {
    sha,
    html_url: `${BASE}/${REPO}/commit/${sha}`,
    commit: { message, author: { name: 'Dev', date: '2026-08-13T10:00:00Z' } },
  };
}

async function makeAdapter() {
  const adapter = new GiteaSourceControlAdapter();
  await adapter.initialize({ baseUrl: BASE, token: 't0ken' });
  return adapter;
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  create.mockClear();
});

describe('GiteaSourceControlAdapter.initialize', () => {
  it('authenticates with Gitea\'s "token" scheme, not GitHub\'s Bearer', async () => {
    await makeAdapter();
    const [options] = create.mock.calls[0] as [{ headers: Record<string, string> }];
    expect(options.headers['Authorization']).toBe('token t0ken');
  });

  it('appends /api/v1 to the instance root', async () => {
    await makeAdapter();
    const [options] = create.mock.calls[0] as [{ baseURL: string }];
    expect(options.baseURL).toBe(`${BASE}/api/v1`);
  });

  it.each([`${BASE}/`, `${BASE}/api/v1`])(
    'normalizes an already-suffixed or trailing-slash base url (%s)',
    async (input) => {
      const adapter = new GiteaSourceControlAdapter();
      await adapter.initialize({ baseUrl: input, token: 't' });
      const [options] = create.mock.calls[0] as [{ baseURL: string }];
      expect(options.baseURL).toBe(`${BASE}/api/v1`);
    }
  );

  it('rejects a missing token', async () => {
    const adapter = new GiteaSourceControlAdapter();
    await expect(adapter.initialize({ baseUrl: BASE, token: '' })).rejects.toThrow(/token required/);
  });

  it('rejects a missing base url', async () => {
    const adapter = new GiteaSourceControlAdapter();
    await expect(adapter.initialize({ baseUrl: '', token: 't' })).rejects.toThrow(/baseUrl required/);
  });
});

describe('GiteaSourceControlAdapter.healthCheck', () => {
  it('probes /version, which needs no token scope', async () => {
    const adapter = await makeAdapter();
    get.mockResolvedValue({ data: { version: '1.27.1' } });

    await expect(adapter.healthCheck()).resolves.toMatchObject({ healthy: true });
    expect(get).toHaveBeenCalledWith('/version');
  });

  it('reports unhealthy instead of throwing when the instance is unreachable', async () => {
    const adapter = await makeAdapter();
    get.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(adapter.healthCheck()).resolves.toMatchObject({
      healthy: false,
      error: 'ECONNREFUSED',
    });
  });
});

describe('GiteaSourceControlAdapter.getCommitsSince', () => {
  it('paginates with Gitea\'s "limit" — GitHub\'s per_page is ignored by Gitea', async () => {
    const adapter = await makeAdapter();
    get.mockResolvedValue({ data: [commit('abc')] });

    await adapter.getCommitsSince({ repo: REPO, since: new Date('2026-08-13T00:00:00Z') });

    const [, options] = get.mock.calls[0] as [string, { params: Record<string, unknown> }];
    expect(options.params['limit']).toBe(50);
    expect(options.params).not.toHaveProperty('per_page');
  });

  it('omits optional filters rather than sending undefined', async () => {
    const adapter = await makeAdapter();
    get.mockResolvedValue({ data: [] });

    await adapter.getCommitsSince({ repo: REPO, since: new Date('2026-08-13T00:00:00Z') });

    const [, options] = get.mock.calls[0] as [string, { params: Record<string, unknown> }];
    expect(options.params).not.toHaveProperty('until');
    expect(options.params).not.toHaveProperty('sha');
    expect(options.params).not.toHaveProperty('path');
  });

  it('maps branch to sha and surfaces changed files when present', async () => {
    const adapter = await makeAdapter();
    get.mockResolvedValue({
      data: [{ ...commit('abc', 'fix: thing'), files: [{ filename: 'src/a.ts' }] }],
    });

    const commits = await adapter.getCommitsSince({
      repo: REPO,
      since: new Date('2026-08-13T00:00:00Z'),
      branch: 'main',
    });

    const [, options] = get.mock.calls[0] as [string, { params: Record<string, unknown> }];
    expect(options.params['sha']).toBe('main');
    expect(commits[0]).toMatchObject({ sha: 'abc', message: 'fix: thing', author: 'Dev' });
    expect(commits[0]?.timestamp).toBeInstanceOf(Date);
    expect(commits[0]?.filesChanged).toEqual(['src/a.ts']);
  });

  it('drops malformed entries instead of throwing', async () => {
    const adapter = await makeAdapter();
    get.mockResolvedValue({ data: [commit('abc'), null, { sha: 'no-commit-field' }, 'garbage'] });

    const commits = await adapter.getCommitsSince({
      repo: REPO,
      since: new Date('2026-08-13T00:00:00Z'),
    });

    expect(commits).toHaveLength(1);
  });

  it('returns an empty list when the response is not an array', async () => {
    const adapter = await makeAdapter();
    get.mockResolvedValue({ data: { message: 'not found' } });

    await expect(
      adapter.getCommitsSince({ repo: REPO, since: new Date('2026-08-13T00:00:00Z') })
    ).resolves.toEqual([]);
  });
});

describe('GiteaSourceControlAdapter.getDiff', () => {
  it('assembles a range diff from per-commit diffs, oldest first', async () => {
    const adapter = await makeAdapter();
    // Gitea returns compare commits newest-first.
    get.mockImplementation((url: string) => {
      if (url.includes('/compare/')) {
        return Promise.resolve({ data: { commits: [commit('newer'), commit('older')] } });
      }
      return Promise.resolve({ data: `diff for ${url.split('/').pop()}` });
    });

    const diff = await adapter.getDiff({ repo: REPO, base: 'older', head: 'newer' });

    expect(diff.indexOf('older.diff')).toBeLessThan(diff.indexOf('newer.diff'));
  });

  it('returns empty string for an empty range without fetching diffs', async () => {
    const adapter = await makeAdapter();
    get.mockResolvedValue({ data: { commits: [] } });

    await expect(adapter.getDiff({ repo: REPO, base: 'a', head: 'a' })).resolves.toBe('');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('caps the number of per-commit fetches and marks the diff truncated', async () => {
    const adapter = await makeAdapter();
    const many = Array.from({ length: 25 }, (_, i) => commit(`sha${i}`));
    get.mockImplementation((url: string) =>
      url.includes('/compare/')
        ? Promise.resolve({ data: { commits: many } })
        : Promise.resolve({ data: 'd' })
    );

    const diff = await adapter.getDiff({ repo: REPO, base: 'a', head: 'b' });

    // 1 compare call + at most 20 commit diffs
    expect(get).toHaveBeenCalledTimes(21);
    expect(diff).toContain('diff truncated');
    expect(diff).toContain('25 commits');
  });

  it('skips a commit whose diff fetch fails rather than losing the whole range', async () => {
    const adapter = await makeAdapter();
    get.mockImplementation((url: string) => {
      if (url.includes('/compare/')) {
        return Promise.resolve({ data: { commits: [commit('good'), commit('bad')] } });
      }
      return url.includes('bad')
        ? Promise.reject(new Error('500'))
        : Promise.resolve({ data: 'GOOD DIFF' });
    });

    await expect(adapter.getDiff({ repo: REPO, base: 'a', head: 'b' })).resolves.toBe('GOOD DIFF');
  });
});

describe('GiteaSourceControlAdapter.createPR', () => {
  const response = {
    number: 7,
    html_url: `${BASE}/${REPO}/pulls/7`,
    title: 'T',
    state: 'open',
    head: { ref: 'feature' },
    base: { ref: 'main' },
    created_at: '2026-08-13T10:00:00Z',
    merged_at: null,
  };

  it('maps the Gitea response onto the shared PullRequest shape', async () => {
    const adapter = await makeAdapter();
    post.mockResolvedValue({ data: response });

    const pr = await adapter.createPR({
      repo: REPO,
      title: 'T',
      body: 'B',
      head: 'feature',
      base: 'main',
    });

    expect(pr).toMatchObject({ number: 7, state: 'open', head: 'feature', base: 'main' });
    expect(pr.createdAt).toBeInstanceOf(Date);
    expect(pr).not.toHaveProperty('mergedAt');
  });

  it('sets mergedAt only when the PR is merged', async () => {
    const adapter = await makeAdapter();
    post.mockResolvedValue({
      data: { ...response, state: 'merged', merged_at: '2026-08-13T12:00:00Z' },
    });

    const pr = await adapter.createPR({
      repo: REPO,
      title: 'T',
      body: 'B',
      head: 'f',
      base: 'main',
    });

    expect(pr.state).toBe('merged');
    expect(pr.mergedAt).toBeInstanceOf(Date);
  });

  it('normalizes an unrecognized state to open', async () => {
    const adapter = await makeAdapter();
    post.mockResolvedValue({ data: { ...response, state: 'weird' } });

    await expect(
      adapter.createPR({ repo: REPO, title: 'T', body: 'B', head: 'f', base: 'main' })
    ).resolves.toMatchObject({ state: 'open' });
  });

  it('omits labels when none are requested', async () => {
    const adapter = await makeAdapter();
    post.mockResolvedValue({ data: response });

    await adapter.createPR({ repo: REPO, title: 'T', body: 'B', head: 'f', base: 'main' });

    const [, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('labels');
  });
});

describe('GiteaSourceControlAdapter.addPRComment', () => {
  const pr = {
    number: 7,
    url: `${BASE}/${REPO}/pulls/7`,
    title: 'T',
    state: 'open' as const,
    head: 'f',
    base: 'main',
    createdAt: new Date(),
  };

  it('posts to the issue timeline, which is where Gitea keeps PR comments', async () => {
    const adapter = await makeAdapter();
    post.mockResolvedValue({ data: {} });

    await adapter.addPRComment(pr, 'hello');

    expect(post).toHaveBeenCalledWith(`/repos/${REPO}/issues/7/comments`, { body: 'hello' });
  });

  it('tolerates a trailing slash on the PR url', async () => {
    const adapter = await makeAdapter();
    post.mockResolvedValue({ data: {} });

    await adapter.addPRComment({ ...pr, url: `${pr.url}/` }, 'hello');

    expect(post).toHaveBeenCalledWith(`/repos/${REPO}/issues/7/comments`, { body: 'hello' });
  });

  it('no-ops on an unparseable PR url rather than throwing', async () => {
    const adapter = await makeAdapter();

    await expect(adapter.addPRComment({ ...pr, url: `${BASE}/nope` }, 'x')).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('GiteaSourceControlAdapter uninitialized', () => {
  it('fails loudly when used before initialize', async () => {
    const adapter = new GiteaSourceControlAdapter();

    await expect(adapter.getFile({ repo: REPO, path: 'a.ts' })).rejects.toThrow(/not initialized/);
  });
});
