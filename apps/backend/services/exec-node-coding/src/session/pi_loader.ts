import * as path from 'node:path';
import type { AgentSessionEventListener } from '@mariozechner/pi-coding-agent';

export interface PiAgentSession {
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  abortBash(): void;
  isBashRunning?: boolean;
  subscribe(listener: AgentSessionEventListener): () => void;
}

export interface PiSessionPair {
  session: PiAgentSession;
  getSessionFile(): string | undefined;
}

export interface PiLoaderOptions {
  cwd: string;
  sessionDir: string;
  workspaceRoot: string;
  credentials: Array<{ provider: string; type: 'api_key' | 'oauth'; apiKey?: string; accessToken?: string }>;
  continueSessionFile?: string;
  systemPromptAdditions?: string;
}

export type PiLoader = (options: PiLoaderOptions) => Promise<PiSessionPair>;

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function validateSafeId(value: string, fieldName: string): void {
  if (!SAFE_ID_RE.test(value)) {
    throw new Error(`Invalid ${fieldName}: must match [a-zA-Z0-9_-]{1,128}, got "${value}"`);
  }
}

export function validateWorkspacePath(workspacePath: string, workspaceRoot: string): void {
  const resolved = path.resolve(workspacePath);
  const resolvedRoot = path.resolve(workspaceRoot);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error(`workspacePath "${workspacePath}" is outside WORKSPACE_ROOT "${workspaceRoot}"`);
  }
}

export function validateContinueSessionFile(file: string, sessionDir: string): void {
  const resolved = path.resolve(file);
  const resolvedDir = path.resolve(sessionDir);
  if (!resolved.startsWith(resolvedDir + path.sep)) {
    throw new Error(`continueSessionFile "${file}" is outside sessionDir "${sessionDir}"`);
  }
}

export async function realPiLoader(options: PiLoaderOptions): Promise<PiSessionPair> {
  const pi = await import('@mariozechner/pi-coding-agent').catch((err: unknown) => {
    throw new Error(
      `@mariozechner/pi-coding-agent is not installed: ${err instanceof Error ? err.message : String(err)}`
    );
  });

  const authStorage = pi.AuthStorage.inMemory();
  for (const cred of options.credentials) {
    if (cred.type === 'api_key' && cred.apiKey) {
      authStorage.setRuntimeApiKey(cred.provider, cred.apiKey);
    }
    if (cred.type === 'oauth' && cred.accessToken) {
      authStorage.setRuntimeApiKey(cred.provider, cred.accessToken);
    }
  }

  if (options.continueSessionFile) {
    validateContinueSessionFile(options.continueSessionFile, options.sessionDir);
  }

  const sessionManager = options.continueSessionFile
    ? pi.SessionManager.open(options.continueSessionFile, options.sessionDir)
    : pi.SessionManager.create(options.cwd, options.sessionDir);

  const systemPromptAdditions = options.systemPromptAdditions;
  const appendSystemPromptOverride = systemPromptAdditions
    ? (base: string[]) => [...base, systemPromptAdditions]
    : undefined;

  const resourceLoader = new pi.DefaultResourceLoader({
    cwd: options.cwd,
    appendSystemPromptOverride,
  });
  await resourceLoader.reload();

  const { session } = await pi.createAgentSession({
    cwd: options.cwd,
    authStorage,
    sessionManager,
    resourceLoader,
  });

  return {
    session,
    getSessionFile() { return sessionManager.getSessionFile(); },
  };
}
