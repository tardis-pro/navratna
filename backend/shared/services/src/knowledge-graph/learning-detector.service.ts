import { logger } from '@uaip/utils';
import { ParsedConversation, ParsedMessage } from './chat-parser.service.js';
import { ContentClassifier } from './content-classifier.service.js';
import { EmbeddingService } from './embedding.service.js';
import { v4 as uuidv4 } from 'uuid';

export interface LearningMoment {
  id: string;
  learner: string;
  teacher: string;
  topic: string;
  content: string;
  type:
    | 'knowledge_transfer'
    | 'skill_acquisition'
    | 'concept_clarification'
    | 'problem_solving'
    | 'mistake_correction'
    | 'insight_sharing'
    | 'experience_sharing';
  learningOutcome:
    | 'understanding'
    | 'skill_improvement'
    | 'knowledge_gained'
    | 'perspective_changed'
    | 'problem_solved'
    | 'confusion_resolved';
  timestamp: Date;
  confidence: number;
  effectiveness: number; // 0-1 based on learner response
  context: {
    conversationId: string;
    messageIds: string[];
    participantCount: number;
    domain: string;
    complexity: 'basic' | 'intermediate' | 'advanced' | 'expert';
    duration: number; // in minutes
    followUpQuestions: number;
    acknowledgments: string[];
  };
  metadata: {
    detectionMethod: string;
    validationScore: number;
    impactAssessment: number;
    retentionIndicators: string[];
    applicationEvidence: string[];
    qualityMetrics: {
      clarity: number;
      relevance: number;
      completeness: number;
      engagement: number;
    };
  };
}

export interface KnowledgeTransfer {
  id: string;
  fromParticipant: string;
  toParticipant: string;
  knowledge: string;
  transferType: 'explicit' | 'tacit' | 'procedural' | 'conceptual' | 'experiential';
  transferMethod:
    | 'explanation'
    | 'demonstration'
    | 'guidance'
    | 'correction'
    | 'questioning'
    | 'storytelling';
  domain: string;
  effectiveness: number;
  retentionProbability: number;
  applicationLikelihood: number;
  transferQuality: {
    accuracy: number;
    completeness: number;
    clarity: number;
    adaptability: number;
  };
  evidence: {
    teachingMessages: string[];
    learningResponses: string[];
    followUpQuestions: string[];
    applicationAttempts: string[];
    confirmationSignals: string[];
  };
  barriers: string[];
  facilitators: string[];
  timestamp: Date;
}

export interface LearningProgression {
  learner: string;
  domain: string;
  timeline: LearningTimelineEntry[];
  skillDevelopment: SkillProgression[];
  knowledgeGrowth: KnowledgeGrowthMetrics;
  learningPattern: {
    style: 'visual' | 'auditory' | 'kinesthetic' | 'reading_writing' | 'mixed';
    pace: 'fast' | 'moderate' | 'slow';
    depth: 'surface' | 'deep' | 'strategic';
    feedback_preference: 'immediate' | 'delayed' | 'self_directed';
    challenge_response: 'thrives' | 'copes' | 'struggles';
  };
  motivation: {
    intrinsic: number; // 0-1
    extrinsic: number; // 0-1
    curiosity: number; // 0-1
    persistence: number; // 0-1
    growth_mindset: number; // 0-1
  };
  effectiveness: {
    overall: number;
    retention: number;
    application: number;
    transfer: number;
    mastery: number;
  };
}

export interface LearningTimelineEntry {
  timestamp: Date;
  event:
    | 'knowledge_gained'
    | 'skill_practiced'
    | 'concept_mastered'
    | 'mistake_made'
    | 'insight_achieved'
    | 'knowledge_applied';
  topic: string;
  description: string;
  impact: number; // 0-1
  evidence: string[];
  teacher?: string;
  context: string;
}

export interface SkillProgression {
  skill: string;
  category: 'technical' | 'soft' | 'domain' | 'cognitive';
  initialLevel: 'none' | 'basic' | 'intermediate' | 'advanced' | 'expert';
  currentLevel: 'none' | 'basic' | 'intermediate' | 'advanced' | 'expert';
  progression: Array<{
    timestamp: Date;
    level: string;
    evidence: string[];
    catalyst: string; // What triggered the progression
  }>;
  trajectory: 'accelerating' | 'steady' | 'plateauing' | 'declining';
  nextMilestone: string;
  estimatedTimeToNext: string;
}

export interface KnowledgeGrowthMetrics {
  startingKnowledge: number; // 0-1
  currentKnowledge: number; // 0-1
  growthRate: number; // knowledge gained per unit time
  retentionRate: number; // 0-1
  applicationRate: number; // 0-1
  transferRate: number; // ability to apply knowledge to new contexts
  curiosityIndex: number; // frequency of questions and exploration
  masteryIndicators: string[];
}

export interface LearningInsights {
  overallMetrics: {
    totalLearningMoments: number;
    uniqueLearners: number;
    uniqueTeachers: number;
    domainsActive: number;
    averageEffectiveness: number;
    knowledgeFlowStrength: number;
    learningVelocity: number;
  };
  patterns: {
    mostEffectiveTeachers: Array<{ participant: string; effectiveness: number; domains: string[] }>;
    fastestLearners: Array<{ participant: string; learningRate: number; domains: string[] }>;
    popularTopics: Array<{ topic: string; learningMoments: number; avgEffectiveness: number }>;
    optimalLearningConditions: string[];
    commonBarriers: string[];
    successFactors: string[];
  };
  recommendations: {
    learningOpportunities: Array<{ learner: string; opportunities: string[] }>;
    teachingOpportunities: Array<{ teacher: string; opportunities: string[] }>;
    knowledgeGaps: Array<{ domain: string; gaps: string[]; priority: number }>;
    improvementSuggestions: string[];
    interventions: Array<{ type: string; description: string; expectedImpact: number }>;
  };
  trends: {
    learningVelocityTrend: 'increasing' | 'stable' | 'decreasing';
    knowledgeQualityTrend: 'improving' | 'stable' | 'declining';
    engagementTrend: 'increasing' | 'stable' | 'decreasing';
    retentionTrend: 'improving' | 'stable' | 'declining';
  };
  networkAnalysis: {
    centralKnowledgeNodes: string[];
    learningClusters: Array<{ participants: string[]; domain: string; strength: number }>;
    knowledgeBrokers: string[]; // People who connect different knowledge domains
    isolatedLearners: string[];
    mentorshipPotential: Array<{ mentor: string; mentee: string; match_score: number }>;
  };
}

export interface LearningDetectionOptions {
  minConfidence?: number;
  includeMomentsByMoment?: boolean;
  analyzeLearningProgression?: boolean;
  detectKnowledgeTransfer?: boolean;
  assessLearningEffectiveness?: boolean;
  identifyLearningPatterns?: boolean;
  generateInsights?: boolean;
  timeWindow?: {
    start?: Date;
    end?: Date;
  };
  domains?: string[];
  participants?: string[];
  learningTypes?: LearningMoment['type'][];
}

export class LearningDetectorService {
  private readonly learningIndicators = {
    knowledge_acquisition: [
      /\b(?:I\s+(?:learned|discovered|realized|understood|figured\s+out)|now\s+I\s+(?:know|understand|see|get\s+it))\b/gi,
      /\b(?:that\s+makes\s+sense|I\s+get\s+it|ah,?\s+(?:I\s+see|okay|right)|oh,?\s+(?:I\s+understand|got\s+it))\b/gi,
      /\b(?:so\s+(?:that's\s+(?:how|why|what)|the\s+(?:idea|point)\s+is)|I\s+see\s+(?:what\s+you\s+mean|the\s+point))\b/gi,
    ],
    confusion_resolution: [
      /\b(?:I\s+(?:was\s+)?confused\s+(?:about|by)|I\s+didn't\s+understand|that\s+was\s+unclear)\b/gi,
      /\b(?:but\s+now\s+I|thanks\s+for\s+clarifying|that\s+clears\s+(?:it\s+)?up|makes\s+more\s+sense\s+now)\b/gi,
      /\b(?:initially\s+I\s+thought|I\s+misunderstood|I\s+was\s+wrong\s+about)\b/gi,
    ],
    skill_improvement: [
      /\b(?:I'm\s+getting\s+better\s+at|I've\s+improved\s+(?:my|at)|my\s+(?:skills?\s+(?:in|with|at)|understanding\s+of)\s+.+\s+(?:has\s+)?improved)\b/gi,
      /\b(?:I\s+can\s+now|I'm\s+(?:now\s+)?able\s+to|I\s+(?:finally\s+)?managed\s+to)\b/gi,
      /\b(?:progress|improvement|better\s+(?:than\s+before|at\s+this)|getting\s+the\s+hang\s+of)\b/gi,
    ],
    insight_achievement: [
      /\b(?:(?:interesting|fascinating|surprising)(?:\s+that)?|I\s+never\s+(?:thought|considered|realized)|that's\s+a\s+good\s+point)\b/gi,
      /\b(?:aha|eureka|breakthrough|revelation|epiphany|insight|realization)\b/gi,
      /\b(?:that\s+(?:explains|makes\s+sense\s+of|clarifies)|now\s+I\s+understand\s+why)\b/gi,
    ],
    knowledge_application: [
      /\b(?:I\s+(?:tried|applied|used|implemented)|let\s+me\s+try|I'll\s+(?:apply|use)\s+(?:this|that))\b/gi,
      /\b(?:putting\s+(?:this|that)\s+(?:into\s+practice|to\s+use)|applying\s+(?:what|this)|in\s+practice)\b/gi,
      /\b(?:it\s+worked|that\s+approach\s+worked|successful(?:ly)?|effective(?:ly)?)\b/gi,
    ],
    teaching_recognition: [
      /\b(?:thanks\s+for\s+(?:explaining|teaching|showing|helping)|that\s+(?:was\s+)?helpful|great\s+explanation)\b/gi,
      /\b(?:you're\s+(?:a\s+)?good\s+(?:teacher|at\s+explaining)|I\s+appreciate\s+(?:the\s+)?(?:help|explanation|guidance))\b/gi,
      /\b(?:clear(?:ly)?\s+explained|well\s+explained|(?:easy|simple)\s+to\s+understand)\b/gi,
    ],
  };

  private readonly questionPatterns = [
    /^(?:what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/i,
    /\?$/,
    /\b(?:I\s+(?:wonder|don't\s+understand|need\s+help\s+with)|could\s+you\s+(?:explain|help|show)|can\s+you\s+tell\s+me)\b/gi,
  ];

  private readonly teachingPatterns = [
    /\b(?:let\s+me\s+(?:explain|show\s+you|tell\s+you)|here's\s+(?:how|what|why)|the\s+way\s+(?:to\s+do\s+this\s+)?is)\b/gi,
    /\b(?:think\s+of\s+it\s+(?:as|like)|imagine|for\s+example|to\s+illustrate|consider\s+(?:this|that))\b/gi,
    /\b(?:step\s+(?:by\s+step|one)|first(?:ly)?|then|next|finally|in\s+summary)\b/gi,
    /\b(?:the\s+(?:key|important)\s+(?:thing|point)\s+is|(?:remember|keep\s+in\s+mind)\s+that)\b/gi,
  ];

  private detectionCache = new Map<string, LearningMoment[]>();
  private readonly CACHE_TTL = 45 * 60 * 1000; // 45 minutes
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.5;
  private readonly MAX_LEARNING_MOMENT_DISTANCE = 5; // Max messages between question and answer

  constructor(
    private readonly contentClassifier: ContentClassifier,
    private readonly embeddingService: EmbeddingService
  ) {}

  /**
   * Detect learning moments in conversations with comprehensive analysis
   */
  async detectLearningMoments(
    messages: ParsedMessage[],
    options: LearningDetectionOptions = {}
  ): Promise<LearningMoment[]> {
    const startTime = Date.now();

    try {
      logger.info('Starting learning moment detection', {
        messageCount: messages.length,
        options,
      });

      // Check cache first
      const cacheKey = this.generateCacheKey(messages, options);
      if (this.detectionCache.has(cacheKey)) {
        logger.debug('Returning cached learning moments');
        return this.detectionCache.get(cacheKey)!;
      }

      const learningMoments: LearningMoment[] = [];

      // Filter messages by time window if specified
      const filteredMessages = this.filterMessagesByTimeWindow(messages, options.timeWindow);

      // Filter by participants if specified
      const participantFilteredMessages = options.participants
        ? filteredMessages.filter((m) => options.participants!.includes(m.sender))
        : filteredMessages;

      // Detect different types of learning moments
      const questionAnswerMoments = await this.detectQuestionAnswerLearning(
        participantFilteredMessages
      );
      const explanationMoments = await this.detectExplanationLearning(participantFilteredMessages);
      const correctiveMoments = await this.detectCorrectiveLearning(participantFilteredMessages);
      const insightMoments = await this.detectInsightMoments(participantFilteredMessages);
      const skillMoments = await this.detectSkillDevelopmentMoments(participantFilteredMessages);
      const experienceMoments = await this.detectExperienceSharing(participantFilteredMessages);

      // Combine all moments
      learningMoments.push(
        ...questionAnswerMoments,
        ...explanationMoments,
        ...correctiveMoments,
        ...insightMoments,
        ...skillMoments,
        ...experienceMoments
      );

      // Filter by confidence threshold
      const minConfidence = options.minConfidence || this.MIN_CONFIDENCE_THRESHOLD;
      const filteredMoments = learningMoments.filter(
        (moment) => moment.confidence >= minConfidence
      );

      // Filter by learning types if specified
      const typedFilteredMoments = options.learningTypes
        ? filteredMoments.filter((moment) => options.learningTypes!.includes(moment.type))
        : filteredMoments;

      // Filter by domains if specified
      const domainFilteredMoments = options.domains
        ? typedFilteredMoments.filter((moment) => options.domains!.includes(moment.context.domain))
        : typedFilteredMoments;

      // Enhance moments with additional analysis
      const enhancedMoments = await this.enhanceLearningMoments(domainFilteredMoments, messages);

      // Validate and score moments
      const validatedMoments = await this.validateLearningMoments(enhancedMoments);

      // Cache results
      this.detectionCache.set(cacheKey, validatedMoments);
      setTimeout(() => this.detectionCache.delete(cacheKey), this.CACHE_TTL);

      const processingTime = Date.now() - startTime;

      logger.info('Learning moment detection completed', {
        momentsDetected: validatedMoments.length,
        processingTime,
        averageConfidence: this.calculateAverageConfidence(validatedMoments),
        averageEffectiveness: this.calculateAverageEffectiveness(validatedMoments),
      });

      return validatedMoments;
    } catch (error) {
      logger.error('Learning moment detection failed', { error: error.message });
      throw new Error(`Learning moment detection failed: ${error.message}`);
    }
  }

  /**
   * Identify knowledge transfer patterns between participants
   */
  async identifyKnowledgeTransfer(
    conversations: ParsedConversation[],
    options: LearningDetectionOptions = {}
  ): Promise<KnowledgeTransfer[]> {
    const transfers: KnowledgeTransfer[] = [];

    for (const conversation of conversations) {
      const conversationTransfers = await this.analyzeConversationForTransfer(
        conversation,
        options
      );
      transfers.push(...conversationTransfers);
    }

    return transfers.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  /**
   * Track learning progression over time for participants
   */
  async trackLearningProgression(
    moments: LearningMoment[],
    participant: string,
    options: LearningDetectionOptions = {}
  ): Promise<LearningProgression> {
    const participantMoments = moments.filter((m) => m.learner === participant);

    if (participantMoments.length === 0) {
      throw new Error(`No learning moments found for participant: ${participant}`);
    }

    // Sort moments by timestamp
    participantMoments.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Extract domains
    const domains = [...new Set(participantMoments.map((m) => m.context.domain))];
    const primaryDomain = this.findPrimaryDomain(participantMoments);

    // Build timeline
    const timeline = this.buildLearningTimeline(participantMoments);

    // Analyze skill progressions
    const skillProgressions = await this.analyzeSkillProgressions(participantMoments, participant);

    // Calculate knowledge growth metrics
    const knowledgeGrowth = this.calculateKnowledgeGrowthMetrics(participantMoments);

    // Identify learning patterns
    const learningPattern = await this.identifyLearningPattern(participantMoments, participant);

    // Assess motivation indicators
    const motivation = await this.assessMotivation(participantMoments, participant);

    // Calculate effectiveness metrics
    const effectiveness = this.calculateLearningEffectiveness(participantMoments);

    return {
      learner: participant,
      domain: primaryDomain,
      timeline,
      skillDevelopment: skillProgressions,
      knowledgeGrowth,
      learningPattern,
      motivation,
      effectiveness,
    };
  }

  /**
   * Generate comprehensive learning insights and recommendations
   */
  async generateLearningInsights(
    moments: LearningMoment[],
    progressions: LearningProgression[] = [],
    transfers: KnowledgeTransfer[] = []
  ): Promise<LearningInsights> {
    // Calculate overall metrics
    const overallMetrics = this.calculateOverallMetrics(moments, progressions, transfers);

    // Identify patterns
    const patterns = await this.identifyLearningPatterns(moments, progressions, transfers);

    // Generate recommendations
    const recommendations = await this.generateRecommendations(moments, progressions, transfers);

    // Analyze trends
    const trends = this.analyzeLearningTrends(moments, progressions);

    // Perform network analysis
    const networkAnalysis = await this.performNetworkAnalysis(moments, transfers);

    return {
      overallMetrics,
      patterns,
      recommendations,
      trends,
      networkAnalysis,
    };
  }

  /**
   * Detect question-answer learning moments
   */
  private async detectQuestionAnswerLearning(messages: ParsedMessage[]): Promise<LearningMoment[]> {
    const moments: LearningMoment[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i];

      if (this.isQuestion(currentMessage.content)) {
        // Look for answers in the next few messages
        for (
          let j = i + 1;
          j < Math.min(i + this.MAX_LEARNING_MOMENT_DISTANCE, messages.length);
          j++
        ) {
          const potentialAnswer = messages[j];

          if (
            potentialAnswer.sender !== currentMessage.sender &&
            this.isAnswer(potentialAnswer.content, currentMessage.content)
          ) {
            // Look for learning indicators in subsequent messages
            const learningResponse = this.findLearningResponse(
              messages,
              j + 1,
              currentMessage.sender
            );

            if (learningResponse) {
              const moment = await this.createLearningMoment({
                learner: currentMessage.sender,
                teacher: potentialAnswer.sender,
                type: 'knowledge_transfer',
                learningOutcome: 'understanding',
                question: currentMessage,
                answer: potentialAnswer,
                response: learningResponse,
                allMessages: messages,
              });

              if (moment) {
                moments.push(moment);
              }
            }
            break; // Found answer, move to next question
          }
        }
      }
    }

    return moments;
  }

  /**
   * Detect explanation-based learning moments
   */
  private async detectExplanationLearning(messages: ParsedMessage[]): Promise<LearningMoment[]> {
    const moments: LearningMoment[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i];

      if (this.isExplanation(currentMessage.content)) {
        // Look for learning responses
        const responses = this.findLearningResponses(messages, i + 1, currentMessage.sender);

        for (const response of responses) {
          const moment = await this.createLearningMoment({
            learner: response.sender,
            teacher: currentMessage.sender,
            type: 'concept_clarification',
            learningOutcome: 'understanding',
            teachingMessage: currentMessage,
            learningResponse: response,
            allMessages: messages,
          });

          if (moment) {
            moments.push(moment);
          }
        }
      }
    }

    return moments;
  }

  /**
   * Detect corrective learning moments
   */
  private async detectCorrectiveLearning(messages: ParsedMessage[]): Promise<LearningMoment[]> {
    const moments: LearningMoment[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i];

      if (this.isCorrection(currentMessage.content)) {
        // Look for acceptance or learning responses
        const responses = this.findLearningResponses(messages, i + 1, currentMessage.sender);

        for (const response of responses) {
          if (this.indicatesAcceptance(response.content)) {
            const moment = await this.createLearningMoment({
              learner: response.sender,
              teacher: currentMessage.sender,
              type: 'mistake_correction',
              learningOutcome: 'understanding',
              correctionMessage: currentMessage,
              acceptanceResponse: response,
              allMessages: messages,
            });

            if (moment) {
              moments.push(moment);
            }
          }
        }
      }
    }

    return moments;
  }

  /**
   * Detect insight moments
   */
  private async detectInsightMoments(messages: ParsedMessage[]): Promise<LearningMoment[]> {
    const moments: LearningMoment[] = [];

    for (const message of messages) {
      if (this.indicatesInsight(message.content)) {
        // Look for preceding context that might have triggered the insight
        const context = this.findInsightContext(messages, message);

        const moment = await this.createLearningMoment({
          learner: message.sender,
          teacher: context?.teacher || 'self',
          type: 'insight_sharing',
          learningOutcome: 'perspective_changed',
          insightMessage: message,
          context: context?.context,
          allMessages: messages,
        });

        if (moment) {
          moments.push(moment);
        }
      }
    }

    return moments;
  }

  /**
   * Detect skill development moments
   */
  private async detectSkillDevelopmentMoments(
    messages: ParsedMessage[]
  ): Promise<LearningMoment[]> {
    const moments: LearningMoment[] = [];

    for (const message of messages) {
      if (this.indicatesSkillImprovement(message.content)) {
        const moment = await this.createLearningMoment({
          learner: message.sender,
          teacher: 'practice', // Self-directed learning
          type: 'skill_acquisition',
          learningOutcome: 'skill_improvement',
          skillMessage: message,
          allMessages: messages,
        });

        if (moment) {
          moments.push(moment);
        }
      }
    }

    return moments;
  }

  /**
   * Detect experience sharing moments
   */
  private async detectExperienceSharing(messages: ParsedMessage[]): Promise<LearningMoment[]> {
    const moments: LearningMoment[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i];

      if (this.isExperienceSharing(currentMessage.content)) {
        // Look for learning responses
        const responses = this.findLearningResponses(messages, i + 1, currentMessage.sender);

        for (const response of responses) {
          const moment = await this.createLearningMoment({
            learner: response.sender,
            teacher: currentMessage.sender,
            type: 'experience_sharing',
            learningOutcome: 'knowledge_gained',
            experienceMessage: currentMessage,
            learningResponse: response,
            allMessages: messages,
          });

          if (moment) {
            moments.push(moment);
          }
        }
      }
    }

    return moments;
  }

  // Helper methods for pattern detection
  private isQuestion(content: string): boolean {
    return this.questionPatterns.some((pattern) => pattern.test(content));
  }

  private isAnswer(content: string, questionContent: string): boolean {
    // Check if content is responding to the question
    if (content.length < 10) return false;
    if (this.isQuestion(content)) return false;

    // Look for answer indicators
    const answerPatterns = [
      /^(?:yes|no|sure|absolutely|definitely|maybe|perhaps|probably)/i,
      /\b(?:the\s+answer\s+is|here's\s+(?:how|what|why)|let\s+me\s+(?:explain|tell\s+you))/i,
    ];

    return answerPatterns.some((pattern) => pattern.test(content)) || content.length > 30;
  }

  private isExplanation(content: string): boolean {
    return this.teachingPatterns.some((pattern) => pattern.test(content));
  }

  private isCorrection(content: string): boolean {
    const correctionPatterns = [
      /\b(?:actually|no,?\s+(?:that's\s+)?(?:not|wrong)|incorrect(?:ly)?|mistake|error)\b/gi,
      /\b(?:let\s+me\s+correct|the\s+(?:right|correct)\s+(?:way|answer)\s+is|should\s+(?:be|have))\b/gi,
    ];

    return correctionPatterns.some((pattern) => pattern.test(content));
  }

  private indicatesAcceptance(content: string): boolean {
    const acceptancePatterns = [
      /\b(?:oh,?\s+(?:right|okay|I\s+see)|thanks\s+for\s+(?:the\s+)?correction|you're\s+right)\b/gi,
      /\b(?:I\s+(?:was\s+)?wrong|my\s+mistake|I\s+misunderstood)\b/gi,
    ];

    return acceptancePatterns.some((pattern) => pattern.test(content));
  }

  private indicatesInsight(content: string): boolean {
    return this.learningIndicators.insight_achievement.some((pattern) => pattern.test(content));
  }

  private indicatesSkillImprovement(content: string): boolean {
    return this.learningIndicators.skill_improvement.some((pattern) => pattern.test(content));
  }

  private isExperienceSharing(content: string): boolean {
    const experiencePatterns = [
      /\b(?:in\s+my\s+experience|I've\s+(?:found|seen|learned)|when\s+I\s+(?:was|worked))\b/gi,
      /\b(?:from\s+(?:my\s+)?experience|I\s+remember\s+when|similar\s+(?:thing\s+)?happened)\b/gi,
    ];

    return experiencePatterns.some((pattern) => pattern.test(content)) && content.length > 50;
  }

  private findLearningResponse(
    messages: ParsedMessage[],
    startIndex: number,
    learner: string
  ): ParsedMessage | null {
    for (let i = startIndex; i < Math.min(startIndex + 3, messages.length); i++) {
      const message = messages[i];
      if (message.sender === learner && this.indicatesLearning(message.content)) {
        return message;
      }
    }
    return null;
  }

  private findLearningResponses(
    messages: ParsedMessage[],
    startIndex: number,
    excludeSender: string
  ): ParsedMessage[] {
    const responses: ParsedMessage[] = [];

    for (let i = startIndex; i < Math.min(startIndex + 5, messages.length); i++) {
      const message = messages[i];
      if (message.sender !== excludeSender && this.indicatesLearning(message.content)) {
        responses.push(message);
      }
    }

    return responses;
  }

  private indicatesLearning(content: string): boolean {
    return Object.values(this.learningIndicators).some((patterns) =>
      patterns.some((pattern) => pattern.test(content))
    );
  }

  private findInsightContext(
    messages: ParsedMessage[],
    insightMessage: ParsedMessage
  ): { teacher: string; context: string } | null {
    const messageIndex = messages.indexOf(insightMessage);
    if (messageIndex < 1) return null;

    // Look at the few messages before the insight
    for (let i = Math.max(0, messageIndex - 3); i < messageIndex; i++) {
      const prevMessage = messages[i];
      if (prevMessage.sender !== insightMessage.sender && this.isExplanation(prevMessage.content)) {
        return {
          teacher: prevMessage.sender,
          context: prevMessage.content,
        };
      }
    }

    return null;
  }

  private async createLearningMoment(params: any): Promise<LearningMoment | null> {
    try {
      const topic = await this.extractTopic(params);
      const content = this.extractContent(params);
      const context = await this.buildContext(params);
      const confidence = this.calculateConfidence(params);
      const effectiveness = await this.assessEffectiveness(params);

      if (confidence < this.MIN_CONFIDENCE_THRESHOLD) {
        return null;
      }

      return {
        id: uuidv4(),
        learner: params.learner,
        teacher: params.teacher,
        topic,
        content,
        type: params.type,
        learningOutcome: params.learningOutcome,
        timestamp: this.extractTimestamp(params),
        confidence,
        effectiveness,
        context,
        metadata: await this.buildMetadata(params, confidence, effectiveness),
      };
    } catch (error) {
      logger.warn('Failed to create learning moment', { error: error.message });
      return null;
    }
  }

  private async extractTopic(params: any): Promise<string> {
    // Extract topic from the conversation content
    const contents = [
      params.question?.content,
      params.answer?.content,
      params.teachingMessage?.content,
      params.correctionMessage?.content,
      params.insightMessage?.content,
      params.skillMessage?.content,
      params.experienceMessage?.content,
    ].filter(Boolean);

    const combinedContent = contents.join(' ');
    return this.extractTopicFromContent(combinedContent);
  }

  private extractContent(params: any): string {
    return (
      params.answer?.content ||
      params.teachingMessage?.content ||
      params.correctionMessage?.content ||
      params.insightMessage?.content ||
      params.skillMessage?.content ||
      params.experienceMessage?.content ||
      ''
    );
  }

  private async buildContext(params: any): Promise<LearningMoment['context']> {
    const messageIds = [
      params.question?.id,
      params.answer?.id,
      params.teachingMessage?.id,
      params.learningResponse?.id,
      params.correctionMessage?.id,
      params.acceptanceResponse?.id,
      params.insightMessage?.id,
      params.skillMessage?.id,
      params.experienceMessage?.id,
    ].filter(Boolean);

    const participants = [...new Set([params.learner, params.teacher].filter(Boolean))];
    const domain = await this.extractDomain(params);
    const complexity = this.assessComplexity(params);
    const duration = this.calculateDuration(params);
    const followUpQuestions = this.countFollowUpQuestions(params);
    const acknowledgments = this.extractAcknowledgments(params);

    return {
      conversationId: 'unknown', // Would be set by caller
      messageIds,
      participantCount: participants.length,
      domain,
      complexity,
      duration,
      followUpQuestions,
      acknowledgments,
    };
  }

  private calculateConfidence(params: any): number {
    let confidence = 0.6; // Base confidence

    // Boost for explicit learning indicators
    if (this.indicatesLearning(params.learningResponse?.content || '')) {
      confidence += 0.2;
    }

    // Boost for clear question-answer pattern
    if (params.question && params.answer) {
      confidence += 0.1;
    }

    // Boost for acknowledgment/acceptance
    if (params.acceptanceResponse && this.indicatesAcceptance(params.acceptanceResponse.content)) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  private async assessEffectiveness(params: any): Promise<number> {
    let effectiveness = 0.5; // Base effectiveness

    // Look for follow-up questions (indicates engagement)
    const followUpCount = this.countFollowUpQuestions(params);
    effectiveness += Math.min(0.2, followUpCount * 0.1);

    // Look for application attempts
    const applicationIndicators = this.findApplicationIndicators(params);
    effectiveness += applicationIndicators * 0.2;

    // Look for acknowledgment strength
    const acknowledgmentStrength = this.assessAcknowledgmentStrength(params);
    effectiveness += acknowledgmentStrength * 0.3;

    return Math.min(1, effectiveness);
  }

  private async buildMetadata(
    params: any,
    confidence: number,
    effectiveness: number
  ): Promise<LearningMoment['metadata']> {
    return {
      detectionMethod: this.getDetectionMethod(params),
      validationScore: confidence,
      impactAssessment: effectiveness,
      retentionIndicators: this.findRetentionIndicators(params),
      applicationEvidence: this.findApplicationEvidence(params),
      qualityMetrics: {
        clarity: this.assessClarity(params),
        relevance: this.assessRelevance(params),
        completeness: this.assessCompleteness(params),
        engagement: this.assessEngagement(params),
      },
    };
  }

  // Additional helper methods
  private extractTimestamp(params: any): Date {
    return (
      params.question?.timestamp ||
      params.teachingMessage?.timestamp ||
      params.insightMessage?.timestamp ||
      new Date()
    );
  }

  private extractTopicFromContent(content: string): string {
    // Simple topic extraction - would use ML in production
    const words = content
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    const commonWords = new Set([
      'this',
      'that',
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

  private async extractDomain(params: any): Promise<string> {
    // Domain extraction based on content analysis
    return 'general'; // Simplified for now
  }

  private assessComplexity(params: any): LearningMoment['context']['complexity'] {
    const contents = [
      params.question?.content,
      params.answer?.content,
      params.teachingMessage?.content,
    ].filter(Boolean);

    const avgLength = contents.reduce((sum, c) => sum + c.length, 0) / contents.length;

    if (avgLength > 200) return 'expert';
    if (avgLength > 120) return 'advanced';
    if (avgLength > 60) return 'intermediate';
    return 'basic';
  }

  private calculateDuration(params: any): number {
    // Calculate duration between first and last message
    const timestamps = [
      params.question?.timestamp,
      params.answer?.timestamp,
      params.teachingMessage?.timestamp,
      params.learningResponse?.timestamp,
    ].filter(Boolean);

    if (timestamps.length < 2) return 0;

    const start = Math.min(...timestamps.map((t) => t.getTime()));
    const end = Math.max(...timestamps.map((t) => t.getTime()));

    return Math.round((end - start) / (1000 * 60)); // Duration in minutes
  }

  private countFollowUpQuestions(params: any): number {
    // Count follow-up questions from the learner
    if (!params.allMessages || !params.learner) return 0;

    const learnerMessages = params.allMessages.filter((m) => m.sender === params.learner);
    return learnerMessages.filter((m) => this.isQuestion(m.content)).length;
  }

  private extractAcknowledgments(params: any): string[] {
    const acknowledgmentPatterns = [
      /\b(?:thanks?|thank\s+you|appreciate|helpful|great|excellent|perfect)\b/gi,
    ];

    const acknowledgments: string[] = [];
    const responseContent =
      params.learningResponse?.content || params.acceptanceResponse?.content || '';

    for (const pattern of acknowledgmentPatterns) {
      const matches = responseContent.match(pattern);
      if (matches) {
        acknowledgments.push(...matches);
      }
    }

    return [...new Set(acknowledgments)];
  }

  private getDetectionMethod(params: any): string {
    if (params.question && params.answer) return 'question_answer_analysis';
    if (params.teachingMessage) return 'explanation_analysis';
    if (params.correctionMessage) return 'correction_analysis';
    if (params.insightMessage) return 'insight_detection';
    if (params.skillMessage) return 'skill_tracking';
    if (params.experienceMessage) return 'experience_analysis';
    return 'general_analysis';
  }

  private findRetentionIndicators(params: any): string[] {
    // Look for indicators that learning was retained
    const indicators: string[] = [];

    if (params.applicationEvidence) indicators.push('application_attempt');
    if (params.followUpQuestions > 0) indicators.push('continued_engagement');
    if (this.indicatesLearning(params.learningResponse?.content || ''))
      indicators.push('explicit_acknowledgment');

    return indicators;
  }

  private findApplicationEvidence(params: any): string[] {
    const applicationPatterns = [
      /\b(?:I\s+(?:tried|used|applied)|let\s+me\s+try|I'll\s+(?:use|apply))\b/gi,
    ];

    const evidence: string[] = [];
    const content = params.learningResponse?.content || '';

    for (const pattern of applicationPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        evidence.push(...matches);
      }
    }

    return evidence;
  }

  private findApplicationIndicators(params: any): number {
    return this.findApplicationEvidence(params).length > 0 ? 1 : 0;
  }

  private assessAcknowledgmentStrength(params: any): number {
    const acknowledgments = this.extractAcknowledgments(params);
    return Math.min(1, acknowledgments.length / 3);
  }

  private assessClarity(params: any): number {
    // Assess clarity of the teaching/explanation
    const teachingContent = params.answer?.content || params.teachingMessage?.content || '';
    if (!teachingContent) return 0.5;

    const sentences = teachingContent.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgSentenceLength =
      sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;

    return Math.max(0, Math.min(1, 1 - (avgSentenceLength - 15) / 30));
  }

  private assessRelevance(params: any): number {
    // Assess relevance of answer to question
    if (!params.question || !params.answer) return 0.7; // Default for non-QA moments

    // Simple relevance check - would use semantic similarity in production
    const questionWords = new Set(params.question.content.toLowerCase().split(/\W+/));
    const answerWords = new Set(params.answer.content.toLowerCase().split(/\W+/));
    const overlap = [...questionWords].filter((w) => answerWords.has(w)).length;

    return Math.min(1, overlap / Math.min(questionWords.size, 10));
  }

  private assessCompleteness(params: any): number {
    // Assess completeness of the learning moment
    let completeness = 0.5; // Base score

    if (params.question) completeness += 0.1;
    if (params.answer || params.teachingMessage) completeness += 0.2;
    if (params.learningResponse) completeness += 0.2;

    return Math.min(1, completeness);
  }

  private assessEngagement(params: any): number {
    // Assess level of engagement in the learning moment
    const followUps = this.countFollowUpQuestions(params);
    const acknowledgments = this.extractAcknowledgments(params).length;

    return Math.min(1, followUps * 0.3 + acknowledgments * 0.2 + 0.5);
  }

  // Methods for the other features (abbreviated for brevity)
  private async analyzeConversationForTransfer(
    conversation: ParsedConversation,
    options: LearningDetectionOptions
  ): Promise<KnowledgeTransfer[]> {
    // Implementation would analyze conversation for knowledge transfer patterns
    return [];
  }

  private findPrimaryDomain(moments: LearningMoment[]): string {
    const domainCounts: Record<string, number> = {};
    for (const moment of moments) {
      domainCounts[moment.context.domain] = (domainCounts[moment.context.domain] || 0) + 1;
    }

    return Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
  }

  private buildLearningTimeline(moments: LearningMoment[]): LearningTimelineEntry[] {
    return moments.map((moment) => ({
      timestamp: moment.timestamp,
      event: this.mapLearningOutcomeToEvent(moment.learningOutcome),
      topic: moment.topic,
      description: moment.content.substring(0, 100),
      impact: moment.effectiveness,
      evidence: [moment.content],
      teacher:
        moment.teacher !== 'self' && moment.teacher !== 'practice' ? moment.teacher : undefined,
      context: moment.context.domain,
    }));
  }

  private mapLearningOutcomeToEvent(
    outcome: LearningMoment['learningOutcome']
  ): LearningTimelineEntry['event'] {
    const mapping: Record<LearningMoment['learningOutcome'], LearningTimelineEntry['event']> = {
      understanding: 'knowledge_gained',
      skill_improvement: 'skill_practiced',
      knowledge_gained: 'knowledge_gained',
      perspective_changed: 'insight_achieved',
      problem_solved: 'knowledge_applied',
      confusion_resolved: 'knowledge_gained',
    };

    return mapping[outcome] || 'knowledge_gained';
  }

  private async analyzeSkillProgressions(
    moments: LearningMoment[],
    participant: string
  ): Promise<SkillProgression[]> {
    // Implementation would track skill development over time
    return [];
  }

  private calculateKnowledgeGrowthMetrics(moments: LearningMoment[]): KnowledgeGrowthMetrics {
    // Simple implementation - would be enhanced with more sophisticated analysis
    return {
      startingKnowledge: 0.3,
      currentKnowledge: 0.7,
      growthRate: moments.length / 30, // Growth per month
      retentionRate: 0.8,
      applicationRate: 0.6,
      transferRate: 0.5,
      curiosityIndex:
        moments.filter((m) => m.type === 'knowledge_transfer').length / moments.length,
      masteryIndicators: [],
    };
  }

  private async identifyLearningPattern(
    moments: LearningMoment[],
    participant: string
  ): Promise<LearningProgression['learningPattern']> {
    // Implementation would analyze learning patterns
    return {
      style: 'mixed',
      pace: 'moderate',
      depth: 'deep',
      feedback_preference: 'immediate',
      challenge_response: 'copes',
    };
  }

  private async assessMotivation(
    moments: LearningMoment[],
    participant: string
  ): Promise<LearningProgression['motivation']> {
    // Implementation would assess motivation indicators
    return {
      intrinsic: 0.7,
      extrinsic: 0.5,
      curiosity: 0.8,
      persistence: 0.6,
      growth_mindset: 0.7,
    };
  }

  private calculateLearningEffectiveness(
    moments: LearningMoment[]
  ): LearningProgression['effectiveness'] {
    const avgEffectiveness = moments.reduce((sum, m) => sum + m.effectiveness, 0) / moments.length;

    return {
      overall: avgEffectiveness,
      retention: 0.8, // Would be calculated from follow-up analysis
      application: 0.6, // Would be calculated from application evidence
      transfer: 0.5, // Would be calculated from cross-domain application
      mastery: 0.4, // Would be calculated from mastery indicators
    };
  }

  private calculateOverallMetrics(
    moments: LearningMoment[],
    progressions: LearningProgression[],
    transfers: KnowledgeTransfer[]
  ): LearningInsights['overallMetrics'] {
    const uniqueLearners = new Set(moments.map((m) => m.learner)).size;
    const uniqueTeachers = new Set(moments.map((m) => m.teacher)).size;
    const domainsActive = new Set(moments.map((m) => m.context.domain)).size;
    const avgEffectiveness = this.calculateAverageEffectiveness(moments);

    return {
      totalLearningMoments: moments.length,
      uniqueLearners,
      uniqueTeachers,
      domainsActive,
      averageEffectiveness: avgEffectiveness,
      knowledgeFlowStrength:
        transfers.reduce((sum, t) => sum + t.effectiveness, 0) / Math.max(transfers.length, 1),
      learningVelocity: moments.length / Math.max(1, this.calculateTimeSpan(moments)),
    };
  }

  private async identifyLearningPatterns(
    moments: LearningMoment[],
    progressions: LearningProgression[],
    transfers: KnowledgeTransfer[]
  ): Promise<LearningInsights['patterns']> {
    // Implementation would identify patterns in learning data
    return {
      mostEffectiveTeachers: [],
      fastestLearners: [],
      popularTopics: [],
      optimalLearningConditions: [],
      commonBarriers: [],
      successFactors: [],
    };
  }

  private async generateRecommendations(
    moments: LearningMoment[],
    progressions: LearningProgression[],
    transfers: KnowledgeTransfer[]
  ): Promise<LearningInsights['recommendations']> {
    // Implementation would generate actionable recommendations
    return {
      learningOpportunities: [],
      teachingOpportunities: [],
      knowledgeGaps: [],
      improvementSuggestions: [],
      interventions: [],
    };
  }

  private analyzeLearningTrends(
    moments: LearningMoment[],
    progressions: LearningProgression[]
  ): LearningInsights['trends'] {
    // Implementation would analyze trends over time
    return {
      learningVelocityTrend: 'stable',
      knowledgeQualityTrend: 'stable',
      engagementTrend: 'stable',
      retentionTrend: 'stable',
    };
  }

  private async performNetworkAnalysis(
    moments: LearningMoment[],
    transfers: KnowledgeTransfer[]
  ): Promise<LearningInsights['networkAnalysis']> {
    // Implementation would perform network analysis
    return {
      centralKnowledgeNodes: [],
      learningClusters: [],
      knowledgeBrokers: [],
      isolatedLearners: [],
      mentorshipPotential: [],
    };
  }

  // Utility methods
  private filterMessagesByTimeWindow(
    messages: ParsedMessage[],
    timeWindow?: LearningDetectionOptions['timeWindow']
  ): ParsedMessage[] {
    if (!timeWindow) return messages;

    return messages.filter((message) => {
      const timestamp = message.timestamp.getTime();
      const start = timeWindow.start?.getTime() || 0;
      const end = timeWindow.end?.getTime() || Date.now();
      return timestamp >= start && timestamp <= end;
    });
  }

  private async enhanceLearningMoments(
    moments: LearningMoment[],
    allMessages: ParsedMessage[]
  ): Promise<LearningMoment[]> {
    // Enhancement logic would go here
    return moments;
  }

  private async validateLearningMoments(moments: LearningMoment[]): Promise<LearningMoment[]> {
    // Validation logic would go here
    return moments.filter((moment) => moment.confidence >= this.MIN_CONFIDENCE_THRESHOLD);
  }

  private calculateAverageConfidence(moments: LearningMoment[]): number {
    if (moments.length === 0) return 0;
    return moments.reduce((sum, m) => sum + m.confidence, 0) / moments.length;
  }

  private calculateAverageEffectiveness(moments: LearningMoment[]): number {
    if (moments.length === 0) return 0;
    return moments.reduce((sum, m) => sum + m.effectiveness, 0) / moments.length;
  }

  private calculateTimeSpan(moments: LearningMoment[]): number {
    if (moments.length === 0) return 1;

    const timestamps = moments.map((m) => m.timestamp.getTime());
    const span = Math.max(...timestamps) - Math.min(...timestamps);

    return Math.max(1, span / (1000 * 60 * 60 * 24)); // Days
  }

  private generateCacheKey(messages: ParsedMessage[], options: LearningDetectionOptions): string {
    const messageIds = messages
      .map((m) => m.id)
      .sort()
      .join(',');
    const optionsKey = JSON.stringify(options);
    return `${messageIds}_${optionsKey}`;
  }
}
