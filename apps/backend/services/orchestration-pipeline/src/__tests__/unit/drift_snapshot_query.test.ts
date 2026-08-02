import { describe, it, expect, vi, beforeEach } from 'vitest';

interface RecordedPredicate {
  op: string;
  column: unknown;
  value: unknown;
}

const predicates: RecordedPredicate[] = [];
const insertedValues: Record<string, unknown>[] = [];
const selectRows: Record<string, unknown>[] = [];

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  eq: (column: unknown, value: unknown) => {
    predicates.push({ op: 'eq', column, value });
    return { op: 'eq', column, value };
  },
  and: (...parts: unknown[]) => ({ op: 'and', parts }),
  ilike: (column: unknown, value: unknown) => {
    predicates.push({ op: 'ilike', column, value });
    return { op: 'ilike', column, value };
  },
  arrayContains: (column: unknown, value: unknown) => {
    predicates.push({ op: 'arrayContains', column, value });
    return { op: 'arrayContains', column, value };
  },
}));

vi.mock('@uaip/shared-services', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@uaip/shared-services');
  return {
    ...actual,
    getIntelligenceDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve(selectRows) }),
        }),
      }),
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedValues.push(row);
          return Promise.resolve(undefined);
        },
      }),
    }),
  };
});

describe('DriftDetectionService snapshot round-trip', () => {
  beforeEach(() => {
    predicates.length = 0;
    insertedValues.length = 0;
    selectRows.length = 0;
  });

  it('reads snapshots using the same marker it writes them with', async () => {
    const { DriftDetectionService } = await import('../../services/drift_detection_service.js');
    const service = new DriftDetectionService({
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
    } as never);

    const save = Reflect.get(service, 'saveSnapshot') as (
      repoSource: string,
      snapshot: unknown
    ) => Promise<void>;
    await save.call(service, 'repo-a', { files: [], todos: new Set(), fileSizes: new Map(), symbols: [] });

    expect(insertedValues).toHaveLength(1);
    const written = insertedValues[0];
    const writtenTags = (written.tags as string[]) ?? [];
    const writtenType = String(written.type);

    predicates.length = 0;
    const load = Reflect.get(service, 'loadPreviousSnapshot') as (
      repoSource: string
    ) => Promise<unknown>;
    await load.call(service, 'repo-a');

    const markerPredicate = predicates.find(
      (p) => p.op === 'ilike' || p.op === 'arrayContains'
    );
    expect(markerPredicate).toBeDefined();

    const readMarker = markerPredicate?.value;
    const { knowledgeItems } = await import('@uaip/shared-services');
    const queriedTypeColumn = markerPredicate?.column === knowledgeItems.type;
    const queriedTagsColumn = markerPredicate?.column === knowledgeItems.tags;

    // The read must interrogate the SAME column the write populated. Querying the
    // tag marker against the type column is the defect under test.
    const typeLookupIsCorrect = queriedTypeColumn && String(readMarker) === writtenType;
    const tagLookupIsCorrect =
      queriedTagsColumn &&
      (Array.isArray(readMarker)
        ? readMarker.every((tag) => writtenTags.includes(String(tag)))
        : writtenTags.includes(String(readMarker)));

    expect(typeLookupIsCorrect || tagLookupIsCorrect).toBe(true);
  });
});
