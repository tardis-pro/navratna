import { logger } from '@uaip/utils';
import { ParsedConversation, ParsedMessage } from './chat-parser.service.js';
import { ContentClassifier } from './content-classifier.service.js';
import { EmbeddingService } from './embedding.service.js';
import { v4 as uuidv4 } from 'uuid';

export interface ExpertiseProfile {
  id: string;
  participant: string;
  domains: ExpertiseDomain[];
  overallExpertiseLevel: 'novice' | 'intermediate' | 'advanced' | 'expert' | 'master';
  confidenceScore: number;
  evidenceMessages: string[];
  metadata: {
    analysisDate: Date;
    totalMessages: number;
    conversationsAnalyzed: number;
    domainCoverage: number;
    consistencyScore: number;
    growthTrend: 'improving' | 'stable' | 'declining' | 'unknown';
    lastActivity: Date;
  };
}

export interface ExpertiseDomain {
  id: string;
  domain: string;
  subdomain?: string;
  level: 'novice' | 'intermediate' | 'advanced' | 'expert' | 'master';
  confidence: number;
  indicators: ExpertiseIndicator[];
  skills: Skill[];
  knowledge: KnowledgeArea[];
  experience: ExperienceEvidence[];
  teaching: TeachingEvidence[];
  problemSolving: ProblemSolvingEvidence[];
  mentoring: MentoringEvidence[];
}

export interface ExpertiseIndicator {
  type: 'technical_depth' | 'teaching_ability' | 'problem_solving' | 'domain_knowledge' | 'experience_sharing' | 'mentoring' | 'innovation' | 'leadership';
  strength: number; // 0-1
  evidence: string[];
  messageIds: string[];
}

export interface Skill {
  name: string;
  category: 'technical' | 'soft' | 'domain' | 'tool' | 'methodology';
  level: 'basic' | 'intermediate' | 'advanced' | 'expert';
  confidence: number;
  evidence: string[];
}

export interface KnowledgeArea {
  area: string;
  depth: 'surface' | 'working' | 'deep' | 'expert';
  breadth: 'narrow' | 'moderate' | 'broad' | 'comprehensive';
  currency: 'outdated' | 'current' | 'cutting_edge';
  evidence: string[];
}

export interface ExperienceEvidence {
  type: 'project' | 'role' | 'achievement' | 'failure' | 'challenge';
  description: string;
  domain: string;
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  outcome: 'success' | 'failure' | 'mixed' | 'learning';
  messageId: string;
}

export interface TeachingEvidence {
  type: 'explanation' | 'tutorial' | 'guidance' | 'correction' | 'concept_clarification';
  topic: string;
  clarity: number; // 0-1
  depth: number; // 0-1
  accuracy: number; // 0-1
  helpfulness: number; // 0-1
  messageId: string;
}

export interface ProblemSolvingEvidence {
  type: 'analysis' | 'solution' | 'debugging' | 'optimization' | 'design' | 'troubleshooting';
  problem: string;
  approach: string;
  solution: string;
  effectiveness: number; // 0-1
  creativity: number; // 0-1
  messageId: string;
}

export interface MentoringEvidence {
  type: 'guidance' | 'feedback' | 'encouragement' | 'career_advice' | 'skill_development';
  mentee: string;
  topic: string;
  supportiveness: number; // 0-1
  constructiveness: number; // 0-1
  messageId: string;
}

export interface ExpertiseGraph {
  participants: ExpertiseProfile[];
  relationships: ExpertiseRelationship[];
  domains: DomainExpertiseMap[];
  collaborations: CollaborationPattern[];
  knowledgeFlow: KnowledgeFlowPattern[];
  mentorshipNetworks: MentorshipNetwork[];
}

export interface ExpertiseRelationship {
  fromParticipant: string;
  toParticipant: string;
  type: 'mentors' | 'collaborates_with' | 'learns_from' | 'teaches' | 'complements';
  domains: string[];
  strength: number; // 0-1
  evidence: string[];
}

export interface DomainExpertiseMap {
  domain: string;
  experts: Array<{
    participant: string;
    level: string;
    confidence: number;
  }>;
  knowledgeGaps: string[];
  learningOpportunities: string[];
}

export interface CollaborationPattern {
  participants: string[];
  domains: string[];
  type: 'peer_collaboration' | 'mentor_mentee' | 'cross_domain' | 'problem_solving';
  frequency: number;
  effectiveness: number;
  outcomes: string[];
}

export interface KnowledgeFlowPattern {
  fromParticipant: string;
  toParticipant: string;
  domain: string;
  type: 'teaching' | 'sharing' | 'mentoring' | 'collaboration';
  frequency: number;
  effectiveness: number;
  topics: string[];
}

export interface MentorshipNetwork {
  mentor: string;
  mentees: string[];
  domains: string[];
  effectivenessScore: number;
  relationshipStrength: number;
  growthIndicators: string[];
}

export interface ExpertiseAnalysisOptions {
  minMessages?: number;
  minConfidence?: number;
  domains?: string[];
  includeMentoring?: boolean;
  includeTeaching?: boolean;
  includeProblemSolving?: boolean;
  analyzeGrowth?: boolean;
  detectRelationships?: boolean;
  generateRecommendations?: boolean;
}

export interface ExpertiseRecommendation {
  type: 'learning_opportunity' | 'mentoring_match' | 'collaboration_suggestion' | 'skill_development' | 'knowledge_sharing';
  participant: string;
  description: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high';
  estimatedImpact: number; // 0-1
  suggestedActions: string[];
}

export interface ExpertiseAnalysisMetrics {
  totalParticipants: number;
  domainsIdentified: number;
  expertiseRelationships: number;
  averageExpertiseLevel: number;
  domainCoverage: number;
  mentorshipConnections: number;
  knowledgeFlowStrength: number;
  collaborationOpportunities: number;
  processingTime: number;
}

export class ExpertiseAnalyzerService {
  private readonly expertiseIndicators = {
    technical_depth: [
      /\b(?:implementation|architecture|algorithm|optimization|performance|scalability|security|design\s+pattern)\b/gi,
      /\b(?:deep|thorough|comprehensive|detailed|advanced|sophisticated|complex)\s+(?:understanding|knowledge|experience)\b/gi,
      /\b(?:I've\s+(?:built|designed|implemented|architected|optimized)|in\s+my\s+experience)\b/gi
    ],
    teaching_ability: [
      /\b(?:let\s+me\s+explain|here's\s+how|the\s+way\s+(?:I|you)\s+(?:do|would)|step\s+by\s+step)\b/gi,
      /\b(?:think\s+of\s+it\s+(?:as|like)|imagine|consider|for\s+example|to\s+illustrate)\b/gi,
      /\b(?:the\s+key\s+(?:point|concept)|important\s+to\s+(?:understand|remember|note))\b/gi
    ],
    problem_solving: [
      /\b(?:the\s+(?:issue|problem|challenge)\s+(?:is|here)|root\s+cause|solution\s+(?:is|would\s+be))\b/gi,
      /\b(?:troubleshoot|debug|diagnose|analyze|investigate|resolve)\b/gi,
      /\b(?:alternative|approach|strategy|workaround|fix)\b/gi
    ],
    domain_knowledge: [
      /\b(?:in\s+(?:this|that)\s+(?:field|domain|area)|industry\s+(?:standard|practice|norm))\b/gi,
      /\b(?:best\s+practice|common\s+(?:pattern|approach|mistake)|typical(?:ly)?|usually|generally)\b/gi,
      /\b(?:according\s+to|based\s+on|research\s+shows|studies\s+indicate)\b/gi
    ],
    experience_sharing: [
      /\b(?:I've\s+(?:seen|found|learned|discovered)|in\s+my\s+experience|from\s+(?:my\s+)?experience)\b/gi,
      /\b(?:when\s+I\s+(?:was|worked)|at\s+(?:my\s+)?(?:previous|current|last)\s+(?:job|company|role))\b/gi,
      /\b(?:learned\s+(?:the\s+)?hard\s+way|made\s+(?:that\s+)?mistake|been\s+there)\b/gi
    ],
    mentoring: [
      /\b(?:you\s+(?:should|could|might\s+want\s+to)|I\s+(?:suggest|recommend|advise))\b/gi,
      /\b(?:tip|advice|guidance|suggestion|recommendation)\b/gi,
      /\b(?:keep\s+(?:in\s+)?mind|remember\s+(?:that|to)|be\s+(?:careful|aware)\s+(?:of|that))\b/gi
    ],
    innovation: [
      /\b(?:new\s+(?:approach|method|way|technique)|innovative|creative|novel|breakthrough)\b/gi,
      /\b(?:I\s+(?:developed|created|invented|came\s+up\s+with)|my\s+(?:approach|method|solution))\b/gi,
      /\b(?:cutting\s+edge|state\s+of\s+the\s+art|latest|emerging|experimental)\b/gi
    ],
    leadership: [
      /\b(?:I\s+(?:led|managed|directed|coordinated)|as\s+(?:a\s+)?(?:lead|manager|director))\b/gi,
      /\b(?:team|project|initiative|strategy|vision|roadmap)\b/gi,
      /\b(?:decision|responsibility|accountability|ownership)\b/gi
    ]
  };

  private readonly domainKeywords = {
    'software_development': ['code', 'programming', 'development', 'software', 'application', 'system', 'framework'],
    'data_science': ['data', 'analytics', 'machine learning', 'ai', 'statistics', 'modeling', 'analysis'],
    'devops': ['deployment', 'infrastructure', 'cloud', 'docker', 'kubernetes', 'ci/cd', 'automation'],
    'design': ['ui', 'ux', 'design', 'user experience', 'interface', 'visual', 'prototype'],
    'business': ['strategy', 'business', 'market', 'sales', 'revenue', 'growth', 'customer'],
    'project_management': ['project', 'management', 'planning', 'timeline', 'resources', 'stakeholder'],
    'security': ['security', 'vulnerability', 'authentication', 'encryption', 'privacy', 'compliance'],
    'networking': ['network', 'protocol', 'routing', 'firewall', 'bandwidth', 'latency'],
    'database': ['database', 'sql', 'nosql', 'query', 'schema', 'indexing', 'performance']
  };

  private analysisCache = new Map<string, ExpertiseProfile[]>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour
  private readonly MIN_MESSAGES_FOR_ANALYSIS = 3;
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.4;

  constructor(
    private readonly contentClassifier: ContentClassifier,
    private readonly embeddingService: EmbeddingService
  ) {}

  /**
   * Analyze participant expertise from conversations
   */
  async analyzeParticipantExpertise(
    conversations: ParsedConversation[],
    options: ExpertiseAnalysisOptions = {}
  ): Promise<ExpertiseProfile[]> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting expertise analysis', {
        conversationCount: conversations.length,
        options
      });

      // Check cache first
      const cacheKey = this.generateCacheKey(conversations, options);
      if (this.analysisCache.has(cacheKey)) {
        logger.debug('Returning cached expertise analysis');
        return this.analysisCache.get(cacheKey)!;
      }

      // Collect all participants and their messages
      const participantMessages = this.collectParticipantMessages(conversations);
      
      // Filter participants by message count
      const minMessages = options.minMessages || this.MIN_MESSAGES_FOR_ANALYSIS;
      const eligibleParticipants = Object.keys(participantMessages).filter(
        participant => participantMessages[participant].length >= minMessages
      );

      logger.info(`Analyzing ${eligibleParticipants.length} eligible participants`);

      const profiles: ExpertiseProfile[] = [];

      // Analyze each participant
      for (const participant of eligibleParticipants) {
        try {
          const profile = await this.analyzeParticipant(
            participant,
            participantMessages[participant],
            conversations,
            options
          );
          
          if (profile && profile.confidenceScore >= (options.minConfidence || this.MIN_CONFIDENCE_THRESHOLD)) {
            profiles.push(profile);
          }
        } catch (error) {
          logger.warn('Failed to analyze participant', {
            participant,
            error: error.message
          });
        }
      }

      // Analyze relationships if requested
      if (options.detectRelationships) {
        await this.analyzeExpertiseRelationships(profiles, conversations);
      }

      // Cache results
      this.analysisCache.set(cacheKey, profiles);
      setTimeout(() => this.analysisCache.delete(cacheKey), this.CACHE_TTL);

      const processingTime = Date.now() - startTime;
      
      logger.info('Expertise analysis completed', {
        profilesGenerated: profiles.length,
        processingTime,
        averageExpertiseLevel: this.calculateAverageExpertiseLevel(profiles)
      });

      return profiles;

    } catch (error) {
      logger.error('Expertise analysis failed', { error: error.message });
      throw new Error(`Expertise analysis failed: ${error.message}`);
    }
  }

  /**
   * Detect expertise domains in conversations
   */
  async detectExpertiseDomains(messages: ParsedMessage[]): Promise<ExpertiseDomain[]> {
    const domains: ExpertiseDomain[] = [];
    const domainCounts: Record<string, number> = {};
    const domainEvidence: Record<string, string[]> = {};

    // Analyze each message for domain indicators
    for (const message of messages) {
      const content = message.content.toLowerCase();
      
      for (const [domain, keywords] of Object.entries(this.domainKeywords)) {
        const keywordMatches = keywords.filter(keyword => 
          content.includes(keyword.toLowerCase())
        );
        
        if (keywordMatches.length > 0) {
          domainCounts[domain] = (domainCounts[domain] || 0) + keywordMatches.length;
          domainEvidence[domain] = domainEvidence[domain] || [];
          domainEvidence[domain].push(message.content);
        }
      }
    }

    // Convert counts to domain objects
    for (const [domain, count] of Object.entries(domainCounts)) {
      if (count >= 2) { // Minimum threshold
        const confidence = Math.min(1, count / (messages.length * 0.3));
        const level = this.assessDomainLevel(domainEvidence[domain], confidence);
        
        domains.push({
          id: uuidv4(),
          domain,
          level,
          confidence,
          indicators: await this.analyzeExpertiseIndicators(domainEvidence[domain]),
          skills: await this.extractSkills(domainEvidence[domain], domain),
          knowledge: await this.assessKnowledgeAreas(domainEvidence[domain], domain),
          experience: await this.extractExperienceEvidence(domainEvidence[domain], domain),
          teaching: await this.extractTeachingEvidence(domainEvidence[domain]),
          problemSolving: await this.extractProblemSolvingEvidence(domainEvidence[domain]),
          mentoring: await this.extractMentoringEvidence(domainEvidence[domain])
        });
      }
    }

    return domains;
  }

  /**
   * Score expertise confidence based on evidence
   */
  async scoreExpertiseConfidence(evidence: string[]): Promise<number> {
    if (evidence.length === 0) return 0;

    let totalScore = 0;
    let weightedEvidence = 0;

    for (const item of evidence) {
      const indicatorScores = await this.analyzeExpertiseIndicators([item]);
      const itemScore = indicatorScores.reduce((sum, indicator) => sum + indicator.strength, 0) / indicatorScores.length;
      
      const weight = Math.min(1, item.length / 100); // Longer evidence gets more weight
      totalScore += itemScore * weight;
      weightedEvidence += weight;
    }

    return weightedEvidence > 0 ? Math.min(1, totalScore / weightedEvidence) : 0;
  }

  /**
   * Build expertise graph showing relationships and knowledge flow
   */
  async buildExpertiseGraph(profiles: ExpertiseProfile[]): Promise<ExpertiseGraph> {
    const relationships: ExpertiseRelationship[] = [];
    const domainMaps: DomainExpertiseMap[] = [];
    const collaborations: CollaborationPattern[] = [];
    const knowledgeFlow: KnowledgeFlowPattern[] = [];
    const mentorshipNetworks: MentorshipNetwork[] = [];

    // Build domain expertise maps
    const allDomains = new Set<string>();
    for (const profile of profiles) {
      for (const domain of profile.domains) {
        allDomains.add(domain.domain);
      }
    }

    for (const domain of allDomains) {
      const experts = profiles
        .filter(p => p.domains.some(d => d.domain === domain))
        .map(p => {
          const domainInfo = p.domains.find(d => d.domain === domain)!;
          return {
            participant: p.participant,
            level: domainInfo.level,
            confidence: domainInfo.confidence
          };
        })
        .sort((a, b) => b.confidence - a.confidence);

      domainMaps.push({
        domain,
        experts,
        knowledgeGaps: [], // Would be populated with gap analysis
        learningOpportunities: [] // Would be populated with opportunity analysis
      });
    }

    return {
      participants: profiles,
      relationships,
      domains: domainMaps,
      collaborations,
      knowledgeFlow,
      mentorshipNetworks
    };
  }

  /**
   * Generate expertise recommendations
   */
  async generateRecommendations(
    profiles: ExpertiseProfile[],
    expertiseGraph: ExpertiseGraph
  ): Promise<ExpertiseRecommendation[]> {
    const recommendations: ExpertiseRecommendation[] = [];

    // Learning opportunity recommendations
    for (const profile of profiles) {
      const learningOpps = await this.identifyLearningOpportunities(profile, expertiseGraph);
      recommendations.push(...learningOpps);
    }

    // Mentoring match recommendations
    const mentoringMatches = await this.identifyMentoringMatches(profiles);
    recommendations.push(...mentoringMatches);

    // Collaboration suggestions
    const collaborationSuggestions = await this.identifyCollaborationOpportunities(profiles);
    recommendations.push(...collaborationSuggestions);

    return recommendations.sort((a, b) => b.estimatedImpact - a.estimatedImpact);
  }

  /**
   * Analyze a single participant's expertise
   */
  private async analyzeParticipant(
    participant: string,
    messages: ParsedMessage[],
    conversations: ParsedConversation[],
    options: ExpertiseAnalysisOptions
  ): Promise<ExpertiseProfile | null> {
    try {
      // Detect domains
      const domains = await this.detectExpertiseDomains(messages);
      
      if (domains.length === 0) {
        return null; // No expertise detected
      }

      // Calculate overall expertise level
      const overallLevel = this.calculateOverallExpertiseLevel(domains);
      
      // Calculate confidence score
      const confidenceScore = await this.calculateParticipantConfidence(messages, domains);
      
      // Extract evidence messages
      const evidenceMessages = this.extractEvidenceMessages(messages, domains);
      
      // Analyze growth trend if requested
      const growthTrend = options.analyzeGrowth 
        ? await this.analyzeGrowthTrend(participant, conversations)
        : 'unknown';

      return {
        id: uuidv4(),
        participant,
        domains,
        overallExpertiseLevel: overallLevel,
        confidenceScore,
        evidenceMessages: evidenceMessages.slice(0, 10), // Limit evidence
        metadata: {
          analysisDate: new Date(),
          totalMessages: messages.length,
          conversationsAnalyzed: conversations.length,
          domainCoverage: domains.length,
          consistencyScore: this.calculateConsistencyScore(domains),
          growthTrend,
          lastActivity: new Date(Math.max(...messages.map(m => m.timestamp.getTime())))
        }
      };
    } catch (error) {
      logger.warn('Failed to analyze participant expertise', {
        participant,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Collect messages by participant
   */
  private collectParticipantMessages(conversations: ParsedConversation[]): Record<string, ParsedMessage[]> {
    const participantMessages: Record<string, ParsedMessage[]> = {};

    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        if (!participantMessages[message.sender]) {
          participantMessages[message.sender] = [];
        }
        participantMessages[message.sender].push(message);
      }
    }

    return participantMessages;
  }

  /**
   * Analyze expertise indicators in text
   */
  private async analyzeExpertiseIndicators(evidence: string[]): Promise<ExpertiseIndicator[]> {
    const indicators: ExpertiseIndicator[] = [];

    for (const [type, patterns] of Object.entries(this.expertiseIndicators)) {
      const matches: string[] = [];
      let totalStrength = 0;

      for (const text of evidence) {
        for (const pattern of patterns) {
          const patternMatches = text.match(pattern);
          if (patternMatches) {
            matches.push(...patternMatches);
            totalStrength += patternMatches.length;
          }
        }
      }

      if (matches.length > 0) {
        const strength = Math.min(1, totalStrength / (evidence.length * 2));
        indicators.push({
          type: type as any,
          strength,
          evidence: [...new Set(matches)].slice(0, 5),
          messageIds: [] // Would be populated with actual message IDs
        });
      }
    }

    return indicators;
  }

  /**
   * Extract skills from evidence
   */
  private async extractSkills(evidence: string[], domain: string): Promise<Skill[]> {
    const skills: Skill[] = [];
    const skillPatterns = [
      /\b(?:skilled\s+(?:in|at|with)|experience\s+(?:with|in)|proficient\s+(?:in|with))\s+([^,.;]+)/gi,
      /\b(?:using|worked\s+with|familiar\s+with|know)\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s+(?:to|for|and)|[,.;]|$)/gi
    ];

    const allText = evidence.join(' ');
    
    for (const pattern of skillPatterns) {
      let match;
      while ((match = pattern.exec(allText)) !== null) {
        if (match[1] && match[1].trim().length > 2) {
          const skillName = match[1].trim();
          const category = this.categorizeSkill(skillName, domain);
          const level = this.assessSkillLevel(skillName, evidence);
          
          skills.push({
            name: skillName,
            category,
            level,
            confidence: 0.7, // Default confidence
            evidence: [match[0]]
          });
        }
      }
    }

    return [...new Set(skills.map(s => s.name))].map(name => 
      skills.find(s => s.name === name)!
    ).slice(0, 10); // Limit skills
  }

  /**
   * Assess knowledge areas
   */
  private async assessKnowledgeAreas(evidence: string[], domain: string): Promise<KnowledgeArea[]> {
    const knowledgeAreas: KnowledgeArea[] = [];
    
    // Simple implementation - would be enhanced with ML in production
    const keywords = this.domainKeywords[domain] || [];
    
    for (const keyword of keywords) {
      const mentions = evidence.filter(text => 
        text.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (mentions.length > 0) {
        const depth = this.assessKnowledgeDepth(mentions);
        const breadth = this.assessKnowledgeBreadth(mentions);
        const currency = this.assessKnowledgeCurrency(mentions);
        
        knowledgeAreas.push({
          area: keyword,
          depth,
          breadth,
          currency,
          evidence: mentions.slice(0, 3)
        });
      }
    }

    return knowledgeAreas;
  }

  /**
   * Extract experience evidence
   */
  private async extractExperienceEvidence(evidence: string[], domain: string): Promise<ExperienceEvidence[]> {
    const experiences: ExperienceEvidence[] = [];
    const experiencePatterns = [
      /(?:I\s+(?:worked\s+on|built|developed|led|managed)|project\s+(?:where|that)|when\s+I\s+was)\s+(.+?)(?:[,.;]|$)/gi,
      /(?:experience\s+(?:with|in)|worked\s+(?:at|with|on)|role\s+(?:as|at))\s+(.+?)(?:[,.;]|$)/gi
    ];

    const allText = evidence.join(' ');
    
    for (const pattern of experiencePatterns) {
      let match;
      while ((match = pattern.exec(allText)) !== null) {
        if (match[1] && match[1].trim().length > 10) {
          experiences.push({
            type: this.classifyExperienceType(match[1]),
            description: match[1].trim(),
            domain,
            complexity: this.assessComplexity(match[1]),
            outcome: 'success', // Default - would be analyzed from context
            messageId: 'unknown' // Would be actual message ID
          });
        }
      }
    }

    return experiences.slice(0, 5); // Limit experiences
  }

  /**
   * Extract teaching evidence
   */
  private async extractTeachingEvidence(evidence: string[]): Promise<TeachingEvidence[]> {
    const teachingEvidence: TeachingEvidence[] = [];
    const teachingPatterns = [
      /(?:let\s+me\s+explain|here's\s+how|the\s+way\s+to)\s+(.+?)(?:[,.;]|$)/gi,
      /(?:think\s+of\s+it\s+as|imagine|for\s+example)\s+(.+?)(?:[,.;]|$)/gi
    ];

    for (const text of evidence) {
      for (const pattern of teachingPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          if (match[1] && match[1].trim().length > 5) {
            teachingEvidence.push({
              type: this.classifyTeachingType(match[0]),
              topic: match[1].trim(),
              clarity: this.assessClarity(text),
              depth: this.assessDepth(text),
              accuracy: 0.8, // Default - would be validated
              helpfulness: 0.8, // Default - would be assessed
              messageId: 'unknown'
            });
          }
        }
      }
    }

    return teachingEvidence.slice(0, 5);
  }

  /**
   * Extract problem solving evidence
   */
  private async extractProblemSolvingEvidence(evidence: string[]): Promise<ProblemSolvingEvidence[]> {
    const problemSolving: ProblemSolvingEvidence[] = [];
    const problemPatterns = [
      /(?:the\s+(?:problem|issue)\s+(?:is|was)|solution\s+(?:is|was|would\s+be))\s+(.+?)(?:[,.;]|$)/gi,
      /(?:to\s+(?:fix|solve|resolve)|approach\s+(?:is|was))\s+(.+?)(?:[,.;]|$)/gi
    ];

    for (const text of evidence) {
      for (const pattern of problemPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          if (match[1] && match[1].trim().length > 5) {
            problemSolving.push({
              type: this.classifyProblemSolvingType(match[0]),
              problem: 'Identified problem', // Would extract from context
              approach: match[0],
              solution: match[1].trim(),
              effectiveness: 0.7, // Default - would be assessed
              creativity: 0.6, // Default - would be assessed
              messageId: 'unknown'
            });
          }
        }
      }
    }

    return problemSolving.slice(0, 5);
  }

  /**
   * Extract mentoring evidence
   */
  private async extractMentoringEvidence(evidence: string[]): Promise<MentoringEvidence[]> {
    const mentoringEvidence: MentoringEvidence[] = [];
    const mentoringPatterns = [
      /(?:you\s+(?:should|could|might\s+want\s+to)|I\s+(?:suggest|recommend|advise))\s+(.+?)(?:[,.;]|$)/gi,
      /(?:tip|advice|keep\s+in\s+mind|remember\s+to)\s+(.+?)(?:[,.;]|$)/gi
    ];

    for (const text of evidence) {
      for (const pattern of mentoringPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          if (match[1] && match[1].trim().length > 5) {
            mentoringEvidence.push({
              type: this.classifyMentoringType(match[0]),
              mentee: 'unknown', // Would be extracted from conversation context
              topic: match[1].trim(),
              supportiveness: 0.8, // Default - would be assessed
              constructiveness: 0.8, // Default - would be assessed
              messageId: 'unknown'
            });
          }
        }
      }
    }

    return mentoringEvidence.slice(0, 5);
  }

  // Assessment and classification helper methods
  private assessDomainLevel(evidence: string[], confidence: number): ExpertiseDomain['level'] {
    const complexity = this.calculateTextComplexity(evidence.join(' '));
    const depth = evidence.filter(e => e.length > 100).length / evidence.length;
    
    const score = (confidence + complexity + depth) / 3;
    
    if (score > 0.8) return 'expert';
    if (score > 0.6) return 'advanced';
    if (score > 0.4) return 'intermediate';
    return 'novice';
  }

  private calculateOverallExpertiseLevel(domains: ExpertiseDomain[]): ExpertiseProfile['overallExpertiseLevel'] {
    if (domains.length === 0) return 'novice';
    
    const levelScores = {
      'novice': 1,
      'intermediate': 2,
      'advanced': 3,
      'expert': 4,
      'master': 5
    };
    
    const avgScore = domains.reduce((sum, d) => sum + levelScores[d.level], 0) / domains.length;
    
    if (avgScore >= 4.5) return 'master';
    if (avgScore >= 3.5) return 'expert';
    if (avgScore >= 2.5) return 'advanced';
    if (avgScore >= 1.5) return 'intermediate';
    return 'novice';
  }

  private async calculateParticipantConfidence(messages: ParsedMessage[], domains: ExpertiseDomain[]): Promise<number> {
    let totalConfidence = 0;
    let weightedDomains = 0;

    for (const domain of domains) {
      const weight = domain.indicators.length; // More indicators = higher weight
      totalConfidence += domain.confidence * weight;
      weightedDomains += weight;
    }

    const baseConfidence = weightedDomains > 0 ? totalConfidence / weightedDomains : 0;
    
    // Adjust based on message quantity and quality
    const messageBonus = Math.min(0.2, messages.length / 50);
    const qualityBonus = this.assessMessageQuality(messages) * 0.1;
    
    return Math.min(1, baseConfidence + messageBonus + qualityBonus);
  }

  private extractEvidenceMessages(messages: ParsedMessage[], domains: ExpertiseDomain[]): string[] {
    const evidenceMessages: string[] = [];
    
    for (const domain of domains) {
      for (const indicator of domain.indicators) {
        evidenceMessages.push(...indicator.evidence);
      }
    }
    
    return [...new Set(evidenceMessages)];
  }

  private calculateConsistencyScore(domains: ExpertiseDomain[]): number {
    if (domains.length === 0) return 0;
    
    const confidences = domains.map(d => d.confidence);
    const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
    
    return Math.max(0, 1 - variance); // Lower variance = higher consistency
  }

  private async analyzeGrowthTrend(participant: string, conversations: ParsedConversation[]): Promise<ExpertiseProfile['metadata']['growthTrend']> {
    // Simple implementation - would analyze expertise over time
    return 'stable';
  }

  private categorizeSkill(skillName: string, domain: string): Skill['category'] {
    const technicalPatterns = /\b(?:programming|coding|development|framework|language|tool|library|api)\b/i;
    const softPatterns = /\b(?:communication|leadership|teamwork|problem.solving|management|presentation)\b/i;
    
    if (technicalPatterns.test(skillName)) return 'technical';
    if (softPatterns.test(skillName)) return 'soft';
    
    return 'domain';
  }

  private assessSkillLevel(skillName: string, evidence: string[]): Skill['level'] {
    const mentions = evidence.filter(e => e.toLowerCase().includes(skillName.toLowerCase()));
    const complexity = this.calculateTextComplexity(mentions.join(' '));
    
    if (complexity > 0.7) return 'expert';
    if (complexity > 0.5) return 'advanced';
    if (complexity > 0.3) return 'intermediate';
    return 'basic';
  }

  private assessKnowledgeDepth(mentions: string[]): KnowledgeArea['depth'] {
    const avgLength = mentions.reduce((sum, m) => sum + m.length, 0) / mentions.length;
    const complexity = this.calculateTextComplexity(mentions.join(' '));
    
    const score = (avgLength / 200 + complexity) / 2;
    
    if (score > 0.7) return 'expert';
    if (score > 0.5) return 'deep';
    if (score > 0.3) return 'working';
    return 'surface';
  }

  private assessKnowledgeBreadth(mentions: string[]): KnowledgeArea['breadth'] {
    const uniqueTopics = new Set(mentions.map(m => this.extractTopic(m)));
    
    if (uniqueTopics.size > 5) return 'comprehensive';
    if (uniqueTopics.size > 3) return 'broad';
    if (uniqueTopics.size > 1) return 'moderate';
    return 'narrow';
  }

  private assessKnowledgeCurrency(mentions: string[]): KnowledgeArea['currency'] {
    const recentKeywords = ['latest', 'new', 'recent', 'current', 'modern', '2023', '2024', '2025'];
    const outdatedKeywords = ['old', 'legacy', 'deprecated', 'obsolete'];
    
    const allText = mentions.join(' ').toLowerCase();
    const recentCount = recentKeywords.filter(k => allText.includes(k)).length;
    const outdatedCount = outdatedKeywords.filter(k => allText.includes(k)).length;
    
    if (recentCount > outdatedCount && recentCount > 0) return 'cutting_edge';
    if (outdatedCount > recentCount) return 'outdated';
    return 'current';
  }

  private classifyExperienceType(description: string): ExperienceEvidence['type'] {
    if (/\b(?:project|built|developed)\b/i.test(description)) return 'project';
    if (/\b(?:role|position|job)\b/i.test(description)) return 'role';
    if (/\b(?:achieved|accomplished|success)\b/i.test(description)) return 'achievement';
    if (/\b(?:challenge|difficult|problem)\b/i.test(description)) return 'challenge';
    return 'project';
  }

  private assessComplexity(text: string): ExperienceEvidence['complexity'] {
    const complexity = this.calculateTextComplexity(text);
    
    if (complexity > 0.7) return 'expert';
    if (complexity > 0.5) return 'complex';
    if (complexity > 0.3) return 'moderate';
    return 'simple';
  }

  private classifyTeachingType(text: string): TeachingEvidence['type'] {
    if (/\b(?:explain|explanation)\b/i.test(text)) return 'explanation';
    if (/\b(?:step|tutorial|how.to)\b/i.test(text)) return 'tutorial';
    if (/\b(?:guide|guidance|help)\b/i.test(text)) return 'guidance';
    if (/\b(?:correct|wrong|mistake)\b/i.test(text)) return 'correction';
    return 'concept_clarification';
  }

  private classifyProblemSolvingType(text: string): ProblemSolvingEvidence['type'] {
    if (/\b(?:analyze|analysis)\b/i.test(text)) return 'analysis';
    if (/\b(?:solution|solve)\b/i.test(text)) return 'solution';
    if (/\b(?:debug|fix|troubleshoot)\b/i.test(text)) return 'debugging';
    if (/\b(?:optimize|improve)\b/i.test(text)) return 'optimization';
    if (/\b(?:design|architect)\b/i.test(text)) return 'design';
    return 'troubleshooting';
  }

  private classifyMentoringType(text: string): MentoringEvidence['type'] {
    if (/\b(?:suggest|recommend|advise)\b/i.test(text)) return 'guidance';
    if (/\b(?:feedback|review)\b/i.test(text)) return 'feedback';
    if (/\b(?:encourage|support)\b/i.test(text)) return 'encouragement';
    if (/\b(?:career|growth|development)\b/i.test(text)) return 'career_advice';
    return 'skill_development';
  }

  private assessClarity(text: string): number {
    // Simple clarity assessment - would be enhanced with NLP
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    
    return Math.max(0, Math.min(1, 1 - (avgSentenceLength - 15) / 30)); // Optimal around 15 words
  }

  private assessDepth(text: string): number {
    return this.calculateTextComplexity(text);
  }

  private calculateTextComplexity(text: string): number {
    const words = text.split(/\s+/);
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    const technicalTerms = words.filter(w => w.length > 8 || /[A-Z]{2,}/.test(w)).length;
    
    const lengthScore = Math.min(1, avgWordLength / 10);
    const technicalScore = Math.min(1, technicalTerms / words.length * 10);
    
    return (lengthScore + technicalScore) / 2;
  }

  private assessMessageQuality(messages: ParsedMessage[]): number {
    const avgLength = messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
    const complexity = messages.reduce((sum, m) => sum + this.calculateTextComplexity(m.content), 0) / messages.length;
    
    return (Math.min(1, avgLength / 200) + complexity) / 2;
  }

  private extractTopic(text: string): string {
    // Simple topic extraction - would use topic modeling in production
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    return words[0] || 'general';
  }

  private async analyzeExpertiseRelationships(profiles: ExpertiseProfile[], conversations: ParsedConversation[]): Promise<void> {
    // This would analyze relationships between participants
    // Implementation would look for mentor-mentee patterns, collaboration patterns, etc.
  }

  private async identifyLearningOpportunities(profile: ExpertiseProfile, expertiseGraph: ExpertiseGraph): Promise<ExpertiseRecommendation[]> {
    // This would identify learning opportunities for the participant
    return [];
  }

  private async identifyMentoringMatches(profiles: ExpertiseProfile[]): Promise<ExpertiseRecommendation[]> {
    // This would identify potential mentor-mentee matches
    return [];
  }

  private async identifyCollaborationOpportunities(profiles: ExpertiseProfile[]): Promise<ExpertiseRecommendation[]> {
    // This would identify collaboration opportunities
    return [];
  }

  private calculateAverageExpertiseLevel(profiles: ExpertiseProfile[]): number {
    if (profiles.length === 0) return 0;
    
    const levelScores = {
      'novice': 1,
      'intermediate': 2,
      'advanced': 3,
      'expert': 4,
      'master': 5
    };
    
    return profiles.reduce((sum, p) => sum + levelScores[p.overallExpertiseLevel], 0) / profiles.length;
  }

  private generateCacheKey(conversations: ParsedConversation[], options: ExpertiseAnalysisOptions): string {
    const conversationIds = conversations.map(c => c.id).sort().join(',');
    const optionsKey = JSON.stringify(options);
    return `${conversationIds}_${optionsKey}`;
  }
}