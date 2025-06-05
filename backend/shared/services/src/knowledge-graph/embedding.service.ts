import { ContextRequest } from '@uaip/types';

export class EmbeddingService {
  private openaiApiKey: string;
  private embeddingModel: string;

  constructor(openaiApiKey?: string, embeddingModel: string = 'text-embedding-ada-002') {
    this.openaiApiKey = openaiApiKey || process.env.OPENAI_API_KEY || '';
    this.embeddingModel = embeddingModel;
    
    if (!this.openaiApiKey) {
      console.warn('OPENAI_API_KEY not found in environment variables');
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          model: this.embeddingModel
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  async generateEmbeddings(content: string): Promise<number[][]> {
    // Split content into chunks for large texts
    const chunks = this.splitIntoChunks(content);
    const embeddings: number[][] = [];

    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  async generateContextEmbedding(context: ContextRequest): Promise<number[]> {
    // Create a contextual text representation
    const contextText = this.buildContextText(context);
    return this.generateEmbedding(contextText);
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // OpenAI supports batch embeddings
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts,
          model: this.embeddingModel
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data.map((item: any) => item.embedding);
    } catch (error) {
      console.error('Batch embedding generation error:', error);
      // Fallback to individual embeddings
      const embeddings: number[][] = [];
      for (const text of texts) {
        const embedding = await this.generateEmbedding(text);
        embeddings.push(embedding);
      }
      return embeddings;
    }
  }

  private splitIntoChunks(content: string, maxChunkSize: number = 8000): string[] {
    if (content.length <= maxChunkSize) {
      return [content];
    }

    const chunks: string[] = [];
    const sentences = content.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          // Single sentence is too long, split by words
          const words = sentence.split(' ');
          let wordChunk = '';
          for (const word of words) {
            if ((wordChunk + ' ' + word).length > maxChunkSize) {
              if (wordChunk) {
                chunks.push(wordChunk.trim());
                wordChunk = word;
              } else {
                // Single word is too long, truncate
                chunks.push(word.substring(0, maxChunkSize));
              }
            } else {
              wordChunk += (wordChunk ? ' ' : '') + word;
            }
          }
          if (wordChunk) {
            currentChunk = wordChunk;
          }
        }
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  private buildContextText(context: ContextRequest): string {
    const parts: string[] = [];

    if (context.discussionHistory?.length) {
      const recentMessages = context.discussionHistory.slice(-5);
      parts.push(`Recent discussion: ${recentMessages.map(m => m.content || m.message || '').join(' ')}`);
    }

    if (context.relevantTags?.length) {
      parts.push(`Topics: ${context.relevantTags.join(', ')}`);
    }

    if (context.participantExpertise?.length) {
      parts.push(`Expertise areas: ${context.participantExpertise.join(', ')}`);
    }

    if (context.userPreferences) {
      const prefs = Object.entries(context.userPreferences)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      parts.push(`Preferences: ${prefs}`);
    }

    return parts.join('. ') || 'General context';
  }

  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return similarity;
  }
} 