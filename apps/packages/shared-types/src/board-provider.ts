/**
 * The canonical status vocabulary for board items AND for `tasks.status`.
 *
 * Three different vocabularies were being written into the single
 * `tasks.status` varchar column:
 *   TaskService         todo | in_progress | in_review | blocked | completed | cancelled
 *   InternalBoardAdapter backlog | in-progress | in-review | done | blocked | needs-triage
 *   the column default   pending          (matching neither)
 * Reads therefore depended on which writer had touched the row last.
 *
 * This set wins because four board adapters (internal, github, jira, linear)
 * already conform to it, and because it has 'needs-triage', which escalation
 * needs and the TaskService vocabulary cannot express. `toStoryStatus` maps the
 * legacy values so existing rows keep working.
 */
export type StoryStatus =
  | 'backlog'
  | 'in-progress'
  | 'in-review'
  | 'done'
  | 'blocked'
  | 'needs-triage';

export const STORY_STATUSES: readonly StoryStatus[] = [
  'backlog',
  'in-progress',
  'in-review',
  'done',
  'blocked',
  'needs-triage',
] as const;

export function isStoryStatus(value: unknown): value is StoryStatus {
  return typeof value === 'string' && (STORY_STATUSES as readonly string[]).includes(value);
}

/**
 * Every legacy spelling that has been written into `tasks.status`, mapped onto
 * the canonical value. Kept exhaustive rather than clever: an unrecognised value
 * must be a deliberate decision, not a regex accident.
 */
const LEGACY_STATUS_ALIASES: Record<string, StoryStatus> = {
  // TaskService vocabulary
  todo: 'backlog',
  in_progress: 'in-progress',
  in_review: 'in-review',
  completed: 'done',
  cancelled: 'done',
  // the old column default, which no writer ever produced
  pending: 'backlog',
  // defensive: underscore/hyphen drift seen in both directions
  'needs_triage': 'needs-triage',
  inprogress: 'in-progress',
};

/**
 * Normalises any stored status to the canonical vocabulary.
 *
 * Returns null for something it does not recognise, so callers choose between a
 * default and an error rather than silently getting 'backlog' for a typo.
 */
export function toStoryStatus(value: unknown): StoryStatus | null {
  if (isStoryStatus(value)) return value;
  if (typeof value !== 'string') return null;
  return LEGACY_STATUS_ALIASES[value.trim().toLowerCase()] ?? null;
}

/**
 * Allowed status transitions. `tasks.status` is a free-form PUT today, so any
 * value can replace any other — including reopening a 'done' task into
 * 'in-review', or moving 'backlog' straight to 'done' without work.
 *
 * 'blocked' and 'needs-triage' are reachable from anywhere: a task can be
 * discovered blocked or mis-filed at any point.
 */
export const STORY_STATUS_TRANSITIONS: Record<StoryStatus, readonly StoryStatus[]> = {
  backlog: ['in-progress', 'blocked', 'needs-triage'],
  'in-progress': ['in-review', 'done', 'backlog', 'blocked', 'needs-triage'],
  'in-review': ['done', 'in-progress', 'blocked', 'needs-triage'],
  blocked: ['backlog', 'in-progress', 'in-review', 'needs-triage'],
  'needs-triage': ['backlog', 'in-progress', 'blocked'],
  // Terminal apart from an explicit reopen back into the working states.
  done: ['in-progress', 'needs-triage'],
};

export function canTransitionStoryStatus(from: StoryStatus, to: StoryStatus): boolean {
  if (from === to) return true;
  return STORY_STATUS_TRANSITIONS[from].includes(to);
}

export interface BoardItem {
  id: string;
  title: string;
  description?: string;
  status: StoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BoardConfig {
  type: 'internal' | 'github' | 'jira' | 'linear';
  credentials?: Record<string, unknown>;
}

export interface BoardProject extends BoardItem {
  repoUrl?: string;
  boardConfig?: BoardConfig;
}

export interface BoardEpic extends BoardItem {
  projectId: string;
  priority?: string;
  dueDate?: string;
}

export interface BoardStory extends BoardItem {
  epicId: string;
  assignee?: string;
  prUrl?: string;
  storyPoints?: number;
  labels?: string[];
}

export interface EpicSpec {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
}

export interface StorySpec {
  title: string;
  description?: string;
  assignee?: string;
  storyPoints?: number;
  labels?: string[];
}

export interface BoardProvider {
  createProject(name: string, config?: Partial<BoardProject>): Promise<BoardProject>;
  createEpic(projectId: string, spec: EpicSpec): Promise<BoardEpic>;
  createStory(epicId: string, spec: StorySpec): Promise<BoardStory>;
  updateStatus(itemId: string, status: StoryStatus): Promise<void>;
  linkPR(storyId: string, prUrl: string): Promise<void>;
  getBacklog(projectId: string): Promise<BoardStory[]>;
}
