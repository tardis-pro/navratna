import { createHash } from 'node:crypto';
import type { CodingReceipt } from '@uaip/types';

export type ExtractedTestEvent =
  | { type: 'test_run_start'; payload: { runner: string; fileCount?: number } }
  | { type: 'test_case_result'; payload: { name: string; file: string; status: 'pass' | 'fail' | 'skip'; durationMs: number; error?: string } }
  | { type: 'test_run_end'; payload: { passed: number; failed: number; skipped: number; durationMs: number; success: boolean } };

export type ReceiptExtraction = {
  receipt: CodingReceipt | null;
  testEvents: ExtractedTestEvent[];
};

const MAX_PATH_LENGTH = 1_024;
const MAX_TEXT_LENGTH = 512;
const MAX_DIFF_LENGTH = 8_192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, maxLength)
    : null;
}

function finiteNonnegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function aliasedValue(record: Record<string, unknown>, first: string, second: string): unknown | null {
  const hasFirst = first in record;
  const hasSecond = second in record;
  if (hasFirst === hasSecond) return null;
  return hasFirst ? record[first] : record[second];
}

function toolName(raw: Record<string, unknown>): string | null {
  const direct = boundedString(raw['toolName'], 128);
  const nestedTool = raw['tool'];
  const nested = isRecord(nestedTool) ? boundedString(nestedTool['name'], 128) : null;
  if (direct !== null && nested !== null) return direct === nested ? direct : null;
  return direct ?? nested;
}

function safeUrl(value: unknown): string | null {
  const text = boundedString(value, 2_048);
  if (text === null) return null;
  try {
    const parsed = new URL(text);
    if (parsed.username || parsed.password) return null;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function commandFingerprint(command: string): string {
  return `sha256:${createHash('sha256').update(command).digest('hex').slice(0, 24)}`;
}

function unifiedDiff(path: string, oldText: string, newText: string): {
  patch: string;
  added: number;
  removed: number;
} {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;

  const removedLines = oldLines.slice(prefix, oldLines.length - suffix);
  const addedLines = newLines.slice(prefix, newLines.length - suffix);
  const header = `--- a/${path}\n+++ b/${path}\n@@ -${prefix + 1},${removedLines.length} +${prefix + 1},${addedLines.length} @@\n`;
  const body = [
    ...removedLines.map((line) => `-${line}`),
    ...addedLines.map((line) => `+${line}`),
  ].join('\n');
  const patch = `${header}${body}`;
  return {
    patch: patch.length <= MAX_DIFF_LENGTH ? patch : `${patch.slice(0, MAX_DIFF_LENGTH - 20)}\n[diff truncated]`,
    added: addedLines.length,
    removed: removedLines.length,
  };
}

function extractFileRead(input: Record<string, unknown>, result: Record<string, unknown>): CodingReceipt | null {
  const path = boundedString(input['path'] ?? input['filePath'], MAX_PATH_LENGTH);
  if (path === null) return null;
  const lineCountValue = result['lineCount'];
  const lineCount = lineCountValue === undefined ? undefined : integer(lineCountValue);
  if (lineCount === null || (lineCount !== undefined && lineCount < 0)) return null;
  return { kind: 'file_read', path, lineCount };
}

function extractFileWrite(input: Record<string, unknown>): CodingReceipt | null {
  const path = boundedString(input['path'] ?? input['filePath'], MAX_PATH_LENGTH);
  const oldText = input['oldString'] ?? input['oldText'] ?? input['oldContent'];
  const newText = input['newString'] ?? input['newText'] ?? input['newContent'];
  if (path === null || typeof oldText !== 'string' || typeof newText !== 'string') return null;
  const diff = unifiedDiff(path, oldText, newText);
  return { kind: 'file_write', path, diffPatch: diff.patch, added: diff.added, removed: diff.removed };
}

function extractShell(input: Record<string, unknown>, result: Record<string, unknown>): CodingReceipt | null {
  const command = boundedString(input['command'] ?? input['cmd'], 64 * 1_024);
  const exitCode = integer(result['exitCode'] ?? result['code']);
  const durationMs = finiteNonnegative(result['durationMs'] ?? result['duration']);
  if (command === null || exitCode === null || durationMs === null) return null;
  return { kind: 'shell_run', command: commandFingerprint(command), exitCode, stdoutTail: '', durationMs };
}

function extractCommit(input: Record<string, unknown>, result: Record<string, unknown>): CodingReceipt | null {
  const sha = boundedString(result['sha'] ?? result['commitSha'], 128);
  const message = boundedString(input['message'] ?? result['message'], MAX_TEXT_LENGTH);
  const branch = boundedString(result['branch'] ?? input['branch'], 256);
  if (sha === null || message === null || branch === null) return null;
  return { kind: 'git_commit', sha, message, branch };
}

function extractPr(input: Record<string, unknown>, result: Record<string, unknown>): CodingReceipt | null {
  const number = integer(result['number'] ?? result['prNumber']);
  const url = safeUrl(result['url'] ?? result['htmlUrl']);
  const title = boundedString(input['title'] ?? result['title'], MAX_TEXT_LENGTH);
  const draft = result['draft'] ?? input['draft'];
  if (number === null || number <= 0 || url === null || title === null || typeof draft !== 'boolean') return null;
  return { kind: 'pr_opened', number, url, title, draft };
}

function extractStructuredTests(value: unknown): ExtractedTestEvent[] {
  if (!isRecord(value)) return [];
  const runner = boundedString(value['runner'], 128);
  const cases = value['cases'];
  const summary = value['summary'];
  const durationMs = finiteNonnegative(value['durationMs']);
  if (runner === null || !Array.isArray(cases) || !isRecord(summary) || durationMs === null) return [];

  const fileCountRaw = value['fileCount'];
  const fileCount = fileCountRaw === undefined ? undefined : integer(fileCountRaw);
  if (fileCount === null || (fileCount !== undefined && fileCount < 0)) return [];

  const caseEvents: ExtractedTestEvent[] = [];
  for (const testCase of cases) {
    if (!isRecord(testCase)) return [];
    const name = boundedString(testCase['name'], MAX_TEXT_LENGTH);
    const file = boundedString(testCase['file'], MAX_PATH_LENGTH);
    const status = testCase['status'];
    const caseDuration = finiteNonnegative(testCase['durationMs']);
    const errorRaw = testCase['error'];
    const error = errorRaw === undefined ? undefined : boundedString(errorRaw, 2_048);
    if (
      name === null || file === null ||
      (status !== 'pass' && status !== 'fail' && status !== 'skip') ||
      caseDuration === null || error === null
    ) return [];
    caseEvents.push({
      type: 'test_case_result',
      payload: { name, file, status, durationMs: caseDuration, error },
    });
  }

  const passed = integer(summary['passed']);
  const failed = integer(summary['failed']);
  const skipped = integer(summary['skipped']);
  const success = summary['success'];
  if (
    passed === null || passed < 0 || failed === null || failed < 0 || skipped === null || skipped < 0 ||
    typeof success !== 'boolean'
  ) return [];

  return [
    { type: 'test_run_start', payload: { runner, fileCount } },
    ...caseEvents,
    { type: 'test_run_end', payload: { passed, failed, skipped, durationMs, success } },
  ];
}

export function extractToolReceipt(raw: unknown): ReceiptExtraction | null {
  if (!isRecord(raw)) return null;
  const name = toolName(raw);
  const inputValue = aliasedValue(raw, 'input', 'args');
  const resultValue = aliasedValue(raw, 'result', 'output');
  if (name === null || !isRecord(inputValue) || !isRecord(resultValue)) return null;

  const normalized = name.toLowerCase().replaceAll('-', '_');
  let receipt: CodingReceipt | null = null;
  if (normalized === 'file_read' || normalized === 'read') receipt = extractFileRead(inputValue, resultValue);
  else if (normalized === 'file_write' || normalized === 'write' || normalized === 'edit') receipt = extractFileWrite(inputValue);
  else if (normalized === 'shell_run' || normalized === 'bash' || normalized === 'shell') receipt = extractShell(inputValue, resultValue);
  else if (normalized === 'git_commit') receipt = extractCommit(inputValue, resultValue);
  else if (normalized === 'pr_opened' || normalized === 'pr_open' || normalized === 'github_pr_create') receipt = extractPr(inputValue, resultValue);

  const testPayload = resultValue['testRun'] ?? resultValue['testResult'];
  const testEvents = normalized === 'test_run' || normalized === 'run_tests'
    ? extractStructuredTests(testPayload)
    : [];
  if (receipt === null && testEvents.length === 0) return null;
  return { receipt, testEvents };
}

export function extractKnownTestEvent(raw: unknown): ExtractedTestEvent | null {
  if (!isRecord(raw) || typeof raw['type'] !== 'string' || !isRecord(raw['payload'])) return null;
  const payload = raw['payload'];
  if (raw['type'] === 'test_run_start') {
    const runner = boundedString(payload['runner'], 128);
    const fileCountRaw = payload['fileCount'];
    const fileCount = fileCountRaw === undefined ? undefined : integer(fileCountRaw);
    return runner !== null && fileCount !== null && (fileCount === undefined || fileCount >= 0)
      ? { type: 'test_run_start', payload: { runner, fileCount } }
      : null;
  }
  if (raw['type'] === 'test_case_result') {
    const name = boundedString(payload['name'], MAX_TEXT_LENGTH);
    const file = boundedString(payload['file'], MAX_PATH_LENGTH);
    const status = payload['status'];
    const durationMs = finiteNonnegative(payload['durationMs']);
    const errorRaw = payload['error'];
    const error = errorRaw === undefined ? undefined : boundedString(errorRaw, 2_048);
    return name !== null && file !== null && (status === 'pass' || status === 'fail' || status === 'skip') && durationMs !== null && error !== null
      ? { type: 'test_case_result', payload: { name, file, status, durationMs, error } }
      : null;
  }
  if (raw['type'] === 'test_run_end') {
    const passed = integer(payload['passed']);
    const failed = integer(payload['failed']);
    const skipped = integer(payload['skipped']);
    const durationMs = finiteNonnegative(payload['durationMs']);
    const success = payload['success'];
    return passed !== null && passed >= 0 && failed !== null && failed >= 0 && skipped !== null && skipped >= 0 && durationMs !== null && typeof success === 'boolean'
      ? { type: 'test_run_end', payload: { passed, failed, skipped, durationMs, success } }
      : null;
  }
  return null;
}
