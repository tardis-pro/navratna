import React, { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import Dagre from '@dagrejs/dagre';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Filter, RefreshCw, Info, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_CONFIG } from '@/config/apiConfig';
import { uaipAPI } from '@/utils/uaip-api';

import '@xyflow/react/dist/style.css';

// Knowledge Graph Types
interface KnowledgeNode extends Node {
  data: {
    label: string;
    knowledgeType: string;
    tags: string[];
    confidence: number;
    sourceType: string;
    createdAt: string;
    fullContent: string;
  };
}

interface KnowledgeEdge extends Edge {
  data: {
    relationshipType: string;
    confidence: number;
  };
}

interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    searchMetadata?: any;
  };
}

// Knowledge Type Styling
const KNOWLEDGE_NODE_STYLES = {
  common: {
    padding: '10px',
    borderRadius: '8px',
    border: '2px solid',
    fontSize: '12px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    minWidth: '180px',
    minHeight: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  FACTUAL: {
    backgroundColor: '#3b82f6',
    borderColor: '#1d4ed8',
    color: '#ffffff',
  },
  PROCEDURAL: {
    backgroundColor: '#10b981',
    borderColor: '#059669',
    color: '#ffffff',
  },
  CONCEPTUAL: {
    backgroundColor: '#8b5cf6',
    borderColor: '#7c3aed',
    color: '#ffffff',
  },
  EXPERIENTIAL: {
    backgroundColor: '#f59e0b',
    borderColor: '#d97706',
    color: '#ffffff',
  },
  EPISODIC: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
    color: '#ffffff',
  },
  SEMANTIC: {
    backgroundColor: '#06b6d4',
    borderColor: '#0891b2',
    color: '#ffffff',
  },
  default: {
    backgroundColor: '#64748b',
    borderColor: '#475569',
    color: '#ffffff',
  },
};

const getLayoutedElements = (
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  direction: string = 'TB'
) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: 100,
    nodesep: 80,
    marginx: 20,
    marginy: 20,
  });

  edges.forEach((edge: KnowledgeEdge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node: KnowledgeNode) => {
    g.setNode(node.id, { width: 200, height: 80 });
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node: KnowledgeNode) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 100, // Half the width
        y: nodeWithPosition.y - 40, // Half the height
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
};

interface KnowledgeGraphVisualizationInnerProps {
  className?: string;
  onNodeSelect?: (nodeData: { id: string; data: any }) => void;
}

const KnowledgeGraphVisualizationInner: React.FC<KnowledgeGraphVisualizationInnerProps> = ({
  className = '',
  onNodeSelect,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<KnowledgeNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<KnowledgeEdge>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const auth = useAuth();
  const { fitView, getNode, getNodes, getEdges } = useReactFlow();

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#64748b' },
        data: {
          relationshipType: 'custom',
          confidence: 0.8,
        },
      };
      setEdges((oldEdges) => addEdge(newEdge, oldEdges));
    },
    [setEdges]
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: KnowledgeNode) => {
      setSelectedNode(node);
      setShowDetails(true);

      // Call external callback if provided
      if (onNodeSelect) {
        onNodeSelect({ id: node.id, data: node.data });
      }
    },
    [onNodeSelect]
  );

  const fetchKnowledgeGraph = useCallback(async () => {
    if (!auth.isAuthenticated) {
      setError('Authentication required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: '50',
        includeRelationships: 'true',
      });

      if (filterType) {
        params.append('types', filterType);
      }

      // Use knowledge API to get graph data
      let graphData: KnowledgeGraphData;
      try {
        const apiGraphData = await uaipAPI.knowledge.getKnowledgeGraph({
          depth: 2,
          types: filterType ? [filterType] : undefined,
          limit: 100,
        });

        // Transform to expected format if needed
        graphData = {
          nodes: apiGraphData.nodes || [],
          edges: apiGraphData.edges || [],
        };
      } catch (error) {
        console.warn('Knowledge graph API failed, using mock data:', error);
        // Provide mock data when API is not available
        graphData = {
          nodes: [],
          edges: [],
        };
      }

      // Apply knowledge type styling to nodes
      const styledNodes = graphData.nodes.map((node) => ({
        ...node,
        type: 'default', // Ensure all nodes use React Flow's default type
        style: {
          ...KNOWLEDGE_NODE_STYLES.common,
          ...(KNOWLEDGE_NODE_STYLES[
            node.data.knowledgeType as keyof typeof KNOWLEDGE_NODE_STYLES
          ] || KNOWLEDGE_NODE_STYLES.default),
        },
      }));

      const styledEdges = graphData.edges.map((edge) => ({
        ...edge,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: '#64748b',
          strokeWidth: 2,
        },
      }));

      const layouted = getLayoutedElements(styledNodes, styledEdges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);

      setTimeout(() => fitView({ padding: 0.2 }), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch knowledge graph');
      console.error('Knowledge graph fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [auth.isAuthenticated, filterType, fitView, setNodes, setEdges]);

  // Initial load
  useEffect(() => {
    fetchKnowledgeGraph();
  }, [fetchKnowledgeGraph]);

  const handleRefresh = () => {
    fetchKnowledgeGraph();
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    // Filter nodes based on search term
    const allNodes = getNodes();
    if (term) {
      const filteredNodes = allNodes.filter(
        (node) =>
          node.data.label.toLowerCase().includes(term.toLowerCase()) ||
          node.data.tags.some((tag) => tag.toLowerCase().includes(term.toLowerCase()))
      );
      // Highlight matching nodes (you could implement highlighting logic here)
    }
  };

  const reactFlowStyles: React.CSSProperties = {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  };

  const rfWrapper: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
  };

  if (error) {
    return (
      <Card className="h-full w-full bg-black/20 border-red-500/20">
        <div className="p-8 text-center h-full flex items-center justify-center">
          <div>
            <div className="w-16 h-16 text-red-400 mx-auto mb-4">⚠️</div>
            <p className="text-red-400 mb-2">Error Loading Knowledge Graph</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <Button
              onClick={handleRefresh}
              variant="outline"
              className="bg-red-600 hover:bg-red-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`h-full w-full overflow-hidden bg-black/20 border-blue-500/20 ${className}`}>
      <div style={rfWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          proOptions={{ hideAttribution: true }}
          style={reactFlowStyles}
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={true}
          elementsSelectable={true}
          zoomOnScroll={true}
          panOnScroll={true}
          preventScrolling={false}
          nodeOrigin={[0.5, 0.5]}
        >
          <Background color="#334155" gap={16} />
          <Controls className="rounded-lg border border-gray-700 bg-gray-800 p-2 [&>button:hover]:bg-gray-600 [&>button]:border-0 [&>button]:bg-gray-700 [&>button]:text-white" />

          {/* Control Panel */}
          <Panel
            position="top-left"
            className="flex flex-col space-y-2 rounded-md bg-gray-800/90 p-3 shadow-lg backdrop-blur-sm"
          >
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search knowledge..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-48 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white rounded px-2 py-1 text-sm"
              >
                <option value="">All Types</option>
                <option value="FACTUAL">Factual</option>
                <option value="PROCEDURAL">Procedural</option>
                <option value="CONCEPTUAL">Conceptual</option>
                <option value="EXPERIENTIAL">Experiential</option>
                <option value="EPISODIC">Episodic</option>
                <option value="SEMANTIC">Semantic</option>
              </select>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 border-blue-500"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </Panel>

          {/* Node Details Panel */}
          {selectedNode && showDetails && (
            <Panel
              position="top-right"
              className="w-80 rounded-md bg-gray-800/95 p-4 shadow-lg backdrop-blur-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center">
                  <Info className="w-4 h-4 mr-2" />
                  Knowledge Details
                </h3>
                <div className="flex gap-1">
                  {onNodeSelect && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onNodeSelect({ id: selectedNode.id, data: selectedNode.data })}
                      className="text-purple-400 hover:text-purple-300"
                      title="Examine in Atomic View"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowDetails(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    <EyeOff className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-400">Type:</span>
                  <Badge
                    className="ml-2"
                    style={{
                      backgroundColor:
                        KNOWLEDGE_NODE_STYLES[
                          selectedNode.data.knowledgeType as keyof typeof KNOWLEDGE_NODE_STYLES
                        ]?.backgroundColor || '#64748b',
                    }}
                  >
                    {selectedNode.data.knowledgeType}
                  </Badge>
                </div>

                <div>
                  <span className="text-gray-400">Content:</span>
                  <p className="text-white mt-1 text-xs leading-relaxed max-h-32 overflow-y-auto">
                    {selectedNode.data.fullContent}
                  </p>
                </div>

                <div>
                  <span className="text-gray-400">Tags:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedNode.data.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-gray-400">Confidence:</span>
                  <span className="text-white ml-2">
                    {((selectedNode.data.confidence || 0) * 100).toFixed(1)}%
                  </span>
                </div>

                <div>
                  <span className="text-gray-400">Source:</span>
                  <span className="text-white ml-2">{selectedNode.data.sourceType}</span>
                </div>

                <div>
                  <span className="text-gray-400">Created:</span>
                  <span className="text-white ml-2">
                    {new Date(selectedNode.data.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </Card>
  );
};

const KnowledgeGraphVisualization: React.FC<KnowledgeGraphVisualizationInnerProps> = (props) => {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <KnowledgeGraphVisualizationInner {...props} />
      </ReactFlowProvider>
    </div>
  );
};

export default KnowledgeGraphVisualization;
