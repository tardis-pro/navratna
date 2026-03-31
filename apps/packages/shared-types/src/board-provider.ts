export type StoryStatus =
  | 'backlog'
  | 'in-progress'
  | 'in-review'
  | 'done'
  | 'blocked'
  | 'needs-triage';

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
