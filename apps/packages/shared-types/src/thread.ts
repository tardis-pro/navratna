// Thread — canonical home-surface chat/thread model for the Navratna redesign.
//
// Thread is the "home surface" object that the redesigned UI renders for every
// ongoing conversation: agent chat, group multi-agent discussions, WhatsApp
// threads, planning sessions, and project/task/doc-anchored contexts. A Thread
// maps 1:1 to a `discussions` row in intelligence_schema (status='active',
// turnStrategy={type:'free_form'}) — field naming is intentionally compatible
// so a future adapter is trivial.

export interface Thread {
  id: string;
  participants: ThreadParticipant[];
  subject?: ThreadSubject;
  messages: ThreadMessage[];
  state: ThreadState;
  presence: ThreadPresence;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
  metadata?: Record<string, unknown>;
}

// A Thread has at least one agent and optionally one or more humans/groups.
// `type` is the discriminant — narrow on it before reading other fields.
export type ThreadParticipant =
  | ThreadAgentParticipant
  | ThreadHumanParticipant
  | ThreadGroupParticipant;

export interface ThreadAgentParticipant {
  type: 'agent';
  agentId: string;
  name: string;
  avatar?: string;
  role?: string;
}

export interface ThreadHumanParticipant {
  type: 'human';
  contactId: string;
  name: string;
  phone?: string;
  transport: 'whatsapp' | 'direct';
  lastSeenAt?: string; // ISO-8601
}

export interface ThreadGroupParticipant {
  type: 'group';
  memberIds: string[];
  name?: string;
}

// A message in a Thread. `authorType` is the canonical discriminator between
// the three sender classes surfaced in the home surface.
export interface ThreadMessage {
  id: string;
  threadId: string;
  authorId: string;
  authorType: 'user' | 'agent' | 'human';
  content: string;
  attachments?: ThreadAttachment[];
  contextRefs?: ThreadSubject[];
  createdAt: string; // ISO-8601
  streaming?: boolean;
  metadata?: Record<string, unknown>;
}

// What a Thread is *about*. Threads can be anchored to a project/task/doc,
// or be free-form "planning" sessions without a specific entity.
export type ThreadSubject =
  | ThreadSubjectProject
  | ThreadSubjectTask
  | ThreadSubjectDoc
  | ThreadSubjectPlanning;

export interface ThreadSubjectProject {
  type: 'project';
  projectId: string;
  name: string;
}

export interface ThreadSubjectTask {
  type: 'task';
  taskId: string;
  name: string;
  projectId?: string;
}

export interface ThreadSubjectDoc {
  type: 'doc';
  knowledgeItemId: string;
  title: string;
}

export interface ThreadSubjectPlanning {
  type: 'planning';
}

// Top-level UI state for the Thread surface. Drives empty/loading/active
// chrome, error toasts, and offline/transport-down banners.
export enum ThreadState {
  EMPTY = 'empty',
  LOADING = 'loading',
  ACTIVE = 'active',
  ERROR = 'error',
  OFFLINE = 'offline',
  WA_DISCONNECTED = 'wa_disconnected',
}

// Sub-state of the live Thread — drives the breathing/urgent microexpressions
// on the home surface. Independent of ThreadState (state is structural,
// presence is rhythm).
export enum ThreadPresence {
  RESTING = 'resting',
  BREATHING = 'breathing',
  AWAITING = 'awaiting',
  URGENT = 'urgent',
}

// Attachment on a ThreadMessage. `uploadStatus` is client-side progress —
// 'pending' and 'uploading' are in-flight, 'done' is persisted, 'error' is failed.
export interface ThreadAttachment {
  id: string;
  type: 'image' | 'file' | 'doc';
  name: string;
  size: number;
  mimeType: string;
  thumbnailUrl?: string;
  uploadStatus: 'pending' | 'uploading' | 'done' | 'error';
}

// What kind of companion pane (right rail) the home surface should mount
// alongside this Thread. `none` means no companion — chat only.
export enum ThreadCompanionKind {
  NONE = 'none',
  CODE = 'code',
  MERMAID = 'mermaid',
  DIAGRAM = 'diagram',
  DOC = 'doc',
  PROJECT = 'project',
  TASK = 'task',
}
