import { KnowledgeClassification, KnowledgeType } from '@uaip/types';

export class ContentClassifier {
  private readonly procedureKeywords = [
    'step', 'process', 'procedure', 'method', 'algorithm', 'workflow', 'instruction',
    'guide', 'tutorial', 'how to', 'implementation', 'setup', 'configuration'
  ];

  private readonly conceptualKeywords = [
    'concept', 'theory', 'principle', 'definition', 'explanation', 'understanding',
    'framework', 'model', 'architecture', 'design pattern', 'best practice'
  ];

  private readonly experientialKeywords = [
    'experience', 'lesson', 'learned', 'outcome', 'result', 'success', 'failure',
    'mistake', 'insight', 'observation', 'case study', 'example'
  ];

  private readonly episodicKeywords = [
    'episode', 'event', 'interaction', 'discussion', 'meeting', 'conversation',
    'session', 'encounter', 'incident', 'occurrence'
  ];

  private readonly semanticKeywords = [
    'meaning', 'definition', 'relationship', 'connection', 'association',
    'category', 'classification', 'taxonomy', 'ontology'
  ];

  async classify(content: string): Promise<KnowledgeClassification> {
    const lowercaseContent = content.toLowerCase();
    
    // Determine knowledge type
    const type = this.determineKnowledgeType(lowercaseContent);
    
    // Extract topics and entities
    const topics = this.extractTopics(content);
    const entities = this.extractEntities(content);
    
    // Generate tags based on content analysis
    const tags = this.generateTags(content, type, topics, entities);
    
    // Calculate confidence based on keyword matches and content structure
    const confidence = this.calculateConfidence(lowercaseContent, type);

    return {
      type,
      tags,
      confidence,
      topics,
      entities
    };
  }

  private determineKnowledgeType(content: string): KnowledgeType {
    const scores = {
      [KnowledgeType.PROCEDURAL]: this.calculateKeywordScore(content, this.procedureKeywords),
      [KnowledgeType.CONCEPTUAL]: this.calculateKeywordScore(content, this.conceptualKeywords),
      [KnowledgeType.EXPERIENTIAL]: this.calculateKeywordScore(content, this.experientialKeywords),
      [KnowledgeType.EPISODIC]: this.calculateKeywordScore(content, this.episodicKeywords),
      [KnowledgeType.SEMANTIC]: this.calculateKeywordScore(content, this.semanticKeywords),
      [KnowledgeType.FACTUAL]: 0.5 // Default baseline
    };

    // Additional heuristics
    if (this.containsCodeOrCommands(content)) {
      scores[KnowledgeType.PROCEDURAL] += 0.3;
    }

    if (this.containsPersonalPronouns(content)) {
      scores[KnowledgeType.EXPERIENTIAL] += 0.2;
      scores[KnowledgeType.EPISODIC] += 0.2;
    }

    if (this.containsTimeReferences(content)) {
      scores[KnowledgeType.EPISODIC] += 0.3;
    }

    if (this.containsDefinitions(content)) {
      scores[KnowledgeType.CONCEPTUAL] += 0.3;
      scores[KnowledgeType.SEMANTIC] += 0.2;
    }

    // Return the type with the highest score
    return Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b)[0] as KnowledgeType;
  }

  private calculateKeywordScore(content: string, keywords: string[]): number {
    let score = 0;
    const words = content.split(/\s+/);
    const totalWords = words.length;

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches) {
        score += matches.length / totalWords;
      }
    }

    return Math.min(score, 1.0);
  }

  private containsCodeOrCommands(content: string): boolean {
    const codePatterns = [
      /```[\s\S]*?```/g, // Code blocks
      /`[^`]+`/g, // Inline code
      /\$\s+\w+/g, // Shell commands
      /function\s+\w+/g, // Function definitions
      /class\s+\w+/g, // Class definitions
      /import\s+/g, // Import statements
      /export\s+/g, // Export statements
    ];

    return codePatterns.some(pattern => pattern.test(content));
  }

  private containsPersonalPronouns(content: string): boolean {
    const pronouns = ['i', 'we', 'my', 'our', 'me', 'us'];
    const words = content.toLowerCase().split(/\s+/);
    return pronouns.some(pronoun => words.includes(pronoun));
  }

  private containsTimeReferences(content: string): boolean {
    const timePatterns = [
      /\b(yesterday|today|tomorrow|last week|next week|ago|recently|previously)\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, // Dates
      /\b\d{1,2}:\d{2}\b/g, // Times
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi
    ];

    return timePatterns.some(pattern => pattern.test(content));
  }

  private containsDefinitions(content: string): boolean {
    const definitionPatterns = [
      /\bis\s+(a|an|the)\s+/gi,
      /\bmeans\s+/gi,
      /\brefers\s+to\s+/gi,
      /\bdefined\s+as\s+/gi,
      /\bknown\s+as\s+/gi
    ];

    return definitionPatterns.some(pattern => pattern.test(content));
  }

  private extractTopics(content: string): string[] {
    const topics: string[] = [];
    
    // Extract capitalized words (potential topics)
    const capitalizedWords = content.match(/\b[A-Z][a-z]+\b/g) || [];
    
    // Extract technical terms (words with specific patterns)
    const technicalTerms = content.match(/\b[a-z]+[A-Z][a-z]*\b/g) || []; // camelCase
    
    // Extract quoted terms
    const quotedTerms = content.match(/"([^"]+)"/g) || [];
    
    // Combine and deduplicate
    const allTerms = [
      ...capitalizedWords,
      ...technicalTerms,
      ...quotedTerms.map(term => term.replace(/"/g, ''))
    ];

    // Filter and clean topics
    const uniqueTerms = [...new Set(allTerms)]
      .filter(term => term.length > 2 && term.length < 50)
      .slice(0, 10); // Limit to top 10 topics

    return uniqueTerms;
  }

  private extractEntities(content: string): string[] {
    const entities: string[] = [];
    
    // Extract URLs
    const urls = content.match(/https?:\/\/[^\s]+/g) || [];
    entities.push(...urls.map(url => `url:${url}`));
    
    // Extract file paths
    const filePaths = content.match(/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_\/-]+\.[a-zA-Z0-9]+/g) || [];
    entities.push(...filePaths.map(path => `file:${path}`));
    
    // Extract email addresses
    const emails = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    entities.push(...emails.map(email => `email:${email}`));
    
    // Extract version numbers
    const versions = content.match(/v?\d+\.\d+(\.\d+)?/g) || [];
    entities.push(...versions.map(version => `version:${version}`));

    return entities.slice(0, 20); // Limit entities
  }

  private generateTags(content: string, type: KnowledgeType, topics: string[], entities: string[]): string[] {
    const tags: string[] = [];
    
    // Add type-based tags
    tags.push(type.toLowerCase());
    
    // Add domain-specific tags based on content
    if (this.containsCodeOrCommands(content)) {
      tags.push('code', 'technical', 'programming');
    }
    
    if (content.toLowerCase().includes('api')) {
      tags.push('api', 'integration');
    }
    
    if (content.toLowerCase().includes('database')) {
      tags.push('database', 'data');
    }
    
    if (content.toLowerCase().includes('security')) {
      tags.push('security', 'authentication');
    }
    
    if (content.toLowerCase().includes('test')) {
      tags.push('testing', 'quality-assurance');
    }
    
    // Add topic-based tags (first 5 topics as tags)
    tags.push(...topics.slice(0, 5).map(topic => topic.toLowerCase()));
    
    // Add length-based tags
    if (content.length > 5000) {
      tags.push('detailed', 'comprehensive');
    } else if (content.length < 500) {
      tags.push('brief', 'summary');
    }
    
    // Remove duplicates and return
    return [...new Set(tags)].slice(0, 15); // Limit to 15 tags
  }

  private calculateConfidence(content: string, type: KnowledgeType): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on content quality indicators
    if (content.length > 100) confidence += 0.1;
    if (content.length > 500) confidence += 0.1;
    
    // Well-structured content
    if (content.includes('\n') || content.includes('.')) confidence += 0.1;
    
    // Contains specific keywords for the determined type
    const typeKeywords = this.getKeywordsForType(type);
    const keywordScore = this.calculateKeywordScore(content, typeKeywords);
    confidence += keywordScore * 0.3;
    
    // Penalize very short or very long content
    if (content.length < 50) confidence -= 0.2;
    if (content.length > 10000) confidence -= 0.1;
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private getKeywordsForType(type: KnowledgeType): string[] {
    switch (type) {
      case KnowledgeType.PROCEDURAL:
        return this.procedureKeywords;
      case KnowledgeType.CONCEPTUAL:
        return this.conceptualKeywords;
      case KnowledgeType.EXPERIENTIAL:
        return this.experientialKeywords;
      case KnowledgeType.EPISODIC:
        return this.episodicKeywords;
      case KnowledgeType.SEMANTIC:
        return this.semanticKeywords;
      default:
        return [];
    }
  }
} 