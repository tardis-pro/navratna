import React, { useState, useCallback } from 'react';
import { Search, Filter, X, Tag, Calendar, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { KnowledgeType, SourceType, KnowledgeItem } from '@uaip/types';

interface KnowledgeSearchProps {
  onItemSelect?: (item: KnowledgeItem) => void;
  className?: string;
}

const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string }[] = [
  { value: 'FACTUAL', label: 'Factual' },
  { value: 'PROCEDURAL', label: 'Procedural' },
  { value: 'CONCEPTUAL', label: 'Conceptual' },
  { value: 'EXPERIENTIAL', label: 'Experiential' },
  { value: 'EPISODIC', label: 'Episodic' },
  { value: 'SEMANTIC', label: 'Semantic' },
];

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: 'USER_INPUT', label: 'User Input' },
  { value: 'FILE_SYSTEM', label: 'File System' },
  { value: 'GIT_REPOSITORY', label: 'Git Repository' },
  { value: 'AGENT_INTERACTION', label: 'Agent Interaction' },
  { value: 'DISCUSSION', label: 'Discussion' },
  { value: 'OPERATION', label: 'Operation' },
  { value: 'EXTERNAL_API', label: 'External API' },
];

export const KnowledgeSearch: React.FC<KnowledgeSearchProps> = ({ 
  onItemSelect,
  className 
}) => {
  const {
    searchResults,
    isSearching,
    error,
    searchMetadata,
    searchKnowledge,
    clearSearchResults,
    clearError,
  } = useKnowledge();

  // Local state
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<KnowledgeType[]>([]);
  const [selectedSources, setSelectedSources] = useState<SourceType[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    try {
      await searchKnowledge({
        query: query.trim(),
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
  }, [query, selectedTags, selectedTypes, selectedSources, searchKnowledge]);

  // Handle clear filters
  const clearFilters = useCallback(() => {
    setSelectedTags([]);
    setSelectedTypes([]);
    setSelectedSources([]);
  }, []);

  // Handle item click
  const handleItemClick = useCallback((item: KnowledgeItem) => {
    onItemSelect?.(item);
  }, [onItemSelect]);

  const hasFilters = selectedTags.length > 0 || selectedTypes.length > 0 || selectedSources.length > 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search Bar */}
      <Card className="bg-black/20 border-blue-500/20">
        <CardContent className="p-4">
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search knowledge..."
                className="pl-10 bg-black/20 border-blue-500/30 text-white placeholder-gray-400"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            
            {/* Filters Button */}
            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="border-blue-500/30">
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                  {hasFilters && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {selectedTags.length + selectedTypes.length + selectedSources.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 bg-gray-900 border-blue-500/20">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-white">Search Filters</h4>
                    {hasFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        Clear All
                      </Button>
                    )}
                  </div>

                  {/* Knowledge Types */}
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Knowledge Types</label>
                    <div className="space-y-2">
                      {KNOWLEDGE_TYPES.map((type) => (
                        <div key={type.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`type-${type.value}`}
                            checked={selectedTypes.includes(type.value)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTypes(prev => [...prev, type.value]);
                              } else {
                                setSelectedTypes(prev => prev.filter(t => t !== type.value));
                              }
                            }}
                          />
                          <label htmlFor={`type-${type.value}`} className="text-sm text-gray-300">
                            {type.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Source Types */}
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Source Types</label>
                    <div className="space-y-2">
                      {SOURCE_TYPES.map((source) => (
                        <div key={source.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`source-${source.value}`}
                            checked={selectedSources.includes(source.value)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedSources(prev => [...prev, source.value]);
                              } else {
                                setSelectedSources(prev => prev.filter(s => s !== source.value));
                              }
                            }}
                          />
                          <label htmlFor={`source-${source.value}`} className="text-sm text-gray-300">
                            {source.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {/* Active Filters Display */}
          {hasFilters && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedTypes.map((type) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  Type: {KNOWLEDGE_TYPES.find(t => t.value === type)?.label}
                  <button
                    onClick={() => setSelectedTypes(prev => prev.filter(t => t !== type))}
                    className="ml-1 hover:bg-gray-600 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {selectedSources.map((source) => (
                <Badge key={source} variant="secondary" className="text-xs">
                  Source: {SOURCE_TYPES.find(s => s.value === source)?.label}
                  <button
                    onClick={() => setSelectedSources(prev => prev.filter(s => s !== source))}
                    className="ml-1 hover:bg-gray-600 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  Tag: {tag}
                  <button
                    onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                    className="ml-1 hover:bg-gray-600 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-red-300">{error}</p>
              <Button variant="ghost" size="sm" onClick={clearError}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card className="bg-black/20 border-blue-500/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center">
                <Database className="w-5 h-5 mr-2" />
                Search Results
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary">{searchResults.length} results</Badge>
                {searchMetadata && (
                  <Badge variant="outline" className="text-xs">
                    {searchMetadata.processingTime}ms
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={clearSearchResults}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <div className="space-y-3">
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded border border-blue-500/20 bg-black/10 cursor-pointer hover:bg-blue-500/10 transition-colors"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Database className="w-4 h-4 text-blue-400" />
                        <Badge variant="outline" className="text-xs">
                          {item.type}
                        </Badge>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {(item.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    
                    <p className="text-white text-sm mb-3 line-clamp-3">
                      {item.content}
                    </p>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.tags.slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          <Tag className="w-3 h-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                      {item.tags.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{item.tags.length - 5} more
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center text-xs text-gray-400">
                      <span className="flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                      <span>{item.sourceType}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {searchResults.length === 0 && query && !isSearching && (
        <Card className="bg-black/20 border-blue-500/20">
          <CardContent className="p-8 text-center">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-white font-medium mb-2">No Results Found</h3>
            <p className="text-gray-400 text-sm">
              Try adjusting your search query or filters
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}; 