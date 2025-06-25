import React, { useState, useEffect, useCallback } from 'react';
import { Search, Upload, Database, Brain, FileText, Tag, TrendingUp, Link, Filter, Download, Trash2, Edit3, Eye, Plus } from 'lucide-react';
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<KnowledgeType[]>([]);
  const [selectedSources, setSelectedSources] = useState<SourceType[]>([]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [uploadContent, setUploadContent] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadType, setUploadType] = useState<KnowledgeType>(KnowledgeType.FACTUAL);
  const [uploadSource, setUploadSource] = useState<SourceType>(SourceType.USER_INPUT);
  const [relatedItems, setRelatedItems] = useState<KnowledgeItem[]>([]);

  // Load stats on mount
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    try {
      await searchKnowledge({
        query: searchQuery,
        filters: {
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          types: selectedTypes.length > 0 ? selectedTypes : undefined,
          sourceTypes: selectedSources.length > 0 ? selectedSources : undefined,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Search failed:', error);
    }
  }, [searchQuery, selectedTags, selectedTypes, selectedSources, searchKnowledge]);

  // Handle upload
  const handleUpload = useCallback(async () => {
    if (!uploadContent.trim()) return;

    const tags = uploadTags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    const knowledgeItem: KnowledgeIngestRequest = {
      content: uploadContent,
      type: uploadType,
      tags,
      source: {
        type: uploadSource,
        identifier: `user-upload-${Date.now()}`,
        metadata: {
          uploadedAt: new Date().toISOString(),
          userGenerated: true,
        },
      },
      confidence: 0.8,
    };

    try {
      await uploadKnowledge([knowledgeItem]);
      setUploadContent('');
      setUploadTags('');
      setShowUploadDialog(false);
      await refreshStats();
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }, [uploadContent, uploadTags, uploadType, uploadSource, uploadKnowledge, refreshStats]);

  // Handle item selection
  const handleItemSelect = useCallback(async (item: KnowledgeItem) => {
    setActiveItem(item.id);
    try {
      const related = await getRelatedKnowledge(item.id);
      setRelatedItems(related);
    } catch (error) {
      console.error('Failed to load related items:', error);
    }
  }, [setActiveItem, getRelatedKnowledge]);

  // Get active item
  const activeItem = activeItemId ? items[activeItemId] : null;

  // Get all available tags
  const allTags = Array.from(
    new Set([
      ...Object.values(items).flatMap(item => item.tags),
      ...searchResults.flatMap(item => item.tags),
    ])
  );

  return (
    <div className={`h-full flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-blue-500/20 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Database className="w-8 h-8 text-blue-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">Knowledge Graph</h2>
              <p className="text-blue-300">Manage and explore your knowledge base</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Knowledge
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Knowledge</DialogTitle>
                  <DialogDescription>
                    Upload new knowledge to your personal knowledge graph
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Content</label>
                    <Textarea
                      value={uploadContent}
                      onChange={(e) => setUploadContent(e.target.value)}
                      placeholder="Enter your knowledge content..."
                      rows={6}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                    <div>
                      <label className="text-sm font-medium mb-2 block">Source</label>
                      <Select value={uploadSource} onValueChange={(value: SourceType) => setUploadSource(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SOURCE_TYPES.map(source => (
                            <SelectItem key={source.value} value={source.value}>
                              {source.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Tags (comma-separated)</label>
                    <Input
                      value={uploadTags}
                      onChange={(e) => setUploadTags(e.target.value)}
                      placeholder="ai, machine-learning, research"
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
                    <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={!uploadContent.trim() || isUploading}>
                      {isUploading ? 'Uploading...' : 'Upload'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search Bar */}
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
          <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
          {searchResults.length > 0 && (
            <Button variant="outline" onClick={clearSearchResults}>
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
      <div className="flex-1 p-6 overflow-hidden">
        <Tabs defaultValue="browse" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-4 bg-black/20">
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="search">Search Results</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
            <TabsTrigger value="graph">Graph View</TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="flex-1 flex overflow-hidden">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
              {/* Knowledge Items List */}
              <div className="lg:col-span-2 space-y-4 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">All Knowledge</h3>
                  <Badge variant="secondary">{Object.keys(items).length} items</Badge>
                </div>
                <ScrollArea className="h-full">
                  <div className="space-y-3">
                    {Object.values(items).map((item) => (
                      <Card
                        key={item.id}
                        className={`cursor-pointer transition-all hover:bg-blue-500/10 border-blue-500/20 ${
                          activeItemId === item.id ? 'ring-2 ring-blue-500 bg-blue-500/20' : 'bg-black/20'
                        }`}
                        onClick={() => handleItemSelect(item)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              {KNOWLEDGE_TYPES.find(t => t.value === item.type)?.icon}
                              <Badge variant="outline" className="text-xs">
                                {item.type}
                              </Badge>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {(item.confidence * 100).toFixed(0)}%
                            </Badge>
                          </div>
                          <p className="text-white text-sm mb-2 line-clamp-2">
                            {item.content}
                          </p>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {item.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {item.tags.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{item.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                          <div className="flex justify-between items-center text-xs text-gray-400">
                            <span>{item.sourceType}</span>
                            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Item Details */}
              <div className="space-y-4 overflow-hidden">
                {activeItem ? (
                  <>
                    <Card className="bg-black/20 border-blue-500/20">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-white">Knowledge Item</CardTitle>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline">
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-300">Content</label>
                          <ScrollArea className="h-32 mt-1">
                            <p className="text-white text-sm">{activeItem.content}</p>
                          </ScrollArea>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-300">Type</label>
                            <p className="text-white text-sm">{activeItem.type}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-300">Confidence</label>
                            <p className="text-white text-sm">{(activeItem.confidence * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-300">Tags</label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {activeItem.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-300">Source</label>
                          <p className="text-white text-sm">{activeItem.sourceType}</p>
                          <p className="text-gray-400 text-xs">{activeItem.sourceIdentifier}</p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Related Items */}
                    {relatedItems.length > 0 && (
                      <Card className="bg-black/20 border-blue-500/20">
                        <CardHeader>
                          <CardTitle className="text-white">Related Knowledge</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-48">
                            <div className="space-y-2">
                              {relatedItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="p-2 rounded border border-blue-500/20 cursor-pointer hover:bg-blue-500/10"
                                  onClick={() => handleItemSelect(item)}
                                >
                                  <p className="text-white text-sm line-clamp-2">{item.content}</p>
                                  <div className="flex justify-between items-center mt-1">
                                    <Badge variant="outline" className="text-xs">
                                      {item.type}
                                    </Badge>
                                    <span className="text-xs text-gray-400">
                                      {(item.confidence * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <Card className="bg-black/20 border-blue-500/20">
                    <CardContent className="p-8 text-center">
                      <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-400">Select a knowledge item to view details</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Search Results Tab */}
          <TabsContent value="search" className="flex-1 overflow-hidden">
            <div className="h-full space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Search Results</h3>
                <Badge variant="secondary">{searchResults.length} results</Badge>
              </div>
              <ScrollArea className="h-full">
                <div className="space-y-3">
                  {searchResults.map((item) => (
                    <Card
                      key={item.id}
                      className="cursor-pointer transition-all hover:bg-blue-500/10 border-blue-500/20 bg-black/20"
                      onClick={() => handleItemSelect(item)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            {KNOWLEDGE_TYPES.find(t => t.value === item.type)?.icon}
                            <Badge variant="outline" className="text-xs">
                              {item.type}
                            </Badge>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {(item.confidence * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <p className="text-white text-sm mb-2 line-clamp-2">
                          {item.content}
                        </p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {item.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{item.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-400">
                          <span>{item.sourceType}</span>
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="stats" className="flex-1 overflow-hidden">
            {stats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 h-full overflow-auto">
                {/* Total Items */}
                <Card className="bg-black/20 border-blue-500/20">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Database className="w-5 h-5 mr-2" />
                      Total Knowledge
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-400">{stats.totalItems}</div>
                    <p className="text-gray-400">Items in knowledge base</p>
                  </CardContent>
                </Card>

                {/* By Type */}
                <Card className="bg-black/20 border-blue-500/20">
                  <CardHeader>
                    <CardTitle className="text-white">By Type</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(stats.itemsByType).map(([type, count]) => (
                      <div key={type} className="flex justify-between items-center">
                        <span className="text-gray-300">{type}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* By Source */}
                <Card className="bg-black/20 border-blue-500/20">
                  <CardHeader>
                    <CardTitle className="text-white">By Source</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {stats.itemsBySource && Object.entries(stats.itemsBySource).map(([source, count]) => (
                      <div key={source} className="flex justify-between items-center">
                        <span className="text-gray-300">{source}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card className="bg-black/20 border-blue-500/20 md:col-span-2 lg:col-span-3">
                  <CardHeader>
                    <CardTitle className="text-white">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.recentActivity.data && stats.recentActivity.map((activity, index) => (
                        <div key={index} className="flex justify-between items-center p-3 rounded border border-blue-500/20">
                          <span className="text-gray-300">{activity.date}</span>
                          <div className="flex space-x-4">
                            <div className="flex items-center space-x-1">
                              <Upload className="w-4 h-4 text-green-400" />
                              <span className="text-green-400">{activity.uploads}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Search className="w-4 h-4 text-blue-400" />
                              <span className="text-blue-400">{activity.searches}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="bg-black/20 border-blue-500/20">
                <CardContent className="p-8 text-center">
                  <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-400">Loading statistics...</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Graph View Tab */}
          <TabsContent value="graph" className="flex-1 overflow-hidden">
            <Card className="bg-black/20 border-blue-500/20 h-full">
              <CardContent className="p-8 text-center h-full flex items-center justify-center">
                <div>
                  <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-400 mb-2">Knowledge Graph Visualization</p>
                  <p className="text-sm text-gray-500">Coming soon - Interactive knowledge graph explorer</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}; 