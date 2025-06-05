interface VectorSearchOptions {
  limit: number;
  threshold: number;
  filters?: any;
}

interface VectorSearchResult {
  id: string;
  score: number;
  payload?: any;
}

export class QdrantService {
  private qdrantUrl: string;
  private collectionName: string;

  constructor(qdrantUrl: string = 'http://localhost:6333', collectionName: string = 'knowledge_embeddings') {
    this.qdrantUrl = qdrantUrl;
    this.collectionName = collectionName;
  }

  async search(queryEmbedding: number[], options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    try {
      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vector: queryEmbedding,
          limit: options.limit,
          score_threshold: options.threshold,
          filter: options.filters,
          with_payload: true
        })
      });

      if (!response.ok) {
        throw new Error(`Qdrant search failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.result.map((item: any) => ({
        id: item.id,
        score: item.score,
        payload: item.payload
      }));
    } catch (error) {
      console.error('Qdrant search error:', error);
      throw new Error(`Vector search failed: ${error.message}`);
    }
  }

  async store(knowledgeItemId: string, embeddings: number[][]): Promise<void> {
    try {
      const points = embeddings.map((embedding, index) => ({
        id: `${knowledgeItemId}_${index}`,
        vector: embedding,
        payload: {
          knowledge_item_id: knowledgeItemId,
          chunk_index: index,
          created_at: new Date().toISOString()
        }
      }));

      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: points
        })
      });

      if (!response.ok) {
        throw new Error(`Qdrant storage failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Qdrant storage error:', error);
      throw new Error(`Vector storage failed: ${error.message}`);
    }
  }

  async update(knowledgeItemId: string, embeddings: number[][]): Promise<void> {
    // Delete existing embeddings for this knowledge item
    await this.delete(knowledgeItemId);
    
    // Store new embeddings
    await this.store(knowledgeItemId, embeddings);
  }

  async delete(knowledgeItemId: string): Promise<void> {
    try {
      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            must: [
              {
                key: 'knowledge_item_id',
                match: {
                  value: knowledgeItemId
                }
              }
            ]
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Qdrant deletion failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Qdrant deletion error:', error);
      throw new Error(`Vector deletion failed: ${error.message}`);
    }
  }

  async ensureCollection(): Promise<void> {
    try {
      // Check if collection exists
      const checkResponse = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`);
      
      if (checkResponse.status === 404) {
        // Create collection
        const createResponse = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            vectors: {
              size: 1536, // OpenAI embedding size
              distance: 'Cosine'
            },
            optimizers_config: {
              default_segment_number: 2
            },
            replication_factor: 1
          })
        });

        if (!createResponse.ok) {
          throw new Error(`Failed to create Qdrant collection: ${createResponse.statusText}`);
        }

        console.log(`Created Qdrant collection: ${this.collectionName}`);
      }
    } catch (error) {
      console.error('Qdrant collection setup error:', error);
      throw new Error(`Failed to ensure Qdrant collection: ${error.message}`);
    }
  }

  async getCollectionInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get collection info: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('Qdrant collection info error:', error);
      throw new Error(`Failed to get collection info: ${error.message}`);
    }
  }
} 