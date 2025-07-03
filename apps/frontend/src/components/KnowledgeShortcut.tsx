import React, { useState, useEffect } from 'react';
import { Eye, Search, BookOpen, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { KnowledgeItem } from '@uaip/types';

interface KnowledgeShortcutProps {
  isOpen: boolean;
  onClose: () => void;
  onExamine: (knowledgeItem: KnowledgeItem) => void;
}

export const KnowledgeShortcut: React.FC<KnowledgeShortcutProps> = ({ 
  isOpen, 
  onClose, 
  onExamine 
}) => {
  const { items, searchKnowledge, searchResults, clearSearchResults } = useKnowledge();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const allItems = Object.values(items);
  const displayItems = searchResults.length > 0 ? searchResults : allItems;

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      clearSearchResults();
    }
  }, [isOpen, clearSearchResults]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      clearSearchResults();
      return;
    }

    setIsSearching(true);
    try {
      await searchKnowledge({
        query: searchQuery,
        filters: {},
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleItemSelect = (item: KnowledgeItem) => {
    onExamine(item);
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Knowledge Quick Access
          </DialogTitle>
          <DialogDescription>
            Search and directly examine knowledge items
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col h-full space-y-4">
          {/* Search Bar */}
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search knowledge items..."
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
            {searchResults.length > 0 && (
              <Button variant="outline" onClick={() => {
                setSearchQuery('');
                clearSearchResults();
              }}>
                Clear
              </Button>
            )}
          </div>

          {/* Results Count */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {searchResults.length > 0 
                ? `${searchResults.length} search results` 
                : `${allItems.length} total items`
              }
            </span>
            {searchQuery && (
              <span>Searching for: "{searchQuery}"</span>
            )}
          </div>

          {/* Knowledge Items List */}
          <ScrollArea className="flex-1">
            {displayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                <BookOpen className="w-12 h-12 mb-3" />
                <p>No knowledge items found</p>
                {searchQuery && (
                  <p className="text-sm">Try a different search term</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {displayItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleItemSelect(item)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">
                          {item.content.substring(0, 200)}
                          {item.content.length > 200 && '...'}
                        </p>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            {item.type}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-gray-500">
                            {(item.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {item.tags.length > 4 && (
                            <Badge variant="secondary" className="text-xs">
                              +{item.tags.length - 4} more
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleItemSelect(item);
                          }}
                          className="h-8 w-8 p-0"
                          title="Examine"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Open in knowledge portal
                            window.dispatchEvent(new CustomEvent('openKnowledgePortal', {
                              detail: { itemId: item.id }
                            }));
                            onClose();
                          }}
                          className="h-8 w-8 p-0"
                          title="Open in Knowledge Portal"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Quick Actions */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-xs text-gray-500">
              Press Enter to search • Click items to examine • Use Ctrl+K anywhere for quick access
            </div>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};