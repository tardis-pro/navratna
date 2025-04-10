import React, { createContext, useContext, useReducer } from 'react';
import type { DocumentContext, DocumentContextValue, DocumentContextState } from '../types/document';

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
  | { type: 'SET_ERROR'; payload: string | null };

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
    case 'REMOVE_DOCUMENT':
      const { [action.payload]: removed, ...remainingDocs } = state.documents;
      return {
        ...state,
        documents: remainingDocs,
        activeDocumentId: state.activeDocumentId === action.payload ? null : state.activeDocumentId,
      };
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
    default:
      return state;
  }
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(documentReducer, initialState);

  const value: DocumentContextValue = {
    ...state,
    addDocument: (document: DocumentContext) => {
      dispatch({ type: 'ADD_DOCUMENT', payload: document });
    },
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