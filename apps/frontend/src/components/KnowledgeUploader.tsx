import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import { KnowledgeType, SourceType } from '@uaip/types';
import type { KnowledgeIngestRequest } from '@uaip/types';
import {
  useKnowledgeUpload,
  filterFilesByType,
  generateFileId,
} from '@/hooks/use_knowledge_upload';
import { KnowledgeErrorAlert } from '@/components/KnowledgeErrorAlert';
import { TextKnowledgeCard, KNOWLEDGE_TYPES } from '@/components/TextKnowledgeCard';
import { UploadDropZone } from '@/components/UploadDropZone';
import { UploadProgressBar } from '@/components/UploadProgressBar';
import { FileRemoveButton } from '@/components/FileRemoveButton';
import { parseCommaSeparatedValues } from '@/utils/parse_comma_separated';

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

const SUPPORTED_FILE_TYPES = ['.txt', '.md', '.json', '.csv', '.pdf', '.docx', '.html'];

export const KnowledgeUploader: React.FC<KnowledgeUploaderProps> = ({
  onUploadComplete,
  className,
}) => {
  const { uploadKnowledge, isUploading, uploadProgress } = useKnowledge();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileUpload[]>([]);
  const [error, setError] = useState<string | null>(null);

  const readFileContent = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }, []);

  const handleFiles = useCallback(
    async (newFiles: File[]) => {
      setError(null);
      const { valid: validFiles, skipped } = filterFilesByType(newFiles, SUPPORTED_FILE_TYPES);
      if (skipped > 0) {
        setError(`Some files were skipped. Supported formats: ${SUPPORTED_FILE_TYPES.join(', ')}`);
      }
      const fileUploads: FileUpload[] = await Promise.all(
        validFiles.map(async (file) => {
          const content = await readFileContent(file);
          return {
            id: generateFileId(file),
            file,
            content,
            type: KnowledgeType.FACTUAL,
            tags: [] as string[],
            status: 'pending' as const,
          };
        })
      );
      setFiles((prev) => [...prev, ...fileUploads]);
    },
    [readFileContent]
  );

  const { dragActive, handleDrag, handleDrop, handleFileSelect } = useKnowledgeUpload({
    onFiles: handleFiles,
  });

  const updateFile = useCallback((id: string, updates: Partial<FileUpload>) => {
    setFiles((prev) => prev.map((file) => (file.id === id ? { ...file, ...updates } : file)));
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const handleFileUpload = useCallback(async () => {
    if (files.length === 0) return;

    const knowledgeItems: KnowledgeIngestRequest[] = files.map((file) => ({
      content: file.content,
      type: file.type,
      tags: file.tags,
      source: {
        type: SourceType.FILE_SYSTEM,
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
      files.forEach((file) => {
        updateFile(file.id, { status: 'processing' });
      });

      await uploadKnowledge(knowledgeItems);

      files.forEach((file) => {
        updateFile(file.id, { status: 'complete' });
      });

      setTimeout(() => {
        setFiles([]);
        onUploadComplete?.();
      }, 2000);
    } catch (err) {
      files.forEach((file) => {
        updateFile(file.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      });
      setError(err instanceof Error ? err.message : 'Failed to upload files');
    }
  }, [files, uploadKnowledge, updateFile, onUploadComplete]);

  return (
    <div className={`space-y-6 ${className}`}>
      <KnowledgeErrorAlert error={error} onDismiss={() => setError(null)} />

      <TextKnowledgeCard
        uploadKnowledge={uploadKnowledge}
        isUploading={isUploading}
        onUploadComplete={onUploadComplete}
        onError={setError}
      />

      <Card className="bg-black/20 border-blue-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Upload className="w-5 h-5 mr-2" />
            Upload Files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UploadDropZone
            dragActive={dragActive}
            handleDrag={handleDrag}
            handleDrop={handleDrop}
            handleFileSelect={handleFileSelect}
            fileInputRef={fileInputRef}
            acceptedTypes={SUPPORTED_FILE_TYPES}
          />

          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-medium">Files to Upload</h4>
                <Button
                  onClick={handleFileUpload}
                  disabled={isUploading || files.every((f) => f.status === 'complete')}
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
                <UploadProgressBar label="Upload Progress" value={uploadProgress} />
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
                        {file.status === 'pending' && <Badge variant="secondary">Pending</Badge>}
                        {file.status === 'processing' && (
                          <Badge className="bg-yellow-600">Processing</Badge>
                        )}
                        {file.status === 'complete' && (
                          <Badge className="bg-green-600">Complete</Badge>
                        )}
                        {file.status === 'error' && <Badge variant="destructive">Error</Badge>}
                        <FileRemoveButton onClick={() => removeFile(file.id)} />
                      </div>
                    </div>

                    {file.status === 'error' && file.error && (
                      <p className="text-red-400 text-xs mb-2">{file.error}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Select
                        value={file.type}
                        onValueChange={(value: KnowledgeType) =>
                          updateFile(file.id, { type: value })
                        }
                      >
                        <SelectTrigger className="h-8 bg-black/20 border-blue-500/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KNOWLEDGE_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                        <Input
                          value={file.tags.join(', ')}
                          onChange={(e) => {
                            const tags = parseCommaSeparatedValues(e.target.value);
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
