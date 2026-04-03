import { useState, useCallback, useEffect, useRef } from 'react';
import { useConversationIntelligence } from '@/hooks/use_conversation_intelligence';
import { edenRequest } from '@/api/eden';
import type {
  IntentOption,
  IntentCategory,
  IntentDetectionResult,
  UseIntentDetectionOptions,
  IntentSearchResult,
} from './intent_field_types';

const STATIC_OPTIONS: IntentOption[] = [
  {
    id: 'agent-create',
    type: 'agent',
    title: 'Create AI Agent',
    description: 'Spawn a new AI agent',
    keywords: ['agent', 'ai', 'create', 'spawn'],
    icon: '🤖',
  },
  {
    id: 'agent-manage',
    type: 'agent',
    title: 'Manage Agents',
    description: 'View and configure agents',
    keywords: ['agent', 'manage', 'config'],
    icon: '🤖',
  },
  {
    id: 'portal-dashboard',
    type: 'portal',
    title: 'Dashboard',
    description: 'Open the main dashboard',
    keywords: ['dashboard', 'home', 'overview'],
    icon: '🚪',
  },
  {
    id: 'portal-settings',
    type: 'portal',
    title: 'Settings',
    description: 'System configuration',
    keywords: ['settings', 'config', 'preferences'],
    icon: '🚪',
  },
  {
    id: 'portal-knowledge',
    type: 'portal',
    title: 'Knowledge Base',
    description: 'Browse knowledge articles',
    keywords: ['knowledge', 'docs', 'articles', 'wiki'],
    icon: '📚',
  },
  {
    id: 'portal-tools',
    type: 'portal',
    title: 'Tools',
    description: 'Available tools and integrations',
    keywords: ['tools', 'integrations', 'utilities'],
    icon: '🚪',
  },
  {
    id: 'sop-new-discussion',
    type: 'sop',
    title: 'Start Discussion',
    description: 'Create a new discussion thread',
    keywords: ['discussion', 'chat', 'new', 'start'],
    icon: '📋',
  },
  {
    id: 'sop-search',
    type: 'sop',
    title: 'Search History',
    description: 'Find past conversations',
    keywords: ['search', 'history', 'find'],
    icon: '📋',
  },
  {
    id: 'knowledge-search',
    type: 'knowledge',
    title: 'Search Knowledge',
    description: 'Find documents and resources',
    keywords: ['search', 'knowledge', 'docs', 'find'],
    icon: '📚',
  },
  {
    id: 'knowledge-upload',
    type: 'knowledge',
    title: 'Upload Document',
    description: 'Add new knowledge content',
    keywords: ['upload', 'document', 'add', 'knowledge'],
    icon: '📚',
  },
  {
    id: 'action-export',
    type: 'action',
    title: 'Export Data',
    description: 'Export conversation or data',
    keywords: ['export', 'download', 'save'],
    icon: '⚡',
  },
  {
    id: 'action-share',
    type: 'action',
    title: 'Share',
    description: 'Share with team members',
    keywords: ['share', 'collaborate', 'team'],
    icon: '⚡',
  },
];

const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;

type RelevanceCandidateType = 'agent' | 'sop' | 'task' | 'knowledge' | 'capability';

interface RelevanceApiResult {
  id: string;
  score: number;
}

interface RelevanceApiResponse {
  results?: RelevanceApiResult[];
}

const RELEVANCE_TYPE_MAP: Record<IntentOption['type'], RelevanceCandidateType> = {
  agent: 'agent',
  portal: 'capability',
  sop: 'sop',
  knowledge: 'knowledge',
  action: 'task',
};

function toNumberVector(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const isNumberVector = value.every(
    (entry) => typeof entry === 'number' && Number.isFinite(entry)
  );
  if (!isNumberVector) {
    return undefined;
  }

  return value;
}

function toRelevanceCandidate(option: IntentOption) {
  const metadata = {
    ...(option.metadata || {}),
    title: option.title,
    description: option.description,
    keywords: option.keywords,
    sourceType: option.type,
  };

  return {
    id: option.id,
    type: RELEVANCE_TYPE_MAP[option.type],
    vector: toNumberVector(option.metadata?.vector),
    metadata,
  };
}

function categorizeOptions(options: IntentOption[]): IntentCategory[] {
  const categoryMap = new Map<IntentOption['type'], IntentOption[]>();

  for (const option of options) {
    const existing = categoryMap.get(option.type) || [];
    existing.push(option);
    categoryMap.set(option.type, existing);
  }

  const typeOrder: IntentOption['type'][] = ['agent', 'portal', 'sop', 'knowledge', 'action'];

  return typeOrder
    .filter((type) => categoryMap.has(type))
    .map((type) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1) + 's',
      options: categoryMap.get(type) || [],
    }));
}

function fuzzyMatch(query: string, option: IntentOption): number {
  const q = query.toLowerCase();
  const title = option.title.toLowerCase();
  const desc = (option.description || '').toLowerCase();
  const keywords = (option.keywords || []).join(' ').toLowerCase();

  if (title.includes(q)) return 1.0;
  if (keywords.includes(q)) return 0.9;
  if (desc.includes(q)) return 0.7;

  let score = 0;
  const queryChars = q.split('');
  let lastIndex = -1;
  let consecutiveBonus = 0;

  for (const char of queryChars) {
    const idx = title.indexOf(char, lastIndex + 1);
    if (idx === -1) return 0;
    if (idx === lastIndex + 1) consecutiveBonus += 0.1;
    lastIndex = idx;
    score += 0.1;
  }

  return Math.min(score + consecutiveBonus, 0.6);
}

export function useIntentDetection(options: UseIntentDetectionOptions = {}) {
  const { agentId, conversationId, onIntentDetected } = options;

  const [results, setResults] = useState<IntentSearchResult>({
    categories: [],
    totalCount: 0,
    query: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relevanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relevanceRequestIdRef = useRef(0);
  const latestQueryRef = useRef('');

  const {
    connected,
    loading: wsLoading,
    requestAutocomplete,
    clearAutocomplete,
  } = useConversationIntelligence({
    agentId: agentId || 'global-user-llm',
    conversationId,
    onAutocompleteResults: (suggestions) => {
      const intentOptions: IntentOption[] = suggestions.map((s, i) => ({
        id: `ws-${i}`,
        type:
          s.type === 'ai_generated'
            ? 'action'
            : s.type === 'topic'
              ? 'knowledge'
              : s.type === 'context'
                ? 'sop'
                : 'action',
        title: s.text,
        description: s.metadata?.description as string | undefined,
        relevanceScore: s.score,
        icon: s.type === 'ai_generated' ? '⚡' : s.type === 'topic' ? '📚' : '📋',
      }));

      setResults((prev: IntentSearchResult) => {
        const combined = [...intentOptions];
        for (const cat of prev.categories) {
          for (const opt of cat.options) {
            if (!combined.find((o) => o.title === opt.title)) {
              combined.push(opt);
            }
          }
        }
        const categories = categorizeOptions(combined);
        return { categories, totalCount: combined.length, query: prev.query };
      });
      setIsLoading(false);
    },
  });

  const detectIntent = useCallback((query: string): IntentDetectionResult => {
    const lowerQuery = query.toLowerCase();

    const typePatterns: Array<[IntentOption['type'], RegExp]> = [
      ['agent', /\b(agent|ai|bot|assistant|create|spawn)\b/i],
      ['portal', /\b(portal|dashboard|settings|config|panel)\b/i],
      ['sop', /\b(sop|procedure|discussion|chat|start|new)\b/i],
      ['knowledge', /\b(knowledge|docs|document|search|find|wiki)\b/i],
      ['action', /\b(action|export|share|download|save)\b/i],
    ];

    for (const [type, pattern] of typePatterns) {
      if (pattern.test(lowerQuery)) {
        return { detected: true, type, confidence: 0.8 };
      }
    }

    return { detected: false };
  }, []);

  const fetchRelevanceScores = useCallback(
    async (query: string, intentOptions: IntentOption[]): Promise<Map<string, number>> => {
      if (intentOptions.length === 0) {
        return new Map<string, number>();
      }

      const response = await edenRequest<RelevanceApiResponse>('/api/v1/agents/relevance', {
        method: 'POST',
        body: {
          query,
          candidates: intentOptions.map(toRelevanceCandidate),
          limit: intentOptions.length,
        },
      });

      const scoreMap = new Map<string, number>();
      for (const result of response?.results || []) {
        if (typeof result.id === 'string' && typeof result.score === 'number') {
          scoreMap.set(result.id, result.score);
        }
      }

      return scoreMap;
    },
    []
  );

  const search = useCallback(
    (query: string) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (relevanceTimeoutRef.current) {
        clearTimeout(relevanceTimeoutRef.current);
        relevanceTimeoutRef.current = null;
      }
      relevanceRequestIdRef.current += 1;
      latestQueryRef.current = query;

      if (query.length < MIN_SEARCH_LENGTH) {
        setResults({ categories: [], totalCount: 0, query: '' });
        setIsLoading(false);
        setError(null);
        clearAutocomplete();
        return;
      }

      setIsLoading(true);
      setError(null);

      const intentResult = detectIntent(query);
      if (onIntentDetected && intentResult.detected) {
        onIntentDetected(intentResult);
      }

      const scoredOptions = STATIC_OPTIONS.map((opt) => ({
        ...opt,
        relevanceScore: fuzzyMatch(query, opt),
      }))
        .filter((opt) => (opt.relevanceScore || 0) > 0)
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

      const categories = categorizeOptions(scoredOptions);

      setResults({ categories, totalCount: scoredOptions.length, query });

      if (scoredOptions.length > 0) {
        const requestId = relevanceRequestIdRef.current;
        relevanceTimeoutRef.current = setTimeout(() => {
          void fetchRelevanceScores(query, scoredOptions)
            .then((backendScores: Map<string, number>) => {
              if (relevanceRequestIdRef.current !== requestId || latestQueryRef.current !== query) {
                return;
              }

              if (backendScores.size === 0) {
                return;
              }

              const mergedOptions = scoredOptions
                .map((option) => ({
                  ...option,
                  relevanceScore: backendScores.get(option.id) ?? option.relevanceScore,
                }))
                .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

              setResults((prev: IntentSearchResult) => {
                if (prev.query !== query) {
                  return prev;
                }

                const mergedCategories = categorizeOptions(mergedOptions);
                return { categories: mergedCategories, totalCount: mergedOptions.length, query };
              });
            })
            .catch((apiError: unknown) => {
              if (relevanceRequestIdRef.current !== requestId || latestQueryRef.current !== query) {
                return;
              }

              console.warn('Intent relevance API unavailable, using local fuzzy ranking', apiError);
            });
        }, DEBOUNCE_MS);
      }

      if (connected) {
        searchTimeoutRef.current = setTimeout(() => {
          requestAutocomplete(query, { intentType: intentResult.type }, 5);
        }, DEBOUNCE_MS);
      } else {
        setIsLoading(false);
      }
    },
    [
      connected,
      detectIntent,
      onIntentDetected,
      requestAutocomplete,
      clearAutocomplete,
      fetchRelevanceScores,
    ]
  );

  const clear = useCallback(() => {
    if (relevanceTimeoutRef.current) {
      clearTimeout(relevanceTimeoutRef.current);
      relevanceTimeoutRef.current = null;
    }
    relevanceRequestIdRef.current += 1;
    latestQueryRef.current = '';
    setResults({ categories: [], totalCount: 0, query: '' });
    setIsLoading(false);
    setError(null);
    clearAutocomplete();
  }, [clearAutocomplete]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (relevanceTimeoutRef.current) {
        clearTimeout(relevanceTimeoutRef.current);
      }
    };
  }, []);

  return {
    results,
    isLoading: isLoading || wsLoading.autocomplete,
    error,
    connected,
    search,
    clear,
    detectIntent,
  };
}
