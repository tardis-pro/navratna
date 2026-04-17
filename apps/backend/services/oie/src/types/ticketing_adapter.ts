import type { BaseAdapter } from './base_adapter.js';

export interface TicketRef {
  id: string;
  key: string;
  url: string;
}

export interface CreateIssueParams {
  projectKey: string;
  summary: string;
  description: string;
  issueType: 'Bug' | 'Task' | 'Incident';
  priority: 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest';
  labels?: string[];
  assignee?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateIssueParams {
  summary?: string;
  description?: string;
  priority?: 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest';
  labels?: string[];
  comment?: string;
}

export interface SearchIssuesParams {
  jql: string;
  maxResults?: number;
  fields?: string[];
}

export interface CreatedIssue {
  ref: TicketRef;
  status: string;
  assignee?: string;
  created: Date;
}

export interface TicketingAdapter extends BaseAdapter {
  createIssue(params: CreateIssueParams): Promise<CreatedIssue>;
  updateIssue(ref: TicketRef, update: UpdateIssueParams): Promise<void>;
  transitionIssue(ref: TicketRef, targetStatus: string): Promise<void>;
  searchIssues(params: SearchIssuesParams): Promise<CreatedIssue[]>;
  addComment(ref: TicketRef, body: string): Promise<void>;
}
