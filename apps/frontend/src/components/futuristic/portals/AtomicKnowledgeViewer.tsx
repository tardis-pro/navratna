import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  FileText,
  Tag,
  Calendar,
  User,
  Globe,
  Link2,
  TrendingUp,
  BarChart3,
  Eye,
  Copy,
  Download,
  Share,
  Edit3,
  Trash2,
  MessageSquare,
  Network,
  Clock,
  Target,
  Zap,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Plus,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import type { KnowledgeItem } from '@uaip/types';
import { KnowledgeType, SourceType } from '@uaip/types';
import { DiscussionTrigger } from '@/components/DiscussionTrigger';

interface AtomicKnowledgeViewerProps {
  item: KnowledgeItem;
  relatedItems?: KnowledgeItem[];
  onUpdate?: (updates: Partial<KnowledgeItem>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onLoadRelated?: (itemId: string) => Promise<KnowledgeItem[]>;
  className?: string;
}

interface KnowledgeAnalysis {
  readingTime: number;
  wordCount: number;
  complexity: 'simple' | 'moderate' | 'complex';
  keyTerms: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  conceptDensity: number;
}

interface KnowledgeConnection {
  id: string;
  targetId: string;
  type: 'semantic' | 'temporal' | 'causal' | 'reference';
  strength: number;
  description: string;
}

const KNOWLEDGE_TYPE_INFO = {
  [KnowledgeType.FACTUAL]: {
    icon: <FileText className="w-4 h-4" />,
    color: 'from-blue-500 to-blue-600',
    description: 'Concrete facts and objective information',
  },
  [KnowledgeType.PROCEDURAL]: {
    icon: <Brain className="w-4 h-4" />,
    color: 'from-green-500 to-green-600',
    description: 'Step-by-step processes and procedures',
  },
  [KnowledgeType.CONCEPTUAL]: {
    icon: <Network className="w-4 h-4" />,
    color: 'from-purple-500 to-purple-600',
    description: 'Abstract concepts and theoretical frameworks',
  },
  [KnowledgeType.EXPERIENTIAL]: {
    icon: <TrendingUp className="w-4 h-4" />,
    color: 'from-orange-500 to-orange-600',
    description: 'Experiential knowledge and insights',
  },
  [KnowledgeType.EPISODIC]: {
    icon: <Clock className="w-4 h-4" />,
    color: 'from-red-500 to-red-600',
    description: 'Event-based and temporal knowledge',
  },
  [KnowledgeType.SEMANTIC]: {
    icon: <Tag className="w-4 h-4" />,
    color: 'from-cyan-500 to-cyan-600',
    description: 'Semantic relationships and meanings',
  },
};

export const AtomicKnowledgeViewer: React.FC<AtomicKnowledgeViewerProps> = ({
  item,
  relatedItems = [],
  onUpdate,
  onDelete,
  onLoadRelated,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(item.content);
  const [editedTags, setEditedTags] = useState(item.tags.join(', '));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<KnowledgeAnalysis | null>(null);
  const [connections, setConnections] = useState<KnowledgeConnection[]>([]);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');

  const typeInfo = KNOWLEDGE_TYPE_INFO[item.type] || KNOWLEDGE_TYPE_INFO[KnowledgeType.FACTUAL];

  // Analyze content on mount
  useEffect(() => {
    analyzeContent();
    if (onLoadRelated) {
      loadConnections();
    }
  }, [item.id]);

  const analyzeContent = useCallback(async () => {
    setIsAnalyzing(true);

    // Simulate content analysis (in real implementation, this would call an AI service)
    setTimeout(() => {
      const words = item.content.split(/\s+/).filter(Boolean);
      const sentences = item.content.split(/[.!?]+/).filter(Boolean);

      const mockAnalysis: KnowledgeAnalysis = {
        readingTime: Math.ceil(words.length / 200), // 200 words per minute
        wordCount: words.length,
        complexity: words.length > 100 ? 'complex' : words.length > 50 ? 'moderate' : 'simple',
        keyTerms: extractKeyTerms(item.content),
        sentiment: analyzeSentiment(item.content),
        topics: item.tags.slice(0, 3),
        conceptDensity: Math.min(100, (sentences.length / words.length) * 1000),
      };

      setAnalysis(mockAnalysis);
      setIsAnalyzing(false);
    }, 1000);
  }, [item.content]);

  const loadConnections = useCallback(async () => {
    if (!onLoadRelated) return;

    try {
      const related = await onLoadRelated(item.id);
      const mockConnections: KnowledgeConnection[] = related.slice(0, 5).map((relatedItem) => ({
        id: `conn-${item.id}-${relatedItem.id}`,
        targetId: relatedItem.id,
        type: 'semantic',
        strength: Math.random() * 0.8 + 0.2,
        description: `Related through shared concepts: ${relatedItem.tags.slice(0, 2).join(', ')}`,
      }));

      setConnections(mockConnections);
    } catch (error) {
      console.error('Failed to load connections:', error);
    }
  }, [item.id, onLoadRelated]);

  const extractKeyTerms = (content: string): string[] => {
    // Simple key term extraction (in real implementation, use NLP)
    const words = content.toLowerCase().split(/\s+/);
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
    ]);
    const wordCounts = words
      .filter((word) => word.length > 3 && !commonWords.has(word))
      .reduce(
        (acc, word) => {
          acc[word] = (acc[word] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

    return Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  };

  const analyzeSentiment = (content: string): 'positive' | 'neutral' | 'negative' => {
    // Simple sentiment analysis (in real implementation, use ML)
    const positiveWords = [
      'good',
      'great',
      'excellent',
      'amazing',
      'wonderful',
      'fantastic',
      'positive',
      'success',
      'achieve',
    ];
    const negativeWords = [
      'bad',
      'terrible',
      'awful',
      'horrible',
      'negative',
      'fail',
      'error',
      'problem',
      'issue',
    ];

    const words = content.toLowerCase().split(/\s+/);
    const positiveCount = words.filter((word) => positiveWords.includes(word)).length;
    const negativeCount = words.filter((word) => negativeWords.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  };

  const handleSave = async () => {
    if (!onUpdate) return;

    try {
      await onUpdate({
        content: editedContent,
        tags: editedTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update knowledge item:', error);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(item.content || '');
  };

  const handleExport = () => {
    const exportData = {
      id: item.id,
      content: item.content || '',
      type: item.type,
      tags: item.tags || [],
      confidence: item.confidence || 0,
      sourceType: item.sourceType,
      createdAt: item.createdAt,
      analysis: analysis,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-${item.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'text-green-400';
      case 'negative':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getComplexityIcon = (complexity: string) => {
    switch (complexity) {
      case 'simple':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'complex':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Target className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getConnectionTypeColor = (type: string) => {
    switch (type) {
      case 'semantic':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'temporal':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'causal':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'reference':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`h-full flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 ${className}`}
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-700/50 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div
              className={`w-12 h-12 bg-gradient-to-br ${typeInfo.color} rounded-xl flex items-center justify-center`}
            >
              {typeInfo.icon}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-white">Atomic Knowledge</h2>
                <Badge variant="outline" className="text-xs">
                  {item.type}
                </Badge>
              </div>
              <p className="text-slate-400 text-sm">{typeInfo.description}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button size="sm" variant="outline" onClick={handleCopy}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4" />
            </Button>
            <DiscussionTrigger
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/50"
                >
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Discuss
                </Button>
              }
              contextType="knowledge"
              contextData={{
                knowledgeItem: {
                  id: item.id,
                  content: item.content,
                  type: item.type,
                  tags: item.tags,
                },
              }}
            />
            {onUpdate && (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(!isEditing)}>
                <Edit3 className="w-4 h-4" />
              </Button>
            )}
            {onDelete && (
              <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-hidden">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 bg-black/20">
            <TabsTrigger value="overview">Content</TabsTrigger>
            <TabsTrigger value="connections">Related</TabsTrigger>
            <TabsTrigger value="metadata">Details</TabsTrigger>
          </TabsList>

          {/* Content Tab */}
          <TabsContent value="overview" className="flex-1 space-y-4 overflow-hidden">
            <div className="h-full flex flex-col">
              {/* Main Content Area */}
              <div className="flex-1 mb-4">
                {isEditing ? (
                  <div className="h-full flex flex-col space-y-4">
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="flex-1 bg-slate-800/50 border-slate-600/50 text-white resize-none"
                      placeholder="Enter knowledge content..."
                    />
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSave}>Save Changes</Button>
                    </div>
                  </div>
                ) : (
                  <Card className="bg-black/20 border-slate-700/50 h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white">Content</CardTitle>
                        {analysis && (
                          <div className="flex items-center space-x-2 text-sm text-slate-400">
                            <Clock className="w-4 h-4" />
                            <span>{analysis.readingTime} min read</span>
                            <span>•</span>
                            <span>{analysis.wordCount} words</span>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="h-full pb-6">
                      <ScrollArea className="h-full">
                        <div className="text-slate-300 leading-relaxed whitespace-pre-wrap pr-4">
                          {item.content}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Tags Row */}
              <div className="border-t border-slate-700/50 pt-4">
                {isEditing ? (
                  <div>
                    <label className="text-slate-400 text-sm mb-2 block">Tags</label>
                    <Input
                      value={editedTags}
                      onChange={(e) => setEditedTags(e.target.value)}
                      placeholder="Comma-separated tags"
                      className="bg-slate-800/50 border-slate-600/50 text-white"
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-slate-300">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Related Tab */}
          <TabsContent value="connections" className="flex-1 space-y-4 overflow-hidden">
            {relatedItems.length > 0 ? (
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-4">
                  {relatedItems.map((relatedItem) => (
                    <Card
                      key={relatedItem.id}
                      className="bg-black/20 border-slate-700/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            {relatedItem.type}
                          </Badge>
                          <span className="text-xs text-slate-400">
                            {((relatedItem.confidence || 0) * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed mb-3">
                          {relatedItem.content.length > 200
                            ? `${relatedItem.content.substring(0, 200)}...`
                            : relatedItem.content}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {relatedItem.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {relatedItem.tags.length > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{relatedItem.tags.length - 4}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Network className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400">No related items found</p>
                  <p className="text-slate-500 text-sm">
                    Related knowledge will appear here as you build your knowledge base
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="metadata" className="flex-1 space-y-4 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Basic Info */}
              <Card className="bg-black/20 border-slate-700/50">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Type</span>
                    <span className="text-white">{item.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Source</span>
                    <span className="text-white text-sm">{item.sourceType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Confidence</span>
                    <span className="text-white">{((item.confidence || 0) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Created</span>
                    <span className="text-white text-sm">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {analysis && (
                    <>
                      <div className="border-t border-slate-600/50 pt-3 mt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Reading Time</span>
                          <span className="text-white">{analysis.readingTime} min</span>
                        </div>
                        <div className="flex justify-between mt-2">
                          <span className="text-slate-400">Word Count</span>
                          <span className="text-white">{analysis.wordCount}</span>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-slate-400">Complexity</span>
                          <div className="flex items-center space-x-1">
                            {getComplexityIcon(analysis.complexity)}
                            <span className="text-white capitalize">{analysis.complexity}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Key Terms */}
              {analysis && analysis.keyTerms.length > 0 && (
                <Card className="bg-black/20 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Key Terms</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analysis.keyTerms.map((term, index) => (
                        <div
                          key={term}
                          className="flex items-center justify-between p-2 bg-slate-800/30 rounded"
                        >
                          <span className="text-slate-300">{term}</span>
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Connection Dialog */}
      <Dialog open={showConnectionDialog} onOpenChange={setShowConnectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Knowledge Connection</DialogTitle>
            <DialogDescription>
              Create a new connection between this knowledge item and another
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Connection Type</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select connection type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semantic">Semantic</SelectItem>
                  <SelectItem value="temporal">Temporal</SelectItem>
                  <SelectItem value="causal">Causal</SelectItem>
                  <SelectItem value="reference">Reference</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Target Knowledge Item</label>
              <Input placeholder="Search for knowledge item..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description</label>
              <Textarea placeholder="Describe the relationship..." rows={3} />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowConnectionDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowConnectionDialog(false)}>Create Connection</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default AtomicKnowledgeViewer;
