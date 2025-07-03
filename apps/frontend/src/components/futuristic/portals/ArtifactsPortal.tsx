import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package,
  Plus,
  Search,
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
  Eye,
  MoreHorizontal
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  className?: string;
}

export const ArtifactsPortal: React.FC<ArtifactsPortalProps> = ({
  className = ''
}) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Mock data (same as original)
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
        description: 'Comprehensive analysis of recent agent discussions and patterns',
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
      }
    ];

    setArtifacts(mockArtifacts);
  }, []);

  // Filter artifacts
  const filteredArtifacts = artifacts
    .filter(artifact => {
      const matchesSearch = artifact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           artifact.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === 'all' || artifact.type === selectedType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  // Get type icon
  const getTypeIcon = (type: string) => {
    const icons = {
      'code': Code,
      'document': FileText,
      'image': Image,
      'video': Video,
      'audio': Music,
      'archive': Archive,
    };
    return icons[type as keyof typeof icons] || Package;
  };

  // Get type color
  const getTypeColor = (type: string) => {
    const colors = {
      'code': 'text-blue-400',
      'document': 'text-green-400',
      'image': 'text-purple-400',
      'video': 'text-red-400',
      'audio': 'text-yellow-400',
      'archive': 'text-gray-400',
    };
    return colors[type as keyof typeof colors] || 'text-slate-400';
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className={`h-full flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 ${className}`}>
      {/* Minimal Header */}
      <motion.div 
        className="p-6 border-b border-cyan-500/20 bg-slate-900/50 backdrop-blur-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
              animate={{ 
                boxShadow: [
                  '0 0 20px rgba(59, 130, 246, 0.3)',
                  '0 0 30px rgba(6, 182, 212, 0.4)',
                  '0 0 20px rgba(59, 130, 246, 0.3)'
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Package className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold text-white">Artifacts</h2>
              <p className="text-slate-400">Digital assets and generated content</p>
            </div>
          </div>
          
          <button
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </div>

        {/* Simplified Controls */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search artifacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800/50 border-slate-600/30 text-white placeholder-slate-400 rounded-xl focus:border-cyan-500/50"
            />
          </div>
          
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-800/50 border border-slate-600/30 text-white text-sm rounded-xl px-4 py-3 min-w-[120px] focus:border-cyan-500/50 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="code">Code</option>
            <option value="document">Documents</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="archive">Archives</option>
          </select>
        </div>
      </motion.div>

      {/* Clean Content Grid */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-slate-400 text-sm">
            {filteredArtifacts.length} artifacts
          </span>
        </div>

        <ScrollArea className="h-full">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence>
              {filteredArtifacts.map((artifact, index) => {
                const TypeIcon = getTypeIcon(artifact.type);
                
                return (
                  <motion.div
                    key={artifact.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    className="group cursor-pointer"
                  >
                    {/* Simplified Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/60 via-blue-900/30 to-purple-900/20 backdrop-blur-xl border border-cyan-500/20 hover:border-cyan-400/40 transition-all duration-300 p-6">
                      {/* Glow effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      
                      {/* Header */}
                      <div className="relative flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center ${getTypeColor(artifact.type)}`}>
                            <TypeIcon className="w-5 h-5" />
                          </div>
                          {artifact.isFavorite && (
                            <Star className="w-4 h-4 text-yellow-400 fill-current" />
                          )}
                        </div>
                        
                        <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-600/50 rounded-lg">
                          <MoreHorizontal className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>

                      {/* Content */}
                      <div className="relative space-y-3">
                        <div>
                          <h3 className="text-white font-semibold text-sm line-clamp-1 mb-1">
                            {artifact.name}
                          </h3>
                          <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed">
                            {artifact.description}
                          </p>
                        </div>

                        {/* Meta info */}
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{artifact.author}</span>
                          <span>{formatFileSize(artifact.size)}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Download className="w-3 h-3" />
                            <span>{artifact.downloadCount}</span>
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded">
                              View
                            </button>
                            <button className="text-xs text-slate-400 hover:text-white p-1 rounded">
                              <Download className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Tags */}
                        {artifact.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {artifact.tags.slice(0, 2).map(tag => (
                              <span 
                                key={tag} 
                                className="text-xs px-2 py-1 bg-slate-700/50 text-slate-300 rounded-md"
                              >
                                {tag}
                              </span>
                            ))}
                            {artifact.tags.length > 2 && (
                              <span className="text-xs px-2 py-1 bg-slate-700/50 text-slate-400 rounded-md">
                                +{artifact.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};