import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  FileText,
  Code,
  Image,
  Video,
  Music,
  Archive,
  Star,
  Clock,
  User,
  Tag,
  MoreVertical,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface Artifact {
  id: string;
  name: string;
  type: 'code' | 'document' | 'image' | 'video' | 'audio' | 'archive' | 'other';
  size: number;
  createdAt: Date;
  updatedAt: Date;
  author: string;
  description?: string;
  tags: string[];
  isFavorite: boolean;
  downloadCount: number;
  version: string;
  status: 'draft' | 'published' | 'archived';
}

interface ArtifactsPortalProps {
  viewport?: ViewportSize;
  className?: string;
}

export const ArtifactsPortal: React.FC<ArtifactsPortalProps> = ({
  viewport,
  className = ''
}) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'downloads'>('date');

  // Mock data
  useEffect(() => {
    const mockArtifacts: Artifact[] = [
      {
        id: '1',
        name: 'Agent Configuration Template',
        type: 'code',
        size: 15420,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-20'),
        author: 'System',
        description: 'Template for creating new AI agents with standard configurations',
        tags: ['template', 'agent', 'config'],
        isFavorite: true,
        downloadCount: 45,
        version: '1.2.0',
        status: 'published'
      },
      {
        id: '2',
        name: 'Discussion Analysis Report',
        type: 'document',
        size: 2840,
        createdAt: new Date('2024-01-18'),
        updatedAt: new Date('2024-01-18'),
        author: 'Agent Alpha',
        description: 'Comprehensive analysis of recent agent discussions',
        tags: ['analysis', 'report', 'discussion'],
        isFavorite: false,
        downloadCount: 12,
        version: '1.0.0',
        status: 'published'
      },
      {
        id: '3',
        name: 'Knowledge Graph Visualization',
        type: 'image',
        size: 890000,
        createdAt: new Date('2024-01-19'),
        updatedAt: new Date('2024-01-19'),
        author: 'Agent Beta',
        description: 'Visual representation of the current knowledge graph structure',
        tags: ['visualization', 'knowledge', 'graph'],
        isFavorite: true,
        downloadCount: 28,
        version: '1.0.0',
        status: 'published'
      },
      {
        id: '4',
        name: 'System Backup Archive',
        type: 'archive',
        size: 15600000,
        createdAt: new Date('2024-01-20'),
        updatedAt: new Date('2024-01-20'),
        author: 'System',
        description: 'Complete system backup including configurations and data',
        tags: ['backup', 'system', 'archive'],
        isFavorite: false,
        downloadCount: 3,
        version: '2024.01.20',
        status: 'published'
      },
      {
        id: '5',
        name: 'Draft API Documentation',
        type: 'document',
        size: 45200,
        createdAt: new Date('2024-01-21'),
        updatedAt: new Date('2024-01-21'),
        author: 'Agent Gamma',
        description: 'Work in progress API documentation for new features',
        tags: ['documentation', 'api', 'draft'],
        isFavorite: false,
        downloadCount: 0,
        version: '0.1.0',
        status: 'draft'
      }
    ];

    setArtifacts(mockArtifacts);
  }, []);

  // Filter and sort artifacts
  const filteredArtifacts = artifacts
    .filter(artifact => {
      const matchesSearch = artifact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           artifact.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           artifact.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType = selectedType === 'all' || artifact.type === selectedType;
      const matchesStatus = selectedStatus === 'all' || artifact.status === selectedStatus;
      
      return matchesSearch && matchesType && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        case 'size':
          return b.size - a.size;
        case 'downloads':
          return b.downloadCount - a.downloadCount;
        default:
          return 0;
      }
    });

  // Get type icon
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'code':
        return Code;
      case 'document':
        return FileText;
      case 'image':
        return Image;
      case 'video':
        return Video;
      case 'audio':
        return Music;
      case 'archive':
        return Archive;
      default:
        return Package;
    }
  };

  // Get type color
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'code': 'bg-blue-500/20 text-blue-400',
      'document': 'bg-green-500/20 text-green-400',
      'image': 'bg-purple-500/20 text-purple-400',
      'video': 'bg-red-500/20 text-red-400',
      'audio': 'bg-yellow-500/20 text-yellow-400',
      'archive': 'bg-gray-500/20 text-gray-400',
      'other': 'bg-slate-500/20 text-slate-400'
    };
    return colors[type] || colors.other;
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-500/20 text-green-400';
      case 'draft':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'archived':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className={`h-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-purple-500/20 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Package className="w-8 h-8 text-purple-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">Artifacts Repository</h2>
              <p className="text-purple-300">Manage and organize your digital assets</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button className="bg-purple-600 hover:bg-purple-700">
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
            <Button variant="outline" className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10">
              <Plus className="w-4 h-4 mr-2" />
              Create
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search artifacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800/50 border-slate-600/50 text-white placeholder-slate-400"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-slate-800/50 border border-slate-600/50 text-white text-sm rounded px-3 py-2"
            >
              <option value="all">All Types</option>
              <option value="code">Code</option>
              <option value="document">Documents</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="archive">Archives</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-800/50 border border-slate-600/50 text-white text-sm rounded px-3 py-2"
            >
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-800/50 border border-slate-600/50 text-white text-sm rounded px-3 py-2"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="size">Sort by Size</option>
              <option value="downloads">Sort by Downloads</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 text-sm">
                {filteredArtifacts.length} artifact{filteredArtifacts.length !== 1 ? 's' : ''}
              </span>
              {searchQuery && (
                <Badge className="bg-purple-500/20 text-purple-400">
                  Filtered
                </Badge>
              )}
            </div>
          </div>

          <ScrollArea className="h-full">
            <div className={`grid gap-4 ${
              viewMode === 'grid' 
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1'
            }`}>
              <AnimatePresence>
                {filteredArtifacts.map((artifact, index) => {
                  const TypeIcon = getTypeIcon(artifact.type);
                  
                  return (
                    <motion.div
                      key={artifact.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="bg-slate-800/30 border-slate-700/50 hover:bg-slate-700/50 transition-all duration-200 group cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getTypeColor(artifact.type)}`}>
                                <TypeIcon size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-white font-medium truncate">{artifact.name}</h3>
                                <p className="text-slate-400 text-xs">v{artifact.version}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-1">
                              {artifact.isFavorite && (
                                <Star size={14} className="text-yellow-400 fill-current" />
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 p-0"
                              >
                                <MoreVertical size={14} />
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2 mb-3">
                            <div className="flex items-center justify-between text-xs">
                              <Badge className={getStatusColor(artifact.status)}>
                                {artifact.status}
                              </Badge>
                              <span className="text-slate-400">{formatFileSize(artifact.size)}</span>
                            </div>
                            
                            {artifact.description && (
                              <p className="text-slate-400 text-xs line-clamp-2">
                                {artifact.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center space-x-1">
                              <User size={10} />
                              <span>{artifact.author}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Download size={10} />
                              <span>{artifact.downloadCount}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                            <div className="flex items-center space-x-1 text-xs text-slate-400">
                              <Clock size={10} />
                              <span>{formatDate(artifact.updatedAt)}</span>
                            </div>
                            
                            <div className="flex items-center space-x-1">
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                <Eye size={12} className="mr-1" />
                                View
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                <Download size={12} />
                              </Button>
                            </div>
                          </div>

                          {/* Tags */}
                          {artifact.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {artifact.tags.slice(0, 3).map(tag => (
                                <Badge key={tag} className="bg-slate-700/50 text-slate-300 text-xs px-1.5 py-0.5">
                                  {tag}
                                </Badge>
                              ))}
                              {artifact.tags.length > 3 && (
                                <Badge className="bg-slate-700/50 text-slate-300 text-xs px-1.5 py-0.5">
                                  +{artifact.tags.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};
