import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { DocumentContext, DocumentContextValue, DocumentContextState } from '../types/document';
import { useKnowledge } from './KnowledgeContext';
import type { KnowledgeItem, KnowledgeIngestRequest } from '@uaip/types';

const initialState: DocumentContextState = {
  documents: {},
  activeDocumentId: null,
  isLoading: false,
  error: null,
};

type DocumentAction = 
  | { type: 'ADD_DOCUMENT'; payload: DocumentContext }
  | { type: 'REMOVE_DOCUMENT'; payload: string }
  | { type: 'SET_ACTIVE_DOCUMENT'; payload: string }
  | { type: 'UPDATE_DOCUMENT'; payload: { id: string; updates: Partial<DocumentContext> } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONTENT'; payload: string }
  | { type: 'LOAD_DOCUMENT'; payload: { id: string; content: string } };

const documentReducer = (state: DocumentContextState, action: DocumentAction): DocumentContextState => {
  switch (action.type) {
    case 'ADD_DOCUMENT':
      return {
        ...state,
        documents: {
          ...state.documents,
          [action.payload.id]: action.payload,
        },
      };
    case 'REMOVE_DOCUMENT': {
      const { [action.payload]: removed, ...remainingDocs } = state.documents;
      return {
        ...state,
        documents: remainingDocs,
        activeDocumentId: state.activeDocumentId === action.payload ? null : state.activeDocumentId,
      };
    }
    case 'SET_ACTIVE_DOCUMENT':
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    case 'UPDATE_DOCUMENT':
      return {
        ...state,
        documents: {
          ...state.documents,
          [action.payload.id]: {
            ...state.documents[action.payload.id],
            ...action.payload.updates,
          },
        },
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };
    case 'SET_CONTENT':
      return {
        ...state,
        content: action.payload
      };
    case 'LOAD_DOCUMENT': {
      const { id, content } = action.payload;
      return {
        ...state,
        documents: {
          ...state.documents,
          [id]: {
            id,
            title: `Document ${id}`,
            content,
            type: 'general',
            metadata: {
              createdAt: new Date(),
              lastModified: new Date(),
              author: 'User'
            },
            tags: ['general']
          }
        },
        activeDocumentId: id
      };
    }
    default:
      return state;
  }
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(documentReducer, initialState);
  const { uploadKnowledge } = useKnowledge();

  const addDocument = useCallback(async (document: DocumentContext) => {
    dispatch({ type: 'ADD_DOCUMENT', payload: document });
    
    // Also add to knowledge graph if it has substantial content
    if (document.content && document.content.length > 50) {
      try {
        const knowledgeItem: KnowledgeIngestRequest = {
          content: document.content,
          type: document.type === 'policy' ? 'PROCEDURAL' : 
                document.type === 'technical' ? 'FACTUAL' : 'CONCEPTUAL',
          tags: [...document.tags, 'document', document.type],
          source: {
            type: 'USER_INPUT',
            identifier: `document-${document.id}`,
            metadata: {
              documentTitle: document.title,
              documentType: document.type,
              author: document.metadata.author,
              createdAt: document.metadata.createdAt.toISOString(),
            },
          },
          confidence: 0.8,
        };
        
        await uploadKnowledge([knowledgeItem]);
      } catch (error) {
        console.warn('Failed to add document to knowledge graph:', error);
      }
    }
  }, [uploadKnowledge]);

  const value: DocumentContextValue = {
    ...state,
    addDocument,
    removeDocument: (id: string) => {
      dispatch({ type: 'REMOVE_DOCUMENT', payload: id });
    },
    setActiveDocument: (id: string) => {
      dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: id });
    },
    updateDocument: (id: string, updates: Partial<DocumentContext>) => {
      dispatch({ type: 'UPDATE_DOCUMENT', payload: { id, updates } });
    },
  };

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocument = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useDocument must be used within a DocumentProvider');
  }
  return context;
}; 