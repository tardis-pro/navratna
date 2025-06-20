import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { 
  KnowledgeItem, 
  KnowledgeSearchRequest, 
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeType,
  SourceType
} from '@uaip/types';
import { uaipAPI } from '@/utils/uaip-api';

interface KnowledgeContextState {
  // Knowledge items
  items: Record<string, KnowledgeItem>;
  searchResults: KnowledgeItem[];
  activeItemId: string | null;
  
  // UI state
  isLoading: boolean;
  isUploading: boolean;
  isSearching: boolean;
  error: string | null;
  
  // Search state
  lastSearchQuery: KnowledgeSearchRequest | null;
  searchMetadata: {
    totalCount: number;
    processingTime: number;
    filtersApplied: string[];
  } | null;
  
  // Stats
  stats: {
    totalItems: number;
    itemsByType: Record<KnowledgeType, number>;
    itemsBySource: Record<SourceType, number>;
    recentActivity: Array<{
      date: string;
      uploads: number;
      searches: number;
    }>;
  } | null;
  
  // Upload queue
  uploadQueue: KnowledgeIngestRequest[];
  uploadProgress: number;
}

interface KnowledgeContextValue extends KnowledgeContextState {
  // Knowledge operations
  uploadKnowledge: (items: KnowledgeIngestRequest[]) => Promise<KnowledgeIngestResponse>;
  searchKnowledge: (query: KnowledgeSearchRequest) => Promise<KnowledgeSearchResponse>;
  updateKnowledge: (itemId: string, updates: Partial<KnowledgeItem>) => Promise<KnowledgeItem>;
  deleteKnowledge: (itemId: string) => Promise<void>;
  getRelatedKnowledge: (itemId: string) => Promise<KnowledgeItem[]>;
  getKnowledgeByTag: (tag: string) => Promise<KnowledgeItem[]>;
  
  // UI operations
  setActiveItem: (itemId: string | null) => void;
  clearSearchResults: () => void;
  clearError: () => void;
  
  // Stats operations
  refreshStats: () => Promise<void>;
}

const initialState: KnowledgeContextState = {
  items: {},
  searchResults: [],
  activeItemId: null,
  isLoading: false,
  isUploading: false,
  isSearching: false,
  error: null,
  lastSearchQuery: null,
  searchMetadata: null,
  stats: null,
  uploadQueue: [],
  uploadProgress: 0,
};

type KnowledgeAction = 
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_UPLOADING'; payload: boolean }
  | { type: 'SET_SEARCHING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_ACTIVE_ITEM'; payload: string | null }
  | { type: 'ADD_KNOWLEDGE_ITEMS'; payload: KnowledgeItem[] }
  | { type: 'UPDATE_KNOWLEDGE_ITEM'; payload: KnowledgeItem }
  | { type: 'REMOVE_KNOWLEDGE_ITEM'; payload: string }
  | { type: 'SET_SEARCH_RESULTS'; payload: { items: KnowledgeItem[]; query: KnowledgeSearchRequest; metadata: any } }
  | { type: 'CLEAR_SEARCH_RESULTS' }
  | { type: 'SET_STATS'; payload: KnowledgeContextState['stats'] }
  | { type: 'SET_UPLOAD_QUEUE'; payload: KnowledgeIngestRequest[] }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: number };

const knowledgeReducer = (state: KnowledgeContextState, action: KnowledgeAction): KnowledgeContextState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_UPLOADING':
      return { ...state, isUploading: action.payload };
    case 'SET_SEARCHING':
      return { ...state, isSearching: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_ACTIVE_ITEM':
      return { ...state, activeItemId: action.payload };
    case 'ADD_KNOWLEDGE_ITEMS': {
      const newItems = { ...state.items };
      action.payload.forEach(item => {
        newItems[item.id] = item;
      });
      return { ...state, items: newItems };
    }
    case 'UPDATE_KNOWLEDGE_ITEM':
      return {
        ...state,
        items: {
          ...state.items,
          [action.payload.id]: action.payload,
        },
      };
    case 'REMOVE_KNOWLEDGE_ITEM': {
      const { [action.payload]: removed, ...remainingItems } = state.items;
      return {
        ...state,
        items: remainingItems,
        activeItemId: state.activeItemId === action.payload ? null : state.activeItemId,
      };
    }
    case 'SET_SEARCH_RESULTS':
      return {
        ...state,
        searchResults: action.payload.items,
        lastSearchQuery: action.payload.query,
        searchMetadata: action.payload.metadata,
      };
    case 'CLEAR_SEARCH_RESULTS':
      return {
        ...state,
        searchResults: [],
        lastSearchQuery: null,
        searchMetadata: null,
      };
    case 'SET_STATS':
      return { ...state, stats: action.payload };
    case 'SET_UPLOAD_QUEUE':
      return { ...state, uploadQueue: action.payload };
    case 'SET_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.payload };
    default:
      return state;
  }
};

const KnowledgeContext = createContext<KnowledgeContextValue | null>(null);

export const KnowledgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(knowledgeReducer, initialState);

  const uploadKnowledge = useCallback(async (items: KnowledgeIngestRequest[]): Promise<KnowledgeIngestResponse> => {
    dispatch({ type: 'SET_UPLOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_UPLOAD_QUEUE', payload: items });
    dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: 0 });

    try {
      const response = await uaipAPI.knowledge.uploadKnowledge(items);
      
      // Add uploaded items to state
      dispatch({ type: 'ADD_KNOWLEDGE_ITEMS', payload: response.items });
      dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: 100 });
      
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload knowledge';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_UPLOADING', payload: false });
      dispatch({ type: 'SET_UPLOAD_QUEUE', payload: [] });
    }
  }, []);

  const searchKnowledge = useCallback(async (query: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> => {
    dispatch({ type: 'SET_SEARCHING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const response = await uaipAPI.knowledge.searchKnowledge(query);
      
      dispatch({ 
        type: 'SET_SEARCH_RESULTS', 
        payload: { 
          items: response.items, 
          query, 
          metadata: response.searchMetadata 
        } 
      });
      
      // Also add items to the main items collection
      dispatch({ type: 'ADD_KNOWLEDGE_ITEMS', payload: response.items });
      
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to search knowledge';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_SEARCHING', payload: false });
    }
  }, []);

  const updateKnowledge = useCallback(async (itemId: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const updatedItem = await uaipAPI.knowledge.updateKnowledge(itemId, updates);
      dispatch({ type: 'UPDATE_KNOWLEDGE_ITEM', payload: updatedItem });
      return updatedItem;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update knowledge';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const deleteKnowledge = useCallback(async (itemId: string): Promise<void> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      await uaipAPI.knowledge.deleteKnowledge(itemId);
      dispatch({ type: 'REMOVE_KNOWLEDGE_ITEM', payload: itemId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete knowledge';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const getRelatedKnowledge = useCallback(async (itemId: string): Promise<KnowledgeItem[]> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const relatedItems = await uaipAPI.knowledge.getRelatedKnowledge(itemId);
      dispatch({ type: 'ADD_KNOWLEDGE_ITEMS', payload: relatedItems });
      return relatedItems;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get related knowledge';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const getKnowledgeByTag = useCallback(async (tag: string): Promise<KnowledgeItem[]> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const items = await uaipAPI.knowledge.getKnowledgeByTag(tag);
      dispatch({ type: 'ADD_KNOWLEDGE_ITEMS', payload: items });
      return items;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get knowledge by tag';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const refreshStats = useCallback(async (): Promise<void> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const stats = await uaipAPI.knowledge.getKnowledgeStats();
      dispatch({ type: 'SET_STATS', payload: stats });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh stats';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const setActiveItem = useCallback((itemId: string | null) => {
    dispatch({ type: 'SET_ACTIVE_ITEM', payload: itemId });
  }, []);

  const clearSearchResults = useCallback(() => {
    dispatch({ type: 'CLEAR_SEARCH_RESULTS' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  const value: KnowledgeContextValue = {
    ...state,
    uploadKnowledge,
    searchKnowledge,
    updateKnowledge,
    deleteKnowledge,
    getRelatedKnowledge,
    getKnowledgeByTag,
    setActiveItem,
    clearSearchResults,
    clearError,
    refreshStats,
  };

  return (
    <KnowledgeContext.Provider value={value}>
      {children}
    </KnowledgeContext.Provider>
  );
};

export const useKnowledge = () => {
  const context = useContext(KnowledgeContext);
  if (!context) {
    throw new Error('useKnowledge must be used within a KnowledgeProvider');
  }
  return context;
}; 