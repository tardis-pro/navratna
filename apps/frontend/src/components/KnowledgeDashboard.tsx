import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Search,
  Filter,
  TrendingUp,
  Brain,
  Network,
  FileText,
  Users,
  Workflow,
  MessageSquare,
  BarChart3,
  Eye,
  Download,
  RefreshCw,
  Settings,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { knowledgeAPI } from '@/api/knowledge.api';
import { ChatKnowledgeUploader } from './ChatKnowledgeUploader';

interface KnowledgeDashboardProps {
  className?: string;
}

interface KnowledgeStats {
  totalItems: number;
  itemsByType: Record<string, number>;
  itemsByCategory: Record<string, number>;
  recentUploads: number;
  topTags: Array<{ tag: string; count: number }>;
}

interface QAPair {
  question: string;
  answer: string;
  source: string;
  confidence: number;
  topic: string;
}

interface Workflow {
  name: string;
  steps: Array<{
    action: string;
    description: string;
    order: number;
  }>;
  prerequisites: string[];
  outcomes: string[];
  confidence: number;
  source: string;
}

interface ExpertiseProfile {
  participant: string;
  domains: Array<{
    domain: string;
    confidence: number;
    topics: string[];
    evidenceCount: number;
  }>;
  overallConfidence: number;
  totalInteractions: number;
  knowledgeAreas: string[];
}

interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, any>;
}

interface KnowledgeGraphEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}

export const KnowledgeDashboard: React.FC<KnowledgeDashboardProps> = ({ className }) => {
  // State
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [qaPairs, setQaPairs] = useState<QAPair[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [expertiseProfiles, setExpertiseProfiles] = useState<ExpertiseProfile[]>([]);
  const [graphNodes, setGraphNodes] = useState<KnowledgeGraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<KnowledgeGraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load knowledge statistics
      const statsData = await knowledgeAPI.getStats();
      setStats(statsData);

      // Load knowledge graph
      const graphData = await knowledgeAPI.getGraph({ limit: 100 });
      setGraphNodes(graphData.nodes);
      setGraphEdges(graphData.edges);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Q&A pairs
  const loadQAPairs = useCallback(async (domain?: string) => {
    try {
      const qaData = await knowledgeAPI.generateQAFromKnowledge(domain, 20);
      setQaPairs(qaData.qaPairs);
    } catch (err) {
      console.error('Error loading Q&A pairs:', err);
    }
  }, []);

  // Load workflows
  const loadWorkflows = useCallback(async () => {
    try {
      const workflowData = await knowledgeAPI.extractWorkflows();
      setWorkflows(workflowData.workflows);
    } catch (err) {
      console.error('Error loading workflows:', err);
    }
  }, []);

  // Load learning insights
  const loadLearningInsights = useCallback(async () => {
    try {
      const insightsData = await knowledgeAPI.getLearningInsights();
      // Transform insights into expertise profiles for display
      const profiles: ExpertiseProfile[] = insightsData.progressions.map((progression) => ({
        participant: progression.learner,
        domains: [
          {
            domain: progression.topic,
            confidence: 0.8,
            topics: [progression.topic],
            evidenceCount: progression.progression.length,
          },
        ],
        overallConfidence: 0.8,
        totalInteractions: progression.progression.length,
        knowledgeAreas: [progression.topic],
      }));
      setExpertiseProfiles(profiles);
    } catch (err) {
      console.error('Error loading learning insights:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Load tab-specific data
  useEffect(() => {
    switch (activeTab) {
      case 'qa':
        loadQAPairs(selectedDomain === 'all' ? undefined : selectedDomain);
        break;
      case 'workflows':
        loadWorkflows();
        break;
      case 'expertise':
        loadLearningInsights();
        break;
    }
  }, [activeTab, selectedDomain, loadQAPairs, loadWorkflows, loadLearningInsights]);

  // Filter Q&A pairs
  const filteredQAPairs = qaPairs.filter(
    (qa) =>
      searchQuery === '' ||
      qa.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      qa.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      qa.topic.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter workflows
  const filteredWorkflows = workflows.filter(
    (workflow) =>
      searchQuery === '' ||
      workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflow.steps.some(
        (step) =>
          step.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          step.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  // Get unique domains from stats
  const domains = stats ? Object.keys(stats.itemsByType) : [];

  if (loading && !stats) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
        <span className="ml-2 text-white">Loading knowledge dashboard...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Database className="w-6 h-6 mr-3" />
            Knowledge Dashboard
          </h1>
          <p className="text-gray-300 mt-1">
            Manage and visualize your knowledge graph, Q&A pairs, workflows, and expertise profiles
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={loadDashboardData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {error}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="ml-2 h-auto p-1"
            >
              ✕
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search knowledge, Q&A, workflows..."
            className="bg-black/20 border-blue-500/30 text-white placeholder-gray-400"
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <Select value={selectedDomain} onValueChange={setSelectedDomain}>
          <SelectTrigger className="w-full sm:w-48 bg-black/20 border-blue-500/30">
            <SelectValue placeholder="All Domains" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            {domains.map((domain) => (
              <SelectItem key={domain} value={domain}>
                {domain}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="qa">Q&A Pairs</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="expertise">Expertise</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-black/20 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Database className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-sm text-gray-300">Total Items</p>
                      <p className="text-2xl font-bold text-white">
                        {stats.totalItems.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-black/20 border-green-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    <div>
                      <p className="text-sm text-gray-300">Recent Uploads</p>
                      <p className="text-2xl font-bold text-white">{stats.recentUploads}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-black/20 border-purple-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Network className="w-5 h-5 text-purple-400" />
                    <div>
                      <p className="text-sm text-gray-300">Knowledge Types</p>
                      <p className="text-2xl font-bold text-white">
                        {Object.keys(stats.itemsByType).length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-black/20 border-orange-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5 text-orange-400" />
                    <div>
                      <p className="text-sm text-gray-300">Top Tags</p>
                      <p className="text-2xl font-bold text-white">{stats.topTags.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Knowledge Type Distribution */}
          {stats && Object.keys(stats.itemsByType).length > 0 && (
            <Card className="bg-black/20 border-blue-500/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Knowledge Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(stats.itemsByType).map(([type, count]) => {
                  const percentage = (count / stats.totalItems) * 100;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-300">{type}</span>
                        <span className="text-white">
                          {count} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Knowledge Graph Visualization */}
          <Card className="bg-black/20 border-blue-500/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Network className="w-5 h-5 mr-2" />
                Knowledge Graph Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-gray-300">
                    Nodes: <span className="text-white font-medium">{graphNodes.length}</span>
                  </p>
                  <p className="text-sm text-gray-300">
                    Edges: <span className="text-white font-medium">{graphEdges.length}</span>
                  </p>
                  <p className="text-sm text-gray-300">
                    Connectivity:{' '}
                    <span className="text-white font-medium">
                      {graphNodes.length > 0
                        ? ((graphEdges.length / graphNodes.length) * 100).toFixed(1)
                        : 0}
                      %
                    </span>
                  </p>
                </div>
                <div className="flex flex-col space-y-2">
                  <Button variant="outline" size="sm" className="justify-start">
                    <Eye className="w-4 h-4 mr-2" />
                    View Full Graph
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start">
                    <Download className="w-4 h-4 mr-2" />
                    Export Graph
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Upload Tab */}
        <TabsContent value="upload">
          <ChatKnowledgeUploader onUploadComplete={loadDashboardData} />
        </TabsContent>

        {/* Q&A Pairs Tab */}
        <TabsContent value="qa" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <MessageSquare className="w-5 h-5 mr-2" />
              Q&A Pairs ({filteredQAPairs.length})
            </h3>
            <Button
              onClick={() => loadQAPairs(selectedDomain === 'all' ? undefined : selectedDomain)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Generate New Q&A
            </Button>
          </div>

          <div className="grid gap-4">
            {filteredQAPairs.map((qa, index) => (
              <Card key={index} className="bg-black/20 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-xs">
                          {qa.topic}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {(qa.confidence * 100).toFixed(0)}% confidence
                        </Badge>
                      </div>
                      <p className="text-white font-medium">Q: {qa.question}</p>
                    </div>
                    <div className="pl-4 border-l-2 border-blue-500/30">
                      <p className="text-gray-300">A: {qa.answer}</p>
                    </div>
                    <p className="text-xs text-gray-400">Source: {qa.source}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <Workflow className="w-5 h-5 mr-2" />
              Workflows ({filteredWorkflows.length})
            </h3>
            <Button onClick={loadWorkflows}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Extract Workflows
            </Button>
          </div>

          <div className="grid gap-4">
            {filteredWorkflows.map((workflow, index) => (
              <Card key={index} className="bg-black/20 border-green-500/20">
                <CardHeader>
                  <CardTitle className="text-white text-lg">{workflow.name}</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="text-xs">
                      {workflow.steps.length} steps
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {(workflow.confidence * 100).toFixed(0)}% confidence
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Prerequisites */}
                  {workflow.prerequisites.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-300 mb-2">Prerequisites:</p>
                      <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
                        {workflow.prerequisites.map((prereq, i) => (
                          <li key={i}>{prereq}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Steps */}
                  <div>
                    <p className="text-sm font-medium text-gray-300 mb-2">Steps:</p>
                    <ol className="space-y-2">
                      {workflow.steps.map((step, i) => (
                        <li key={i} className="flex items-start space-x-3">
                          <Badge variant="outline" className="text-xs mt-0.5">
                            {step.order}
                          </Badge>
                          <div>
                            <p className="text-white font-medium">{step.action}</p>
                            <p className="text-gray-400 text-sm">{step.description}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Outcomes */}
                  {workflow.outcomes.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-300 mb-2">Expected Outcomes:</p>
                      <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
                        {workflow.outcomes.map((outcome, i) => (
                          <li key={i}>{outcome}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-gray-400">Source: {workflow.source}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Expertise Tab */}
        <TabsContent value="expertise" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Expertise Profiles ({expertiseProfiles.length})
            </h3>
            <Button onClick={loadLearningInsights}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Analyze Expertise
            </Button>
          </div>

          <div className="grid gap-4">
            {expertiseProfiles.map((profile, index) => (
              <Card key={index} className="bg-black/20 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white">{profile.participant}</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="text-xs">
                      {profile.domains.length} domain{profile.domains.length !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {(profile.overallConfidence * 100).toFixed(0)}% confidence
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-300 mb-2">Expertise Domains:</p>
                      <div className="space-y-2">
                        {profile.domains.map((domain, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-white">{domain.domain}</span>
                              <span className="text-gray-400">
                                {(domain.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                            <Progress value={domain.confidence * 100} className="h-1" />
                            <p className="text-xs text-gray-400">
                              {domain.evidenceCount} interactions • Topics:{' '}
                              {domain.topics.join(', ')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-300 mb-2">Statistics:</p>
                      <div className="space-y-1 text-sm">
                        <p className="text-gray-400">
                          Total Interactions:{' '}
                          <span className="text-white">{profile.totalInteractions}</span>
                        </p>
                        <p className="text-gray-400">
                          Knowledge Areas:{' '}
                          <span className="text-white">{profile.knowledgeAreas.length}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
