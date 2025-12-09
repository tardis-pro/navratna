// Artifact Generation Panel - UI Component for Epic 4
// Integrates with existing chat interface to provide artifact generation capabilities

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Code,
  FileText,
  TestTube,
  GitBranch,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  Download,
  Eye,
} from 'lucide-react';

import { artifactFactory } from '@/services/artifact/ArtifactFactory';
import {
  Artifact,
  ConversationContext,
  ArtifactType,
  Participant,
  GenerationResult,
} from '@/types/artifact';

interface ArtifactGenerationPanelProps {
  conversationId: string;
  messages: any[];
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
  onArtifactGenerated?: (artifact: Artifact) => void;
}

export const ArtifactGenerationPanel: React.FC<ArtifactGenerationPanelProps> = ({
  conversationId,
  messages,
  currentUser,
  onArtifactGenerated,
}) => {
  const [analysis, setAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedType, setSelectedType] = useState<ArtifactType>('code-diff');
  const [generatedArtifacts, setGeneratedArtifacts] = useState<Artifact[]>([]);
  const [activeTab, setActiveTab] = useState('analyze');

  // Convert messages to the expected format
  const conversationContext: ConversationContext = {
    conversationId,
    messages: messages.map((msg) => ({
      id: msg.id || Math.random().toString(),
      content: msg.content,
      sender: msg.sender,
      timestamp: msg.timestamp || new Date().toISOString(),
      type: msg.type || 'user',
    })),
    phase: 'discussion',
    participants: [
      {
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        permissions: ['generate:*'], // Default permissions
      },
    ],
    metadata: {},
  };

  const participant: Participant = {
    id: currentUser.id,
    name: currentUser.name,
    role: currentUser.role,
    permissions: ['generate:*'],
  };

  // Analyze conversation on load and when messages change
  useEffect(() => {
    if (messages.length > 0) {
      analyzeConversation();
    }
  }, [messages]);

  const analyzeConversation = async () => {
    setIsAnalyzing(true);
    try {
      const result = await artifactFactory.analyzeConversation(conversationContext);
      setAnalysis(result);
    } catch (error) {
      console.error('Conversation analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateArtifact = async (type: ArtifactType) => {
    setIsGenerating(true);
    try {
      const result: GenerationResult = await artifactFactory.generateArtifact(
        type,
        conversationContext,
        participant
      );

      if (result.success && result.artifact) {
        setGeneratedArtifacts((prev) => [...prev, result.artifact!]);
        onArtifactGenerated?.(result.artifact);
        setActiveTab('artifacts');
      } else {
        // Handle errors
        console.error('Generation failed:', result.errors);
      }
    } catch (error) {
      console.error('Artifact generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getArtifactIcon = (type: ArtifactType) => {
    const icons = {
      'code-diff': Code,
      test: TestTube,
      prd: FileText,
      documentation: FileText,
      config: FileText,
      workflow: GitBranch,
    };
    const Icon = icons[type] || FileText;
    return <Icon className="h-4 w-4" />;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatContent = (content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Artifact Generation
        </CardTitle>
        <CardDescription>
          Generate code, tests, and documentation from your conversation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="analyze">Analysis</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="artifacts">Artifacts ({generatedArtifacts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="analyze" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Conversation Analysis</h3>
              <Button onClick={analyzeConversation} disabled={isAnalyzing} size="sm">
                {isAnalyzing ? 'Analyzing...' : 'Refresh Analysis'}
              </Button>
            </div>

            {isAnalyzing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 animate-spin" />
                  <span>Analyzing conversation...</span>
                </div>
                <Progress value={50} className="w-full" />
              </div>
            ) : analysis ? (
              <div className="space-y-4">
                {/* Conversation Phase */}
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium mb-2">Current Phase</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{analysis.phase.current}</Badge>
                    <div className="flex items-center gap-1">
                      <div
                        className={`w-2 h-2 rounded-full ${getConfidenceColor(analysis.phase.confidence)}`}
                      />
                      <span className="text-sm text-muted-foreground">
                        {Math.round(analysis.phase.confidence * 100)}% confidence
                      </span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">Suggested actions:</p>
                    <ul className="text-sm list-disc list-inside">
                      {analysis.phase.suggestedActions.map((action: string, index: number) => (
                        <li key={index}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Generation Triggers */}
                {analysis.triggers.length > 0 && (
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium mb-2">Generation Opportunities</h4>
                    <div className="space-y-2">
                      {analysis.triggers.slice(0, 3).map((trigger: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-muted rounded"
                        >
                          <div className="flex items-center gap-2">
                            {getArtifactIcon(trigger.artifactType)}
                            <span className="text-sm">{trigger.artifactType}</span>
                            <Badge variant="secondary" size="sm">
                              {Math.round(trigger.confidence * 100)}%
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedType(trigger.artifactType);
                              setActiveTab('generate');
                            }}
                          >
                            Generate
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {analysis.suggestions.length > 0 && (
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium mb-2">Suggestions</h4>
                    <ul className="text-sm space-y-1">
                      {analysis.suggestions.map((suggestion: string, index: number) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No analysis available. Click "Refresh Analysis" to analyze the conversation.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="generate" className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Artifact Type</label>
                <Select
                  value={selectedType}
                  onValueChange={(value) => setSelectedType(value as ArtifactType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="code-diff">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        Code Diff
                      </div>
                    </SelectItem>
                    <SelectItem value="test">
                      <div className="flex items-center gap-2">
                        <TestTube className="h-4 w-4" />
                        Test Cases
                      </div>
                    </SelectItem>
                    <SelectItem value="prd">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        PRD Section
                      </div>
                    </SelectItem>
                    <SelectItem value="documentation">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Documentation
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={() => generateArtifact(selectedType)}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Generating {selectedType}...
                  </>
                ) : (
                  <>
                    {getArtifactIcon(selectedType)}
                    <span className="ml-2">Generate {selectedType}</span>
                  </>
                )}
              </Button>

              {isGenerating && (
                <div className="space-y-2">
                  <Progress value={75} className="w-full" />
                  <p className="text-sm text-muted-foreground text-center">
                    This may take a few moments...
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="artifacts" className="space-y-4">
            {generatedArtifacts.length === 0 ? (
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  No artifacts generated yet. Use the Generate tab to create artifacts from your
                  conversation.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {generatedArtifacts.map((artifact, index) => (
                  <Card key={artifact.metadata.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getArtifactIcon(artifact.type)}
                          <h4 className="font-medium">{artifact.metadata.title}</h4>
                          <Badge variant="outline">{artifact.type}</Badge>
                          {artifact.validation?.isValid && (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Valid
                            </Badge>
                          )}
                        </div>

                        {artifact.metadata.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {artifact.metadata.description}
                          </p>
                        )}

                        <div className="text-xs text-muted-foreground mb-2">
                          Generated at{' '}
                          {new Date(artifact.traceability.generatedAt).toLocaleString()}•
                          Confidence: {Math.round(artifact.traceability.confidence * 100)}%
                        </div>

                        <div className="bg-muted p-3 rounded text-sm font-mono max-h-32 overflow-y-auto">
                          {formatContent(artifact.content)}
                        </div>

                        {artifact.validation && (
                          <div className="mt-2 space-y-1">
                            {artifact.validation.errors.length > 0 && (
                              <div className="text-sm text-red-600">
                                <AlertTriangle className="h-3 w-3 inline mr-1" />
                                {artifact.validation.errors.length} error(s)
                              </div>
                            )}
                            {artifact.validation.warnings.length > 0 && (
                              <div className="text-sm text-yellow-600">
                                <AlertTriangle className="h-3 w-3 inline mr-1" />
                                {artifact.validation.warnings.length} warning(s)
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        <Button size="sm" variant="outline">
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button size="sm" variant="outline">
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
