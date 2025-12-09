import { v4 as uuidv4 } from 'uuid';
import { logger } from '@uaip/utils';
import { KnowledgeType, SourceType, KnowledgeItem } from '@uaip/types';
import { ParsedConversation, ParsedMessage } from './chat-parser.service.js';
import { ContentClassifier } from './content-classifier.service.js';
import { EmbeddingService } from './embedding.service.js';

export interface ConversationContext {
  conversationId: string;
  participantCount: number;
  messageIndex: number;
  totalMessages: number;
  timeRange: { start: Date; end: Date };
  platform: string;
}

export interface ExtractedKnowledge {
  content: string;
  type: KnowledgeType;
  confidence: number;
  context: ConversationContext;
  tags: string[];
  metadata: {
    extractionMethod: string;
    sourceMessages: string[];
    participants: string[];
    domain?: string;
  };
}

export interface QAPair {
  id: string;
  question: string;
  answer: string;
  context: ConversationContext;
  confidence: number;
  tags: string[];
  participants: { questioner: string; answerer: string };
}

export interface DecisionPoint {
  id: string;
  decision: string;
  reasoning: string[];
  alternatives: string[];
  outcome?: string;
  context: ConversationContext;
  confidence: number;
  participants: string[];
}

export interface ExpertiseArea {
  domain: string;
  participant: string;
  evidenceMessages: string[];
  confidence: number;
  skills: string[];
  context: ConversationContext;
}

export interface LearningMoment {
  id: string;
  learner: string;
  teacher: string;
  topic: string;
  content: string;
  learningType: 'explanation' | 'correction' | 'guidance' | 'example' | 'discovery';
  context: ConversationContext;
  confidence: number;
}

export interface KnowledgeExtractionResult {
  extractedKnowledge: ExtractedKnowledge[];
  qaPairs: QAPair[];
  decisionPoints: DecisionPoint[];
  expertiseAreas: ExpertiseArea[];
  learningMoments: LearningMoment[];
  extractionMetrics: {
    totalMessagesProcessed: number;
    knowledgeItemsExtracted: number;
    avgConfidence: number;
    processingTime: number;
    extractionMethods: Record<string, number>;
  };
}

export class ChatKnowledgeExtractorService {
  private readonly factPatterns = [
    /(.+?)\s+(?:is|are|was|were)\s+(.+)/gi,
    /(.+?)\s*[:：]\s*(.+)/gi,
    /(?:fact|note|remember):\s*(.+)/gi,
    /(.+?)\s+(?:means|refers to|defined as)\s+(.+)/gi,
  ];

  private readonly procedurePatterns = [
    /(?:step\s*\d+|first|then|next|finally)[:.]?\s*(.+)/gi,
    /(?:to|how to)\s+(.+?)[:,]\s*(.+)/gi,
    /(?:process|procedure|method):\s*(.+)/gi,
    /you (?:need to|should|can|must)\s+(.+)/gi,
  ];

  private readonly questionPatterns = [
    /(.+?)\?\s*(.+?)(?:\?|$)/gs,
    /(?:what|how|why|when|where|who)\s+(.+?)\?\s*(.+?)(?:\.|\n|$)/gi,
    /(.+?)\?\s*(?:yes|no|because|since)\s*(.+)/gi,
  ];

  private readonly decisionPatterns = [
    /(?:decided|chose|selected|picked)\s+(.+?)(?:because|since|due to)\s*(.+)/gi,
    /(?:decision|choice):\s*(.+?)(?:reason|because):\s*(.+)/gi,
    /(?:will|should|must)\s+(.+?)(?:instead of|rather than)\s+(.+)/gi,
  ];

  private readonly expertiseIndicators = [
    /i (?:know|understand|think|believe|recommend|suggest)\s+(.+)/gi,
    /in my (?:experience|opinion|view)\s*(.+)/gi,
    /(?:actually|typically|usually|generally)\s+(.+)/gi,
    /(?:let me explain|here's how|the way to)\s+(.+)/gi,
  ];

  private readonly learningIndicators = [
    /(?:thanks|thank you|got it|i see|understood|makes sense)/gi,
    /(?:didn't know|learned|new to me|never heard)\s+(.+)/gi,
    /(?:oh|ah|interesting|cool|wow)\s*[!.]?\s*(.+)/gi,
    /(?:can you explain|help me understand|clarify)\s+(.+)/gi,
  ];

  constructor(
    private readonly contentClassifier: ContentClassifier,
    private readonly embeddingService: EmbeddingService
  ) {}

  async extractKnowledgeFromConversations(
    conversations: ParsedConversation[],
    options?: {
      minConfidence?: number;
      extractQA?: boolean;
      extractDecisions?: boolean;
      extractExpertise?: boolean;
      extractLearning?: boolean;
      domains?: string[];
    }
  ): Promise<KnowledgeExtractionResult> {
    const startTime = Date.now();
    const extractionMethods: Record<string, number> = {};

    let extractedKnowledge: ExtractedKnowledge[] = [];
    let qaPairs: QAPair[] = [];
    let decisionPoints: DecisionPoint[] = [];
    let expertiseAreas: ExpertiseArea[] = [];
    let learningMoments: LearningMoment[] = [];
    let totalMessagesProcessed = 0;

    try {
      for (const conversation of conversations) {
        const context = this.createConversationContext(conversation);

        // Filter by domains if specified
        if (options?.domains && options.domains.length > 0) {
          const conversationDomain = this.inferConversationDomain(conversation);
          if (!options.domains.includes(conversationDomain)) {
            continue;
          }
        }

        totalMessagesProcessed += conversation.messages.length;

        // Extract facts and procedures
        const facts = await this.extractFacts(conversation.messages, context);
        const procedures = await this.extractProcedures(conversation.messages, context);

        extractedKnowledge.push(...facts, ...procedures);
        extractionMethods['fact_extraction'] =
          (extractionMethods['fact_extraction'] || 0) + facts.length;
        extractionMethods['procedure_extraction'] =
          (extractionMethods['procedure_extraction'] || 0) + procedures.length;

        // Extract Q&A pairs if requested
        if (options?.extractQA !== false) {
          const qaResult = await this.extractQuestionAnswerPairs(conversation.messages, context);
          qaPairs.push(...qaResult);
          extractionMethods['qa_extraction'] =
            (extractionMethods['qa_extraction'] || 0) + qaResult.length;
        }

        // Extract decisions if requested
        if (options?.extractDecisions !== false) {
          const decisions = await this.extractDecisions(conversation.messages, context);
          decisionPoints.push(...decisions);
          extractionMethods['decision_extraction'] =
            (extractionMethods['decision_extraction'] || 0) + decisions.length;
        }

        // Extract expertise if requested
        if (options?.extractExpertise !== false) {
          const expertise = await this.extractExpertise(conversation, context);
          expertiseAreas.push(...expertise);
          extractionMethods['expertise_extraction'] =
            (extractionMethods['expertise_extraction'] || 0) + expertise.length;
        }

        // Extract learning moments if requested
        if (options?.extractLearning !== false) {
          const learning = await this.extractLearningMoments(conversation.messages, context);
          learningMoments.push(...learning);
          extractionMethods['learning_extraction'] =
            (extractionMethods['learning_extraction'] || 0) + learning.length;
        }
      }

      // Apply confidence filter
      if (options?.minConfidence) {
        extractedKnowledge = extractedKnowledge.filter(
          (k) => k.confidence >= options.minConfidence!
        );
        qaPairs = qaPairs.filter((qa) => qa.confidence >= options.minConfidence!);
        decisionPoints = decisionPoints.filter((d) => d.confidence >= options.minConfidence!);
        expertiseAreas = expertiseAreas.filter((e) => e.confidence >= options.minConfidence!);
        learningMoments = learningMoments.filter((l) => l.confidence >= options.minConfidence!);
      }

      const totalKnowledgeItems =
        extractedKnowledge.length + qaPairs.length + decisionPoints.length;
      const avgConfidence =
        totalKnowledgeItems > 0
          ? [...extractedKnowledge, ...qaPairs, ...decisionPoints].reduce(
              (sum, item) => sum + item.confidence,
              0
            ) / totalKnowledgeItems
          : 0;

      const processingTime = Date.now() - startTime;

      logger.info(
        `Knowledge extraction completed: ${totalKnowledgeItems} items from ${totalMessagesProcessed} messages in ${processingTime}ms`
      );

      return {
        extractedKnowledge,
        qaPairs,
        decisionPoints,
        expertiseAreas,
        learningMoments,
        extractionMetrics: {
          totalMessagesProcessed,
          knowledgeItemsExtracted: totalKnowledgeItems,
          avgConfidence,
          processingTime,
          extractionMethods,
        },
      };
    } catch (error) {
      logger.error('Error extracting knowledge from conversations:', error);
      throw new Error(
        `Knowledge extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async extractFacts(
    messages: ParsedMessage[],
    context: ConversationContext
  ): Promise<ExtractedKnowledge[]> {
    const facts: ExtractedKnowledge[] = [];

    for (const message of messages) {
      const content = message.content;

      for (const pattern of this.factPatterns) {
        let match;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(content)) !== null) {
          const [fullMatch, subject, object] = match;

          if (subject && object && subject.length > 2 && object.length > 2) {
            const factContent = `${subject.trim()} is ${object.trim()}`;
            const confidence = this.calculateFactConfidence(fullMatch, message);

            if (confidence > 0.3) {
              facts.push({
                content: factContent,
                type: KnowledgeType.FACTUAL,
                confidence,
                context,
                tags: this.extractTags(factContent, message.sender),
                metadata: {
                  extractionMethod: 'fact_pattern_matching',
                  sourceMessages: [message.id],
                  participants: [message.sender],
                  domain: this.inferDomain(factContent),
                },
              });
            }
          }
        }
      }
    }

    return facts;
  }

  async extractProcedures(
    messages: ParsedMessage[],
    context: ConversationContext
  ): Promise<ExtractedKnowledge[]> {
    const procedures: ExtractedKnowledge[] = [];
    const steps: string[] = [];
    let currentProcedure = '';

    for (const message of messages) {
      const content = message.content;

      for (const pattern of this.procedurePatterns) {
        let match;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(content)) !== null) {
          const [fullMatch, procedureText] = match;

          if (procedureText && procedureText.length > 10) {
            // Check if this is a step in a sequence
            if (
              fullMatch.toLowerCase().includes('step') ||
              fullMatch.toLowerCase().includes('first') ||
              fullMatch.toLowerCase().includes('then') ||
              fullMatch.toLowerCase().includes('next')
            ) {
              steps.push(procedureText.trim());
              currentProcedure = steps.join(' → ');
            } else {
              currentProcedure = procedureText.trim();
            }

            const confidence = this.calculateProcedureConfidence(fullMatch, message);

            if (confidence > 0.4 && currentProcedure.length > 20) {
              procedures.push({
                content: currentProcedure,
                type: KnowledgeType.PROCEDURAL,
                confidence,
                context,
                tags: this.extractTags(currentProcedure, message.sender),
                metadata: {
                  extractionMethod: 'procedure_pattern_matching',
                  sourceMessages: [message.id],
                  participants: [message.sender],
                  domain: this.inferDomain(currentProcedure),
                },
              });
            }
          }
        }
      }
    }

    return procedures;
  }

  async extractQuestionAnswerPairs(
    messages: ParsedMessage[],
    context: ConversationContext
  ): Promise<QAPair[]> {
    const qaPairs: QAPair[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i];
      const nextMessage = messages[i + 1];

      // Check if current message contains a question
      const questionMatch = this.findQuestionInMessage(currentMessage.content);

      if (questionMatch && nextMessage.sender !== currentMessage.sender) {
        // Likely Q&A pair
        const confidence = this.calculateQAConfidence(currentMessage, nextMessage);

        if (confidence > 0.5) {
          qaPairs.push({
            id: uuidv4(),
            question: questionMatch,
            answer: nextMessage.content,
            context,
            confidence,
            tags: this.extractTags(
              questionMatch + ' ' + nextMessage.content,
              currentMessage.sender
            ),
            participants: {
              questioner: currentMessage.sender,
              answerer: nextMessage.sender,
            },
          });
        }
      }
    }

    return qaPairs;
  }

  async extractDecisions(
    messages: ParsedMessage[],
    context: ConversationContext
  ): Promise<DecisionPoint[]> {
    const decisions: DecisionPoint[] = [];

    for (const message of messages) {
      const content = message.content;

      for (const pattern of this.decisionPatterns) {
        let match;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(content)) !== null) {
          const [fullMatch, decision, reasoning] = match;

          if (decision && reasoning) {
            const confidence = this.calculateDecisionConfidence(fullMatch, message);

            if (confidence > 0.4) {
              decisions.push({
                id: uuidv4(),
                decision: decision.trim(),
                reasoning: [reasoning.trim()],
                alternatives: this.extractAlternatives(content),
                context,
                confidence,
                participants: [message.sender],
              });
            }
          }
        }
      }
    }

    return decisions;
  }

  async extractExpertise(
    conversation: ParsedConversation,
    context: ConversationContext
  ): Promise<ExpertiseArea[]> {
    const expertiseMap = new Map<
      string,
      { domains: Set<string>; evidence: string[]; confidence: number }
    >();

    for (const message of conversation.messages) {
      const sender = message.sender;
      const content = message.content;

      // Look for expertise indicators
      for (const pattern of this.expertiseIndicators) {
        let match;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(content)) !== null) {
          const [fullMatch, expertiseContent] = match;

          if (expertiseContent) {
            const domain = this.inferDomain(expertiseContent);
            const confidence = this.calculateExpertiseConfidence(fullMatch, message);

            if (!expertiseMap.has(sender)) {
              expertiseMap.set(sender, { domains: new Set(), evidence: [], confidence: 0 });
            }

            const expertise = expertiseMap.get(sender)!;
            expertise.domains.add(domain);
            expertise.evidence.push(fullMatch);
            expertise.confidence = Math.max(expertise.confidence, confidence);
          }
        }
      }
    }

    const expertiseAreas: ExpertiseArea[] = [];
    for (const [participant, data] of expertiseMap) {
      for (const domain of data.domains) {
        expertiseAreas.push({
          domain,
          participant,
          evidenceMessages: data.evidence,
          confidence: data.confidence,
          skills: this.extractSkills(data.evidence),
          context,
        });
      }
    }

    return expertiseAreas;
  }

  async extractLearningMoments(
    messages: ParsedMessage[],
    context: ConversationContext
  ): Promise<LearningMoment[]> {
    const learningMoments: LearningMoment[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i];
      const nextMessage = messages[i + 1];

      // Look for learning indicators in responses
      for (const pattern of this.learningIndicators) {
        pattern.lastIndex = 0;
        const match = pattern.exec(nextMessage.content);

        if (match && currentMessage.sender !== nextMessage.sender) {
          const topic = this.extractTopic(currentMessage.content);
          const learningType = this.determineLearningType(
            currentMessage.content,
            nextMessage.content
          );
          const confidence = this.calculateLearningConfidence(currentMessage, nextMessage);

          if (confidence > 0.5) {
            learningMoments.push({
              id: uuidv4(),
              learner: nextMessage.sender,
              teacher: currentMessage.sender,
              topic,
              content: currentMessage.content,
              learningType,
              context,
              confidence,
            });
          }
        }
      }
    }

    return learningMoments;
  }

  // Helper methods

  private createConversationContext(conversation: ParsedConversation): ConversationContext {
    return {
      conversationId: conversation.id,
      participantCount: conversation.participants.length,
      messageIndex: 0,
      totalMessages: conversation.messages.length,
      timeRange: conversation.metadata.dateRange,
      platform: conversation.platform,
    };
  }

  private findQuestionInMessage(content: string): string | null {
    // Simple question detection
    if (content.includes('?')) {
      const sentences = content.split(/[.!]/).filter((s) => s.includes('?'));
      return sentences[0]?.trim() || null;
    }

    // Check for question words at the beginning
    const questionWords = [
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'can',
      'could',
      'would',
      'should',
    ];
    const firstWords = content.toLowerCase().split(' ').slice(0, 3);

    if (questionWords.some((word) => firstWords.includes(word))) {
      return content.split(/[.!]$/)[0]?.trim() || content;
    }

    return null;
  }

  private calculateFactConfidence(match: string, message: ParsedMessage): number {
    let confidence = 0.5;

    // Boost confidence for definitive statements
    if (match.toLowerCase().includes('is') || match.toLowerCase().includes('are'))
      confidence += 0.2;
    if (match.length > 50) confidence += 0.1;
    if (
      message.sender.toLowerCase().includes('assistant') ||
      message.sender.toLowerCase().includes('claude')
    )
      confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private calculateProcedureConfidence(match: string, message: ParsedMessage): number {
    let confidence = 0.4;

    // Boost confidence for step indicators
    if (match.toLowerCase().includes('step') || match.toLowerCase().includes('first'))
      confidence += 0.2;
    if (match.toLowerCase().includes('then') || match.toLowerCase().includes('next'))
      confidence += 0.1;
    if (match.length > 30) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private calculateQAConfidence(questionMsg: ParsedMessage, answerMsg: ParsedMessage): number {
    let confidence = 0.5;

    // Boost confidence for clear questions
    if (questionMsg.content.includes('?')) confidence += 0.2;
    if (answerMsg.content.length > 20) confidence += 0.1;
    if (answerMsg.sender.toLowerCase().includes('assistant')) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private calculateDecisionConfidence(match: string, message: ParsedMessage): number {
    let confidence = 0.4;

    if (match.toLowerCase().includes('decided') || match.toLowerCase().includes('chose'))
      confidence += 0.2;
    if (match.toLowerCase().includes('because') || match.toLowerCase().includes('reason'))
      confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  private calculateExpertiseConfidence(match: string, message: ParsedMessage): number {
    let confidence = 0.3;

    if (match.toLowerCase().includes('experience') || match.toLowerCase().includes('recommend'))
      confidence += 0.3;
    if (match.length > 40) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private calculateLearningConfidence(
    teacherMsg: ParsedMessage,
    learnerMsg: ParsedMessage
  ): number {
    let confidence = 0.4;

    if (
      learnerMsg.content.toLowerCase().includes('thanks') ||
      learnerMsg.content.toLowerCase().includes('got it')
    )
      confidence += 0.3;
    if (teacherMsg.content.length > 50) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private extractTags(content: string, sender: string): string[] {
    const tags: string[] = [];

    // Add sender as tag
    tags.push(sender.toLowerCase().replace(/\s+/g, '_'));

    // Extract domain-specific tags
    const domain = this.inferDomain(content);
    if (domain !== 'general') tags.push(domain);

    // Add knowledge type tags
    if (content.toLowerCase().includes('step') || content.toLowerCase().includes('process'))
      tags.push('procedure');
    if (content.includes('?')) tags.push('question');

    return tags.filter((tag, index) => tags.indexOf(tag) === index); // Remove duplicates
  }

  private inferDomain(content: string): string {
    const domainKeywords = {
      programming: ['code', 'programming', 'software', 'algorithm', 'function', 'variable', 'api'],
      business: ['business', 'strategy', 'marketing', 'sales', 'revenue', 'customer'],
      science: ['research', 'experiment', 'data', 'analysis', 'hypothesis', 'study'],
      technology: ['technology', 'system', 'infrastructure', 'network', 'database'],
      design: ['design', 'ui', 'ux', 'interface', 'visual', 'layout'],
      healthcare: ['health', 'medical', 'patient', 'treatment', 'diagnosis'],
    };

    const lowerContent = content.toLowerCase();

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some((keyword) => lowerContent.includes(keyword))) {
        return domain;
      }
    }

    return 'general';
  }

  private inferConversationDomain(conversation: ParsedConversation): string {
    const allContent = conversation.messages.map((m) => m.content).join(' ');
    return this.inferDomain(allContent);
  }

  private extractAlternatives(content: string): string[] {
    const alternatives: string[] = [];

    // Look for alternative patterns
    const altPatterns = [
      /instead of (.+?)(?:[,.]|$)/gi,
      /rather than (.+?)(?:[,.]|$)/gi,
      /alternative: (.+?)(?:[,.]|$)/gi,
    ];

    for (const pattern of altPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        alternatives.push(match[1].trim());
      }
    }

    return alternatives;
  }

  private extractSkills(evidence: string[]): string[] {
    const skills: string[] = [];
    const skillPattern = /(?:skilled in|good at|experienced with|expert in)\s+(.+?)(?:[,.]|$)/gi;

    for (const text of evidence) {
      let match;
      skillPattern.lastIndex = 0;
      while ((match = skillPattern.exec(text)) !== null) {
        skills.push(match[1].trim());
      }
    }

    return skills;
  }

  private extractTopic(content: string): string {
    // Simple topic extraction - take first few meaningful words
    const words = content
      .split(' ')
      .filter(
        (word) =>
          word.length > 3 && !['this', 'that', 'what', 'how', 'why'].includes(word.toLowerCase())
      )
      .slice(0, 3);

    return words.join(' ') || 'general topic';
  }

  private determineLearningType(
    teacherContent: string,
    learnerContent: string
  ): LearningMoment['learningType'] {
    const lowerTeacher = teacherContent.toLowerCase();
    const lowerLearner = learnerContent.toLowerCase();

    if (lowerTeacher.includes('explain') || lowerTeacher.includes('because')) return 'explanation';
    if (lowerTeacher.includes('correct') || lowerTeacher.includes('actually')) return 'correction';
    if (lowerTeacher.includes('should') || lowerTeacher.includes('recommend')) return 'guidance';
    if (lowerTeacher.includes('example') || lowerTeacher.includes('like this')) return 'example';
    if (lowerLearner.includes('i see') || lowerLearner.includes('interesting')) return 'discovery';

    return 'explanation';
  }

  async convertToKnowledgeItems(
    extractionResult: KnowledgeExtractionResult,
    sourceIdentifier: string,
    createdBy?: string,
    organizationId?: string
  ): Promise<KnowledgeItem[]> {
    const knowledgeItems: KnowledgeItem[] = [];

    // Convert extracted knowledge
    for (const knowledge of extractionResult.extractedKnowledge) {
      knowledgeItems.push({
        id: uuidv4(),
        content: knowledge.content,
        type: knowledge.type,
        sourceType: SourceType.AGENT_INTERACTION,
        sourceIdentifier,
        sourceUrl: undefined,
        tags: [...knowledge.tags, 'chat_extracted'],
        confidence: knowledge.confidence,
        metadata: {
          ...knowledge.metadata,
          extractionContext: knowledge.context,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
        organizationId,
        accessLevel: 'public',
      });
    }

    // Convert Q&A pairs
    for (const qa of extractionResult.qaPairs) {
      knowledgeItems.push({
        id: uuidv4(),
        content: `Q: ${qa.question}\nA: ${qa.answer}`,
        type: KnowledgeType.PROCEDURAL,
        sourceType: SourceType.AGENT_INTERACTION,
        sourceIdentifier,
        sourceUrl: undefined,
        tags: [...qa.tags, 'qa_pair', 'chat_extracted'],
        confidence: qa.confidence,
        metadata: {
          questionAnswerPair: true,
          participants: qa.participants,
          extractionContext: qa.context,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
        organizationId,
        accessLevel: 'public',
      });
    }

    // Convert decision points
    for (const decision of extractionResult.decisionPoints) {
      knowledgeItems.push({
        id: uuidv4(),
        content: `Decision: ${decision.decision}\nReasoning: ${decision.reasoning.join(', ')}`,
        type: KnowledgeType.EXPERIENTIAL,
        sourceType: SourceType.AGENT_INTERACTION,
        sourceIdentifier,
        sourceUrl: undefined,
        tags: ['decision', 'chat_extracted'],
        confidence: decision.confidence,
        metadata: {
          decisionPoint: true,
          alternatives: decision.alternatives,
          outcome: decision.outcome,
          participants: decision.participants,
          extractionContext: decision.context,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
        organizationId,
        accessLevel: 'public',
      });
    }

    return knowledgeItems;
  }
}
