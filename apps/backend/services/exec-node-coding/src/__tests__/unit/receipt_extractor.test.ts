import { describe, it, expect } from 'vitest';
import { extractToolReceipt, extractKnownTestEvent } from '../../session/receipt_extractor.js';

describe('receipt_extractor — file_read', () => {
  it('extracts file_read receipt with alias input/result', () => {
    const result = extractToolReceipt({
      type: 'tool_execution_end',
      toolName: 'file_read',
      input: { path: '/workspace/src/app.ts' },
      result: { lineCount: 42 },
    });
    expect(result?.receipt).toEqual({ kind: 'file_read', path: '/workspace/src/app.ts', lineCount: 42 });
  });

  it('extracts file_read with filePath alias and no lineCount', () => {
    const result = extractToolReceipt({
      toolName: 'read',
      args: { filePath: '/workspace/index.ts' },
      output: {},
    });
    expect(result?.receipt).toEqual({ kind: 'file_read', path: '/workspace/index.ts', lineCount: undefined });
  });

  it('rejects file_read with no path', () => {
    const result = extractToolReceipt({
      toolName: 'file_read',
      input: {},
      result: { lineCount: 10 },
    });
    expect(result).toBeNull();
  });

  it('rejects file_read with negative lineCount', () => {
    const result = extractToolReceipt({
      toolName: 'file_read',
      input: { path: '/workspace/a.ts' },
      result: { lineCount: -1 },
    });
    expect(result).toBeNull();
  });
});

describe('receipt_extractor — file_write', () => {
  it('extracts file_write with bounded unified diff', () => {
    const result = extractToolReceipt({
      toolName: 'file_write',
      input: { path: '/workspace/app.ts', oldString: 'const x = 1;', newString: 'const x = 2;' },
    });
    expect(result?.receipt?.kind).toBe('file_write');
    const receipt = result?.receipt;
    if (receipt?.kind !== 'file_write') return;
    expect(receipt.path).toBe('/workspace/app.ts');
    expect(receipt.added).toBe(1);
    expect(receipt.removed).toBe(1);
    expect(receipt.diffPatch).toContain('--- a//workspace/app.ts');
    expect(receipt.diffPatch).toContain('-const x = 1;');
    expect(receipt.diffPatch).toContain('+const x = 2;');
  });

  it('extracts file_write with alias names oldText/newText', () => {
    const result = extractToolReceipt({
      toolName: 'edit',
      args: { filePath: '/a.ts', oldText: 'hello', newText: 'world' },
    });
    expect(result?.receipt?.kind).toBe('file_write');
  });

  it('rejects file_write with missing oldText', () => {
    const result = extractToolReceipt({
      toolName: 'file_write',
      input: { path: '/a.ts', newString: 'only new' },
    });
    expect(result).toBeNull();
  });

  it('truncates huge diffs', () => {
    const huge = 'A'.repeat(20_000);
    const result = extractToolReceipt({
      toolName: 'file_write',
      input: { path: '/big.ts', oldString: 'old', newString: huge },
    });
    const receipt = result?.receipt;
    if (receipt?.kind !== 'file_write') return;
    expect(receipt.diffPatch.length).toBeLessThanOrEqual(8192);
    expect(receipt.diffPatch).toContain('[diff truncated]');
  });
});

describe('receipt_extractor — shell_run', () => {
  it('extracts shell_run with hashed command and no stdout', () => {
    const result = extractToolReceipt({
      toolName: 'shell_run',
      input: { command: 'npm test' },
      result: { exitCode: 0, durationMs: 1500 },
    });
    expect(result?.receipt).toEqual({
      kind: 'shell_run',
      command: expect.stringMatching(/^sha256:[0-9a-f]{24}$/),
      exitCode: 0,
      stdoutTail: '',
      durationMs: 1500,
    });
  });

  it('extracts shell_run with cmd alias', () => {
    const result = extractToolReceipt({
      toolName: 'bash',
      args: { cmd: 'ls -la' },
      output: { code: 1, duration: 200 },
    });
    expect(result?.receipt?.kind).toBe('shell_run');
    const receipt = result?.receipt;
    if (receipt?.kind !== 'shell_run') return;
    expect(receipt.exitCode).toBe(1);
    expect(receipt.stdoutTail).toBe('');
  });

  it('never includes stdout/stderr in receipt', () => {
    const result = extractToolReceipt({
      toolName: 'shell_run',
      input: { command: 'echo secret' },
      result: { exitCode: 0, durationMs: 100, stdout: 'sensitive output', stderr: 'error msg' },
    });
    const receipt = result?.receipt;
    if (receipt?.kind !== 'shell_run') return;
    expect(receipt.stdoutTail).toBe('');
    expect(JSON.stringify(receipt)).not.toContain('sensitive');
    expect(JSON.stringify(receipt)).not.toContain('error msg');
  });

  it('rejects shell_run with missing exitCode', () => {
    const result = extractToolReceipt({
      toolName: 'shell_run',
      input: { command: 'ls' },
      result: { durationMs: 100 },
    });
    expect(result).toBeNull();
  });
});

describe('receipt_extractor — git_commit', () => {
  it('extracts git_commit receipt', () => {
    const result = extractToolReceipt({
      toolName: 'git_commit',
      input: { message: 'fix bug' },
      result: { sha: 'abc123def456', branch: 'main' },
    });
    expect(result?.receipt).toEqual({ kind: 'git_commit', sha: 'abc123def456', message: 'fix bug', branch: 'main' });
  });

  it('rejects git_commit with missing sha', () => {
    const result = extractToolReceipt({
      toolName: 'git_commit',
      input: { message: 'msg' },
      result: { branch: 'main' },
    });
    expect(result).toBeNull();
  });
});

describe('receipt_extractor — pr_opened', () => {
  it('extracts pr_opened receipt', () => {
    const result = extractToolReceipt({
      toolName: 'pr_opened',
      input: { title: 'Fix bug', draft: false },
      result: { number: 42, url: 'https://github.com/owner/repo/pull/42' },
    });
    expect(result?.receipt).toEqual({
      kind: 'pr_opened',
      number: 42,
      url: 'https://github.com/owner/repo/pull/42',
      title: 'Fix bug',
      draft: false,
    });
  });

  it('rejects pr_opened with URL containing credentials', () => {
    const result = extractToolReceipt({
      toolName: 'pr_opened',
      input: { title: 'PR', draft: true },
      result: { number: 1, url: 'https://user:pass@github.com/owner/repo/pull/1' },
    });
    expect(result).toBeNull();
  });

  it('rejects pr_opened with non-boolean draft', () => {
    const result = extractToolReceipt({
      toolName: 'pr_opened',
      input: { title: 'PR', draft: 'yes' },
      result: { number: 1, url: 'https://github.com/o/r/pull/1' },
    });
    expect(result).toBeNull();
  });
});

describe('receipt_extractor — ambiguous/unsafe payloads', () => {
  it('returns null for non-object input', () => {
    expect(extractToolReceipt('not an object')).toBeNull();
    expect(extractToolReceipt(null)).toBeNull();
    expect(extractToolReceipt(42)).toBeNull();
  });

  it('returns null when toolName comes from both toolName and tool.name with mismatch', () => {
    const result = extractToolReceipt({
      toolName: 'file_read',
      tool: { name: 'file_write' },
      input: { path: '/a' },
      result: {},
    });
    expect(result).toBeNull();
  });

  it('returns null when both input and args are present', () => {
    const result = extractToolReceipt({
      toolName: 'file_read',
      input: { path: '/a' },
      args: { path: '/b' },
      result: {},
    });
    expect(result).toBeNull();
  });

  it('returns null for unknown tool name', () => {
    const result = extractToolReceipt({
      toolName: 'unknown_tool',
      input: {},
      result: {},
    });
    expect(result).toBeNull();
  });

  it('returns null when input is not a record', () => {
    const result = extractToolReceipt({
      toolName: 'file_read',
      input: 'not an object',
      result: {},
    });
    expect(result).toBeNull();
  });
});

describe('receipt_extractor — structured test events', () => {
  it('extracts structured test events from test_run tool payload', () => {
    const result = extractToolReceipt({
      toolName: 'run_tests',
      input: {},
      result: {},
      testRun: {
        runner: 'vitest',
        fileCount: 3,
        cases: [
          { name: 'test A', file: 'a.test.ts', status: 'pass', durationMs: 10 },
          { name: 'test B', file: 'b.test.ts', status: 'fail', durationMs: 20, error: 'assertion failed' },
        ],
        summary: { passed: 1, failed: 1, skipped: 0, success: false },
        durationMs: 100,
      },
    });
    expect(result?.testEvents).toHaveLength(4);
    expect(result?.testEvents[0]).toEqual({ type: 'test_run_start', payload: { runner: 'vitest', fileCount: 3 } });
    expect(result?.testEvents[1]?.type).toBe('test_case_result');
    expect(result?.testEvents[3]).toEqual({
      type: 'test_run_end',
      payload: { passed: 1, failed: 1, skipped: 0, durationMs: 100, success: false },
    });
  });

  it('does not parse test events from unknown tool', () => {
    const result = extractToolReceipt({
      toolName: 'shell_run',
      input: { command: 'npm test' },
      result: { exitCode: 0, durationMs: 100, testRun: { runner: 'vitest', cases: [], summary: {}, durationMs: 100 } },
    });
    expect(result?.testEvents).toHaveLength(0);
  });

  it('returns empty test events for incomplete test payload', () => {
    const result = extractToolReceipt({
      toolName: 'test_run',
      input: {},
      result: {},
      testResult: { runner: 'vitest', cases: [], summary: {}, durationMs: 0 },
    });
    expect(result?.testEvents).toHaveLength(0);
  });

  it('extractKnownTestEvent validates test_run_start', () => {
    const event = extractKnownTestEvent({ type: 'test_run_start', payload: { runner: 'vitest' } });
    expect(event).toEqual({ type: 'test_run_start', payload: { runner: 'vitest', fileCount: undefined } });
  });

  it('extractKnownTestEvent validates test_case_result', () => {
    const event = extractKnownTestEvent({
      type: 'test_case_result',
      payload: { name: 'test A', file: 'a.ts', status: 'pass', durationMs: 10 },
    });
    expect(event?.type).toBe('test_case_result');
  });

  it('extractKnownTestEvent validates test_run_end', () => {
    const event = extractKnownTestEvent({
      type: 'test_run_end',
      payload: { passed: 3, failed: 0, skipped: 1, durationMs: 100, success: true },
    });
    expect(event?.type).toBe('test_run_end');
  });

  it('extractKnownTestEvent returns null for invalid test event', () => {
    expect(extractKnownTestEvent({ type: 'test_run_start', payload: {} })).toBeNull();
    expect(extractKnownTestEvent({ type: 'unknown', payload: {} })).toBeNull();
    expect(extractKnownTestEvent(null)).toBeNull();
  });
});

describe('receipt_extractor — secret absence', () => {
  it('shell_run receipt never contains the raw command', () => {
    const SECRET = 'super-secret-token';
    const result = extractToolReceipt({
      toolName: 'shell_run',
      input: { command: `curl -H "Authorization: Bearer ${SECRET}" https://api.example.com` },
      result: { exitCode: 0, durationMs: 100 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET);
  });

  it('file_write receipt never contains old/new content beyond diff structure', () => {
    const SECRET = 'api-key-12345';
    const result = extractToolReceipt({
      toolName: 'file_write',
      input: { path: '/config.ts', oldString: `key = '${SECRET}'`, newString: `key = 'new-${SECRET}'` },
    });
    const receipt = result?.receipt;
    if (receipt?.kind !== 'file_write') return;
    expect(receipt.diffPatch).toContain(SECRET); // diff does contain content, but this is explicit old/new after redaction
    // The receipt does not store raw old/new separately
    expect(receipt).not.toHaveProperty('oldString');
    expect(receipt).not.toHaveProperty('newString');
  });
});