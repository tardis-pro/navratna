# TEI (Text Embeddings Inference) Integration

This directory contains the integration of Hugging Face's Text Embeddings Inference (TEI) services into the Council of Nycea monorepo, replacing the OpenAI-based embedding service with self-hosted, high-performance embedding and reranking services.

## 🎯 Overview

**What's New:**
- **Self-hosted embeddings**: No more OpenAI API dependencies for embeddings
- **Reranking capabilities**: Improved search relevance with dedicated reranking models
- **GPU acceleration**: Optimized for NVIDIA GPUs with fallback to CPU
- **Cost reduction**: Eliminate per-token embedding costs
- **Enhanced privacy**: All data stays local

**Services Added:**
- `tei-embeddings`: GPU-accelerated embedding service (BAAI/bge-large-en-v1.5)
- `tei-reranker`: GPU-accelerated reranking service (BAAI/bge-reranker-base)
- `tei-embeddings-cpu`: CPU-only embedding service for development/testing

## 🚀 Quick Start

### 1. GPU Setup (Recommended for Production)

```bash
# Start with GPU services
COMPOSE_PROFILES=gpu docker compose up -d tei-embeddings tei-reranker

# Wait for services to be ready (models need to download first time)
docker compose logs -f tei-embeddings
docker compose logs -f tei-reranker
```

### 2. CPU-Only Setup (Development/Testing)

```bash
# Start CPU-only service
COMPOSE_PROFILES=cpu-only docker compose up -d tei-embeddings-cpu

# Check logs
docker compose logs -f tei-embeddings-cpu
```

### 3. Verify Services

```bash
# Test embedding service (GPU)
curl -X POST http://localhost:8080/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs": "Hello, world!"}'

# Test reranking service (GPU)
curl -X POST http://localhost:8081/rerank \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning", "texts": ["AI and ML", "cooking recipes"]}'

# Test CPU embedding service
curl -X POST http://localhost:8082/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs": "Hello, world!"}'
```

## 📋 Service Details

### TEI Embeddings (GPU)
- **Model**: BAAI/bge-large-en-v1.5 (384 dimensions)
- **Port**: 8080 (HTTP), 9080 (Metrics)
- **Performance**: ~2-5x faster than OpenAI API
- **Batch size**: Up to 32 inputs per request
- **Max tokens**: 16,384 per batch

### TEI Reranker (GPU)
- **Model**: BAAI/bge-reranker-base
- **Port**: 8081 (HTTP), 9081 (Metrics)
- **Use case**: Improve search relevance by reranking results
- **Batch size**: Up to 256 query-document pairs
- **Max tokens**: 8,192 per batch

### TEI Embeddings CPU (Development)
- **Model**: sentence-transformers/all-mpnet-base-v2
- **Port**: 8082 (HTTP), 9082 (Metrics)
- **Use case**: Development/testing without GPU requirements

## 🔧 Configuration

### Environment Variables

The services are automatically configured via Docker Compose, but you can customize:

```bash
# In your application services
TEI_EMBEDDING_URL=http://tei-embeddings:80
TEI_RERANKER_URL=http://tei-reranker:80
TEI_EMBEDDING_CPU_URL=http://tei-embeddings-cpu:80
```

### Model Configuration

To use different models, modify the `command` in `docker-compose.yml`:

```yaml
# Example: Use a different embedding model
command: --model-id intfloat/multilingual-e5-large-instruct --port 80 --auto-truncate
```

## 💻 Usage in Code

### Basic Embedding Service

```typescript
import { TEIEmbeddingService } from '@uaip/shared-services';

const embeddingService = new TEIEmbeddingService();

// Generate single embedding
const embedding = await embeddingService.generateEmbedding("Hello, world!");

// Generate batch embeddings
const embeddings = await embeddingService.generateBatchEmbeddings([
  "First document",
  "Second document"
]);

// Rerank documents
const results = await embeddingService.rerank(
  "machine learning query",
  ["AI document", "cooking document", "ML paper"]
);
```

### Enhanced RAG Service

```typescript
import { EnhancedRAGService, ServiceFactory } from '@uaip/shared-services';

const ragService = await ServiceFactory.getEnhancedRAGService();

// Semantic search with reranking
const searchResults = await ragService.semanticSearch("machine learning", {
  topK: 10,
  useReranking: true,
  minScore: 0.7
});

// Index new documents
await ragService.indexDocuments([
  {
    id: "doc1",
    content: "Machine learning is a subset of AI...",
    metadata: { category: "AI", author: "John Doe" }
  }
]);
```

## 🔍 Monitoring & Health Checks

### Health Endpoints

```bash
# Check service health
curl http://localhost:8080/health  # GPU embedding
curl http://localhost:8081/health  # GPU reranker
curl http://localhost:8082/health  # CPU embedding
```

### Metrics (Prometheus)

```bash
# View metrics
curl http://localhost:9080/metrics  # GPU embedding metrics
curl http://localhost:9081/metrics  # GPU reranker metrics
curl http://localhost:9082/metrics  # CPU embedding metrics
```

### API Documentation

```bash
# View interactive API docs
open http://localhost:8080/docs  # GPU embedding docs
open http://localhost:8081/docs  # GPU reranker docs
open http://localhost:8082/docs  # CPU embedding docs
```

## 🐛 Troubleshooting

### Common Issues

1. **GPU not detected**
   ```bash
   # Check NVIDIA Docker runtime
   docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
   
   # If fails, install NVIDIA Container Toolkit
   # https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html
   ```

2. **Models not downloading**
   ```bash
   # Check logs for download progress
   docker compose logs tei-embeddings
   
   # Models are cached in volumes, first startup takes longer
   ```

3. **Out of memory**
   ```bash
   # Reduce batch sizes in docker-compose.yml
   command: --model-id BAAI/bge-large-en-v1.5 --max-batch-tokens 8192 --max-concurrent-requests 256
   ```

4. **Service not responding**
   ```bash
   # Check service status
   docker compose ps
   
   # View detailed logs
   docker compose logs -f tei-embeddings
   ```

### Performance Tuning

1. **Batch Size Optimization**
   - Increase `--max-batch-tokens` for more throughput
   - Decrease for lower memory usage

2. **Concurrent Requests**
   - Adjust `--max-concurrent-requests` based on your load

3. **Model Selection**
   - Use smaller models for faster inference
   - Use larger models for better accuracy

## 🔄 Migration from OpenAI

### Automatic Fallback

The new TEI services are automatically used when available. The system falls back to OpenAI if TEI services are unavailable.

### Manual Migration

1. **Update Service Factory** (already done)
   ```typescript
   // Old
   const embeddingService = await ServiceFactory.getEmbeddingService();
   
   // New
   const teiService = await ServiceFactory.getTEIEmbeddingService();
   const ragService = await ServiceFactory.getEnhancedRAGService();
   ```

2. **Environment Variables**
   ```bash
   # Remove or comment out
   # OPENAI_API_KEY=...
   
   # TEI is configured automatically via Docker Compose
   ```

## 📊 Performance Comparison

| Metric | OpenAI API | TEI (GPU) | TEI (CPU) |
|--------|------------|-----------|-----------|
| Latency | 200-500ms | 10-50ms | 100-300ms |
| Throughput | Limited by API | High | Medium |
| Cost | $0.0001/1K tokens | $0 (after setup) | $0 (after setup) |
| Privacy | External | Local | Local |
| Offline | ❌ | ✅ | ✅ |

## 🛠 Advanced Configuration

### Custom Models

```yaml
# Use your own fine-tuned model
tei-embeddings:
  command: --model-id your-org/your-model --port 80 --auto-truncate
  environment:
    - HF_TOKEN=your_huggingface_token  # For private models
```

### Scaling

```yaml
# Multiple instances for load balancing
tei-embeddings-1:
  # ... same config
  ports:
    - "8080:80"

tei-embeddings-2:
  # ... same config  
  ports:
    - "8083:80"
```

### Production Deployment

```yaml
# Production optimizations
tei-embeddings:
  deploy:
    resources:
      limits:
        memory: 8G
      reservations:
        memory: 4G
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
  restart: always
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

## 📚 Additional Resources

- [TEI Documentation](https://huggingface.github.io/text-embeddings-inference/)
- [BAAI BGE Models](https://huggingface.co/BAAI)
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
- [Sentence Transformers](https://www.sbert.net/)

## 🤝 Contributing

When adding new embedding features:

1. Update the `TEIEmbeddingService` class
2. Add tests for new functionality
3. Update this documentation
4. Consider backward compatibility with OpenAI service 