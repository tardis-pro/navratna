import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  MessageSquare,
  Brain,
  Workflow,
  Users,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { knowledgeAPI } from '@/api/knowledge_api';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import {
  useKnowledgeUpload,
  filterFilesByType,
  generateFileId,
} from '@/hooks/use_knowledge_upload';
import { KnowledgeErrorAlert } from '@/components/KnowledgeErrorAlert';
import { TextKnowledgeCard } from '@/components/TextKnowledgeCard';
import { UploadDropZone } from '@/components/UploadDropZone';
import { UploadProgressBar } from '@/components/UploadProgressBar';
import { FileRemoveButton } from '@/components/FileRemoveButton';

interface ChatKnowledgeUploaderProps {
  onUploadComplete?: () => void;
  className?: string;
}

interface ChatFile {
  id: string;
  file: File;
  platform: 'claude' | 'gpt' | 'whatsapp' | 'generic';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  jobId?: string;
  error?: string;
  results?: {
    knowledgeItems: number;
    qaPairs: number;
    workflows: number;
    expertiseProfiles: number;
    learningMoments: number;
  };
}

interface ChatIngestionOptions {
  extractWorkflows: boolean;
  generateQA: boolean;
  analyzeExpertise: boolean;
  detectLearning: boolean;
}

const CHAT_FILE_TYPES = ['.txt', '.json', '.csv', '.html', '.md'];

const PLATFORM_PATTERNS = {
  claude: /claude|anthropic/i,
  gpt: /gpt|openai|chatgpt/i,
  whatsapp: /whatsapp|whatsapp.*export/i,
  generic: /.*/,
};

const PLATFORM_DESCRIPTIONS = {
  claude: 'Claude/Anthropic conversation exports',
  gpt: 'ChatGPT/OpenAI conversation exports',
  whatsapp: 'WhatsApp chat exports',
  generic: 'Generic conversation format',
};

export const ChatKnowledgeUploader: React.FC<ChatKnowledgeUploaderProps> = ({
  onUploadComplete,
  className,
}) => {
  const { uploadKnowledge, isUploading } = useKnowledge();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ingestionOptions, setIngestionOptions] = useState<ChatIngestionOptions>({
    extractWorkflows: true,
    generateQA: true,
    analyzeExpertise: true,
    detectLearning: true,
  });

  const detectPlatform = useCallback(
    (filename: string): 'claude' | 'gpt' | 'whatsapp' | 'generic' => {
      const lower = filename.toLowerCase();
      if (PLATFORM_PATTERNS.claude.test(lower)) return 'claude';
      if (PLATFORM_PATTERNS.gpt.test(lower)) return 'gpt';
      if (PLATFORM_PATTERNS.whatsapp.test(lower)) return 'whatsapp';
      return 'generic';
    },
    []
  );

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      setError(null);
      const { valid: validFiles, skipped } = filterFilesByType(newFiles, CHAT_FILE_TYPES);
      if (skipped > 0) {
        setError(`Some files were skipped. Supported formats: ${CHAT_FILE_TYPES.join(', ')}`);
      }
      const chatFileUploads: ChatFile[] = validFiles.map((file) => ({
        id: generateFileId(file),
        file,
        platform: detectPlatform(file.name),
        status: 'pending',
        progress: 0,
      }));
      setChatFiles((prev) => [...prev, ...chatFileUploads]);
    },
    [detectPlatform]
  );

  const { dragActive, handleDrag, handleDrop, handleFileSelect } = useKnowledgeUpload({
    onFiles: handleFiles,
  });

  const pollJobStatus = useCallback(async (jobId: string, fileId: string) => {
    try {
      const status = await knowledgeAPI.getChatJobStatus(jobId);

      setChatFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? {
                ...file,
                status: status.status,
                progress: status.progress,
                results: status.results,
                error: status.error,
              }
            : file
        )
      );

      if (status.status === 'completed' || status.status === 'failed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error polling job status:', err);
      setChatFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? {
                ...file,
                status: 'failed',
                error: err instanceof Error ? err.message : 'Status check failed',
              }
            : file
        )
      );
      return false;
    }
  }, []);

  const startPolling = useCallback(
    (jobId: string, fileId: string) => {
      const poll = async () => {
        const shouldContinue = await pollJobStatus(jobId, fileId);
        if (!shouldContinue) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
      };

      pollIntervalRef.current = setInterval(poll, 2000);
      poll();
    },
    [pollJobStatus]
  );

  const uploadChatFile = useCallback(
    async (chatFile: ChatFile) => {
      try {
        setChatFiles((prev) =>
          prev.map((f) => (f.id === chatFile.id ? { ...f, status: 'processing' } : f))
        );

        const result = await knowledgeAPI.importChatFile(chatFile.file, ingestionOptions);

        setChatFiles((prev) =>
          prev.map((f) => (f.id === chatFile.id ? { ...f, jobId: result.jobId } : f))
        );

        startPolling(result.jobId, chatFile.id);
      } catch (err) {
        setChatFiles((prev) =>
          prev.map((f) =>
            f.id === chatFile.id
              ? {
                  ...f,
                  status: 'failed',
                  error: err instanceof Error ? err.message : 'Upload failed',
                }
              : f
          )
        );
      }
    },
    [ingestionOptions, startPolling]
  );

  const handleChatFileUpload = useCallback(async () => {
    const pendingFiles = chatFiles.filter((f) => f.status === 'pending');

    for (const file of pendingFiles) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      await uploadChatFile(file);
    }
  }, [chatFiles, uploadChatFile]);

  const removeFile = useCallback((id: string) => {
    setChatFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'claude':
        return <Brain className="w-4 h-4" />;
      case 'gpt':
        return <MessageSquare className="w-4 h-4" />;
      case 'whatsapp':
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <KnowledgeErrorAlert error={error} onDismiss={() => setError(null)} />

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat">Chat Import</TabsTrigger>
          <TabsTrigger value="text">Text Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="chat">
          <Card className="bg-black/20 border-blue-500/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <MessageSquare className="w-5 h-5 mr-2" />
                Import Chat Conversations
              </CardTitle>
              <p className="text-gray-300 text-sm">
                Upload Claude, ChatGPT, or WhatsApp conversation files to extract knowledge,
                workflows, and insights.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-white font-medium">Processing Options</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="extractWorkflows"
                      checked={ingestionOptions.extractWorkflows}
                      onCheckedChange={(checked) =>
                        setIngestionOptions((prev) => ({ ...prev, extractWorkflows: !!checked }))
                      }
                    />
                    <label
                      htmlFor="extractWorkflows"
                      className="text-sm text-gray-300 flex items-center"
                    >
                      <Workflow className="w-4 h-4 mr-1" />
                      Extract Workflows
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="generateQA"
                      checked={ingestionOptions.generateQA}
                      onCheckedChange={(checked) =>
                        setIngestionOptions((prev) => ({ ...prev, generateQA: !!checked }))
                      }
                    />
                    <label htmlFor="generateQA" className="text-sm text-gray-300 flex items-center">
                      <FileText className="w-4 h-4 mr-1" />
                      Generate Q&A Pairs
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="analyzeExpertise"
                      checked={ingestionOptions.analyzeExpertise}
                      onCheckedChange={(checked) =>
                        setIngestionOptions((prev) => ({ ...prev, analyzeExpertise: !!checked }))
                      }
                    />
                    <label
                      htmlFor="analyzeExpertise"
                      className="text-sm text-gray-300 flex items-center"
                    >
                      <Users className="w-4 h-4 mr-1" />
                      Analyze Expertise
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="detectLearning"
                      checked={ingestionOptions.detectLearning}
                      onCheckedChange={(checked) =>
                        setIngestionOptions((prev) => ({ ...prev, detectLearning: !!checked }))
                      }
                    />
                    <label
                      htmlFor="detectLearning"
                      className="text-sm text-gray-300 flex items-center"
                    >
                      <TrendingUp className="w-4 h-4 mr-1" />
                      Detect Learning
                    </label>
                  </div>
                </div>
              </div>

              <UploadDropZone
                dragActive={dragActive}
                handleDrag={handleDrag}
                handleDrop={handleDrop}
                handleFileSelect={handleFileSelect}
                fileInputRef={fileInputRef}
                acceptedTypes={CHAT_FILE_TYPES}
                promptText="Drop chat files here, or click to select"
                formatsLabel="Supported:"
                buttonText="Select Chat Files"
              >
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs text-gray-400">
                  {Object.entries(PLATFORM_DESCRIPTIONS).map(([platform, desc]) => (
                    <div key={platform} className="flex items-center justify-center">
                      {getPlatformIcon(platform)}
                      <span className="ml-1">{desc}</span>
                    </div>
                  ))}
                </div>
              </UploadDropZone>

              {chatFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-medium">Chat Files to Process</h4>
                    <Button
                      onClick={handleChatFileUpload}
                      disabled={chatFiles.filter((f) => f.status === 'pending').length === 0}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Process All ({chatFiles.filter((f) => f.status === 'pending').length})
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {chatFiles.map((file) => (
                      <div
                        key={file.id}
                        className="p-4 rounded border border-blue-500/20 bg-black/10"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            {getPlatformIcon(file.platform)}
                            <span className="text-white text-sm font-medium">{file.file.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {file.platform.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {(file.file.size / 1024).toFixed(1)} KB
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(file.status)}
                            <Badge
                              variant={
                                file.status === 'completed'
                                  ? 'default'
                                  : file.status === 'failed'
                                    ? 'destructive'
                                    : file.status === 'processing'
                                      ? 'secondary'
                                      : 'outline'
                              }
                            >
                              {file.status}
                            </Badge>
                            <FileRemoveButton onClick={() => removeFile(file.id)} />
                          </div>
                        </div>

                        {file.status === 'processing' && (
                          <UploadProgressBar
                            label="Processing..."
                            value={file.progress}
                            className="mb-2"
                          />
                        )}

                        {file.status === 'failed' && file.error && (
                          <p className="text-red-400 text-xs mb-2">{file.error}</p>
                        )}

                        {file.status === 'completed' && file.results && (
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                            <div>Knowledge: {file.results.knowledgeItems}</div>
                            <div>Q&A Pairs: {file.results.qaPairs}</div>
                            <div>Workflows: {file.results.workflows}</div>
                            <div>Expertise: {file.results.expertiseProfiles}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="text">
          <TextKnowledgeCard
            uploadKnowledge={uploadKnowledge}
            isUploading={isUploading}
            onUploadComplete={onUploadComplete}
            onError={setError}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
