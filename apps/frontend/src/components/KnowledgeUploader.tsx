import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, X, Plus, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { KnowledgeType, SourceType, KnowledgeIngestRequest } from '@uaip/types';

interface KnowledgeUploaderProps {
  onUploadComplete?: () => void;
  className?: string;
}

interface FileUpload {
  id: string;
  file: File;
  content: string;
  type: KnowledgeType;
  tags: string[];
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
}

const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string }[] = [
  { value: 'FACTUAL', label: 'Factual Knowledge' },
  { value: 'PROCEDURAL', label: 'Procedural Knowledge' },
  { value: 'CONCEPTUAL', label: 'Conceptual Knowledge' },
  { value: 'EXPERIENTIAL', label: 'Experiential Knowledge' },
  { value: 'EPISODIC', label: 'Episodic Memory' },
  { value: 'SEMANTIC', label: 'Semantic Knowledge' },
];

const SUPPORTED_FILE_TYPES = [
  '.txt', '.md', '.json', '.csv', '.pdf', '.docx', '.html'
];

export const KnowledgeUploader: React.FC<KnowledgeUploaderProps> = ({ 
  onUploadComplete,
  className 
}) => {
  const { uploadKnowledge, isUploading, uploadProgress } = useKnowledge();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local state
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [textInput, setTextInput] = useState('');
  const [textTags, setTextTags] = useState('');
  const [textType, setTextType] = useState<KnowledgeType>('FACTUAL');
  const [error, setError] = useState<string | null>(null);

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFiles(selectedFiles);
  }, []);

  // Process files
  const handleFiles = useCallback(async (newFiles: File[]) => {
    setError(null);
    
    const validFiles = newFiles.filter(file => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      return SUPPORTED_FILE_TYPES.includes(extension);
    });

    if (validFiles.length !== newFiles.length) {
      setError(`Some files were skipped. Supported formats: ${SUPPORTED_FILE_TYPES.join(', ')}`);
    }

    const fileUploads: FileUpload[] = await Promise.all(
      validFiles.map(async (file) => {
        const content = await readFileContent(file);
        return {
          id: `${file.name}-${Date.now()}`,
          file,
          content,
          type: 'FACTUAL' as KnowledgeType,
          tags: [],
          status: 'pending' as const,
        };
      })
    );

    setFiles(prev => [...prev, ...fileUploads]);
  }, []);

  // Read file content
  const readFileContent = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }, []);

  // Update file settings
  const updateFile = useCallback((id: string, updates: Partial<FileUpload>) => {
    setFiles(prev => prev.map(file => 
      file.id === id ? { ...file, ...updates } : file
    ));
  }, []);

  // Remove file
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id));
  }, []);

  // Upload text knowledge
  const handleTextUpload = useCallback(async () => {
    if (!textInput.trim()) return;

    const tags = textTags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    const knowledgeItem: KnowledgeIngestRequest = {
      content: textInput,
      type: textType,
      tags,
      source: {
        type: 'USER_INPUT',
        identifier: `text-input-${Date.now()}`,
        metadata: {
          uploadedAt: new Date().toISOString(),
          inputMethod: 'text',
        },
      },
      confidence: 0.8,
    };

    try {
      await uploadKnowledge([knowledgeItem]);
      setTextInput('');
      setTextTags('');
      onUploadComplete?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload text');
    }
  }, [textInput, textTags, textType, uploadKnowledge, onUploadComplete]);

  // Upload all files
  const handleFileUpload = useCallback(async () => {
    if (files.length === 0) return;

    const knowledgeItems: KnowledgeIngestRequest[] = files.map(file => ({
      content: file.content,
      type: file.type,
      tags: file.tags,
      source: {
        type: 'FILE_SYSTEM',
        identifier: file.file.name,
        metadata: {
          fileName: file.file.name,
          fileSize: file.file.size,
          fileType: file.file.type,
          uploadedAt: new Date().toISOString(),
        },
      },
      confidence: 0.7,
    }));

    try {
      // Update file statuses
      files.forEach(file => {
        updateFile(file.id, { status: 'processing' });
      });

      await uploadKnowledge(knowledgeItems);
      
      // Mark as complete
      files.forEach(file => {
        updateFile(file.id, { status: 'complete' });
      });

      // Clear files after successful upload
      setTimeout(() => {
        setFiles([]);
        onUploadComplete?.();
      }, 2000);
    } catch (error) {
      // Mark as error
      files.forEach(file => {
        updateFile(file.id, { 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Upload failed' 
        });
      });
      setError(error instanceof Error ? error.message : 'Failed to upload files');
    }
  }, [files, uploadKnowledge, updateFile, onUploadComplete]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Error Alert */}
      {error && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-2 h-auto p-1">
              ✕
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Text Input Section */}
      <Card className="bg-black/20 border-blue-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <FileText className="w-5 h-5 mr-2" />
            Add Text Knowledge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter your knowledge content here..."
            rows={6}
            className="bg-black/20 border-blue-500/30 text-white placeholder-gray-400"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Knowledge Type</label>
              <Select value={textType} onValueChange={(value: KnowledgeType) => setTextType(value)}>
                <SelectTrigger className="bg-black/20 border-blue-500/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWLEDGE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Tags (comma-separated)</label>
              <Input
                value={textTags}
                onChange={(e) => setTextTags(e.target.value)}
                placeholder="ai, research, notes"
                className="bg-black/20 border-blue-500/30 text-white placeholder-gray-400"
              />
            </div>
          </div>
          <Button 
            onClick={handleTextUpload} 
            disabled={!textInput.trim() || isUploading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add Knowledge
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* File Upload Section */}
      <Card className="bg-black/20 border-blue-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Upload className="w-5 h-5 mr-2" />
            Upload Files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-400 bg-blue-500/10' 
                : 'border-blue-500/30 hover:border-blue-400 hover:bg-blue-500/5'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-white mb-2">Drag and drop files here, or click to select</p>
            <p className="text-sm text-gray-400 mb-4">
              Supported formats: {SUPPORTED_FILE_TYPES.join(', ')}
            </p>
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              className="border-blue-500/30 hover:bg-blue-500/10"
            >
              Select Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={SUPPORTED_FILE_TYPES.join(',')}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-medium">Files to Upload</h4>
                <Button 
                  onClick={handleFileUpload}
                  disabled={isUploading || files.every(f => f.status === 'complete')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload All ({files.length})
                    </>
                  )}
                </Button>
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>Upload Progress</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {files.map((file) => (
                  <div key={file.id} className="p-3 rounded border border-blue-500/20 bg-black/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span className="text-white text-sm font-medium">{file.file.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {(file.file.size / 1024).toFixed(1)} KB
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        {file.status === 'pending' && (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                        {file.status === 'processing' && (
                          <Badge className="bg-yellow-600">Processing</Badge>
                        )}
                        {file.status === 'complete' && (
                          <Badge className="bg-green-600">Complete</Badge>
                        )}
                        {file.status === 'error' && (
                          <Badge variant="destructive">Error</Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFile(file.id)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    
                    {file.status === 'error' && file.error && (
                      <p className="text-red-400 text-xs mb-2">{file.error}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Select 
                        value={file.type} 
                        onValueChange={(value: KnowledgeType) => updateFile(file.id, { type: value })}
                      >
                        <SelectTrigger className="h-8 bg-black/20 border-blue-500/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KNOWLEDGE_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={file.tags.join(', ')}
                        onChange={(e) => {
                          const tags = e.target.value.split(',').map(tag => tag.trim()).filter(Boolean);
                          updateFile(file.id, { tags });
                        }}
                        placeholder="Tags (comma-separated)"
                        className="h-8 bg-black/20 border-blue-500/30 text-white placeholder-gray-400"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}; 