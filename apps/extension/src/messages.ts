export const API_BASE = 'https://api.navratna.tardis.digital';
export const APP_ORIGIN = 'https://navratna.tardis.digital';

export interface PageContext {
  id?: string;
  title?: string;
  content?: string;
  type?: string;
}

export interface Agent {
  id: string;
  name: string;
}

export type BgRequest =
  | { type: 'AUTH_STATUS' }
  | { type: 'LIST_AGENTS' }
  | { type: 'CHAT'; agentId: string; message: string; context?: PageContext }
  | { type: 'OPEN_LOGIN' };

export interface AuthStatusResult {
  authenticated: boolean;
}

export interface ListAgentsResult {
  agents: Agent[];
  error?: string;
}

export interface ChatResult {
  reply?: string;
  error?: string;
}

export type BgResponse = AuthStatusResult | ListAgentsResult | ChatResult | { ok: true };
