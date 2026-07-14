// exec-node-coding — in-process session registry.
// Manages live CodingSession instances, SSE subscriber sets, and replay buffers.
// Manifest persistence is handled by each CodingSession independently.

import { logger } from '@uaip/utils';
import type { CodingSession } from './coding_session.js';

export class SessionRegistry {
  private readonly sessions = new Map<string, CodingSession>();

  add(session: CodingSession): void {
    this.sessions.set(session.id, session);
    logger.info('exec-node-coding: session registered', { sessionId: session.id });
  }

  get(id: string): CodingSession | undefined {
    return this.sessions.get(id);
  }

  delete(id: string): void {
    this.sessions.delete(id);
    logger.info('exec-node-coding: session removed from registry', { sessionId: id });
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  count(): number {
    return this.sessions.size;
  }

  ids(): string[] {
    return Array.from(this.sessions.keys());
  }
}
