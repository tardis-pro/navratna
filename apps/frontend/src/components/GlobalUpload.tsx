import React, { useState, useCallback } from 'react';
import { Upload, Plus, X, FileText, Database } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { KnowledgeIngestRequest } from '@uaip/types';
import { KnowledgeType, SourceType } from '@uaip/types';

interface GlobalUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onKnowledgeCreated?: (knowledgeId: string) => void;
}

const KNOWLEDGE_TYPES = [
  { value: KnowledgeType.FACTUAL, label: 'Factual', icon: <FileText className="w-4 h-4" /> },
  { value: KnowledgeType.PROCEDURAL, label: 'Procedural', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.CONCEPTUAL, label: 'Conceptual', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.EXPERIENTIAL, label: 'Experiential', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.EPISODIC, label: 'Episodic', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.SEMANTIC, label: 'Semantic', icon: <Database className="w-4 h-4" /> },
];

export const GlobalUpload: React.FC<GlobalUploadProps> = ({ isOpen, onClose, onKnowledgeCreated }) => {
  const { uploadKnowledge, isUploading, uploadProgress } = useKnowledge();
  
  const [uploadMethod, setUploadMethod] = useState<'text' | 'file'>('text');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadType, setUploadType] = useState<KnowledgeType>(KnowledgeType.FACTUAL);
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleClose = () => {
    setUploadContent('');
    setUploadTags('');
    setUploadTitle('');
    setSelectedFiles([]);
    setUploadMethod('text');
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  };

  const determineKnowledgeType = (file: File): KnowledgeType => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;

    if (extension === 'md' || extension === 'txt' || mimeType.startsWith('text/')) {
      return KnowledgeType.FACTUAL;
    } else if (extension === 'json' || extension === 'csv' || extension === 'xml') {
      return KnowledgeType.SEMANTIC;
    } else if (extension === 'js' || extension === 'ts' || extension === 'py' || extension === 'java') {
      return KnowledgeType.PROCEDURAL;
    } else {
      return KnowledgeType.FACTUAL;
    }
  };

  const generateTagsFromFile = (file: File): string[] => {
    const tags: string[] = [];
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension) {
      tags.push(extension);
    }
    
    if (file.type.startsWith('text/')) {
      tags.push('text');
    } else if (file.type.startsWith('application/')) {
      tags.push('document');
    }
    
    tags.push('file-upload');
    return tags;
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleUpload = useCallback(async () => {
    try {
      let knowledgeItems: KnowledgeIngestRequest[] = [];

      if (uploadMethod === 'text') {
        if (!uploadContent.trim()) return;

        const tags = uploadTags.split(',').map(tag => tag.trim()).filter(Boolean);
        
        const knowledgeItem: KnowledgeIngestRequest = {
          content: uploadContent,
          type: uploadType,
          tags,
          source: {
            type: SourceType.USER_INPUT,
            identifier: `user-note-${Date.now()}`,
            metadata: {
              title: uploadTitle || 'User Note',
              uploadedAt: new Date().toISOString(),
              userGenerated: true,
            },
          },
          confidence: 0.9,
        };

        knowledgeItems = [knowledgeItem];
      } else {
        // File upload
        for (const file of selectedFiles) {
          try {
            const content = await readFileContent(file);
            const fileType = determineKnowledgeType(file);
            const fileTags = generateTagsFromFile(file);
            const userTags = uploadTags.split(',').map(tag => tag.trim()).filter(Boolean);
            const tags = [...fileTags, ...userTags];

            const knowledgeItem: KnowledgeIngestRequest = {
              content,
              type: fileType,
              tags,
              source: {
                type: SourceType.FILE_SYSTEM,
                identifier: file.name,
                metadata: {
                  fileName: file.name,
                  fileSize: file.size,
                  fileType: file.type,
                  uploadedAt: new Date().toISOString(),
                  userGenerated: true,
                },
              },
              confidence: 0.9,
            };

            knowledgeItems.push(knowledgeItem);
          } catch (error) {
            console.error(`Failed to process file ${file.name}:`, error);
          }
        }
      }

      if (knowledgeItems.length > 0) {
        const results = await uploadKnowledge(knowledgeItems);
        
        // If we have a callback and results, call it with the first knowledge ID
        if (onKnowledgeCreated && results && results.length > 0) {
          onKnowledgeCreated(results[0].id);
        }
        
        handleClose();
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }, [uploadMethod, uploadContent, uploadTags, uploadType, uploadTitle, selectedFiles, uploadKnowledge, onKnowledgeCreated]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Add Knowledge
          </DialogTitle>
          <DialogDescription>
            Create knowledge from text or upload files to your knowledge base
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Upload Method Selection */}
          <div className="flex gap-2">
            <Button
              variant={uploadMethod === 'text' ? 'default' : 'outline'}
              onClick={() => setUploadMethod('text')}
              className="flex-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              Text Note
            </Button>
            <Button
              variant={uploadMethod === 'file' ? 'default' : 'outline'}
              onClick={() => setUploadMethod('file')}
              className="flex-1"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Files
            </Button>
          </div>

          {uploadMethod === 'text' ? (
            <>
              <div>
                <label className="text-sm font-medium mb-2 block">Title (optional)</label>
                <Input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Enter a title for your note..."
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Content</label>
                <Textarea
                  value={uploadContent}
                  onChange={(e) => setUploadContent(e.target.value)}
                  placeholder="Enter your knowledge content..."
                  rows={8}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Type</label>
                <Select value={uploadType} onValueChange={(value: KnowledgeType) => setUploadType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWLEDGE_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center space-x-2">
                          {type.icon}
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div>
              <label className="text-sm font-medium mb-2 block">Select Files</label>
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                accept=".txt,.md,.json,.csv,.js,.ts,.py,.java,.xml,.yml,.yaml,.html,.css,.sql,.log"
                className="w-full p-2 border border-gray-300 rounded-md"
              />
              {selectedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-100 rounded text-sm">
                      <span>{file.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedFiles(files => files.filter((_, i) => i !== index))}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-2 block">Tags (comma-separated)</label>
            <Input
              value={uploadTags}
              onChange={(e) => setUploadTags(e.target.value)}
              placeholder="ai, research, notes, important"
            />
          </div>

          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={
                isUploading || 
                (uploadMethod === 'text' && !uploadContent.trim()) ||
                (uploadMethod === 'file' && selectedFiles.length === 0)
              }
            >
              {isUploading ? 'Uploading...' : 'Add Knowledge'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};