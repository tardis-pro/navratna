# knowledge-graph — @uaip/shared-services/knowledge-graph

Knowledge ingestion, embedding, sync, and retrieval pipeline. 30+ services covering the full lifecycle from chat parsing → concept extraction → vector embedding → Neo4j relationships → Qdrant storage → RAG retrieval.

## SERVICE MAP

| Service                            | Purpose                                                       |
| ---------------------------------- | ------------------------------------------------------------- |
| `knowledge-graph.service.ts`       | Core Neo4j operations — node CRUD, relationship management    |
| `knowledge-sync.service.ts`        | Bidirectional PG↔Neo4j↔Qdrant sync (UUID-consistent)          |
| `simplified-sync.service.ts`       | Lightweight sync path for real-time operations                |
| `reconciliation.service.ts`        | Detects and repairs UUID mismatches across the 3 stores       |
| `bootstrap.service.ts`             | `KnowledgeBootstrapService` — runs post-seed sync on startup  |
| `embedding.service.ts`             | Generates vector embeddings (1024-dim default)                |
| `tei-embedding.service.ts`         | TEI (Text Embedding Inference) endpoint client                |
| `smart-embedding.service.ts`       | Embedding with caching + dedup                                |
| `enhanced-rag.service.ts`          | RAG pipeline — retrieval + generation with metadata filtering |
| `chat-ingestion.middleware.ts`     | Entry middleware for chat import requests                     |
| `chat-parser.service.ts`           | Parses Claude/ChatGPT/WhatsApp/generic conversation formats   |
| `chat-knowledge-extractor.ts`      | Extracts structured knowledge from parsed chats               |
| `concept-extractor.service.ts`     | Extracts concepts/entities from text                          |
| `content-classifier.service.ts`    | Classifies content into knowledge types                       |
| `relationship-detector.service.ts` | Detects semantic relationships between concepts               |
| `expertise-analyzer.service.ts`    | Analyzes participant expertise from conversations             |
| `learning-detector.service.ts`     | Identifies learning moments in conversation transcripts       |
| `workflow-extractor.service.ts`    | Extracts workflows/procedures from conversations              |
| `qa-generator.service.ts`          | Generates Q&A pairs for knowledge items                       |
| `knowledge-clustering.service.ts`  | Groups related knowledge items (K-means on embeddings)        |
| `ontology-builder.service.ts`      | Builds domain ontology from extracted concepts                |
| `taxonomy-generator.service.ts`    | Generates hierarchical taxonomy from knowledge graph          |
| `batch-processor.service.ts`       | Batch processing for large ingestion jobs                     |
| `production-hardening.service.ts`  | Circuit breakers, retries, health checks for prod             |
| `qdrant-health.service.ts`         | Qdrant collection health monitoring                           |
| `knowledge-ingestion.port.ts`      | Port interface (hexagonal arch) for ingestion adapters        |

## WHERE TO LOOK

| Task                            | Location                                                 |
| ------------------------------- | -------------------------------------------------------- |
| Import chat from Claude/ChatGPT | `chat-parser.service.ts` → `chat-knowledge-extractor.ts` |
| Sync item across all 3 stores   | `knowledge-sync.service.ts` `syncItem(item)`             |
| Verify sync consistency         | `reconciliation.service.ts`                              |
| Generate + store embeddings     | `embedding.service.ts` or `tei-embedding.service.ts`     |
| RAG query with knowledge base   | `enhanced-rag.service.ts`                                |
| Post-startup sync               | `bootstrap.service.ts` `runPostSeedSync()`               |

## KEY PATTERNS

**UUID consistency** — every knowledge item has the same UUID across PG, Neo4j, and Qdrant. Never create a new UUID for an existing item; always look it up first.

**Verify sync**:

```typescript
const status = await bootstrapService.verifyItemSync(itemId);
// { postgres: true, neo4j: true, qdrant: true, allSynced: true }
```

**Embedding dimensions**: 1024-dim default. TEI service on env var `TEI_ENDPOINT`. If unavailable, `embedding.service.ts` falls back gracefully.

**Qdrant collection names**: `knowledge_items` (main), `agent_memory` (episodic). Never hardcode — read from config.

## ANTI-PATTERNS

- Creating duplicate knowledge items with different UUIDs — always check all 3 stores first
- Calling `tei-embedding.service.ts` directly in hot paths — use `smart-embedding.service.ts` (cached)
- Manual Neo4j writes bypassing `knowledge-sync.service.ts` — breaks UUID consistency
- Blocking the event loop on large batch operations — use `batch-processor.service.ts`
