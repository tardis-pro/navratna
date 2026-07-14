import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { secureGitClone } from '../../session/secure_git_clone.js';
import type { GitHubCredential } from '@uaip/types';

const VALID_CREDENTIAL: GitHubCredential = {
  token: 'ghs_test_token_value',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  repositoryFullName: 'acme/my-repo',
  cloneUrl: 'https://github.com/acme/my-repo.git',
};

beforeEach(() => {
  vi.mocked(fs.existsSync).mockReturnValue(false);
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'https://github.com/acme/my-repo.git\n', stderr: '', pid: 1, output: [], signal: null });
});

describe('secureGitClone — URL validation', () => {
  it('rejects clone URL that does not match repositoryFullName', async () => {
    await expect(secureGitClone({
      credential: { ...VALID_CREDENTIAL, cloneUrl: 'https://github.com/evil/other-repo.git' },
      workspacePath: '/workspace',
      isResume: false,
      repositoryId: '123',
    })).rejects.toThrow('does not match expected');
  });

  it('rejects clone URL injection attempt', async () => {
    await expect(secureGitClone({
      credential: { ...VALID_CREDENTIAL, cloneUrl: 'https://evil.com/acme/my-repo.git', repositoryFullName: 'acme/my-repo' },
      workspacePath: '/workspace',
      isResume: false,
      repositoryId: '123',
    })).rejects.toThrow();
  });

  it('rejects repositoryFullName with path traversal', async () => {
    await expect(secureGitClone({
      credential: { ...VALID_CREDENTIAL, cloneUrl: 'https://github.com/../../../etc/passwd.git', repositoryFullName: '../../../etc/passwd' },
      workspacePath: '/workspace',
      isResume: false,
      repositoryId: '123',
    })).rejects.toThrow();
  });
});

describe('secureGitClone — token not in argv', () => {
  it('does not pass token as argv to git clone', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await secureGitClone({
      credential: VALID_CREDENTIAL,
      workspacePath: '/workspace',
      isResume: false,
      repositoryId: '123',
    });

    const calls = vi.mocked(spawnSync).mock.calls;
    for (const [cmd, args] of calls) {
      if (cmd === 'git') {
        const argStr = JSON.stringify(args);
        expect(argStr).not.toContain(VALID_CREDENTIAL.token);
        expect(argStr).not.toContain('x-access-token');
      }
    }
  });
});

describe('secureGitClone — token not in clone URL argv', () => {
  it('passes clean URL without credentials embedded', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    await secureGitClone({
      credential: VALID_CREDENTIAL,
      workspacePath: '/workspace',
      isResume: false,
      repositoryId: '123',
    });

    for (const [, args] of vi.mocked(spawnSync).mock.calls) {
      if (Array.isArray(args)) {
        for (const arg of args) {
          if (typeof arg === 'string') {
            expect(arg).not.toContain(`x-access-token:`);
            expect(arg).not.toContain(VALID_CREDENTIAL.token);
          }
        }
      }
    }
  });
});

describe('secureGitClone — resume with existing repo checks origin', () => {
  it('verifies origin on resume matches repositoryFullName', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'https://github.com/acme/my-repo.git\n',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    });

    await expect(secureGitClone({
      credential: VALID_CREDENTIAL,
      workspacePath: '/workspace',
      isResume: true,
      repositoryId: '123',
    })).resolves.not.toThrow();
  });

  it('rejects resume if origin does not match', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'https://github.com/evil/other-repo.git\n',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    });

    await expect(secureGitClone({
      credential: VALID_CREDENTIAL,
      workspacePath: '/workspace',
      isResume: true,
      repositoryId: '123',
    })).rejects.toThrow();
  });
});
