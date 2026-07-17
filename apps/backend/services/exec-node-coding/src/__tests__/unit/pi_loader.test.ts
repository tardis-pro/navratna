import { describe, it, expect, vi } from 'vitest';
import { validateSafeId, validateWorkspacePath, validateContinueSessionFile } from '../../session/pi_loader.js';

describe('validateSafeId', () => {
  it('accepts valid alphanumeric-dash-underscore ids', () => {
    expect(() => validateSafeId('abc-123_DEF', 'sessionId')).not.toThrow();
    expect(() => validateSafeId('a', 'sessionId')).not.toThrow();
  });

  it('rejects path traversal', () => {
    expect(() => validateSafeId('../evil', 'sessionId')).toThrow('Invalid sessionId');
    expect(() => validateSafeId('a/b', 'sessionId')).toThrow('Invalid sessionId');
    expect(() => validateSafeId('a b', 'sessionId')).toThrow('Invalid sessionId');
  });

  it('rejects empty string', () => {
    expect(() => validateSafeId('', 'sessionId')).toThrow('Invalid sessionId');
  });

  it('rejects strings longer than 128 chars', () => {
    expect(() => validateSafeId('a'.repeat(129), 'sessionId')).toThrow('Invalid sessionId');
  });
});

describe('validateWorkspacePath', () => {
  it('accepts path within workspaceRoot', () => {
    expect(() => validateWorkspacePath('/workspace/proj', '/workspace')).not.toThrow();
    expect(() => validateWorkspacePath('/workspace', '/workspace')).not.toThrow();
  });

  it('rejects path outside workspaceRoot', () => {
    expect(() => validateWorkspacePath('/etc', '/workspace')).toThrow('outside WORKSPACE_ROOT');
    expect(() => validateWorkspacePath('/workspace/../etc', '/workspace')).toThrow('outside WORKSPACE_ROOT');
  });
});

describe('validateContinueSessionFile', () => {
  it('accepts file inside sessionDir', () => {
    expect(() =>
      validateContinueSessionFile('/sessions/ws-1/abc.jsonl', '/sessions/ws-1')
    ).not.toThrow();
  });

  it('rejects file outside sessionDir', () => {
    expect(() =>
      validateContinueSessionFile('/etc/passwd', '/sessions')
    ).toThrow('outside sessionDir');

    expect(() =>
      validateContinueSessionFile('/sessions/../etc/passwd', '/sessions')
    ).toThrow('outside sessionDir');
  });
});

describe('PiLoaderOptions — systemPromptAdditions', () => {
  it('passes systemPromptAdditions through to the loader options', async () => {
    const capturedOptions: import('../../session/pi_loader.js').PiLoaderOptions[] = [];
    const fakeLoader = async (opts: import('../../session/pi_loader.js').PiLoaderOptions) => {
      capturedOptions.push(opts);
      return {
        session: {
          prompt: async () => {},
          abort: async () => {},
          abortBash: () => {},
          subscribe: () => () => {},
        },
        getSessionFile: () => undefined,
      };
    };

    await fakeLoader({
      cwd: '/workspace/proj',
      sessionDir: '/sessions/ws-1',
      workspaceRoot: '/workspace',
      credentials: [],
      systemPromptAdditions: 'You are a coding assistant.',
    });

    expect(capturedOptions[0]?.systemPromptAdditions).toBe('You are a coding assistant.');
  });

  it('does not include systemPromptAdditions in any captured log output', () => {
    const PROMPT = 'super-secret-prompt-content';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const opts = {
      cwd: '/workspace',
      sessionDir: '/sessions',
      workspaceRoot: '/workspace',
      credentials: [],
      systemPromptAdditions: PROMPT,
    };
    const raw = JSON.stringify(opts);
    expect(raw).toContain(PROMPT);

    const allCalls = [...warnSpy.mock.calls, ...infoSpy.mock.calls];
    const logsStr = JSON.stringify(allCalls);
    expect(logsStr).not.toContain(PROMPT);

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
