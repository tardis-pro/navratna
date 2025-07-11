import { z } from 'zod';
import { IDSchema, BaseEntitySchema } from './common.js';
import { EventType } from './events.js';
import { WebSocketEventType } from './websocket.js';
import { KnowledgeType, SourceType } from './knowledge-graph.js';

// Extend EventType enum for conversation intelligence
export enum ConversationIntelligenceEventType {
  // Intent Detection Events
  INTENT_DETECTION_REQUESTED = 'intent.detection.requested',
  INTENT_DETECTION_COMPLETED = 'intent.detection.completed',
  
  // Topic Generation Events
  TOPIC_GENERATION_REQUESTED = 'topic.generation.requested',
  TOPIC_GENERATION_COMPLETED = 'topic.generation.completed',
  
  // Prompt Suggestion Events
  PROMPT_SUGGESTIONS_REQUESTED = 'prompt.suggestions.requested',
  PROMPT_SUGGESTIONS_COMPLETED = 'prompt.suggestions.completed',
  
  // Autocomplete Events
  AUTOCOMPLETE_QUERY_REQUESTED = 'autocomplete.query.requested',
  AUTOCOMPLETE_SUGGESTIONS_READY = 'autocomplete.suggestions.ready',
  
  // AI Enhancement Events
  AI_ENHANCEMENT_REQUESTED = 'ai.enhancement.requested',
  AI_ENHANCEMENT_COMPLETED = 'ai.enhancement.completed',
  
  // Writing Enhancement Events
  WRITING_ENHANCEMENT_REQUESTED = 'writing.enhancement.requested',
  WRITING_ENHANCEMENT_COMPLETED = 'writing.enhancement.completed',
  
  // Style Analysis Events
  STYLE_ANALYSIS_REQUESTED = 'style.analysis.requested',
  STYLE_ANALYSIS_COMPLETED = 'style.analysis.completed',
  
  // Memory Events
  CONVERSATION_MEMORY_STORED = 'conversation.memory.stored',
  CONVERSATION_PATTERN_DETECTED = 'conversation.pattern.detected',
  USER_PREFERENCE_LEARNED = 'user.preference.learned'
}

// Extend WebSocket events for real-time features
export enum ConversationWebSocketEventType {
  INTENT_DETECTED = 'intent:detected',
  TOPIC_GENERATED = 'topic:generated',
  SUGGESTIONS_UPDATED = 'suggestions:updated',
  AUTOCOMPLETE_RESULTS = 'autocomplete:results',
  TOOL_PREVIEW = 'tool:preview',
  AI_ENHANCEMENT_RESULTS = 'ai_enhancement:results',
  WRITING_ENHANCEMENT_RESULTS = 'writing_enhancement:results',
  STYLE_ANALYSIS_RESULTS = 'style_analysis:results'
}

// Intent Detection Types
export enum IntentCategory {
  QUESTION = 'question',
  COMMAND = 'command',
  TOOL_REQUEST = 'tool_request',
  CONVERSATION = 'conversation',
  CLARIFICATION = 'clarification'
}

export enum IntentSubType {
  // Question sub-types
  FACTUAL = 'factual',
  EXPLORATORY = 'exploratory',
  TROUBLESHOOTING = 'troubleshooting',
  HOW_TO = 'how_to',
  
  // Command sub-types
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  CONFIGURE = 'configure',
  
  // Tool sub-types
  EXECUTE_CODE = 'execute_code',
  SEARCH_WEB = 'search_web',
  ANALYZE_DATA = 'analyze_data',
  CREATE_ARTIFACT = 'create_artifact'
}

export const IntentSchema = z.object({
  category: z.nativeEnum(IntentCategory),
  subType: z.nativeEnum(IntentSubType),
  confidence: z.number().min(0).max(1),
  extractedParameters: z.record(z.any()).optional(),
  suggestedTools: z.array(z.string()).optional(),
  reasoning: z.string().optional()
});

export type Intent = z.infer<typeof IntentSchema>;

// Intent Detection Event Schemas
export const IntentDetectionRequestedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.INTENT_DETECTION_REQUESTED),
  data: z.object({
    userId: IDSchema,
    conversationId: IDSchema,
    agentId: IDSchema,
    text: z.string(),
    context: z.object({
      previousMessages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
        timestamp: z.date()
      })).optional(),
      currentTopic: z.string().optional(),
      userPreferences: z.record(z.any()).optional()
    }).optional()
  })
});

export const IntentDetectionCompletedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.INTENT_DETECTION_COMPLETED),
  data: z.object({
    userId: IDSchema,
    conversationId: IDSchema,
    agentId: IDSchema,
    intent: IntentSchema,
    suggestions: z.array(z.object({
      prompt: z.string(),
      confidence: z.number(),
      category: z.string()
    })).optional(),
    toolPreview: z.object({
      toolName: z.string(),
      parameters: z.record(z.any()),
      requiresConfirmation: z.boolean()
    }).optional()
  })
});

// Topic Generation Types
export const TopicGenerationRequestedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.TOPIC_GENERATION_REQUESTED),
  data: z.object({
    conversationId: IDSchema,
    messages: z.array(z.object({
      content: z.string(),
      role: z.enum(['user', 'assistant']),
      timestamp: z.date()
    })),
    currentTopic: z.string().optional()
  })
});

export const TopicGenerationCompletedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.TOPIC_GENERATION_COMPLETED),
  data: z.object({
    conversationId: IDSchema,
    topicName: z.string(),
    keywords: z.array(z.string()),
    summary: z.string().optional(),
    confidence: z.number().min(0).max(1)
  })
});

// Prompt Suggestion Types
export const PromptSuggestionSchema = z.object({
  prompt: z.string(),
  category: z.nativeEnum(IntentCategory),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  relevanceScore: z.number().min(0).max(1),
  basedOn: z.array(z.enum(['history', 'context', 'trending', 'capability'])).optional()
});

export type PromptSuggestion = z.infer<typeof PromptSuggestionSchema>;

export const PromptSuggestionsRequestedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_REQUESTED),
  data: z.object({
    userId: IDSchema,
    agentId: IDSchema,
    conversationContext: z.object({
      currentTopic: z.string().optional(),
      recentMessages: z.array(z.object({
        content: z.string(),
        role: z.enum(['user', 'assistant']),
        timestamp: z.date()
      })),
      userInterests: z.array(z.string()).optional()
    }),
    count: z.number().min(1).max(10).default(3)
  })
});

export const PromptSuggestionsCompletedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_COMPLETED),
  data: z.object({
    userId: IDSchema,
    agentId: IDSchema,
    suggestions: z.array(PromptSuggestionSchema)
  })
});

// Autocomplete Types
export const AutocompleteSuggestionSchema = z.object({
  text: z.string(),
  type: z.enum(['command', 'question', 'tool', 'previous', 'common', 'ai_generated', 'topic', 'context']),
  score: z.number().min(0).max(1),
  metadata: z.object({
    icon: z.string().optional(),
    description: z.string().optional(),
    frequency: z.number().optional(),
    lastUsed: z.date().optional()
  }).optional()
});

export type AutocompleteSuggestion = z.infer<typeof AutocompleteSuggestionSchema>;

export const AutocompleteQueryRequestedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.AUTOCOMPLETE_QUERY_REQUESTED),
  data: z.object({
    userId: IDSchema,
    agentId: IDSchema,
    partial: z.string(),
    context: z.object({
      conversationId: IDSchema.optional(),
      currentIntent: IntentSchema.optional(),
      recentQueries: z.array(z.string()).optional()
    }).optional(),
    limit: z.number().min(1).max(20).default(5)
  })
});

export const AutocompleteSuggestionsReadyEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.AUTOCOMPLETE_SUGGESTIONS_READY),
  data: z.object({
    userId: IDSchema,
    agentId: IDSchema,
    suggestions: z.array(AutocompleteSuggestionSchema),
    queryTime: z.number() // milliseconds
  })
});

// Conversation Memory Types
export const ConversationMemorySchema = z.object({
  id: IDSchema,
  userId: IDSchema,
  agentId: IDSchema,
  conversationId: IDSchema,
  turn: z.object({
    userMessage: z.string(),
    assistantResponse: z.string(),
    intent: IntentSchema.optional(),
    toolsUsed: z.array(z.string()).optional(),
    timestamp: z.date()
  }),
  embeddings: z.object({
    userMessageEmbedding: z.array(z.number()),
    responseEmbedding: z.array(z.number()),
    combinedEmbedding: z.array(z.number()).optional()
  }),
  metadata: z.object({
    topic: z.string().optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    duration: z.number().optional(), // milliseconds
    tokens: z.number().optional()
  }).optional()
});

export type ConversationMemory = z.infer<typeof ConversationMemorySchema>;

export const ConversationPatternSchema = z.object({
  userId: IDSchema,
  pattern: z.object({
    type: z.enum(['query_sequence', 'tool_preference', 'topic_interest', 'interaction_style']),
    description: z.string(),
    frequency: z.number(),
    confidence: z.number().min(0).max(1),
    examples: z.array(z.string()),
    lastObserved: z.date()
  }),
  recommendations: z.array(z.string()).optional()
});

export type ConversationPattern = z.infer<typeof ConversationPatternSchema>;

// WebSocket Real-time Event Schemas
export const IntentDetectedWebSocketEventSchema = z.object({
  type: z.literal(ConversationWebSocketEventType.INTENT_DETECTED),
  data: z.object({
    intent: IntentSchema,
    toolPreview: z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.any()),
      estimatedDuration: z.number().optional()
    }).optional()
  })
});

export const TopicGeneratedWebSocketEventSchema = z.object({
  type: z.literal(ConversationWebSocketEventType.TOPIC_GENERATED),
  data: z.object({
    topicName: z.string(),
    confidence: z.number()
  })
});

export const SuggestionsUpdatedWebSocketEventSchema = z.object({
  type: z.literal(ConversationWebSocketEventType.SUGGESTIONS_UPDATED),
  data: z.object({
    prompts: z.array(PromptSuggestionSchema)
  })
});

export const AutocompleteResultsWebSocketEventSchema = z.object({
  type: z.literal(ConversationWebSocketEventType.AUTOCOMPLETE_RESULTS),
  data: z.object({
    suggestions: z.array(AutocompleteSuggestionSchema),
    partial: z.string()
  })
});

// Export all event types
export type IntentDetectionRequestedEvent = z.infer<typeof IntentDetectionRequestedEventSchema>;
export type IntentDetectionCompletedEvent = z.infer<typeof IntentDetectionCompletedEventSchema>;
export type TopicGenerationRequestedEvent = z.infer<typeof TopicGenerationRequestedEventSchema>;
export type TopicGenerationCompletedEvent = z.infer<typeof TopicGenerationCompletedEventSchema>;
export type PromptSuggestionsRequestedEvent = z.infer<typeof PromptSuggestionsRequestedEventSchema>;
export type PromptSuggestionsCompletedEvent = z.infer<typeof PromptSuggestionsCompletedEventSchema>;
export type AutocompleteQueryRequestedEvent = z.infer<typeof AutocompleteQueryRequestedEventSchema>;
export type AutocompleteSuggestionsReadyEvent = z.infer<typeof AutocompleteSuggestionsReadyEventSchema>;

// Service Configuration Types
export const ConversationIntelligenceConfigSchema = z.object({
  intent: z.object({
    confidenceThreshold: z.number().min(0).max(1).default(0.7),
    cacheEnabled: z.boolean().default(true),
    cacheTTL: z.number().default(300000), // 5 minutes
    maxHistoryContext: z.number().default(10)
  }),
  topic: z.object({
    minMessages: z.number().default(3),
    maxTopicLength: z.number().default(50),
    updateFrequency: z.enum(['realtime', 'periodic', 'manual']).default('periodic')
  }),
  suggestions: z.object({
    count: z.number().min(1).max(10).default(3),
    diversityWeight: z.number().min(0).max(1).default(0.3),
    personalizedWeight: z.number().min(0).max(1).default(0.7)
  }),
  autocomplete: z.object({
    minChars: z.number().default(2),
    maxSuggestions: z.number().default(5),
    debounceMs: z.number().default(300),
    sources: z.array(z.enum(['history', 'tools', 'common', 'context'])).default(['history', 'tools'])
  })
});

export type ConversationIntelligenceConfig = z.infer<typeof ConversationIntelligenceConfigSchema>;

// AI Enhancement Types
export enum EnhancementType {
  TOPIC_GENERATION = 'topic',
  CONTEXT_ENHANCEMENT = 'context',
  WRITING_IMPROVEMENT = 'writing',
  STYLE_ANALYSIS = 'style',
  TONE_OPTIMIZATION = 'tone',
  CLARITY_IMPROVEMENT = 'clarity',
  GRAMMAR_CHECK = 'grammar',
  GENERAL = 'general'
}

export const EnhancementRequestSchema = z.object({
  type: z.nativeEnum(EnhancementType),
  currentText: z.string(),
  context: z.object({
    purpose: z.string().optional(),
    discussionType: z.string().optional(),
    selectedAgents: z.array(z.string()).optional(),
    conversationId: z.string().optional(),
    userPreferences: z.record(z.any()).optional()
  }).optional(),
  prompt: z.string().optional(),
  maxSuggestions: z.number().min(1).max(10).default(3)
});

export type EnhancementRequest = z.infer<typeof EnhancementRequestSchema>;

export const EnhancementResultSchema = z.object({
  type: z.nativeEnum(EnhancementType),
  originalText: z.string(),
  suggestions: z.array(z.object({
    text: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional(),
    changes: z.array(z.object({
      type: z.enum(['addition', 'modification', 'deletion', 'restructure']),
      description: z.string(),
      position: z.number().optional()
    })).optional()
  })),
  metadata: z.object({
    processingTime: z.number(),
    llmModel: z.string().optional(),
    tokensUsed: z.number().optional()
  }).optional()
});

export type EnhancementResult = z.infer<typeof EnhancementResultSchema>;

// AI Enhancement Event Schemas
export const AIEnhancementRequestedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.AI_ENHANCEMENT_REQUESTED),
  data: z.object({
    userId: IDSchema,
    requestId: IDSchema,
    enhancement: EnhancementRequestSchema
  })
});

export const AIEnhancementCompletedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.AI_ENHANCEMENT_COMPLETED),
  data: z.object({
    userId: IDSchema,
    requestId: IDSchema,
    result: EnhancementResultSchema
  })
});

// Writing Enhancement Event Schemas
export const WritingEnhancementRequestedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.WRITING_ENHANCEMENT_REQUESTED),
  data: z.object({
    userId: IDSchema,
    requestId: IDSchema,
    text: z.string(),
    enhancementType: z.enum(['clarity', 'conciseness', 'engagement', 'professionalism']),
    context: z.object({
      audience: z.string().optional(),
      purpose: z.string().optional(),
      tone: z.string().optional()
    }).optional()
  })
});

export const WritingEnhancementCompletedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.WRITING_ENHANCEMENT_COMPLETED),
  data: z.object({
    userId: IDSchema,
    requestId: IDSchema,
    originalText: z.string(),
    enhancedText: z.string(),
    improvements: z.array(z.object({
      category: z.string(),
      description: z.string(),
      impact: z.enum(['low', 'medium', 'high'])
    })),
    score: z.object({
      readability: z.number().min(0).max(100),
      engagement: z.number().min(0).max(100),
      clarity: z.number().min(0).max(100)
    })
  })
});

// Style Analysis Event Schemas
export const StyleAnalysisRequestedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.STYLE_ANALYSIS_REQUESTED),
  data: z.object({
    userId: IDSchema,
    requestId: IDSchema,
    text: z.string(),
    analysisType: z.enum(['tone', 'formality', 'complexity', 'sentiment', 'writing_style'])
  })
});

export const StyleAnalysisCompletedEventSchema = z.object({
  type: z.literal(ConversationIntelligenceEventType.STYLE_ANALYSIS_COMPLETED),
  data: z.object({
    userId: IDSchema,
    requestId: IDSchema,
    analysis: z.object({
      tone: z.object({
        primary: z.string(),
        confidence: z.number().min(0).max(1),
        characteristics: z.array(z.string())
      }),
      formality: z.object({
        level: z.enum(['very_informal', 'informal', 'neutral', 'formal', 'very_formal']),
        score: z.number().min(0).max(1)
      }),
      complexity: z.object({
        readingLevel: z.string(),
        sentenceComplexity: z.enum(['simple', 'moderate', 'complex']),
        vocabularyLevel: z.enum(['basic', 'intermediate', 'advanced'])
      }),
      sentiment: z.object({
        polarity: z.enum(['positive', 'neutral', 'negative']),
        intensity: z.number().min(0).max(1)
      }),
      writingStyle: z.object({
        primaryStyle: z.string(),
        characteristics: z.array(z.string()),
        suggestions: z.array(z.string())
      })
    })
  })
});

// WebSocket Enhancement Event Schemas
export const AIEnhancementResultsWebSocketEventSchema = z.object({
  type: z.literal(ConversationWebSocketEventType.AI_ENHANCEMENT_RESULTS),
  data: z.object({
    requestId: IDSchema,
    result: EnhancementResultSchema
  })
});

export const WritingEnhancementResultsWebSocketEventSchema = z.object({
  type: z.literal(ConversationWebSocketEventType.WRITING_ENHANCEMENT_RESULTS),
  data: z.object({
    requestId: IDSchema,
    originalText: z.string(),
    enhancedText: z.string(),
    improvements: z.array(z.object({
      category: z.string(),
      description: z.string(),
      impact: z.enum(['low', 'medium', 'high'])
    }))
  })
});

export const StyleAnalysisResultsWebSocketEventSchema = z.object({
  type: z.literal(ConversationWebSocketEventType.STYLE_ANALYSIS_RESULTS),
  data: z.object({
    requestId: IDSchema,
    analysis: z.object({
      tone: z.string(),
      formality: z.string(),
      suggestions: z.array(z.string())
    })
  })
});

// Export new event types
export type AIEnhancementRequestedEvent = z.infer<typeof AIEnhancementRequestedEventSchema>;
export type AIEnhancementCompletedEvent = z.infer<typeof AIEnhancementCompletedEventSchema>;
export type WritingEnhancementRequestedEvent = z.infer<typeof WritingEnhancementRequestedEventSchema>;
export type WritingEnhancementCompletedEvent = z.infer<typeof WritingEnhancementCompletedEventSchema>;
export type StyleAnalysisRequestedEvent = z.infer<typeof StyleAnalysisRequestedEventSchema>;
export type StyleAnalysisCompletedEvent = z.infer<typeof StyleAnalysisCompletedEventSchema>;