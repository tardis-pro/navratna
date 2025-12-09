import { logger } from '@uaip/utils';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { ContentClassifier } from './content-classifier.service.js';
import { EmbeddingService } from './embedding.service.js';
import { ParsedConversation } from './chat-parser.service.js';
import { v4 as uuidv4 } from 'uuid';

export interface GeneratedQA {
  id: string;
  question: string;
  answer: string;
  source: string;
  sourceType: 'knowledge' | 'conversation' | 'hybrid';
  confidence: number;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  tags: string[];
  metadata: {
    generatedAt: Date;
    method: string;
    sourceIds: string[];
    reviewStatus: 'pending' | 'approved' | 'rejected';
    qualityScore: number;
  };
}

export interface QAGenerationOptions {
  maxPairs?: number;
  minConfidence?: number;
  categories?: string[];
  difficulty?: ('beginner' | 'intermediate' | 'advanced' | 'expert')[];
  includeMetaQuestions?: boolean;
  validateAnswers?: boolean;
  deduplicateQuestions?: boolean;
  enhanceWithContext?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
  qualityScore: number;
}

export interface CategorizedQA {
  beginner: GeneratedQA[];
  intermediate: GeneratedQA[];
  advanced: GeneratedQA[];
  expert: GeneratedQA[];
  total: number;
  averageConfidence: number;
}

export interface QAGenerationMetrics {
  totalGenerated: number;
  validated: number;
  rejected: number;
  averageConfidence: number;
  processingTime: number;
  categoryCounts: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  qualityDistribution: {
    high: number; // >= 0.8
    medium: number; // 0.6-0.8
    low: number; // < 0.6
  };
}

export class QAGeneratorService {
  private readonly questionPatterns = [
    // Direct question patterns
    /^(what|how|why|when|where|who|which)\s+(.+)\?$/gi,
    // Definition patterns
    /(.+?)\s+(?:is|are|means|refers to)\s+(.+)/gi,
    // Process patterns
    /(?:to|how to|in order to)\s+(.+?),?\s+(.+)/gi,
    // Comparison patterns
    /(.+?)\s+(?:vs|versus|compared to|differs from)\s+(.+)/gi,
    // Causal patterns
    /(.+?)\s+(?:because|due to|caused by|results in)\s+(.+)/gi,
  ];

  private readonly answerValidationPatterns = [
    // Complete sentence check
    /^[A-Z][^.!?]*[.!?]$/,
    // Has subject and verb
    /\b(?:is|are|was|were|has|have|can|will|would|should|could)\b/gi,
    // Minimum length check (at least 10 characters)
    /.{10,}/,
  ];

  private generationCache = new Map<string, GeneratedQA[]>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly contentClassifier: ContentClassifier,
    private readonly embeddingService: EmbeddingService
  ) {}

  /**
   * Generate Q&A pairs from existing knowledge items
   */
  async generateFromKnowledge(
    items: any[],
    options: QAGenerationOptions = {}
  ): Promise<GeneratedQA[]> {
    const startTime = Date.now();

    try {
      logger.info('Starting Q&A generation from knowledge', {
        itemCount: items.length,
        options,
      });

      // Apply filters
      const filteredItems = this.filterKnowledgeItems(items, options);

      if (filteredItems.length === 0) {
        logger.warn('No knowledge items match the criteria');
        return [];
      }

      // Generate Q&A pairs in batches
      const qaPairs: GeneratedQA[] = [];
      const batchSize = Math.min(this.BATCH_SIZE, filteredItems.length);

      for (let i = 0; i < filteredItems.length; i += batchSize) {
        const batch = filteredItems.slice(i, i + batchSize);
        const batchQA = await this.processBatch(batch, 'knowledge', options);
        qaPairs.push(...batchQA);

        // Apply max pairs limit if specified
        if (options.maxPairs && qaPairs.length >= options.maxPairs) {
          break;
        }
      }

      // Post-process Q&A pairs
      let processedQA = qaPairs;

      if (options.deduplicateQuestions !== false) {
        processedQA = await this.deduplicateQuestions(processedQA);
      }

      if (options.validateAnswers !== false) {
        processedQA = await this.validateAndEnhanceQA(processedQA);
      }

      // Apply confidence threshold
      if (options.minConfidence) {
        processedQA = processedQA.filter((qa) => qa.confidence >= options.minConfidence!);
      }

      // Limit final results
      if (options.maxPairs) {
        processedQA = processedQA.slice(0, options.maxPairs);
      }

      const processingTime = Date.now() - startTime;

      logger.info('Q&A generation completed', {
        generated: processedQA.length,
        processingTime,
        averageConfidence: this.calculateAverageConfidence(processedQA),
      });

      return processedQA;
    } catch (error) {
      logger.error('Q&A generation from knowledge failed', { error: error.message });
      throw new Error(`Q&A generation failed: ${error.message}`);
    }
  }

  /**
   * Generate Q&A pairs from conversations
   */
  async generateFromConversations(
    conversations: ParsedConversation[],
    options: QAGenerationOptions = {}
  ): Promise<GeneratedQA[]> {
    const startTime = Date.now();

    try {
      logger.info('Starting Q&A generation from conversations', {
        conversationCount: conversations.length,
        options,
      });

      const qaPairs: GeneratedQA[] = [];

      for (const conversation of conversations) {
        try {
          const conversationQA = await this.extractQAFromConversation(conversation, options);
          qaPairs.push(...conversationQA);

          // Apply max pairs limit if specified
          if (options.maxPairs && qaPairs.length >= options.maxPairs) {
            break;
          }
        } catch (error) {
          logger.warn('Failed to extract Q&A from conversation', {
            conversationId: conversation.id,
            error: error.message,
          });
        }
      }

      // Post-process Q&A pairs
      let processedQA = qaPairs;

      if (options.deduplicateQuestions !== false) {
        processedQA = await this.deduplicateQuestions(processedQA);
      }

      if (options.validateAnswers !== false) {
        processedQA = await this.validateAndEnhanceQA(processedQA);
      }

      // Apply confidence threshold
      if (options.minConfidence) {
        processedQA = processedQA.filter((qa) => qa.confidence >= options.minConfidence!);
      }

      // Limit final results
      if (options.maxPairs) {
        processedQA = processedQA.slice(0, options.maxPairs);
      }

      const processingTime = Date.now() - startTime;

      logger.info('Q&A generation from conversations completed', {
        generated: processedQA.length,
        processingTime,
        averageConfidence: this.calculateAverageConfidence(processedQA),
      });

      return processedQA;
    } catch (error) {
      logger.error('Q&A generation from conversations failed', { error: error.message });
      throw new Error(`Q&A generation failed: ${error.message}`);
    }
  }

  /**
   * Validate Q&A pairs with comprehensive checks
   */
  async validateQAPairs(pairs: GeneratedQA[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const pair of pairs) {
      const result = await this.validateSingleQA(pair);
      results.push(result);
    }

    return results;
  }

  /**
   * Categorize Q&A pairs by difficulty level
   */
  categorizeByDifficulty(pairs: GeneratedQA[]): CategorizedQA {
    const categorized: CategorizedQA = {
      beginner: [],
      intermediate: [],
      advanced: [],
      expert: [],
      total: pairs.length,
      averageConfidence: this.calculateAverageConfidence(pairs),
    };

    for (const pair of pairs) {
      categorized[pair.difficulty].push(pair);
    }

    return categorized;
  }

  /**
   * Get generation metrics and analytics
   */
  async getGenerationMetrics(pairs: GeneratedQA[]): Promise<QAGenerationMetrics> {
    const categoryCounts: Record<string, number> = {};
    const difficultyDistribution: Record<string, number> = {
      beginner: 0,
      intermediate: 0,
      advanced: 0,
      expert: 0,
    };
    const qualityDistribution = { high: 0, medium: 0, low: 0 };

    let totalConfidence = 0;
    let validated = 0;
    let rejected = 0;

    for (const pair of pairs) {
      // Count topics
      categoryCounts[pair.topic] = (categoryCounts[pair.topic] || 0) + 1;

      // Count difficulty
      difficultyDistribution[pair.difficulty]++;

      // Count quality
      if (pair.metadata.qualityScore >= 0.8) qualityDistribution.high++;
      else if (pair.metadata.qualityScore >= 0.6) qualityDistribution.medium++;
      else qualityDistribution.low++;

      // Count validation status
      if (pair.metadata.reviewStatus === 'approved') validated++;
      else if (pair.metadata.reviewStatus === 'rejected') rejected++;

      totalConfidence += pair.confidence;
    }

    return {
      totalGenerated: pairs.length,
      validated,
      rejected,
      averageConfidence: pairs.length > 0 ? totalConfidence / pairs.length : 0,
      processingTime: 0, // This would be set by the caller
      categoryCounts,
      difficultyDistribution,
      qualityDistribution,
    };
  }

  /**
   * Process a batch of knowledge items
   */
  private async processBatch(
    items: any[],
    sourceType: 'knowledge' | 'conversation',
    options: QAGenerationOptions
  ): Promise<GeneratedQA[]> {
    const qaPairs: GeneratedQA[] = [];

    for (const item of items) {
      try {
        const itemQA = await this.generateQAFromItem(item, sourceType, options);
        qaPairs.push(...itemQA);
      } catch (error) {
        logger.warn('Failed to generate Q&A from item', {
          itemId: item.id,
          error: error.message,
        });
      }
    }

    return qaPairs;
  }

  /**
   * Generate Q&A pairs from a single knowledge item
   */
  private async generateQAFromItem(
    item: any,
    sourceType: 'knowledge' | 'conversation',
    options: QAGenerationOptions
  ): Promise<GeneratedQA[]> {
    const qaPairs: GeneratedQA[] = [];
    const content = item.content || '';

    // Extract facts and generate factual questions
    const facts = this.extractFacts(content);
    for (const fact of facts) {
      const qa = this.generateFactualQA(fact, item, sourceType);
      if (qa && this.meetsQualityThreshold(qa)) {
        qaPairs.push(qa);
      }
    }

    // Extract procedures and generate how-to questions
    const procedures = this.extractProcedures(content);
    for (const procedure of procedures) {
      const qa = this.generateProceduralQA(procedure, item, sourceType);
      if (qa && this.meetsQualityThreshold(qa)) {
        qaPairs.push(qa);
      }
    }

    // Generate definition questions
    const definitions = this.extractDefinitions(content);
    for (const definition of definitions) {
      const qa = this.generateDefinitionQA(definition, item, sourceType);
      if (qa && this.meetsQualityThreshold(qa)) {
        qaPairs.push(qa);
      }
    }

    // Generate meta-questions if requested
    if (options.includeMetaQuestions) {
      const metaQA = this.generateMetaQuestions(item, sourceType);
      qaPairs.push(...metaQA.filter((qa) => this.meetsQualityThreshold(qa)));
    }

    return qaPairs;
  }

  /**
   * Extract Q&A from conversation flow
   */
  private async extractQAFromConversation(
    conversation: ParsedConversation,
    options: QAGenerationOptions
  ): Promise<GeneratedQA[]> {
    const qaPairs: GeneratedQA[] = [];
    const messages = conversation.messages;

    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i];
      const nextMessage = messages[i + 1];

      // Look for question-answer patterns
      if (this.isQuestion(currentMessage.content) && this.isAnswer(nextMessage.content)) {
        const qa = this.createQAFromMessages(currentMessage, nextMessage, conversation);
        if (qa && this.meetsQualityThreshold(qa)) {
          qaPairs.push(qa);
        }
      }

      // Look for explanation patterns
      if (this.isExplanationRequest(currentMessage.content)) {
        const explanation = this.findExplanation(messages, i);
        if (explanation) {
          const qa = this.createExplanationQA(currentMessage, explanation, conversation);
          if (qa && this.meetsQualityThreshold(qa)) {
            qaPairs.push(qa);
          }
        }
      }
    }

    return qaPairs;
  }

  /**
   * Validate and enhance a single Q&A pair
   */
  private async validateSingleQA(pair: GeneratedQA): Promise<ValidationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let confidence = pair.confidence;

    // Validate question quality
    if (!this.isValidQuestion(pair.question)) {
      issues.push('Question is not properly formatted');
      confidence *= 0.8;
    }

    // Validate answer quality
    if (!this.isValidAnswer(pair.answer)) {
      issues.push('Answer is incomplete or poorly formatted');
      confidence *= 0.7;
    }

    // Check for question-answer relevance
    const relevanceScore = await this.calculateRelevance(pair.question, pair.answer);
    if (relevanceScore < 0.6) {
      issues.push('Question and answer are not closely related');
      confidence *= 0.6;
      suggestions.push('Consider revising the answer to better match the question');
    }

    // Check answer completeness
    if (pair.answer.length < 10) {
      issues.push('Answer is too short');
      suggestions.push('Provide more detailed explanation');
    }

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(pair, relevanceScore);

    return {
      isValid: issues.length === 0,
      confidence: Math.max(0, Math.min(1, confidence)),
      issues,
      suggestions,
      qualityScore,
    };
  }

  /**
   * Deduplicate similar questions
   */
  private async deduplicateQuestions(pairs: GeneratedQA[]): Promise<GeneratedQA[]> {
    const deduped: GeneratedQA[] = [];
    const seen = new Set<string>();

    for (const pair of pairs) {
      const normalized = this.normalizeQuestion(pair.question);
      const fingerprint = await this.generateQuestionFingerprint(normalized);

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        deduped.push(pair);
      } else {
        logger.debug('Duplicate question filtered', { question: pair.question });
      }
    }

    logger.info('Question deduplication completed', {
      original: pairs.length,
      deduplicated: deduped.length,
      removed: pairs.length - deduped.length,
    });

    return deduped;
  }

  /**
   * Validate and enhance Q&A pairs
   */
  private async validateAndEnhanceQA(pairs: GeneratedQA[]): Promise<GeneratedQA[]> {
    const enhanced: GeneratedQA[] = [];

    for (const pair of pairs) {
      const validation = await this.validateSingleQA(pair);

      if (validation.isValid || validation.qualityScore >= 0.5) {
        // Update metadata with validation results
        pair.confidence = validation.confidence;
        pair.metadata.qualityScore = validation.qualityScore;
        pair.metadata.reviewStatus = validation.isValid ? 'approved' : 'pending';

        enhanced.push(pair);
      }
    }

    return enhanced;
  }

  // Helper methods for content analysis
  private extractFacts(content: string): string[] {
    const facts: string[] = [];
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    for (const sentence of sentences) {
      if (this.isFactualStatement(sentence.trim())) {
        facts.push(sentence.trim());
      }
    }

    return facts;
  }

  private extractProcedures(content: string): string[] {
    const procedures: string[] = [];
    const procedurePatterns = [
      /(?:to|how to|in order to)\s+(.+)/gi,
      /(?:step|first|then|next|finally|lastly)\s+(.+)/gi,
      /(?:\d+\.|\d+\))\s+(.+)/gi,
    ];

    for (const pattern of procedurePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        procedures.push(...matches);
      }
    }

    return procedures;
  }

  private extractDefinitions(content: string): Array<{ term: string; definition: string }> {
    const definitions: Array<{ term: string; definition: string }> = [];
    const definitionPatterns = [/(.+?)\s+(?:is|are|means|refers to)\s+(.+)/gi, /(.+?):\s*(.+)/gi];

    for (const pattern of definitionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[2] && match[1].trim().length > 0 && match[2].trim().length > 0) {
          definitions.push({
            term: match[1].trim(),
            definition: match[2].trim(),
          });
        }
      }
    }

    return definitions;
  }

  // Q&A generation methods
  private generateFactualQA(fact: string, item: any, sourceType: string): GeneratedQA | null {
    const patterns = [
      { pattern: /(.+?)\s+(?:is|are)\s+(.+)/, questionTemplate: 'What is {0}?' },
      { pattern: /(.+?)\s+(?:has|have)\s+(.+)/, questionTemplate: 'What does {0} have?' },
      { pattern: /(.+?)\s+(?:can|could)\s+(.+)/, questionTemplate: 'What can {0} do?' },
    ];

    for (const { pattern, questionTemplate } of patterns) {
      const match = fact.match(pattern);
      if (match) {
        const question = questionTemplate.replace('{0}', match[1].trim());
        const answer = fact;

        return this.createQAObject(question, answer, item, sourceType, 'factual');
      }
    }

    return null;
  }

  private generateProceduralQA(
    procedure: string,
    item: any,
    sourceType: string
  ): GeneratedQA | null {
    const howToPattern = /(?:to|how to)\s+(.+)/gi;
    const match = procedure.match(howToPattern);

    if (match) {
      const question = `How do you ${match[1].trim()}?`;
      const answer = procedure;

      return this.createQAObject(question, answer, item, sourceType, 'procedural');
    }

    return null;
  }

  private generateDefinitionQA(
    definition: { term: string; definition: string },
    item: any,
    sourceType: string
  ): GeneratedQA | null {
    const question = `What is ${definition.term}?`;
    const answer = definition.definition;

    return this.createQAObject(question, answer, item, sourceType, 'definition');
  }

  private generateMetaQuestions(item: any, sourceType: string): GeneratedQA[] {
    const metaQAs: GeneratedQA[] = [];
    const templates = [
      {
        question: 'What is the main topic of this information?',
        answer: item.metadata?.topic || 'General knowledge',
      },
      {
        question: 'When was this information created?',
        answer: new Date(item.createdAt || Date.now()).toISOString(),
      },
      { question: 'What is the source of this information?', answer: item.source || 'Unknown' },
    ];

    for (const template of templates) {
      const qa = this.createQAObject(template.question, template.answer, item, sourceType, 'meta');
      if (qa) {
        metaQAs.push(qa);
      }
    }

    return metaQAs;
  }

  private createQAFromMessages(
    questionMsg: any,
    answerMsg: any,
    conversation: ParsedConversation
  ): GeneratedQA | null {
    const question = this.cleanQuestion(questionMsg.content);
    const answer = this.cleanAnswer(answerMsg.content);

    if (!question || !answer) return null;

    return {
      id: uuidv4(),
      question,
      answer,
      source: conversation.id,
      sourceType: 'conversation',
      confidence: 0.8,
      topic: this.extractTopic(questionMsg.content),
      difficulty: this.assessDifficulty(question, answer),
      tags: this.extractTags(question + ' ' + answer),
      metadata: {
        generatedAt: new Date(),
        method: 'conversation_extraction',
        sourceIds: [questionMsg.id, answerMsg.id],
        reviewStatus: 'pending',
        qualityScore: 0.8,
      },
    };
  }

  private createExplanationQA(
    requestMsg: any,
    explanationMsg: any,
    conversation: ParsedConversation
  ): GeneratedQA | null {
    const question = this.extractExplanationQuestion(requestMsg.content);
    const answer = explanationMsg.content;

    if (!question || !answer) return null;

    return {
      id: uuidv4(),
      question,
      answer,
      source: conversation.id,
      sourceType: 'conversation',
      confidence: 0.75,
      topic: this.extractTopic(requestMsg.content),
      difficulty: this.assessDifficulty(question, answer),
      tags: this.extractTags(question + ' ' + answer),
      metadata: {
        generatedAt: new Date(),
        method: 'explanation_extraction',
        sourceIds: [requestMsg.id, explanationMsg.id],
        reviewStatus: 'pending',
        qualityScore: 0.75,
      },
    };
  }

  private createQAObject(
    question: string,
    answer: string,
    item: any,
    sourceType: string,
    method: string
  ): GeneratedQA | null {
    if (!question || !answer) return null;

    return {
      id: uuidv4(),
      question: this.cleanQuestion(question),
      answer: this.cleanAnswer(answer),
      source: item.id || item.source || 'unknown',
      sourceType: sourceType as any,
      confidence: this.calculateInitialConfidence(question, answer, method),
      topic: this.extractTopic(question + ' ' + answer),
      difficulty: this.assessDifficulty(question, answer),
      tags: this.extractTags(question + ' ' + answer),
      metadata: {
        generatedAt: new Date(),
        method,
        sourceIds: [item.id].filter(Boolean),
        reviewStatus: 'pending',
        qualityScore: this.calculateInitialQuality(question, answer),
      },
    };
  }

  // Utility and validation methods
  private filterKnowledgeItems(items: any[], options: QAGenerationOptions): any[] {
    return items.filter((item) => {
      if (options.categories && !options.categories.includes(item.category)) {
        return false;
      }
      return true;
    });
  }

  private isQuestion(text: string): boolean {
    return (
      /^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/i.test(
        text.trim()
      ) || text.trim().endsWith('?')
    );
  }

  private isAnswer(text: string): boolean {
    return text.length > 10 && !this.isQuestion(text);
  }

  private isExplanationRequest(text: string): boolean {
    return /(?:explain|clarify|elaborate|tell me more|can you|could you)/i.test(text);
  }

  private isFactualStatement(sentence: string): boolean {
    return (
      /\b(?:is|are|was|were|has|have|can|will|would|should|could)\b/i.test(sentence) &&
      sentence.length > 10 &&
      !this.isQuestion(sentence)
    );
  }

  private isValidQuestion(question: string): boolean {
    return (
      question.length >= 5 &&
      (question.endsWith('?') || this.isQuestion(question)) &&
      /\b(?:what|how|why|when|where|who|which)\b/i.test(question)
    );
  }

  private isValidAnswer(answer: string): boolean {
    return (
      answer.length >= 10 && this.answerValidationPatterns.some((pattern) => pattern.test(answer))
    );
  }

  private meetsQualityThreshold(qa: GeneratedQA): boolean {
    return (
      qa.confidence >= 0.5 &&
      qa.metadata.qualityScore >= 0.5 &&
      qa.question.length >= 5 &&
      qa.answer.length >= 10
    );
  }

  private findExplanation(messages: any[], startIndex: number): any | null {
    for (let i = startIndex + 1; i < messages.length && i < startIndex + 3; i++) {
      if (messages[i].content.length > 20) {
        return messages[i];
      }
    }
    return null;
  }

  private cleanQuestion(question: string): string {
    return (
      question
        .trim()
        .replace(/^[^\w]+/, '')
        .replace(/[^\w\s?]+$/, '') + (question.endsWith('?') ? '' : '?')
    );
  }

  private cleanAnswer(answer: string): string {
    return answer
      .trim()
      .replace(/^[^\w]+/, '')
      .replace(/[^\w\s.!]+$/, '');
  }

  private extractTopic(text: string): string {
    // Simple topic extraction - in production, use ML-based topic modeling
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    const commonWords = new Set([
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'that',
      'this',
      'with',
      'from',
      'they',
      'them',
      'their',
      'have',
      'been',
      'were',
      'said',
      'each',
      'more',
      'some',
      'like',
      'into',
      'time',
      'very',
      'then',
      'than',
      'only',
      'come',
      'over',
      'just',
      'also',
    ]);

    const keywords = words.filter((w) => !commonWords.has(w));
    return keywords[0] || 'general';
  }

  private extractTags(text: string): string[] {
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    const commonWords = new Set([
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'that',
      'this',
    ]);

    return [...new Set(words.filter((w) => !commonWords.has(w)))].slice(0, 5);
  }

  private extractExplanationQuestion(text: string): string {
    const explanationPatterns = [
      /explain (.+)/i,
      /tell me (?:more )?about (.+)/i,
      /what (?:is|are) (.+)/i,
      /how (?:does|do) (.+)/i,
    ];

    for (const pattern of explanationPatterns) {
      const match = text.match(pattern);
      if (match) {
        return `What is ${match[1].trim()}?`;
      }
    }

    return text.endsWith('?') ? text : text + '?';
  }

  private assessDifficulty(
    question: string,
    answer: string
  ): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
    const complexity = this.calculateComplexity(question, answer);

    if (complexity < 0.3) return 'beginner';
    if (complexity < 0.6) return 'intermediate';
    if (complexity < 0.8) return 'advanced';
    return 'expert';
  }

  private calculateComplexity(question: string, answer: string): number {
    const questionLength = question.split(/\s+/).length;
    const answerLength = answer.split(/\s+/).length;
    const technicalTerms = this.countTechnicalTerms(question + ' ' + answer);

    // Normalize and combine factors
    const lengthScore = Math.min(1, (questionLength + answerLength) / 50);
    const technicalScore = Math.min(1, technicalTerms / 5);

    return (lengthScore + technicalScore) / 2;
  }

  private countTechnicalTerms(text: string): number {
    const technicalPatterns = [
      /\b[A-Z]{2,}\b/g, // Acronyms
      /\b\w*(?:tion|sion|ment|ness|ity|ism)\b/g, // Complex suffixes
      /\b(?:implement|configure|initialize|optimize|algorithm|architecture|infrastructure)\b/gi, // Technical words
    ];

    let count = 0;
    for (const pattern of technicalPatterns) {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    }

    return count;
  }

  private calculateInitialConfidence(question: string, answer: string, method: string): number {
    let confidence = 0.7; // Base confidence

    // Adjust based on method
    const methodBonuses: Record<string, number> = {
      factual: 0.1,
      procedural: 0.05,
      definition: 0.15,
      conversation_extraction: 0.1,
      explanation_extraction: 0.05,
      meta: -0.1,
    };

    confidence += methodBonuses[method] ?? 0;

    // Adjust based on content quality
    if (this.isValidQuestion(question)) confidence += 0.1;
    if (this.isValidAnswer(answer)) confidence += 0.1;

    return Math.max(0, Math.min(1, confidence));
  }

  private calculateInitialQuality(question: string, answer: string): number {
    let quality = 0.6; // Base quality

    // Check question quality
    if (this.isValidQuestion(question)) quality += 0.2;
    if (question.length > 10) quality += 0.1;

    // Check answer quality
    if (this.isValidAnswer(answer)) quality += 0.2;
    if (answer.length > 50) quality += 0.1;

    return Math.max(0, Math.min(1, quality));
  }

  private async calculateRelevance(question: string, answer: string): Promise<number> {
    try {
      // In production, use semantic similarity with embeddings
      // For now, use simple keyword overlap
      const questionWords = new Set(
        question
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 2)
      );
      const answerWords = new Set(
        answer
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 2)
      );

      const intersection = new Set([...questionWords].filter((w) => answerWords.has(w)));
      const union = new Set([...questionWords, ...answerWords]);

      return intersection.size / union.size;
    } catch (error) {
      logger.warn('Failed to calculate relevance', { error: error.message });
      return 0.5; // Default relevance
    }
  }

  private calculateQualityScore(pair: GeneratedQA, relevanceScore: number): number {
    let score = 0;

    // Question quality (30%)
    if (this.isValidQuestion(pair.question)) score += 0.15;
    if (pair.question.length > 10) score += 0.1;
    if (pair.question.length > 20) score += 0.05;

    // Answer quality (40%)
    if (this.isValidAnswer(pair.answer)) score += 0.2;
    if (pair.answer.length > 50) score += 0.1;
    if (pair.answer.length > 100) score += 0.1;

    // Relevance (30%)
    score += relevanceScore * 0.3;

    return Math.max(0, Math.min(1, score));
  }

  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async generateQuestionFingerprint(question: string): Promise<string> {
    // Simple hash-based fingerprint - in production, use semantic embeddings
    const words = question.split(/\s+/).sort();
    return Buffer.from(words.join('')).toString('base64').slice(0, 16);
  }

  private calculateAverageConfidence(pairs: GeneratedQA[]): number {
    if (pairs.length === 0) return 0;
    return pairs.reduce((sum, pair) => sum + pair.confidence, 0) / pairs.length;
  }
}
