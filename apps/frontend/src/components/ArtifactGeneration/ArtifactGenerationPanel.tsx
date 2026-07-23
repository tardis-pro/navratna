import React, { useMemo, useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { artifactCollection } from '@/services/artifact/artifact_collection';
import type { Artifact } from '@uaip/types';
import type {
  ArtifactGenerationPanelProps,
  ArtifactViewState,
} from './ArtifactGenerationPanel.types';

function getArtifactId(artifact: Artifact, index: number): string {
  return artifact.metadata.id ?? artifact.id ?? `${artifact.type}-${index}`;
}

function getGeneratedAtLabel(artifact: Artifact): string {
  const generatedAt = artifact.traceability?.generatedAt ?? artifact.metadata.createdAt;
  return generatedAt ? new Date(generatedAt).toLocaleString() : 'Unknown';
}

function formatContent(content: string, maxLength = 280): string {
  return content.length <= maxLength ? content : `${content.substring(0, maxLength)}...`;
}

export const ArtifactGenerationPanel: React.FC<ArtifactGenerationPanelProps> = ({
  conversationId,
  artifacts = [],
  onArtifactViewed,
}) => {
  const [viewState, setViewState] = useState<ArtifactViewState>({ selectedArtifact: null });

  const sortedArtifacts = useMemo(
    () =>
      artifactCollection.listArtifacts(artifacts),
    [artifacts]
  );

  const handleView = (artifact: Artifact) => {
    setViewState({ selectedArtifact: artifact });
    onArtifactViewed?.(artifact);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Artifacts
        </CardTitle>
        <CardDescription>Artifacts linked to conversation {conversationId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedArtifacts.length === 0 ? (
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>No artifacts are available for this conversation.</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {sortedArtifacts.map((artifact, index) => (
              <Card key={getArtifactId(artifact, index)} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <h4 className="truncate font-medium">{artifact.metadata.title}</h4>
                      <Badge variant="outline">{artifact.type}</Badge>
                    </div>
                    {artifact.metadata.description ? (
                      <p className="mb-2 text-sm text-muted-foreground">
                        {artifact.metadata.description}
                      </p>
                    ) : null}
                    <div className="mb-2 text-xs text-muted-foreground">
                      Updated {getGeneratedAtLabel(artifact)}
                    </div>
                    <div className="max-h-32 overflow-y-auto rounded bg-muted p-3 font-mono text-sm">
                      {formatContent(artifact.content)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleView(artifact)}>
                      <Eye className="mr-1 h-3 w-3" />
                      View
                    </Button>
                    <Button size="sm" variant="outline" disabled>
                      <Download className="mr-1 h-3 w-3" />
                      Export
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {viewState.selectedArtifact ? (
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate font-medium">{viewState.selectedArtifact.metadata.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {viewState.selectedArtifact.type}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setViewState({ selectedArtifact: null })}
              >
                Close
              </Button>
            </div>
            <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-sm">
              {viewState.selectedArtifact.content}
            </pre>
          </Card>
        ) : null}
      </CardContent>
    </Card>
  );
};
