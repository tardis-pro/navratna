import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import { API_CONFIG as _API_CONFIG } from '@/config/api_config';
import { uaipAPI } from '@/utils/uaip_api';

import '@xyflow/react/dist/style.css';
import { logger } from '@/utils/browser_logger';
import type { KnowledgeItem } from '@uaip/types';

// Knowledge Graph Types
interface KnowledgeNode extends Node {
  data: {
    label: string;
    knowledgeType: string;
    tags: string[];
    confidence: number;
    sourceType: string;
    createdAt: string;
  };
}

interface KnowledgeEdge extends Edge {
  data: {
    relationshipType: string;
    confidence: number;
  };
}

type KnowledgeNodeColorKey = keyof Omit<typeof KNOWLEDGE_NODE_STYLES, 'common'>;

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

const isKnowledgeNodeColorKey = (v: string): v is KnowledgeNodeColorKey =>
  v in KNOWLEDGE_NODE_STYLES && v !== 'common';

const getKnowledgeNodeStyle = (
  knowledgeType: string
): (typeof KNOWLEDGE_NODE_STYLES)[KnowledgeNodeColorKey] =>
  isKnowledgeNodeColorKey(knowledgeType)
    ? KNOWLEDGE_NODE_STYLES[knowledgeType]
    : KNOWLEDGE_NODE_STYLES.default;

const styledFor = (nodes: KnowledgeNode[]): KnowledgeNode[] =>
  nodes.map((n) => ({
    ...n,
    style: {
      ...KNOWLEDGE_NODE_STYLES.common,
      ...getKnowledgeNodeStyle(n.data.knowledgeType),
    },
  }));

const MAX_VISIBLE_NODES = 60;
const SEED_LIMIT = 20;
const EXPAND_LIMIT = 12;

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
        x: nodeWithPosition.x - 100,
        y: nodeWithPosition.y - 40,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
};

// Lightweight node payload for React Flow. Full content is fetched on demand
// in the detail panel to keep memory usage flat as the graph grows.
function buildFlowNode(
  id: string,
  label: string,
  knowledgeType: string,
  tags: string[],
  confidence: number,
  sourceType: string,
  createdAt: string
): KnowledgeNode {
  const base: KnowledgeNode = {
    id,
    position: { x: 0, y: 0 },
    type: 'default',
    data: {
      label: label || id,
      knowledgeType: knowledgeType || 'default',
      tags: Array.isArray(tags) ? tags.slice(0, 3) : [],
      confidence: typeof confidence === 'number' ? confidence : 0,
      sourceType: sourceType || '',
      createdAt: createdAt || '',
    },
  };
  return {
    ...base,
    style: {
      ...KNOWLEDGE_NODE_STYLES.common,
      ...getKnowledgeNodeStyle(base.data.knowledgeType),
    },
  };
}

function buildFlowEdge(
  id: string,
  source: string,
  target: string,
  relationshipType: string,
  confidence: number
): KnowledgeEdge {
  return {
    id,
    source,
    target,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#64748b', strokeWidth: 2 },
    data: {
      relationshipType: relationshipType || 'related',
      confidence: typeof confidence === 'number' ? confidence : 0.8,
    },
  };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

interface ApiGraphNode {
  id: string;
  label?: string;
  type?: string;
  properties?: Record<string, unknown>;
}

function apiGraphNodeToFlowNode(node: ApiGraphNode): KnowledgeNode {
  const props = node.properties ?? {};
  const knowledgeType =
    typeof node.type === 'string' && node.type.length > 0
      ? node.type
      : typeof props.knowledgeType === 'string'
        ? props.knowledgeType
        : 'default';
  return buildFlowNode(
    typeof node.id === 'string' ? node.id : '',
    typeof node.label === 'string' ? node.label : typeof node.id === 'string' ? node.id : '',
    knowledgeType,
    asStringArray(props.tags),
    asNumber(props.confidence),
    typeof props.sourceType === 'string' ? props.sourceType : '',
    typeof props.createdAt === 'string' ? props.createdAt : ''
  );
}

function knowledgeItemToFlowNode(item: KnowledgeItem): KnowledgeNode {
  return buildFlowNode(
    item.id,
    item.sourceIdentifier || item.content?.substring(0, 80) || item.id,
    item.type ?? 'default',
    item.tags ?? [],
    typeof item.confidence === 'number' ? item.confidence : 0,
    item.sourceType ?? '',
    item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt ?? '')
  );
}

interface RawRelation {
  id?: string;
  fromId?: string;
  toId?: string;
  sourceItemId?: string;
  targetItemId?: string;
  relationType?: string;
  relationshipType?: string;
  strength?: number;
  confidence?: number;
}

function relationToFlowEdge(relation: RawRelation, sourceId: string, targetId: string): KnowledgeEdge {
  const relType =
    typeof relation.relationType === 'string'
      ? relation.relationType
      : typeof relation.relationshipType === 'string'
        ? relation.relationshipType
        : 'related';
  const confidence =
    typeof relation.confidence === 'number'
      ? relation.confidence
      : typeof relation.strength === 'number'
        ? relation.strength
        : 0.8;
  const id = typeof relation.id === 'string' ? relation.id : `edge-${sourceId}-${targetId}`;
  return buildFlowEdge(id, sourceId, targetId, relType, confidence);
}

interface KnowledgeGraphVisualizationInnerProps {
  className?: string;
  onNodeSelect?: (nodeData: { id: string; data: unknown }) => void;
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
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [exploredCount, setExploredCount] = useState<number>(0);

  // Touch-time LRU for visible-node eviction. Pinned node is the selected one.
  const touchTimesRef = useRef<Map<string, number>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const exploredIdsRef = useRef<Set<string>>(new Set());

  const auth = useAuth();
  const { fitView } = useReactFlow();

  const touchNode = useCallback((nodeId: string) => {
    touchTimesRef.current.set(nodeId, Date.now());
  }, []);

  const commitVisible = useCallback(
    (
      nextNodes: KnowledgeNode[],
      nextEdges: KnowledgeEdge[],
      options: { fit?: boolean } = {}
    ) => {
      const visibleIds = new Set(nextNodes.map((n) => n.id));
      const dedupedEdges = nextEdges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
      );
      const uniqueEdges: KnowledgeEdge[] = [];
      const edgeKeys = new Set<string>();
      for (const e of dedupedEdges) {
        const key = `${e.source}->${e.target}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          uniqueEdges.push(e);
        }
      }

      setNodes(nextNodes);
      setEdges(uniqueEdges);
      if (options.fit !== false) {
        setTimeout(() => fitView({ padding: 0.2 }), 100);
      }
    },
    [fitView, setNodes, setEdges]
  );

  const evictToCap = useCallback(
    (candidates: KnowledgeNode[], candidateEdges: KnowledgeEdge[]) => {
      const pinnedId = selectedIdRef.current;
      let visible = candidates;
      while (visible.length > MAX_VISIBLE_NODES) {
        const evictable = visible
          .filter((n) => n.id !== pinnedId)
          .sort((a, b) => {
            const ta = touchTimesRef.current.get(a.id) ?? 0;
            const tb = touchTimesRef.current.get(b.id) ?? 0;
            return ta - tb;
          });
        if (evictable.length === 0) break;
        const toEvict = evictable[0];
        touchTimesRef.current.delete(toEvict.id);
        visible = visible.filter((n) => n.id !== toEvict.id);
      }
      const visibleIds = new Set(visible.map((n) => n.id));
      const remainingEdges = candidateEdges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
      );
      return { visible, edges: remainingEdges };
    },
    []
  );

  const addNodesAndLayout = useCallback(
    (
      baseNodes: KnowledgeNode[],
      baseEdges: KnowledgeEdge[],
      newNodes: KnowledgeNode[],
      newEdges: KnowledgeEdge[],
      options: { fit?: boolean } = {}
    ) => {
      const existingIds = new Set(baseNodes.map((n) => n.id));
      const mergedNodes = [...baseNodes];
      for (const n of newNodes) {
        if (!existingIds.has(n.id)) {
          mergedNodes.push(n);
          existingIds.add(n.id);
          exploredIdsRef.current.add(n.id);
        }
      }

      for (const n of mergedNodes) {
        if (existingIds.has(n.id)) {
          exploredIdsRef.current.add(n.id);
        }
      }
      setExploredCount(exploredIdsRef.current.size);

      const mergedEdges = [...baseEdges];
      const edgeKeys = new Set(mergedEdges.map((e) => `${e.source}->${e.target}`));
      for (const e of newEdges) {
        const key = `${e.source}->${e.target}`;
        if (!edgeKeys.has(key)) {
          mergedEdges.push(e);
          edgeKeys.add(key);
        }
      }

      const { visible, edges: cappedEdges } = evictToCap(mergedNodes, mergedEdges);
      const layouted = getLayoutedElements(visible, cappedEdges);
      commitVisible(layouted.nodes, layouted.edges, options);
    },
    [commitVisible, evictToCap]
  );

  const loadSeedGraph = useCallback(async () => {
    if (!auth.isAuthenticated) {
      setError('Authentication required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const apiGraphData = await uaipAPI.knowledge.getKnowledgeGraph({
        depth: 1,
        types: filterType ? [filterType] : undefined,
        limit: SEED_LIMIT,
      });

      const rawNodes: ApiGraphNode[] = Array.isArray(apiGraphData.nodes) ? apiGraphData.nodes : [];
      const rawEdges: RawRelation[] = Array.isArray(apiGraphData.edges) ? apiGraphData.edges : [];

      const seedNodes = rawNodes.map(apiGraphNodeToFlowNode);
      const seedEdges = rawEdges.map((e, i) => {
        const source = typeof e.source === 'string' ? e.source : '';
        const target = typeof e.target === 'string' ? e.target : '';
        return relationToFlowEdge(e, source, target);
      });

      for (const n of seedNodes) {
        touchNode(n.id);
        exploredIdsRef.current.add(n.id);
      }
      setExploredCount(exploredIdsRef.current.size);

      const layouted = getLayoutedElements(seedNodes, seedEdges);
      commitVisible(layouted.nodes, layouted.edges, { fit: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch knowledge graph');
      logger.error('Knowledge graph seed fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [auth.isAuthenticated, filterType, commitVisible, touchNode]);

  const expandNode = useCallback(
    async (nodeId: string) => {
      try {
        const relations = await uaipAPI.knowledge.getRelations(nodeId);
        if (!Array.isArray(relations) || relations.length === 0) return;

        const neighborIds: string[] = [];
        const relationEdges: KnowledgeEdge[] = [];
        for (const rel of relations.slice(0, EXPAND_LIMIT)) {
          const sourceId =
            typeof rel.sourceItemId === 'string'
              ? rel.sourceItemId
              : typeof rel.fromId === 'string'
                ? rel.fromId
                : '';
          const targetId =
            typeof rel.targetItemId === 'string'
              ? rel.targetItemId
              : typeof rel.toId === 'string'
                ? rel.toId
                : '';
          if (!sourceId || !targetId) continue;

          const neighborId = sourceId === nodeId ? targetId : sourceId;
          neighborIds.push(neighborId);
          relationEdges.push(relationToFlowEdge(rel, sourceId, targetId));
        }

        if (neighborIds.length === 0) return;

        const uniqueNeighborIds = [...new Set(neighborIds)];
        const neighborItems = await Promise.all(
          uniqueNeighborIds.map(async (id) => {
            try {
              return await uaipAPI.knowledge.getKnowledgeItem(id);
            } catch (err) {
              logger.warn(`Failed to fetch neighbor ${id}:`, err);
              return null;
            }
          })
        );

        const newNodes = neighborItems
          .filter((item): item is KnowledgeItem => item !== null)
          .map(knowledgeItemToFlowNode);

        addNodesAndLayout(nodes, edges, newNodes, relationEdges, { fit: false });
      } catch (err) {
        logger.error('Knowledge graph expand error:', err);
      }
    },
    [nodes, edges, addNodesAndLayout]
  );

  const loadNodeDetail = useCallback(async (nodeId: string) => {
    setDetailLoading(true);
    try {
      const item = await uaipAPI.knowledge.getKnowledgeItem(nodeId);
      setSelectedItem(item);
    } catch (err) {
      logger.warn('Failed to fetch knowledge item detail:', err);
      setSelectedItem(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const onNodeClick = useCallback(
    async (_event: React.MouseEvent, node: KnowledgeNode) => {
      setSelectedNode(node);
      selectedIdRef.current = node.id;
      setShowDetails(true);
      touchNode(node.id);

      void loadNodeDetail(node.id);
      void expandNode(node.id);
    },
    [touchNode, expandNode, loadNodeDetail]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = buildFlowEdge(
        `edge-${connection.source}-${connection.target}`,
        connection.source ?? '',
        connection.target ?? '',
        'custom',
        0.8
      );
      setEdges((oldEdges) => addEdge(newEdge, oldEdges));
    },
    [setEdges]
  );

  useEffect(() => {
    loadSeedGraph();
  }, [loadSeedGraph]);

  const handleRefresh = useCallback(() => {
    exploredIdsRef.current.clear();
    touchTimesRef.current.clear();
    selectedIdRef.current = null;
    setSelectedNode(null);
    setSelectedItem(null);
    setShowDetails(false);
    loadSeedGraph();
  }, [loadSeedGraph]);

  const visibleNodes = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return nodes;
    return nodes.filter((node) => {
      const d = node.data;
      return (
        d.label.toLowerCase().includes(term) ||
        d.tags.some((tag: string) => tag.toLowerCase().includes(term))
      );
    });
  }, [searchTerm, nodes]);

  useEffect(() => {
    if (visibleNodes.length === nodes.length) return;
    // Apply temporary visual dimming by mutating style opacity for non-matching nodes.
    // We still keep the nodes mounted so expansion state is preserved.
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    setNodes((current) =>
      current.map((n) => {
        const isMatch = visibleIds.has(n.id);
        return {
          ...n,
          style: {
            ...n.style,
            opacity: isMatch ? 1 : 0.25,
          },
        };
      })
    );
  }, [visibleNodes, setNodes]);

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
                placeholder="Search visible knowledge..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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

            <div className="border-t border-gray-600/50 pt-2 text-center space-y-1">
              <p className="text-xs text-gray-400">
                <span className="text-white font-medium">{nodes.length}</span>
                <span className="text-gray-500"> / {exploredCount} explored</span>
              </p>
              <p className="text-xs text-gray-500">click node to expand neighbors</p>
              <p className="text-xs text-gray-500">max visible {MAX_VISIBLE_NODES}</p>
            </div>
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

              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  <span className="ml-2 text-sm text-gray-400">Loading details...</span>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-400">Type:</span>
                    <Badge
                      className="ml-2"
                      style={{
                        backgroundColor:
                          getKnowledgeNodeStyle(selectedNode.data.knowledgeType).backgroundColor ??
                          '#64748b',
                      }}
                    >
                      {selectedNode.data.knowledgeType}
                    </Badge>
                  </div>

                  <div>
                    <span className="text-gray-400">Content:</span>
                    <p className="text-white mt-1 text-xs leading-relaxed max-h-32 overflow-y-auto">
                      {selectedItem?.content || 'No content available'}
                    </p>
                  </div>

                  <div>
                    <span className="text-gray-400">Tags:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selectedItem?.tags ?? selectedNode.data.tags).map((tag) => (
                        <Badge key={`${selectedNode.id}-${tag}`} variant="secondary" className="text-xs">
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
                    <span className="text-white ml-2">
                      {selectedItem?.sourceType || selectedNode.data.sourceType || 'Unknown'}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-400">Created:</span>
                    <span className="text-white ml-2">
                      {selectedItem?.createdAt
                        ? new Date(selectedItem.createdAt).toLocaleDateString()
                        : selectedNode.data.createdAt
                          ? new Date(selectedNode.data.createdAt).toLocaleDateString()
                          : 'Unknown'}
                    </span>
                  </div>
                </div>
              )}
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
