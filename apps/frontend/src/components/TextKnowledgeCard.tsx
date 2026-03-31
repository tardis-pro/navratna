import React, { useState, useCallback } from 'react';
import { FileText, Plus, Loader2 } from 'lucide-react';
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
import { KnowledgeType, SourceType } from '@uaip/types';
import type { KnowledgeIngestRequest, KnowledgeIngestResponse } from '@uaip/types';

export const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string }[] = [
  { value: KnowledgeType.FACTUAL, label: 'Factual Knowledge' },
  { value: KnowledgeType.PROCEDURAL, label: 'Procedural Knowledge' },
  { value: KnowledgeType.CONCEPTUAL, label: 'Conceptual Knowledge' },
  { value: KnowledgeType.EXPERIENTIAL, label: 'Experiential Knowledge' },
  { value: KnowledgeType.EPISODIC, label: 'Episodic Memory' },
  { value: KnowledgeType.SEMANTIC, label: 'Semantic Knowledge' },
];

export const KnowledgeTypeSelectItems: React.FC = () => (
  <>
    {KNOWLEDGE_TYPES.map((type) => (
      <SelectItem key={type.value} value={type.value}>
        {type.label}
      </SelectItem>
    ))}
  </>
);

interface TextKnowledgeCardProps {
  uploadKnowledge: (items: KnowledgeIngestRequest[]) => Promise<KnowledgeIngestResponse>;
  isUploading: boolean;
  onUploadComplete?: () => void;
  onError: (error: string | null) => void;
}

export const TextKnowledgeCard: React.FC<TextKnowledgeCardProps> = ({
  uploadKnowledge,
  isUploading,
  onUploadComplete,
  onError,
}) => {
  const [textInput, setTextInput] = useState('');
  const [textTags, setTextTags] = useState('');
  const [textType, setTextType] = useState<KnowledgeType>(KnowledgeType.FACTUAL);

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
        type: SourceType.USER_INPUT,
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
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to upload text');
    }
  }, [textInput, textTags, textType, uploadKnowledge, onUploadComplete, onError]);

  return (
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
                <KnowledgeTypeSelectItems />
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
  );
};
