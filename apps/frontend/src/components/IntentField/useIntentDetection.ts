import { useState, useCallback, useEffect, useRef } from 'react';
import { useConversationIntelligence } from '@/hooks/useConversationIntelligence';
import type {
  IntentOption,
  IntentCategory,
  IntentDetectionResult,
  UseIntentDetectionOptions,
  IntentSearchResult,
} from './IntentField.types';

const STATIC_OPTIONS: IntentOption[] = [
  { id: 'agent-create', type: 'agent', title: 'Create AI Agent', description: 'Spawn a new AI agent', keywords: ['agent', 'ai', 'create', 'spawn'], icon: '🤖' },
  { id: 'agent-manage', type: 'agent', title: 'Manage Agents', description: 'View and configure agents', keywords: ['agent', 'manage', 'config'], icon: '🤖' },
  { id: 'portal-dashboard', type: 'portal', title: 'Dashboard', description: 'Open the main dashboard', keywords: ['dashboard', 'home', 'overview'], icon: '🚪' },
  { id: 'portal-settings', type: 'portal', title: 'Settings', description: 'System configuration', keywords: ['settings', 'config', 'preferences'], icon: '🚪' },
  { id: 'portal-knowledge', type: 'portal', title: 'Knowledge Base', description: 'Browse knowledge articles', keywords: ['knowledge', 'docs', 'articles', 'wiki'], icon: '📚' },
  { id: 'portal-tools', type: 'portal', title: 'Tools', description: 'Available tools and integrations', keywords: ['tools', 'integrations', 'utilities'], icon: '🚪' },
  { id: 'sop-new-discussion', type: 'sop', title: 'Start Discussion', description: 'Create a new discussion thread', keywords: ['discussion', 'chat', 'new', 'start'], icon: '📋' },
  { id: 'sop-search', type: 'sop', title: 'Search History', description: 'Find past conversations', keywords: ['search', 'history', 'find'], icon: '📋' },
  { id: 'knowledge-search', type: 'knowledge', title: 'Search Knowledge', description: 'Find documents and resources', keywords: ['search', 'knowledge', 'docs', 'find'], icon: '📚' },
  { id: 'knowledge-upload', type: 'knowledge', title: 'Upload Document', description: 'Add new knowledge content', keywords: ['upload', 'document', 'add', 'knowledge'], icon: '📚' },
  { id: 'action-export', type: 'action', title: 'Export Data', description: 'Export conversation or data', keywords: ['export', 'download', 'save'], icon: '⚡' },
  { id: 'action-share', type: 'action', title: 'Share', description: 'Share with team members', keywords: ['share', 'collaborate', 'team'], icon: '⚡' },
];

const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;

function categorizeOptions(options: IntentOption[]): IntentCategory[] {
  const categoryMap = new Map<IntentOption['type'], IntentOption[]>();
  
  for (const option of options) {
    const existing = categoryMap.get(option.type) || [];
    existing.push(option);
    categoryMap.set(option.type, existing);
  }

  const typeOrder: IntentOption['type'][] = ['agent', 'portal', 'sop', 'knowledge', 'action'];
  
  return typeOrder
    .filter(type => categoryMap.has(type))
    .map(type => ({
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
  
  const [results, setResults] = useState<IntentSearchResult>({ categories: [], totalCount: 0, query: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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
        type: s.type === 'ai_generated' ? 'action' : 
              s.type === 'topic' ? 'knowledge' : 
              s.type === 'context' ? 'sop' : 'action',
        title: s.text,
        description: s.metadata?.description as string | undefined,
        relevanceScore: s.score,
        icon: s.type === 'ai_generated' ? '⚡' : s.type === 'topic' ? '📚' : '📋',
      }));
      
      setResults((prev: IntentSearchResult) => {
        const combined = [...intentOptions];
        for (const cat of prev.categories) {
          for (const opt of cat.options) {
            if (!combined.find(o => o.title === opt.title)) {
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

  const search = useCallback((query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
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
    
    const scoredOptions = STATIC_OPTIONS
      .map(opt => ({
        ...opt,
        relevanceScore: fuzzyMatch(query, opt),
      }))
      .filter(opt => (opt.relevanceScore || 0) > 0)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    
    const categories = categorizeOptions(scoredOptions);
    
    setResults({ categories, totalCount: scoredOptions.length, query });
    
    if (connected) {
      searchTimeoutRef.current = setTimeout(() => {
        requestAutocomplete(query, { intentType: intentResult.type }, 5);
      }, DEBOUNCE_MS);
    } else {
      setIsLoading(false);
    }
  }, [connected, detectIntent, onIntentDetected, requestAutocomplete, clearAutocomplete]);

  const clear = useCallback(() => {
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
