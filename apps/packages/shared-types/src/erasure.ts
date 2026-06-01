/**
 * GDPR Erasure types — used by UserErasureService and erasure_outbox/erasure_ledger schema.
 */

export type ErasureStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ErasureSurface =
  | 'pg_control'
  | 'pg_intelligence'
  | 'neo4j'
  | 'qdrant'
  | 'redis';

export const ERASURE_SURFACES: ErasureSurface[] = [
  'pg_control',
  'pg_intelligence',
  'neo4j',
  'qdrant',
  'redis',
];

export type ErasureStoreResult = {
  surface: ErasureSurface;
  deletedCount: number;
  success: boolean;
  error?: string;
};

export type ErasureResult = {
  erasureId: string;
  userId: string;
  status: ErasureStatus;
  storesCompleted: Partial<Record<ErasureSurface, boolean>>;
  storeResults: ErasureStoreResult[];
  certificateHash?: string;
  completedAt?: Date;
  error?: string;
};
