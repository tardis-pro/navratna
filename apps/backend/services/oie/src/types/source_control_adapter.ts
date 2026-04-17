import type { BaseAdapter } from './base_adapter.js';

export interface GetFileParams {
  repo: string;
  path: string;
  ref?: string;
}

export interface CreatePRParams {
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
  labels?: string[];
}

export interface GetCommitsParams {
  repo: string;
  since: Date;
  until?: Date;
  branch?: string;
  path?: string;
}

export interface GetDiffParams {
  repo: string;
  base: string;
  head: string;
}

export interface SourceFile {
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  size: number;
  sha: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  timestamp: Date;
  url: string;
  filesChanged?: string[];
}

export interface PullRequest {
  number: number;
  url: string;
  title: string;
  state: 'open' | 'closed' | 'merged';
  head: string;
  base: string;
  createdAt: Date;
  mergedAt?: Date;
}

export interface SourceControlAdapter extends BaseAdapter {
  getFile(params: GetFileParams): Promise<SourceFile>;
  createPR(params: CreatePRParams): Promise<PullRequest>;
  getCommitsSince(params: GetCommitsParams): Promise<Commit[]>;
  getDiff(params: GetDiffParams): Promise<string>;
  addPRComment(ref: PullRequest, comment: string): Promise<void>;
}
