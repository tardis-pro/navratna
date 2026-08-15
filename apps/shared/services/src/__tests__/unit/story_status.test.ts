import { describe, it, expect } from 'vitest';
import {
  STORY_STATUSES,
  STORY_STATUS_TRANSITIONS,
  canTransitionStoryStatus,
  isStoryStatus,
  toStoryStatus,
  type StoryStatus,
} from '@uaip/types';

/**
 * The bug these cover: `tasks.status` is one varchar column that three different
 * writers filled with three different vocabularies (TaskService,
 * InternalBoardAdapter, ProjectTaskToolService), on top of a column default of
 * 'pending' that no writer produced. What a row meant depended on who wrote it
 * last, and a status filter could only ever match one writer's rows.
 */
describe('StoryStatus normalisation', () => {
  it('accepts every canonical value unchanged', () => {
    for (const status of STORY_STATUSES) {
      expect(isStoryStatus(status)).toBe(true);
      expect(toStoryStatus(status)).toBe(status);
    }
  });

  it("maps TaskService's vocabulary", () => {
    expect(toStoryStatus('todo')).toBe('backlog');
    expect(toStoryStatus('in_progress')).toBe('in-progress');
    expect(toStoryStatus('in_review')).toBe('in-review');
    expect(toStoryStatus('completed')).toBe('done');
    expect(toStoryStatus('cancelled')).toBe('done');
    expect(toStoryStatus('blocked')).toBe('blocked');
  });

  it("maps the MCP tool surface's vocabulary", () => {
    expect(toStoryStatus('pending')).toBe('backlog');
    expect(toStoryStatus('in_progress')).toBe('in-progress');
  });

  it('maps the old column default that no writer ever produced', () => {
    expect(toStoryStatus('pending')).toBe('backlog');
  });

  it('returns null for something it does not recognise rather than defaulting', () => {
    expect(toStoryStatus('wibble')).toBeNull();
    expect(toStoryStatus('')).toBeNull();
    expect(toStoryStatus(undefined)).toBeNull();
    expect(toStoryStatus(null)).toBeNull();
    expect(toStoryStatus(7)).toBeNull();
  });

  it('is case- and whitespace-tolerant on legacy values', () => {
    expect(toStoryStatus('  IN_PROGRESS ')).toBe('in-progress');
  });
});

describe('StoryStatus transitions', () => {
  it('allows a no-op transition', () => {
    for (const status of STORY_STATUSES) {
      expect(canTransitionStoryStatus(status, status)).toBe(true);
    }
  });

  it('refuses backlog straight to done', () => {
    expect(canTransitionStoryStatus('backlog', 'done')).toBe(false);
  });

  it('allows the normal working path', () => {
    expect(canTransitionStoryStatus('backlog', 'in-progress')).toBe(true);
    expect(canTransitionStoryStatus('in-progress', 'in-review')).toBe(true);
    expect(canTransitionStoryStatus('in-review', 'done')).toBe(true);
  });

  it('allows an explicit reopen out of done, but not straight back to review', () => {
    expect(canTransitionStoryStatus('done', 'in-progress')).toBe(true);
    expect(canTransitionStoryStatus('done', 'in-review')).toBe(false);
    expect(canTransitionStoryStatus('done', 'backlog')).toBe(false);
  });

  it('lets anything become blocked or needs-triage except from terminal-ish states', () => {
    for (const from of ['backlog', 'in-progress', 'in-review'] as StoryStatus[]) {
      expect(canTransitionStoryStatus(from, 'blocked')).toBe(true);
      expect(canTransitionStoryStatus(from, 'needs-triage')).toBe(true);
    }
  });

  it('lets a blocked task resume', () => {
    expect(canTransitionStoryStatus('blocked', 'in-progress')).toBe(true);
    expect(canTransitionStoryStatus('blocked', 'backlog')).toBe(true);
  });

  it('declares a transition table for every canonical status', () => {
    for (const status of STORY_STATUSES) {
      expect(STORY_STATUS_TRANSITIONS[status]).toBeDefined();
      // Every target must itself be canonical — a typo here would silently
      // create an unreachable state.
      for (const target of STORY_STATUS_TRANSITIONS[status]) {
        expect(isStoryStatus(target)).toBe(true);
      }
    }
  });
});
