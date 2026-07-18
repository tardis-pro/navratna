// DocCompanion — constrained right-panel view of a document
// Renders document content via MarkdownRenderer.
// Shows inside CompanionPane's companion slot.

import React from 'react';
import { FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownRenderer } from './MarkdownRenderer';

interface DocCompanionProps {
  docId: string;
  docTitle: string;
  content: string;
  onClose?: () => void;
}

export const DocCompanion: React.FC<DocCompanionProps> = ({
  docTitle,
  content,
}) => {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/30 pb-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground truncate">{docTitle}</h3>
        </div>

        {/* Document content */}
        <div className="prose-sm">
          <MarkdownRenderer content={content} isStreaming={false} />
        </div>
      </div>
    </ScrollArea>
  );
};
