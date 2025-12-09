import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  X,
  Plus,
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { knowledgeAPI } from '@/api/knowledge.api';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { KnowledgeType, SourceType, KnowledgeIngestRequest } from '@uaip/types';

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
  const { uploadKnowledge, isUploading, uploadProgress } = useKnowledge();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout>();

  // Local state
  const [dragActive, setDragActive] = useState(false);
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [textInput, setTextInput] = useState('');
  const [textTags, setTextTags] = useState('');
  const [textType, setTextType] = useState<KnowledgeType>('FACTUAL');
  const [error, setError] = useState<string | null>(null);
  const [ingestionOptions, setIngestionOptions] = useState<ChatIngestionOptions>({
    extractWorkflows: true,
    generateQA: true,
    analyzeExpertise: true,
    detectLearning: true,
  });

  // Detect platform from filename
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
  const handleFiles = useCallback(
    (newFiles: File[]) => {
      setError(null);

      const validFiles = newFiles.filter((file) => {
        const extension = '.' + file.name.split('.').pop()?.toLowerCase();
        return CHAT_FILE_TYPES.includes(extension);
      });

      if (validFiles.length !== newFiles.length) {
        setError(`Some files were skipped. Supported formats: ${CHAT_FILE_TYPES.join(', ')}`);
      }

      const chatFileUploads: ChatFile[] = validFiles.map((file) => ({
        id: `${file.name}-${Date.now()}`,
        file,
        platform: detectPlatform(file.name),
        status: 'pending',
        progress: 0,
      }));

      setChatFiles((prev) => [...prev, ...chatFileUploads]);
    },
    [detectPlatform]
  );

  // Poll job status
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
        return false; // Stop polling
      }

      return true; // Continue polling
    } catch (error) {
      console.error('Error polling job status:', error);
      setChatFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? {
                ...file,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Status check failed',
              }
            : file
        )
      );
      return false; // Stop polling
    }
  }, []);

  // Start polling for a job
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

      pollIntervalRef.current = setInterval(poll, 2000); // Poll every 2 seconds
      poll(); // Initial poll
    },
    [pollJobStatus]
  );

  // Upload chat file
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

        // Start polling for job status
        startPolling(result.jobId, chatFile.id);
      } catch (error) {
        setChatFiles((prev) =>
          prev.map((f) =>
            f.id === chatFile.id
              ? {
                  ...f,
                  status: 'failed',
                  error: error instanceof Error ? error.message : 'Upload failed',
                }
              : f
          )
        );
      }
    },
    [ingestionOptions, startPolling]
  );

  // Upload all chat files
  const handleChatFileUpload = useCallback(async () => {
    const pendingFiles = chatFiles.filter((f) => f.status === 'pending');

    for (const file of pendingFiles) {
      await uploadChatFile(file);
    }
  }, [chatFiles, uploadChatFile]);

  // Remove file
  const removeFile = useCallback((id: string) => {
    setChatFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  // Upload text knowledge (existing functionality)
  const handleTextUpload = useCallback(async () => {
    if (!textInput.trim()) return;

    const tags = textTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

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

  // Cleanup on unmount
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
      {/* Error Alert */}
      {error && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {error}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="ml-2 h-auto p-1"
            >
              ✕
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat">Chat Import</TabsTrigger>
          <TabsTrigger value="text">Text Knowledge</TabsTrigger>
        </TabsList>

        {/* Chat Import Tab */}
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
              {/* Processing Options */}
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
                <p className="text-white mb-2">Drop chat files here, or click to select</p>
                <p className="text-sm text-gray-400 mb-4">
                  Supported: {CHAT_FILE_TYPES.join(', ')}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs text-gray-400">
                  {Object.entries(PLATFORM_DESCRIPTIONS).map(([platform, desc]) => (
                    <div key={platform} className="flex items-center justify-center">
                      {getPlatformIcon(platform)}
                      <span className="ml-1">{desc}</span>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-blue-500/30 hover:bg-blue-500/10"
                >
                  Select Chat Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={CHAT_FILE_TYPES.join(',')}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {/* Chat Files List */}
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

                        {file.status === 'processing' && (
                          <div className="space-y-2 mb-2">
                            <div className="flex justify-between text-sm text-gray-300">
                              <span>Processing...</span>
                              <span>{file.progress}%</span>
                            </div>
                            <Progress value={file.progress} className="h-2" />
                          </div>
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

        {/* Text Knowledge Tab */}
        <TabsContent value="text">
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
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Knowledge Type
                  </label>
                  <Select
                    value={textType}
                    onValueChange={(value: KnowledgeType) => setTextType(value)}
                  >
                    <SelectTrigger className="bg-black/20 border-blue-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FACTUAL">Factual Knowledge</SelectItem>
                      <SelectItem value="PROCEDURAL">Procedural Knowledge</SelectItem>
                      <SelectItem value="CONCEPTUAL">Conceptual Knowledge</SelectItem>
                      <SelectItem value="EXPERIENTIAL">Experiential Knowledge</SelectItem>
                      <SelectItem value="EPISODIC">Episodic Memory</SelectItem>
                      <SelectItem value="SEMANTIC">Semantic Knowledge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Tags (comma-separated)
                  </label>
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
        </TabsContent>
      </Tabs>
    </div>
  );
};
