import React, { useEffect, useState, useCallback } from 'react'
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
} from '@xyflow/react'
import Dagre from '@dagrejs/dagre'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Copy, Trash2, Edit } from 'lucide-react'


import '@xyflow/react/dist/style.css'

// Use ReactFlow's built-in types
type ReactFlowNode = Node<{ label: string }>
type ReactFlowEdge = Edge

const NODE_STYLES = {
  input: {
    background: '#2563eb',
    color: 'white',
  },
  default: {
    background: '#4b5563',
    color: 'white',
  },
  output: {
    background: '#059669',
    color: 'white',
  },
  common: {
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 'bold',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    width: 'auto',
    minWidth: '150px',
  },
}

// React Flow container styles
const reactFlowStyles: React.CSSProperties = {
  background: '#1f2937',
}

const getLayoutedElements = (
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  direction: string = 'TB'
) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    ranksep: 80,
    nodesep: 50,
    marginx: 20,
    marginy: 20,
  })

  edges.forEach((edge: ReactFlowEdge) => g.setEdge(edge.source, edge.target))
  nodes.forEach((node: ReactFlowNode) => {
    g.setNode(node.id, { width: 150, height: 40 })
  })

  Dagre.layout(g)

  const layoutedNodes = nodes.map((node: ReactFlowNode) => {
    const nodeWithPosition = g.node(node.id)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 75, // Half the width
        y: nodeWithPosition.y - 20, // Half the height
      },
    }
  })

  return {
    nodes: layoutedNodes,
    edges,
  }
}

interface MindMapInnerProps {
  markdown: string
}

const MindMapInner: React.FC<MindMapInnerProps> = ({ markdown }) => {
  const { nodes: ogNodes, edges: ogEdges } = JSON.parse(markdown)

  const [nodes, setNodes, onNodesChange] = useNodesState<ReactFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<ReactFlowEdge>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [initialized, setInitialized] = useState<boolean>(false)
  const [selectedNode, setSelectedNode] = useState<ReactFlowNode | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false)
  const [editLabel, setEditLabel] = useState<string>('')

  const authState = useAuthState()
  // TODO: Get OpenAI key from proper source
  const oAiKey = import.meta.env.VITE_OPENAI_API_KEY || null
  const [apiClient, setApiClient] = useState<OpenAIService | null>(null)
  const {
    fitView,
    getNode,
    getNodes,
    getEdges,
    deleteElements,
    addNodes,
    addEdges,
  } = useReactFlow()

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#64748b' },
      }
      setEdges(oldEdges => addEdge(newEdge, oldEdges))
    },
    [setEdges]
  )

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: ReactFlowNode) => {
      setSelectedNode(node)
    },
    []
  )

  const handleAddNode = useCallback(() => {
    const newNodeId = `node-${getNodes().length + 1}`
    const parentNode = selectedNode || getNodes()[0]

    if (!parentNode) return

    const newNode = {
      id: newNodeId,
      data: { label: 'New Topic' },
      position: { x: parentNode.position.x + 200, y: parentNode.position.y },
      style: {
        ...NODE_STYLES.common,
        ...NODE_STYLES.input,
      },
    }

    const newEdge = {
      id: `edge-${parentNode.id}-${newNodeId}`,
      source: parentNode.id,
      target: newNodeId,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#64748b' },
      animated: true,
    }

    addNodes(newNode)
    addEdges(newEdge)
  }, [
    selectedNode,
    getNodes,
    addNodes,
    addEdges,
    getEdges,
    setNodes,
    setEdges,
    fitView,
  ])

  const handleCopyNode = useCallback(() => {
    if (!selectedNode) return

    const newNodeId = `node-${getNodes().length + 1}`
    const newNode = {
      ...selectedNode,
      id: newNodeId,
      position: {
        x: selectedNode.position.x + 100,
        y: selectedNode.position.y + 100,
      },
    }

    addNodes(newNode)
  }, [selectedNode, getNodes, addNodes, getEdges, setNodes, setEdges, fitView])

  const handleDeleteNode = useCallback(() => {
    if (!selectedNode) return

    const connectedEdges = getEdges().filter(
      edge => edge.source === selectedNode.id || edge.target === selectedNode.id
    )

    deleteElements({
      nodes: [selectedNode],
      edges: connectedEdges,
    })

    setSelectedNode(null)
  }, [
    selectedNode,
    getEdges,
    deleteElements,
    getNodes,
    setNodes,
    setEdges,
    fitView,
  ])

  const handleEditNode = useCallback(() => {
    if (!selectedNode) return
    setEditLabel(selectedNode.data.label)
    setIsEditDialogOpen(true)
  }, [selectedNode])

  const handleSaveEdit = useCallback(() => {
    if (!selectedNode || !editLabel.trim()) return

    setNodes(nds =>
      nds.map(node => {
        if (node.id === selectedNode.id) {
          return {
            ...node,
            data: {
              ...node.data,
              label: editLabel.trim(),
            },
          }
        }
        return node
      })
    )

    setIsEditDialogOpen(false)
    setEditLabel('')
  }, [selectedNode, editLabel, setNodes])

  // Initialize API client
  useEffect(() => {
    if (!apiClient && oAiKey) {
      setApiClient(new OpenAIService(oAiKey))
    }
  }, [oAiKey, apiClient])

  // Initialize the mind map (once)
  useEffect(() => {
    if (!markdown || initialized) return

    setError(null)
    setIsLoading(true)

    try {
      const styledNodes = ogNodes.map(
        (node: { type?: string;[key: string]: unknown }) => ({
          ...node,
          style: {
            ...NODE_STYLES.common,
            ...NODE_STYLES[
            (node.type as keyof typeof NODE_STYLES) || 'default'
            ],
          },
        })
      )

      const styledEdges = ogEdges.map((edge: Record<string, unknown>) => ({
        ...edge,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#64748b' },
      }))

      const layouted = getLayoutedElements(styledNodes, styledEdges)
      setNodes(layouted.nodes)
      setEdges(layouted.edges)
      setInitialized(true)
      setIsLoading(false)

      setTimeout(() => fitView({ padding: 0.2 }), 100)
    } catch (err) {
      setError('Failed to generate mind map')
      console.error(err)
      setIsLoading(false)
    }
  }, [markdown, initialized, fitView, setNodes, setEdges])

  // Fix for the React Flow container size issue
  const rfWrapper: React.CSSProperties = {
    width: '100%',
    height: 'calc(100vh - 200px)', // Adjust for header and padding
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  }

  if (isLoading)
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
        <span className='ml-3 text-gray-300'>Generating mind map...</span>
      </div>
    )

  if (error)
    return (
      <div className='flex h-full items-center justify-center'>
        <div className='text-center'>
          <div className='mb-2 text-red-500'>Error: {error}</div>
          <Button onClick={() => setInitialized(false)}>Retry</Button>
        </div>
      </div>
    )

  return (
    <Card className='h-full w-full overflow-hidden'>
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
          minZoom={0.2}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={true}
          elementsSelectable={true}
          zoomOnScroll={true}
          panOnScroll={true}
          preventScrolling={false}
          nodeOrigin={[0.5, 0.5]}
        >
          <Background color='#334155' gap={16} />
          <Controls className='rounded-lg border border-gray-700 bg-gray-800 p-2 [&>button:hover]:bg-gray-600 [&>button]:border-0 [&>button]:bg-gray-700 [&>button]:text-white' />
          <Panel
            position='top-right'
            className='flex space-x-1 rounded-md bg-gray-800 p-2 shadow'
          >
            <Button
              size='sm'
              variant='outline'
              onClick={handleAddNode}
              disabled={!selectedNode}
            >
              <Plus className='mr-1 h-4 w-4' />
              Add
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={handleCopyNode}
              disabled={!selectedNode}
            >
              <Copy className='mr-1 h-4 w-4' />
              Copy
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={handleEditNode}
              disabled={!selectedNode}
            >
              <Edit className='mr-1 h-4 w-4' />
              Edit
            </Button>
            <Button
              size='sm'
              variant='destructive'
              onClick={handleDeleteNode}
              disabled={!selectedNode}
            >
              <Trash2 className='mr-1 h-4 w-4' />
              Delete
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Node</DialogTitle>
          </DialogHeader>
          <Input
            value={editLabel}
            onChange={e => setEditLabel(e.target.value)}
            placeholder='Node text'
          />
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

const MindMap: React.FC<MindMapInnerProps> = props => {
  const rfWrapper: React.CSSProperties = {
    width: '100%',
    height: 'calc(100vh - 200px)', // Adjust for header and padding
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  }

  return (
    <div className='flex h-full w-full items-center justify-center p-4'>
      <div style={rfWrapper}>
        <ReactFlowProvider>
          <MindMapInner {...props} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

export default MindMap
