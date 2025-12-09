import React, { useCallback } from 'react';
import { useDocument } from '../contexts/DocumentContext';
import type { DocumentContext } from '../types/document';
import { format } from 'date-fns';
import { Upload, FileText, Calendar, Eye, Plus } from 'lucide-react';

interface DocumentViewerProps {
  className?: string;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ className }) => {
  const { documents, activeDocumentId, addDocument, setActiveDocument, isLoading, error } =
    useDocument();

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [addDocument, setActiveDocument]
  );

  const activeDocument = activeDocumentId ? documents[activeDocumentId] : null;

  return (
    <div className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Document Context
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Upload and manage discussion documents
            </p>
          </div>
        </div>

        <label className="relative group cursor-pointer">
          <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105">
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
          </div>
          <input
            type="file"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={handleFileUpload}
            accept=".txt,.md,.json"
          />
        </label>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">!</span>
            </div>
            <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <span className="text-slate-600 dark:text-slate-400 font-medium">
              Loading documents...
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Documents List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Available Documents</span>
                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded-full">
                  {Object.values(documents).length}
                </span>
              </h3>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {Object.values(documents).length > 0 ? (
                Object.values(documents).map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => setActiveDocument(doc.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 hover:scale-[1.02] ${
                      doc.id === activeDocumentId
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-lg shadow-blue-500/10'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate">
                          {doc.title}
                        </div>
                        <div className="flex items-center space-x-2 mt-2 text-sm text-slate-500 dark:text-slate-400">
                          <Calendar className="w-3 h-3" />
                          <span>{format(doc.metadata.lastModified, 'MMM d, yyyy HH:mm')}</span>
                        </div>
                      </div>
                      {doc.id === activeDocumentId && (
                        <div className="ml-2 w-2 h-2 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Plus className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">
                    No documents uploaded
                  </p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                    Upload a document to get started
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Document Content */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <Eye className="w-4 h-4" />
                <span>Document Content</span>
              </h3>
              {activeDocument && (
                <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs rounded-full font-medium">
                  Active
                </span>
              )}
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              {activeDocument ? (
                <div className="p-6">
                  <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {activeDocument.title}
                    </h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {activeDocument.content.length} characters
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {activeDocument.content}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">
                    No document selected
                  </p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                    Choose a document to view its content
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
