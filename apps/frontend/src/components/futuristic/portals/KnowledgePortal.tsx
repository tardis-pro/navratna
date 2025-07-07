import React, { useState, useEffect, useCallback } from 'react';
import { Search, Upload, Database, Brain, FileText, Tag, TrendingUp, Link, Filter, Download, Trash2, Edit3, Eye, Plus, MessageSquare, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { KnowledgeItem, KnowledgeIngestRequest } from '@uaip/types';
import { KnowledgeType, SourceType } from '@uaip/types';
import KnowledgeGraphVisualization from './KnowledgeGraphVisualization';
import { AtomicKnowledgeViewer } from './AtomicKnowledgeViewer';
import { DiscussionTrigger } from '@/components/DiscussionTrigger';

interface KnowledgePortalProps {
  className?: string;
}

const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string; icon: React.ReactNode }[] = [
  { value: KnowledgeType.FACTUAL, label: 'Factual', icon: <FileText className="w-4 h-4" /> },
  { value: KnowledgeType.PROCEDURAL, label: 'Procedural', icon: <Brain className="w-4 h-4" /> },
  { value: KnowledgeType.CONCEPTUAL, label: 'Conceptual', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.EXPERIENTIAL, label: 'Experiential', icon: <TrendingUp className="w-4 h-4" /> },
  { value: KnowledgeType.EPISODIC, label: 'Episodic', icon: <Link className="w-4 h-4" /> },
  { value: KnowledgeType.SEMANTIC, label: 'Semantic', icon: <Tag className="w-4 h-4" /> },
];

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: SourceType.USER_INPUT, label: 'User Input' },
  { value: SourceType.FILE_SYSTEM, label: 'File System' },
  { value: SourceType.GIT_REPOSITORY, label: 'Git Repository' },
  { value: SourceType.AGENT_INTERACTION, label: 'Agent Interaction' },
  { value: SourceType.DISCUSSION, label: 'Discussion' },
  { value: SourceType.OPERATION, label: 'Operation' },
  { value: SourceType.EXTERNAL_API, label: 'External API' },
];

export const KnowledgePortal: React.FC<KnowledgePortalProps> = ({ className }) => {
  const {
    items,
    searchResults,
    activeItemId,
    isLoading,
    isUploading,
    isSearching,
    error,
    stats,
    uploadProgress,
    uploadKnowledge,
    searchKnowledge,
    updateKnowledge,
    deleteKnowledge,
    getRelatedKnowledge,
    getKnowledgeByTag,
    setActiveItem,
    clearSearchResults,
    clearError,
    refreshStats,
  } = useKnowledge();

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemForAtomic, setSelectedItemForAtomic] = useState<KnowledgeItem | null>(null);
  const [activeTab, setActiveTab] = useState<string>('browse');
  const [relatedItems, setRelatedItems] = useState<KnowledgeItem[]>([]);

  // Load stats on mount
  useEffect(() => {
    refreshStats();
  }, []); // Empty dependency array - only run on mount

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    try {
      await searchKnowledge({
        query: searchQuery,
        filters: {},
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Search failed:', error);
    }
  }, [searchQuery, searchKnowledge]);

  return (
    <div className={`h-full flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 ${className}`}>
      {/* Search Bar */}
      <div className="p-4 border-b border-blue-500/20">
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search knowledge..."
              className="pl-10 bg-black/20 border-blue-500/30 text-white placeholder-gray-400"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} size="sm">
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
          {searchResults.length > 0 && (
            <Button variant="outline" onClick={clearSearchResults} size="sm">
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="m-4 border-red-500/50 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {error}
            <Button variant="ghost" size="sm" onClick={clearError} className="ml-2 h-auto p-1">
              ✕
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(value) => {
          if (value === 'atomic' && !selectedItemForAtomic) {
            return;
          }
          setActiveTab(value);
        }} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 bg-black/20 mx-4 mt-4">
            <TabsTrigger value="browse">List</TabsTrigger>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="atomic">Examine</TabsTrigger>
          </TabsList>

          {/* List Tab */}
          <TabsContent value="browse" className="flex-1 overflow-hidden p-4">
            {Object.values(items).length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-400">No knowledge items found</p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-2">
                  {Object.values(items).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-black/20 border border-blue-500/20 rounded hover:bg-blue-500/10 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate mb-1">
                          {item.content}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                          {item.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 ml-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigator.clipboard.writeText(item.content)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          title="Copy"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const blob = new Blob([item.content], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `knowledge-${item.id}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <DiscussionTrigger
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                              title="Discuss"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                          }
                          contextType="knowledge"
                          contextData={{
                            knowledgeItem: {
                              id: item.id,
                              content: item.content,
                              type: item.type,
                              tags: item.tags
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteKnowledge(item.id)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedItemForAtomic(item);
                            setActiveTab('atomic');
                          }}
                          className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300"
                          title="Examine"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* Search Results (shown when there are results) */}
          {searchResults.length > 0 && activeTab === 'browse' && (
            <TabsContent value="browse" className="flex-1 overflow-hidden p-4">
              <ScrollArea className="h-full">
                <div className="space-y-2">
                  {searchResults.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-black/20 border border-blue-500/20 rounded hover:bg-blue-500/10 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate mb-1">
                          {item.content}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                          {item.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 ml-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigator.clipboard.writeText(item.content)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          title="Copy"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const blob = new Blob([item.content], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `knowledge-${item.id}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <DiscussionTrigger
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                              title="Discuss"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                          }
                          contextType="knowledge"
                          contextData={{
                            knowledgeItem: {
                              id: item.id,
                              content: item.content,
                              type: item.type,
                              tags: item.tags
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteKnowledge(item.id)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedItemForAtomic(item);
                            setActiveTab('atomic');
                          }}
                          className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300"
                          title="Examine"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* Graph View Tab */}
          <TabsContent value="graph" className="flex-1 overflow-hidden">
            <KnowledgeGraphVisualization 
              className="h-full" 
              onNodeSelect={(nodeData) => {
                // Find the knowledge item from the node data
                const item = Object.values(items).find(item => item.id === nodeData.id);
                if (item) {
                  setSelectedItemForAtomic(item);
                  setActiveTab('atomic');
                }
              }}
            />
          </TabsContent>

          {/* Atomic View Tab */}
          <TabsContent value="atomic" className="flex-1 overflow-hidden">
            {selectedItemForAtomic ? (
              <AtomicKnowledgeViewer
                item={selectedItemForAtomic}
                relatedItems={relatedItems}
                onUpdate={async (updates) => {
                  await updateKnowledge(selectedItemForAtomic.id, updates);
                  // Refresh the item
                  const updatedItem = { ...selectedItemForAtomic, ...updates };
                  setSelectedItemForAtomic(updatedItem);
                }}
                onDelete={async (id) => {
                  await deleteKnowledge(id);
                  setSelectedItemForAtomic(null);
                  setActiveTab('browse');
                }}
                onLoadRelated={async (itemId) => {
                  const related = await getRelatedKnowledge(itemId);
                  setRelatedItems(related);
                  return related;
                }}
                className="h-full"
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center p-8">
                  <Brain className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">No Item Selected</h3>
                  <p className="text-slate-400 mb-4">Select a knowledge item to examine in detail</p>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-500">You can select items from:</p>
                    <div className="flex justify-center gap-2">
                      <Badge variant="outline" className="text-xs">Browse tab</Badge>
                      <Badge variant="outline" className="text-xs">Search results</Badge>
                      <Badge variant="outline" className="text-xs">Graph view</Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}; 