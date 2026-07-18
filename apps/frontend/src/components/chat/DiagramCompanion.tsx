import React, { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import Dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';

type ReactFlowNode = Node<{ label: string }>;
type ReactFlowEdge = Edge;

const getLayoutedElements = (
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  direction: string = 'TB'
) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: 60,
    nodesep: 40,
    marginx: 20,
    marginy: 20,
  });

  edges.forEach((edge: ReactFlowEdge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node: ReactFlowNode) => {
    g.setNode(node.id, { width: 160, height: 44 });
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node: ReactFlowNode) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 80,
        y: nodeWithPosition.y - 22,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
};

interface DiagramCompanionInnerProps {
  content: string;
}

const DiagramCompanionInner: React.FC<DiagramCompanionInnerProps> = ({ content }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<ReactFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ReactFlowEdge>([]);
  const [error, setError] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  useEffect(() => {
    try {
      let parsedNodes: ReactFlowNode[] = [];
      let parsedEdges: ReactFlowEdge[] = [];

      // Check if content is direct JSON representation
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        const parsed = JSON.parse(content);
        if (parsed.nodes && parsed.edges) {
          parsedNodes = parsed.nodes;
          parsedEdges = parsed.edges;
        } else if (Array.isArray(parsed)) {
          // If it is just an array, try to infer
          parsedNodes = parsed.filter((n: any) => n.id && n.data);
          parsedEdges = parsed.filter((e: any) => e.source && e.target);
        }
      } else {
        // Simple line parser fallback for plain text / markdown lists
        const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
        let idCounter = 1;
        const tempNodes: ReactFlowNode[] = [];
        const tempEdges: ReactFlowEdge[] = [];

        lines.forEach((line, index) => {
          const currentId = `n-${idCounter++}`;
          tempNodes.push({
            id: currentId,
            data: { label: line },
            position: { x: 0, y: 0 },
            style: {
              background: 'hsl(var(--card))',
              color: 'hsl(var(--card-foreground))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            },
          });

          if (index > 0) {
            tempEdges.push({
              id: `e-${index}`,
              source: `n-${idCounter - 2}`,
              target: currentId,
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--border))' },
              style: { stroke: 'hsl(var(--border))' },
            });
          }
        });
        parsedNodes = tempNodes;
        parsedEdges = tempEdges;
      }

      if (parsedNodes.length === 0) {
        throw new Error('No nodes found to render');
      }

      // Map nodes to visual style using CSS variable tokens
      const styledNodes = parsedNodes.map((node) => ({
        ...node,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius, 8px)',
          padding: '10px 16px',
          fontSize: '13px',
          fontWeight: '600',
          textAlign: 'center' as const,
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.05)',
          maxWidth: '180px',
          wordBreak: 'break-word' as const,
          ...node.style,
        },
      }));

      const styledEdges = parsedEdges.map((edge) => ({
        ...edge,
        animated: edge.animated ?? true,
        markerEnd: edge.markerEnd ?? { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))' },
        style: {
          stroke: 'hsl(var(--border))',
          strokeWidth: 2,
          ...edge.style,
        },
      }));

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        styledNodes,
        styledEdges
      );

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setError(null);

      // Fit view shortly after state updates
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 });
      }, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [content, setNodes, setEdges, fitView]);

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
        <h4 className="font-semibold mb-1">Failed to Render ReactFlow Diagram</h4>
        <p className="font-mono text-xs opacity-90">{error}</p>
        <pre className="mt-3 p-2 bg-background/50 rounded font-mono text-xs overflow-x-auto max-h-40">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[400px] relative rounded-lg overflow-hidden border border-border/40 bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="hsl(var(--border))" gap={16} size={1} />
        <Controls showInteractive={false} className="bg-card border-border text-foreground" />
      </ReactFlow>
    </div>
  );
};

export const DiagramCompanion: React.FC<DiagramCompanionInnerProps> = ({ content }) => {
  return (
    <ReactFlowProvider>
      <DiagramCompanionInner content={content} />
    </ReactFlowProvider>
  );
};
