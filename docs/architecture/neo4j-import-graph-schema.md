# Neo4j Import Graph Schema

Maintained by: `ImportGraphService` in `apps/backend/services/navratna-core/src/services/import_graph_service.ts`

## Purpose

Models file-level import dependencies for a repository so that downstream consumers can traverse the transitive dependency graph, detect circular imports, and identify blast radii when a file changes.

---

## Nodes

### `:File`

Represents a single source file (or external module) in a repository.

| Property   | Type     | Nullable | Description                                                                                     |
|------------|----------|----------|-------------------------------------------------------------------------------------------------|
| `path`     | `string` | No       | File path relative to `repoRoot` (e.g. `src/services/agent.ts`) or external module name        |
| `repoRoot` | `string` | No       | Absolute path of the repository root on the ingestion host (e.g. `/home/runner/repos/navratna`) |

**Indexes**

```cypher
CREATE INDEX file_path_repo_idx IF NOT EXISTS
FOR (f:File)
ON (f.path, f.repoRoot);

CREATE INDEX file_path_idx IF NOT EXISTS
FOR (f:File)
ON (f.path);
```

---

## Relationships

### `:IMPORTS`

Directed edge from a source file to the file (or external module) it imports.

| Property    | Type         | Nullable | Description                                                |
|-------------|--------------|----------|------------------------------------------------------------|
| `symbols`   | `string[]`   | No       | Named symbols imported (empty array for side-effect-only imports) |
| `updatedAt` | `datetime()` | No       | ISO timestamp of the last ingestion run that touched this edge |

**Cardinality**: Each `(from)-[:IMPORTS]->(to)` pair has at most one relationship; multiple import statements between the same two files are merged into a single edge with a merged symbol list.

---

## Write Pattern — MERGE (Idempotent)

```cypher
UNWIND $edges AS edge
MERGE (from:File {path: edge.from, repoRoot: $repoRoot})
MERGE (to:File   {path: edge.to,   repoRoot: $repoRoot})
MERGE (from)-[r:IMPORTS]->(to)
SET r.symbols = edge.symbols,
    r.updatedAt = datetime()
```

Parameters:

| Parameter  | Type                                          | Description           |
|------------|-----------------------------------------------|-----------------------|
| `$edges`   | `Array<{ from: string, to: string, symbols: string[] }>` | Batch of edges to upsert |
| `$repoRoot`| `string`                                      | Repository root path  |

**Batch size**: writes are chunked into at most **500 edges per transaction** to avoid Neo4j transaction memory pressure.

---

## Delete Pattern — Stale Import Cleanup

When a file is deleted or renamed, its outgoing `:IMPORTS` edges must be pruned.

```cypher
MATCH (from:File {repoRoot: $repoRoot})-[r:IMPORTS]->()
WHERE NOT from.path IN $currentFilePaths
DELETE r
```

Parameters:

| Parameter          | Type       | Description                                                 |
|--------------------|------------|-------------------------------------------------------------|
| `$repoRoot`        | `string`   | Repository root path to scope the cleanup                   |
| `$currentFilePaths`| `string[]` | Exhaustive list of file paths still present after re-ingestion |

---

## Retrieval Pattern — Import Graph Traversal

Returns the direct imports and transitive closure up to `$depth` hops.

```cypher
MATCH (root:File {path: $path, repoRoot: $repoRoot})-[r:IMPORTS*1..$depth]->(dep:File)
RETURN dep.path AS importedPath,
       dep.repoRoot AS repoRoot,
       [rel IN r | rel.symbols] AS symbolChain
```

Parameters:

| Parameter   | Type      | Description                                  |
|-------------|-----------|----------------------------------------------|
| `$path`     | `string`  | Starting file path                           |
| `$repoRoot` | `string`  | Repository root path                         |
| `$depth`    | `integer` | Maximum traversal depth (default: `3`)       |

---

## Example Graph

```
src/index.ts
  ──[:IMPORTS {symbols: ['AgentService'], updatedAt: …}]──►  src/services/agent.ts
  ──[:IMPORTS {symbols: ['logger'],        updatedAt: …}]──►  @uaip/utils           (external)

src/services/agent.ts
  ──[:IMPORTS {symbols: ['db'],            updatedAt: …}]──►  src/database/index.ts
  ──[:IMPORTS {symbols: ['Agent'],         updatedAt: …}]──►  @uaip/types           (external)

src/database/index.ts
  ──[:IMPORTS {symbols: ['drizzle'],       updatedAt: …}]──►  drizzle-orm           (external)
```

---

## Operational Notes

- External module imports (npm packages, workspace aliases like `@uaip/utils`) are stored as `:File` nodes with the package name as `path`. They can be identified by the absence of a `./` or `/` prefix in the original import source.
- Re-running ingestion is safe — `MERGE` is idempotent; only `symbols` and `updatedAt` are overwritten.
- The `importGraphService.deleteStaleImports()` call should be made **before** `buildGraph()` on a re-ingestion to avoid accumulating ghost edges for deleted files.
- The `code_symbols` Qdrant collection (768-dim) that stores AST symbols is a sibling concern — see `SemanticIndexService` for that schema.
