export interface DocumentContext {
  id: string;
  title: string;
  content: string;
  type: 'policy' | 'technical' | 'general';
  metadata: {
    author?: string;
    createdAt: Date;
    lastModified: Date;
    version?: string;
  };
  tags: string[];
}

export interface DocumentContextState {
  documents: Record<string, DocumentContext>;
  activeDocumentId: string | null;
  isLoading: boolean;
  error: string | null;
  content?: string;
}

export interface DocumentContextValue extends DocumentContextState {
  addDocument: (document: DocumentContext) => void;
  removeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<DocumentContext>) => void;
}
