import React, { useMemo, useState } from 'react';
import {
  Package,
  Search,
  Download,
  FileText,
  Code,
  Image,
  Video,
  Music,
  Archive,
  Star,
  MoreHorizontal,
  Share2,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createArtifactShareLink } from '@/api/artifact_share';
import { logger } from '@/utils/browser_logger';
import {
  PortalContainer,
  PortalHeader,
  PortalBody,
  PortalEmptyState,
  PortalSearchBar,
} from './portal-shared-components';

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

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  code: Code,
  document: FileText,
  image: Image,
  video: Video,
  audio: Music,
  archive: Archive,
};

const TYPE_COLORS: Record<string, string> = {
  code: 'text-blue-400',
  document: 'text-green-400',
  image: 'text-purple-400',
  video: 'text-red-400',
  audio: 'text-yellow-400',
  archive: 'text-slate-400',
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

type ShareState = 'idle' | 'sharing' | 'copied' | 'error';

const ArtifactCard: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const TypeIcon = TYPE_ICONS[artifact.type] ?? Package;
  const typeColor = TYPE_COLORS[artifact.type] ?? 'text-slate-400';
  const [shareState, setShareState] = useState<ShareState>('idle');

  const handleShare = async () => {
    setShareState('sharing');
    try {
      const { shareUrl } = await createArtifactShareLink(artifact.id, { title: artifact.name });
      await navigator.clipboard.writeText(shareUrl);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2000);
    } catch (error) {
      logger.error('Failed to share artifact', error);
      setShareState('error');
      setTimeout(() => setShareState('idle'), 2000);
    }
  };

  return (
    <div className="group cursor-pointer">
      <div
        className={cn(
          'rounded-xl border border-slate-700/50 bg-slate-800/40 p-4',
          'transition-colors hover:bg-slate-800/60 hover:border-slate-600/50',
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center', typeColor)}>
              <TypeIcon className="w-4 h-4" />
            </div>
            {artifact.isFavorite && (
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
            )}
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-700/50 rounded-lg"
            aria-label={`More options for ${artifact.name}`}
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium text-slate-100 truncate">{artifact.name}</h3>
            {artifact.description && (
              <p className="text-xs text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                {artifact.description}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="truncate">{artifact.author}</span>
            <span>{formatFileSize(artifact.size)}</span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-700/40">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Download className="w-3 h-3" />
              <span>{artifact.downloadCount}</span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded"
                aria-label={`View ${artifact.name}`}
              >
                View
              </button>
              <button
                onClick={handleShare}
                disabled={shareState === 'sharing'}
                className={cn(
                  'p-1 rounded',
                  shareState === 'copied' ? 'text-green-400' : 'text-slate-400 hover:text-white',
                )}
                aria-label={shareState === 'copied' ? 'Share link copied' : `Share ${artifact.name}`}
                title={shareState === 'copied' ? 'Link copied!' : 'Copy public share link'}
              >
                {shareState === 'copied' ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
              </button>
              <button
                className="text-slate-400 hover:text-white p-1 rounded"
                aria-label={`Download ${artifact.name}`}
              >
                <Download className="w-3 h-3" />
              </button>
            </div>
          </div>

          {artifact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {artifact.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded"
                >
                  {tag}
                </span>
              ))}
              {artifact.tags.length > 2 && (
                <span className="text-xs px-1.5 py-0.5 bg-slate-700/50 text-slate-500 rounded">
                  +{artifact.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'code', label: 'Code' },
  { value: 'document', label: 'Documents' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'archive', label: 'Archives' },
];

export const ArtifactsPortal: React.FC<ArtifactsPortalProps> = ({ className = '' }) => {
  const [artifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');

  const filteredArtifacts = useMemo(
    () =>
      artifacts
        .filter((artifact) => {
          const matchesSearch =
            artifact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            artifact.description?.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesType = selectedType === 'all' || artifact.type === selectedType;
          return matchesSearch && matchesType;
        })
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    [artifacts, searchQuery, selectedType],
  );

  return (
    <PortalContainer className={className}>
      <PortalHeader
        icon={<Package className="w-4 h-4" />}
        title="Artifacts"
        description="Digital assets and generated content"
      />

      <div className="px-4 pt-3 md:px-5 md:pt-4 space-y-3">
        <PortalSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search artifacts…"
          searchIcon={<Search className="w-3.5 h-3.5" />}
        >
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-900/50 border border-slate-700/60 text-slate-200 text-sm rounded-xl px-3 py-2 min-w-[110px] focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </PortalSearchBar>

        {filteredArtifacts.length > 0 && (
          <span className="text-xs text-slate-500">{filteredArtifacts.length} artifacts</span>
        )}
      </div>

      <PortalBody>
        {filteredArtifacts.length === 0 ? (
          <PortalEmptyState
            icon={<Package className="w-5 h-5" />}
            title="No artifacts yet"
            description="Generated artifacts like code, documents, and media will appear here"
          />
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredArtifacts.map((artifact) => (
              <ArtifactCard key={artifact.id} artifact={artifact} />
            ))}
          </div>
        )}
      </PortalBody>
    </PortalContainer>
  );
};
