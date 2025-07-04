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
  TOOL_PREVIEW = 'tool:preview'
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
  type: z.enum(['command', 'question', 'tool', 'previous', 'common']),
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