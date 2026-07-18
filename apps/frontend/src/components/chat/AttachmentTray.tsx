import React from 'react';
import { File, FileText, Image, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThreadAttachment } from '@uaip/types';

interface AttachmentTrayProps {
  attachments: ThreadAttachment[];
  onRemove: (id: string) => void;
  className?: string;
}

export const AttachmentTray: React.FC<AttachmentTrayProps> = ({
  attachments,
  onRemove,
  className,
}) => {
  if (attachments.length === 0) return null;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className={cn('flex flex-wrap gap-2 p-2 border-b border-border/40 bg-muted/20 min-h-[44px]', className)}>
      {attachments.map((attachment) => {
        const isImage = attachment.type === 'image' || attachment.mimeType.startsWith('image/');
        const isDoc = attachment.type === 'doc';
        
        return (
          <div
            key={attachment.id}
            className={cn(
              'group relative flex items-center gap-2 pl-2 pr-8 py-1.5 rounded-lg border text-xs bg-background max-w-[200px]',
              attachment.uploadStatus === 'error'
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border/60 hover:border-border transition-colors'
            )}
          >
            {/* Render Preview/Icon */}
            {isImage && attachment.thumbnailUrl ? (
              <div className="w-8 h-8 rounded overflow-hidden shrink-0 bg-muted border border-border/30">
                <img
                  src={attachment.thumbnailUrl}
                  alt={attachment.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-muted/60 text-muted-foreground border border-border/30">
                {isDoc ? <FileText className="w-4 h-4" /> : isImage ? <Image className="w-4 h-4" /> : <File className="w-4 h-4" />}
              </div>
            )}

            {/* Render details */}
            <div className="flex flex-col min-w-0 pr-1">
              <span className="font-medium text-foreground truncate">{attachment.name}</span>
              <span className="text-[10px] text-muted-foreground truncate">
                {formatSize(attachment.size)}
              </span>
            </div>

            {/* Render Status Overlay/Indicator */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center justify-center">
              {attachment.uploadStatus === 'uploading' && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              )}
              {attachment.uploadStatus === 'error' && (
                <AlertCircle className="w-3.5 h-3.5 text-destructive" title="Upload failed" />
              )}
              {attachment.uploadStatus === 'done' && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" title="Upload completed" />
              )}
            </div>

            {/* Remove Button */}
            <button
              onClick={() => onRemove(attachment.id)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 opacity-80 group-hover:opacity-100 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
