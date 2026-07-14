// exec-node-coding — bounded in-process SSE replay buffer.
// Holds the last N events (default 200) per session.
// Used to replay missed events to reconnecting clients via Last-Event-ID.

import type { CodingSessionEvent } from '@uaip/types';

export interface ReplayEntry {
  id: string;
  seq: number;
  event: CodingSessionEvent;
}

export class ReplayBuffer {
  private readonly entries: ReplayEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  push(entry: ReplayEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  /**
   * Return all entries with seq > afterSeq (exclusive).
   * Returns empty array when afterSeq is undefined (fresh subscriber).
   */
  since(afterSeq: number): ReplayEntry[] {
    return this.entries.filter((e) => e.seq > afterSeq);
  }

  all(): ReplayEntry[] {
    return [...this.entries];
  }

  lastSeq(): number {
    return this.entries.length > 0
      ? (this.entries[this.entries.length - 1]?.seq ?? 0)
      : 0;
  }
}
