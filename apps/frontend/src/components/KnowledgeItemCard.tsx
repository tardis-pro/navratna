import React from 'react';
import {
  Calendar,
  Tag,
  Database,
  FileText,
  Brain,
  Link,
  TrendingUp,
  Eye,
  Edit3,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { KnowledgeItem, KnowledgeType } from '@uaip/types';

interface KnowledgeItemCardProps {
  item: KnowledgeItem;
  onEdit?: (item: KnowledgeItem) => void;
  onDelete?: (item: KnowledgeItem) => void;
  onViewRelated?: (item: KnowledgeItem) => void;
  onTagClick?: (tag: string) => void;
  className?: string;
  compact?: boolean;
}

const KNOWLEDGE_TYPE_ICONS: Record<KnowledgeType, React.ReactNode> = {
  FACTUAL: <FileText className="w-4 h-4" />,
  PROCEDURAL: <Brain className="w-4 h-4" />,
  CONCEPTUAL: <Database className="w-4 h-4" />,
  EXPERIENTIAL: <TrendingUp className="w-4 h-4" />,
  EPISODIC: <Link className="w-4 h-4" />,
  SEMANTIC: <Tag className="w-4 h-4" />,
};

const KNOWLEDGE_TYPE_COLORS: Record<KnowledgeType, string> = {
  FACTUAL: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  PROCEDURAL: 'bg-green-500/20 text-green-300 border-green-500/30',
  CONCEPTUAL: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  EXPERIENTIAL: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  EPISODIC: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  SEMANTIC: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
};

export const KnowledgeItemCard: React.FC<KnowledgeItemCardProps> = ({
  item,
  onEdit,
  onDelete,
  onViewRelated,
  onTagClick,
  className,
  compact = false,
}) => {
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const truncateContent = (content: string, maxLength: number = 150) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength).trim() + '...';
  };

  return (
    <Card
      className={`bg-black/20 border-blue-500/20 hover:bg-blue-500/10 transition-all duration-200 ${className}`}
    >
      <CardHeader className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2 flex-1">
            {KNOWLEDGE_TYPE_ICONS[item.type]}
            <Badge variant="outline" className={`text-xs ${KNOWLEDGE_TYPE_COLORS[item.type]}`}>
              {item.type}
            </Badge>
            <Badge variant="secondary" className={`text-xs ${getConfidenceColor(item.confidence)}`}>
              {(item.confidence * 100).toFixed(0)}%
            </Badge>
          </div>

          {!compact && (
            <div className="flex items-center space-x-1">
              {onEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEdit(item)}
                  className="h-6 w-6 p-0 hover:bg-blue-500/20"
                >
                  <Edit3 className="w-3 h-3" />
                </Button>
              )}
              {onViewRelated && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onViewRelated(item)}
                  className="h-6 w-6 p-0 hover:bg-blue-500/20"
                >
                  <Eye className="w-3 h-3" />
                </Button>
              )}
              {onDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(item)}
                  className="h-6 w-6 p-0 hover:bg-red-500/20 text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className={compact ? 'p-3 pt-0' : 'p-4 pt-0'}>
        {/* Content */}
        <div className="mb-3">
          {compact ? (
            <p className="text-white text-sm line-clamp-2">{truncateContent(item.content, 100)}</p>
          ) : (
            <ScrollArea className="h-20">
              <p className="text-white text-sm">{item.content}</p>
            </ScrollArea>
          )}
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {(compact ? item.tags.slice(0, 3) : item.tags).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs cursor-pointer hover:bg-blue-500/20"
                onClick={() => onTagClick?.(tag)}
              >
                <Tag className="w-2 h-2 mr-1" />
                {tag}
              </Badge>
            ))}
            {compact && item.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{item.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="flex justify-between items-center text-xs text-gray-400">
          <div className="flex items-center space-x-3">
            <span className="flex items-center">
              <Calendar className="w-3 h-3 mr-1" />
              {formatDate(item.createdAt)}
            </span>
            <span className="flex items-center">
              <Database className="w-3 h-3 mr-1" />
              {item.sourceType}
            </span>
          </div>

          {item.sourceUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="h-4 p-0 text-blue-400 hover:text-blue-300"
              onClick={() => window.open(item.sourceUrl, '_blank')}
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Summary (if available) */}
        {item.summary && !compact && (
          <div className="mt-3 pt-3 border-t border-blue-500/20">
            <p className="text-gray-300 text-xs italic">Summary: {item.summary}</p>
          </div>
        )}

        {/* Metadata details (if not compact) */}
        {!compact && item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="mt-3 pt-3 border-t border-blue-500/20">
            <details className="text-xs">
              <summary className="text-gray-400 cursor-pointer hover:text-gray-300">
                Metadata ({Object.keys(item.metadata).length} items)
              </summary>
              <div className="mt-2 space-y-1">
                {Object.entries(item.metadata)
                  .slice(0, 5)
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-400">{key}:</span>
                      <span className="text-gray-300 max-w-32 truncate">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
                {Object.keys(item.metadata).length > 5 && (
                  <p className="text-gray-500 text-center">
                    +{Object.keys(item.metadata).length - 5} more
                  </p>
                )}
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
