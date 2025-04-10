import React, { useCallback } from 'react';
import { useDocument } from '../contexts/DocumentContext';
import type { DocumentContext } from '../types/document';
import { format } from 'date-fns';

interface DocumentViewerProps {
  className?: string;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ className }) => {
  const { 
    documents, 
    activeDocumentId, 
    addDocument, 
    setActiveDocument,
    isLoading,
    error 
  } = useDocument();

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const document: DocumentContext = {
        id: crypto.randomUUID(),
        title: file.name,
        content,
        type: 'general',
        metadata: {
          createdAt: new Date(),
          lastModified: new Date(file.lastModified),
        },
        tags: [],
      };

      addDocument(document);
      setActiveDocument(document.id);
    } catch (err) {
      console.error('Error reading file:', err);
    }
  }, [addDocument, setActiveDocument]);

  const activeDocument = activeDocumentId ? documents[activeDocumentId] : null;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Document Context</h2>
        <label className="btn btn-primary">
          Upload Document
          <input
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            accept=".txt,.md,.json"
          />
        </label>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-2">Available Documents</h3>
            <div className="space-y-2">
              {Object.values(documents).map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setActiveDocument(doc.id)}
                  className={`w-full text-left p-2 rounded hover:bg-gray-100 ${
                    doc.id === activeDocumentId ? 'bg-gray-100' : ''
                  }`}
                >
                  <div className="font-medium">{doc.title}</div>
                  <div className="text-sm text-gray-500">
                    Last modified: {format(doc.metadata.lastModified, 'MMM d, yyyy HH:mm')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border rounded-lg p-4 overflow-y-scroll h-[300px]">
            <h3 className="font-medium mb-2">Document Content</h3>
            {activeDocument ? (
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap">
                  {activeDocument.content}
                </pre>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">
                Select a document to view its content
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}; 