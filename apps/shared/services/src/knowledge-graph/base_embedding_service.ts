import { ContextRequest } from '@uaip/types';

export abstract class BaseEmbeddingService {
  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  protected splitIntoChunks(content: string, maxChunkSize: number = 500): string[] {
    if (content.length <= maxChunkSize) {
      return [content];
    }

    const chunks: string[] = [];
    const sentences = content.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      if ((currentChunk + trimmedSentence).length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = trimmedSentence;
        } else {
          const words = trimmedSentence.split(' ');
          let wordChunk = '';
          for (const word of words) {
            if ((wordChunk + ' ' + word).length > maxChunkSize) {
              if (wordChunk) {
                chunks.push(wordChunk.trim());
                wordChunk = word;
              } else {
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
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  buildContextText(context: ContextRequest): string {
    const parts: string[] = [];

    if (context.userRequest) {
      parts.push(`User Request: ${context.userRequest}`);
    }

    if (context.currentContext) {
      parts.push(`Current Context: ${JSON.stringify(context.currentContext)}`);
    }

    if (context.conversationHistory && context.conversationHistory.length > 0) {
      parts.push('Conversation History:');
      context.conversationHistory.forEach((msg) => {
        if (msg && typeof msg === 'object' && 'role' in msg && 'content' in msg) {
          const role = (msg as { role?: unknown }).role;
          const content = (msg as { content?: unknown }).content;
          parts.push(`${String(role ?? 'unknown')}: ${String(content ?? '')}`);
        }
      });
    }

    if (context.agentCapabilities && context.agentCapabilities.length > 0) {
      parts.push(`Agent Capabilities: ${context.agentCapabilities.join(', ')}`);
    }

    return parts.join('\n');
  }
}
