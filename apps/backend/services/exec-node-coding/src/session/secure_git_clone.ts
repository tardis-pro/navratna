import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { GitHubCredential } from '@uaip/types';

const VALID_CLONE_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}\.git$/;
const VALID_FULL_NAME_RE = /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;
const VALID_ORIGIN_RE = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}(\.git)?$/;
const GIT_ASKPASS_PATH = '/usr/local/libexec/uaip-git-askpass';

export interface SecureGitCloneOptions {
  credential: GitHubCredential;
  workspacePath: string;
  isResume: boolean;
  repositoryId: string;
}

export function installGitCredentialEnvironment(token: string): void {
  if (!token) throw new Error('GitHub credential token is empty');
  process.env['UAIP_GIT_TOKEN'] = token;
  process.env['GIT_ASKPASS'] = GIT_ASKPASS_PATH;
  process.env['GIT_TERMINAL_PROMPT'] = '0';
}

function assertSafeCloneUrl(cloneUrl: string, repositoryFullName: string): void {
  if (!VALID_FULL_NAME_RE.test(repositoryFullName)) {
    throw new Error(`Invalid repositoryFullName: "${repositoryFullName}"`);
  }
  const expectedUrl = `https://github.com/${repositoryFullName}.git`;
  if (cloneUrl !== expectedUrl) {
    throw new Error(`cloneUrl "${cloneUrl}" does not match expected "${expectedUrl}"`);
  }
  if (!VALID_CLONE_URL_RE.test(cloneUrl)) {
    throw new Error(`cloneUrl failed safety check: "${cloneUrl}"`);
  }
}

function sanitizeOriginUrl(raw: string): string {
  return raw.replace(/x-access-token:[^@]*@/g, '').replace(/:[^/][^@]*@/g, '').trim();
}

function assertOriginMatchesRepo(workspacePath: string, repositoryFullName: string): void {
  const systemPath: string = process.env['PATH'] ?? '/usr/bin:/bin';
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: workspacePath,
    encoding: 'utf-8' as const,
    env: { PATH: systemPath },
    timeout: 5_000,
  });
  if (result.status !== 0) {
    throw new Error('Could not determine git remote origin for existing workspace');
  }
  const rawOrigin = result.stdout.trim();
  const sanitized = sanitizeOriginUrl(rawOrigin);
  if (!VALID_ORIGIN_RE.test(sanitized)) {
    throw new Error('Existing workspace origin URL failed safety check');
  }
  const expectedSuffix = `/${repositoryFullName}`;
  const withoutGit = sanitized.replace(/\.git$/, '');
  if (!withoutGit.endsWith(expectedSuffix)) {
    throw new Error(`Existing workspace origin does not match expected repository "${repositoryFullName}"`);
  }
}

export async function secureGitClone(opts: SecureGitCloneOptions): Promise<void> {
  const { credential, workspacePath, isResume } = opts;
  const { cloneUrl, repositoryFullName, token } = credential;

  assertSafeCloneUrl(cloneUrl, repositoryFullName);

  if (isResume) {
    if (!fs.existsSync(path.join(workspacePath, '.git'))) throw new Error('Resumed workspace is missing its git repository');
    assertOriginMatchesRepo(workspacePath, repositoryFullName);
    installGitCredentialEnvironment(token);
    return;
  }

  if (!fs.existsSync(GIT_ASKPASS_PATH)) {
    throw new Error(`GIT_ASKPASS helper not found at ${GIT_ASKPASS_PATH}`);
  }

  if (fs.existsSync(path.join(workspacePath, '.git'))) {
    assertOriginMatchesRepo(workspacePath, repositoryFullName);
    installGitCredentialEnvironment(token);
    return;
  }

  fs.mkdirSync(workspacePath, { recursive: true });

  const systemPath: string = process.env['PATH'] ?? '/usr/bin:/bin';

  const result = spawnSync(
    'git',
    ['clone', '--', cloneUrl, workspacePath],
    {
      env: {
        PATH: systemPath,
        GIT_ASKPASS: GIT_ASKPASS_PATH,
        GIT_TERMINAL_PROMPT: '0',
        UAIP_GIT_TOKEN: token,
        HOME: '/root',
      },
      timeout: 120_000,
      encoding: 'utf-8' as const,
    }
  );

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr : String(result.stderr ?? '');
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safeStderr = stderr.replace(new RegExp(escaped, 'g'), '[REDACTED]');
    throw new Error(`git clone failed (exit ${result.status ?? 'null'}): ${safeStderr.slice(0, 200)}`);
  }

  const verifyResult = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: workspacePath,
    encoding: 'utf-8' as const,
    env: { PATH: systemPath },
    timeout: 5_000,
  });
  if (verifyResult.status !== 0) {
    throw new Error('Post-clone origin verification failed');
  }
  const rawOrigin = verifyResult.stdout.trim();
  const sanitized = sanitizeOriginUrl(rawOrigin);
  const expectedSuffix = `/${repositoryFullName}`;
  const withoutGit = sanitized.replace(/\.git$/, '');
  if (!withoutGit.endsWith(expectedSuffix)) {
    throw new Error('Post-clone origin mismatch');
  }
  installGitCredentialEnvironment(token);
}
