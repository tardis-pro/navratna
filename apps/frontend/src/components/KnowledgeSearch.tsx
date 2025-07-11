import React, { useState, useCallback } from 'react';
import { Search, Filter, X, Tag, Calendar, Database, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
    <div className={`space-y-6 ${className}`}>
      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-blue-900/30 to-purple-900/20 border-cyan-500/20 backdrop-blur-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5" />
          <CardContent className="relative p-6">
            <div className="flex space-x-3">
              <div className="flex-1 relative group">
                <motion.div
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-cyan-400 w-5 h-5"
                  animate={{ rotate: isSearching ? 360 : 0 }}
                  transition={{ duration: 1, repeat: isSearching ? Infinity : 0, ease: "linear" }}
                >
                  <Search className="w-5 h-5" />
                </motion.div>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search knowledge..."
                  className="pl-12 pr-4 py-3 bg-slate-800/50 border-slate-600/30 hover:border-cyan-500/50 focus:border-cyan-400/70 text-white placeholder-slate-400 rounded-xl backdrop-blur-sm transition-all duration-300"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  style={{
                    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 58, 138, 0.3))'
                  }}
                />
                <div className="absolute inset-0 rounded-xl border border-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </div>
              
              {/* Filters Button */}
              <Popover open={showFilters} onOpenChange={setShowFilters}>
                <PopoverTrigger asChild>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button 
                      variant="outline" 
                      className="relative px-4 py-3 border-slate-600/40 hover:border-purple-400/50 bg-slate-800/30 hover:bg-purple-500/10 text-slate-300 hover:text-purple-300 rounded-xl transition-all duration-300 overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 hover:opacity-100 transition-opacity" />
                      <Filter className="w-4 h-4 mr-2 relative z-10" />
                      <span className="relative z-10">Filters</span>
                      {hasFilters && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="relative z-10"
                        >
                          <Badge 
                            variant="secondary" 
                            className="ml-2 text-xs bg-purple-500/20 text-purple-300 border-purple-400/30"
                          >
                            {selectedTags.length + selectedTypes.length + selectedSources.length}
                          </Badge>
                        </motion.div>
                      )}
                    </Button>
                  </motion.div>
                </PopoverTrigger>
              <PopoverContent className="w-80 bg-gradient-to-br from-slate-900 to-slate-800 border-purple-500/20 backdrop-blur-xl">
                <motion.div 
                  className="space-y-4"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      <Filter className="w-4 h-4 text-purple-400" />
                      Search Filters
                    </h4>
                    {hasFilters && (
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={clearFilters}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          Clear All
                        </Button>
                      </motion.div>
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

            <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  onClick={handleSearch} 
                  disabled={isSearching || !query.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 border-0 rounded-xl text-white font-medium disabled:from-slate-600 disabled:to-slate-700 transition-all duration-300 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                  {isSearching ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      Searching...
                    </motion.div>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      Search
                    </span>
                  )}
                </Button>
            </motion.div>
          </div>

          {/* Active Filters Display */}
          <AnimatePresence>
            {hasFilters && (
              <motion.div 
                className="flex flex-wrap gap-2 mt-4"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                {selectedTypes.map((type) => (
                  <motion.div
                    key={type}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <Badge 
                      variant="secondary" 
                      className="text-xs bg-blue-500/20 text-blue-300 border-blue-400/30 flex items-center gap-1"
                    >
                      Type: {KNOWLEDGE_TYPES.find(t => t.value === type)?.label}
                      <motion.button
                        onClick={() => setSelectedTypes(prev => prev.filter(t => t !== type))}
                        className="ml-1 hover:bg-red-500/30 rounded p-0.5 transition-colors"
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <X className="w-3 h-3" />
                      </motion.button>
                    </Badge>
                  </motion.div>
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
      <AnimatePresence>
        {searchResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
          >
            <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-blue-900/30 to-purple-900/20 border-cyan-500/20 backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5" />
              <CardHeader className="relative">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-3">
                    <motion.div
                      className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                      animate={{ rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Database className="w-5 h-5 text-white" />
                    </motion.div>
                    <span>Search Results</span>
                  </CardTitle>
                  <div className="flex items-center space-x-3">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Badge 
                        variant="secondary" 
                        className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
                      >
                        {searchResults.length} results
                      </Badge>
                    </motion.div>
                    {searchMetadata && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        <Badge 
                          variant="outline" 
                          className="text-xs border-slate-500/30 text-slate-400 flex items-center gap-1"
                        >
                          <Zap className="w-3 h-3" />
                          {searchMetadata.processingTime}ms
                        </Badge>
                      </motion.div>
                    )}
                    <motion.button
                      onClick={clearSearchResults}
                      className="w-8 h-8 rounded-lg hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-300 transition-colors"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative">
                <ScrollArea 
                  className="h-96" 
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(59, 130, 246, 0.3) transparent' }}
                >
                  <div className="space-y-4">
                    {searchResults.map((item, index) => (
                      <motion.div
                        key={item.id}
                        className="group relative overflow-hidden rounded-xl border border-slate-600/30 hover:border-cyan-400/50 cursor-pointer transition-all duration-300"
                        onClick={() => handleItemClick(item)}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ 
                          delay: index * 0.05,
                          type: "spring",
                          stiffness: 200
                        }}
                        whileHover={{ 
                          y: -2,
                          scale: 1.01,
                          transition: { duration: 0.2 }
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* Background with gradient */}
                        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/60 via-blue-900/30 to-purple-900/20" />
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        <div className="relative p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <motion.div
                                className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                                whileHover={{ rotate: 5 }}
                              >
                                <Database className="w-4 h-4 text-white" />
                              </motion.div>
                              <Badge 
                                variant="outline" 
                                className="text-xs border-cyan-500/30 text-cyan-300 bg-cyan-500/10"
                              >
                                {item.type}
                              </Badge>
                            </div>
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                            >
                              <Badge 
                                variant="secondary" 
                                className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-400/30 flex items-center gap-1"
                              >
                                <Zap className="w-3 h-3" />
                                {(item.confidence * 100).toFixed(0)}%
                              </Badge>
                            </motion.div>
                          </div>
                    
                          <p className="text-white text-sm font-medium mb-4 leading-relaxed line-clamp-3">
                            {item.content}
                          </p>
                    
                          <div className="flex flex-wrap gap-2 mb-3">
                            {item.tags.slice(0, 5).map((tag) => (
                              <motion.div
                                key={tag}
                                whileHover={{ scale: 1.05 }}
                              >
                                <Badge 
                                  variant="outline" 
                                  className="text-xs border-purple-500/30 text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 transition-colors flex items-center gap-1"
                                >
                                  <Tag className="w-3 h-3" />
                                  {tag}
                                </Badge>
                              </motion.div>
                            ))}
                            {item.tags.length > 5 && (
                              <Badge 
                                variant="outline" 
                                className="text-xs border-slate-500/30 text-slate-400"
                              >
                                +{item.tags.length - 5} more
                              </Badge>
                            )}
                          </div>
                    
                          <div className="flex justify-between items-center text-xs">
                            <span className="flex items-center gap-2 text-slate-400">
                              <motion.div
                                className="w-1.5 h-1.5 bg-cyan-400 rounded-full"
                                animate={{ opacity: [1, 0.5, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                              />
                              <Calendar className="w-3 h-3" />
                              {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                            <span className="text-slate-500 px-2 py-1 rounded bg-slate-800/30">
                              {item.sourceType}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      <AnimatePresence>
        {searchResults.length === 0 && query && !isSearching && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-blue-900/30 to-purple-900/20 border-slate-600/30">
              <div className="absolute inset-0 bg-gradient-to-r from-slate-500/5 via-transparent to-slate-500/5" />
              <CardContent className="relative p-12 text-center">
                <motion.div
                  className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center"
                  animate={{ 
                    rotate: [0, 5, -5, 0],
                    scale: [1, 1.05, 1]
                  }}
                  transition={{ 
                    duration: 4, 
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <Search className="w-8 h-8 text-slate-400" />
                </motion.div>
                <h3 className="text-white font-semibold text-lg mb-3">No Results Found</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Try adjusting your search query or filters
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 