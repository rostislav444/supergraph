import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  useReactFlow,
  ReactFlowProvider,
  Handle,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Graph, Relation } from '@/types'

interface SchemaGraphProps {
  graph: Graph
}

// Service colors for visual distinction
const SERVICE_COLOR_PALETTE = [
  { border: '#3b82f6', header: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' }, // blue
  { border: '#a855f7', header: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' }, // purple
  { border: '#10b981', header: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' }, // emerald
  { border: '#f97316', header: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' }, // orange
  { border: '#06b6d4', header: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' }, // cyan
  { border: '#ec4899', header: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' }, // pink
  { border: '#eab308', header: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' }, // yellow
  { border: '#ef4444', header: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' }, // red
]

const NODE_WIDTH = 220
const NODE_HEADER_HEIGHT = 44
const FIELD_HEIGHT = 18
const NODE_PADDING = 12
const NODE_GAP_X = 50
const NODE_GAP_Y = 30
const GROUP_GAP = 80
const GROUP_PADDING = 30

// Field type colors
const TYPE_COLORS: Record<string, string> = {
  int: '#ef4444',      // red
  string: '#22c55e',   // green
  json: '#60a5fa',     // light blue
  bool: '#ec4899',     // pink
  float: '#3b82f6',    // blue
  datetime: '#06b6d4', // cyan
  date: '#67e8f9',     // cyan light
  enum: '#f97316',     // orange
  text: '#34d399',     // emerald (similar to string)
  uuid: '#a78bfa',     // violet
  decimal: '#2dd4bf',  // teal
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] || '#9ca3af' // gray fallback
}

// Calculate node height based on number of fields
function calculateNodeHeight(fieldCount: number): number {
  return NODE_HEADER_HEIGHT + NODE_PADDING + fieldCount * FIELD_HEIGHT
}

// Custom node component for entities
function EntityNode({
  data,
}: {
  data: {
    label: string
    fields: Array<{ name: string; type: string; isFk?: boolean; fkTarget?: string }>
    service: string
    color: (typeof SERVICE_COLOR_PALETTE)[0]
  }
}) {
  return (
    <div
      className="rounded-lg shadow-xl relative"
      style={{
        backgroundColor: '#1f2937',
        border: `2px solid ${data.color.border}`,
        width: NODE_WIDTH - 20,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 rounded-t-md"
        style={{ backgroundColor: data.color.header }}
      >
        <div className="font-semibold text-white text-xs truncate">{data.label}</div>
        <div className="text-[10px] text-white/70 truncate">{data.service}</div>
      </div>
      {/* Fields - show all fields without scrolling */}
      <div className="px-2 py-1.5">
        {data.fields.map((field, index) => (
          <div
            key={field.name}
            className="text-[10px] py-0.5 font-mono flex items-center gap-1 relative"
            style={{ height: FIELD_HEIGHT }}
          >
            {/* Target handle for 'id' field - receives FK connections */}
            {field.name === 'id' && (
              <Handle
                type="target"
                position={Position.Left}
                id={`field-id`}
                style={{
                  background: '#ef4444',
                  width: 6,
                  height: 6,
                  left: -14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              />
            )}
            {/* Source handle for FK fields - sends connections */}
            {field.isFk && (
              <Handle
                type="source"
                position={Position.Right}
                id={`field-${field.name}`}
                style={{
                  background: '#fbbf24',
                  width: 6,
                  height: 6,
                  right: -14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              />
            )}
            {field.isFk && (
              <span className="text-amber-400 text-[8px]" title={`FK → ${field.fkTarget}`}>
                🔑
              </span>
            )}
            <span style={{ color: field.isFk ? '#fbbf24' : '#9ca3af' }}>
              {field.name}
            </span>
            <span
              className="text-[9px] ml-auto font-semibold"
              style={{ color: field.isFk ? '#fbbf24' : getTypeColor(field.type) }}
            >
              {field.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Service group node (background)
function ServiceGroupNode({
  data,
}: {
  data: {
    label: string
    color: (typeof SERVICE_COLOR_PALETTE)[0]
    width: number
    height: number
  }
}) {
  return (
    <div
      className="rounded-xl"
      style={{
        width: data.width,
        height: data.height,
        backgroundColor: data.color.bg,
        border: `2px dashed ${data.color.border}`,
      }}
    >
      <div
        className="px-3 py-1.5 text-sm font-semibold"
        style={{ color: data.color.border }}
      >
        {data.label}
      </div>
    </div>
  )
}

const nodeTypes = {
  entity: EntityNode,
  serviceGroup: ServiceGroupNode,
}

// Layout grouped by services with dynamic node heights
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'LR'
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges }

  // Separate entity nodes from group nodes
  const entityNodes = nodes.filter(n => n.type === 'entity')
  const groupNodes = nodes.filter(n => n.type === 'serviceGroup')

  // Group entities by service
  const serviceGroups: Record<string, Node[]> = {}
  entityNodes.forEach(node => {
    const service = node.data.service as string
    if (!serviceGroups[service]) serviceGroups[service] = []
    serviceGroups[service].push(node)
  })

  const services = Object.keys(serviceGroups)
  const layoutedNodes: Node[] = []

  // Calculate grid layout for each service group
  let currentX = 0
  let currentY = 0
  let maxRowHeight = 0
  const GROUPS_PER_ROW = direction === 'LR' ? 4 : 3

  services.forEach((service, serviceIndex) => {
    const nodesInGroup = serviceGroups[service]

    // Calculate grid for nodes within this group
    const cols = Math.ceil(Math.sqrt(nodesInGroup.length))
    const rows = Math.ceil(nodesInGroup.length / cols)

    // Calculate max height for each row based on field counts
    const rowHeights: number[] = []
    for (let row = 0; row < rows; row++) {
      let maxHeightInRow = 0
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col
        if (index < nodesInGroup.length) {
          const node = nodesInGroup[index]
          const fieldCount = (node.data.fields as Array<unknown>).length
          const nodeHeight = calculateNodeHeight(fieldCount)
          maxHeightInRow = Math.max(maxHeightInRow, nodeHeight)
        }
      }
      rowHeights.push(maxHeightInRow)
    }

    const totalNodesHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (rows - 1) * NODE_GAP_Y
    const groupWidth = cols * NODE_WIDTH + (cols - 1) * NODE_GAP_X + GROUP_PADDING * 2
    const groupHeight = totalNodesHeight + GROUP_PADDING * 2 + 30 // +30 for header

    // Position nodes within the group
    nodesInGroup.forEach((node, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)

      // Calculate Y position based on previous row heights
      let yOffset = 0
      for (let r = 0; r < row; r++) {
        yOffset += rowHeights[r] + NODE_GAP_Y
      }

      const x = currentX + GROUP_PADDING + col * (NODE_WIDTH + NODE_GAP_X)
      const y = currentY + GROUP_PADDING + 30 + yOffset

      layoutedNodes.push({
        ...node,
        position: { x, y },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      })
    })

    // Find and update the corresponding group node
    const groupNode = groupNodes.find(g => g.id === `group-${service}`)
    if (groupNode) {
      layoutedNodes.push({
        ...groupNode,
        position: { x: currentX, y: currentY },
        data: {
          ...groupNode.data,
          width: groupWidth,
          height: groupHeight,
        },
      })
    }

    maxRowHeight = Math.max(maxRowHeight, groupHeight)

    // Move to next position
    if ((serviceIndex + 1) % GROUPS_PER_ROW === 0) {
      currentX = 0
      currentY += maxRowHeight + GROUP_GAP
      maxRowHeight = 0
    } else {
      currentX += groupWidth + GROUP_GAP
    }
  })

  return { nodes: layoutedNodes, edges }
}

function SchemaGraphInner({ graph }: SchemaGraphProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  // Convert graph to nodes and edges
  const { initialNodes, initialEdges, services } = useMemo(() => {
    const entities = Object.entries(graph.entities || {})
    const nodes: Node[] = []
    const edges: Edge[] = []
    const edgeSet = new Set<string>()

    // Get unique services and assign colors
    const serviceSet = new Set<string>()
    entities.forEach(([, entity]) => {
      serviceSet.add(entity.service || 'unknown')
    })
    const serviceList = Array.from(serviceSet).sort()
    const serviceColorMap: Record<string, (typeof SERVICE_COLOR_PALETTE)[0]> = {}
    serviceList.forEach((service, index) => {
      serviceColorMap[service] = SERVICE_COLOR_PALETTE[index % SERVICE_COLOR_PALETTE.length]
    })

    // Create service group nodes first (they render behind entity nodes)
    serviceList.forEach((service) => {
      nodes.push({
        id: `group-${service}`,
        type: 'serviceGroup',
        position: { x: 0, y: 0 },
        data: {
          label: service,
          color: serviceColorMap[service],
          width: 200,
          height: 200,
        },
        draggable: false,
        selectable: false,
        zIndex: -1,
      })
    })

    // Create entity nodes
    entities.forEach(([name, entity]) => {
      const service = entity.service || 'unknown'
      const color = serviceColorMap[service]

      // Analyze fields for FK
      const fieldsWithFk: Array<{ name: string; type: string; isFk?: boolean; fkTarget?: string }> = []
      const entityFields = entity.fields || {}

      Object.entries(entityFields).forEach(([fieldName, field]) => {
        let isFk = false
        let fkTarget = ''

        // Check if field has FK info from backend
        if (field.fk) {
          isFk = true
          fkTarget = field.fk.target_entity
        } else {
          // Fallback: check explicit relations
          const relations = entity.relations || {}
          Object.entries(relations).forEach(([, rel]) => {
            const relation = rel as Relation
            if (relation.ref?.from_field === fieldName) {
              isFk = true
              fkTarget = relation.target
            }
          })
        }

        fieldsWithFk.push({
          name: fieldName,
          type: field.type,
          isFk,
          fkTarget,
        })
      })

      // Sort: id first, then FKs, then rest
      fieldsWithFk.sort((a, b) => {
        if (a.name === 'id') return -1
        if (b.name === 'id') return 1
        if (a.isFk && !b.isFk) return -1
        if (!a.isFk && b.isFk) return 1
        return a.name.localeCompare(b.name)
      })

      nodes.push({
        id: name,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: name,
          fields: fieldsWithFk,
          service,
          color,
        },
        zIndex: 1,
      })

      // Create edges for explicit relations
      const relations = entity.relations || {}
      Object.entries(relations).forEach(([relName, relation]) => {
        const rel = relation as Relation
        if (!graph.entities[rel.target]) return

        const edgeId = `${name}-${rel.target}`
        const reverseEdgeId = `${rel.target}-${name}`

        if (edgeSet.has(edgeId)) return

        const isCrossService = graph.entities[rel.target].service !== service
        const isFkRelation = !!rel.ref
        const isThroughRelation = !!rel.through

        let strokeColor = '#22c55e'
        let strokeWidth = 2
        let animated = rel.cardinality === 'many'
        let strokeDasharray: string | undefined

        if (isCrossService) {
          strokeColor = '#f59e0b'
          strokeWidth = 2
          strokeDasharray = '8,4'
        } else if (isFkRelation) {
          strokeColor = '#8b5cf6'
          animated = false
        } else if (isThroughRelation) {
          strokeColor = '#06b6d4'
        }

        if (rel.cardinality === 'one') {
          animated = false
        }

        edges.push({
          id: `${name}-${relName}-${rel.target}`,
          source: name,
          target: rel.target,
          label: relName,
          type: 'smoothstep',
          animated,
          style: {
            stroke: strokeColor,
            strokeWidth,
            strokeDasharray,
          },
          labelStyle: {
            fill: '#9ca3af',
            fontSize: 9,
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: '#111827',
            fillOpacity: 0.9,
          },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: strokeColor,
            width: 15,
            height: 15,
          },
          zIndex: 0,
        })

        edgeSet.add(edgeId)
        edgeSet.add(reverseEdgeId)
      })

      // Create edges for FK relationships (from backend fk info)
      fieldsWithFk.forEach((field) => {
        if (!field.isFk || !field.fkTarget) return

        // Check if this FK edge already exists (from explicit relations)
        const edgeId = `${name}-${field.fkTarget}`
        const reverseEdgeId = `${field.fkTarget}-${name}`

        if (edgeSet.has(edgeId)) return

        const targetEntity = graph.entities[field.fkTarget]
        if (!targetEntity) return

        const isCrossService = targetEntity.service !== service
        let strokeColor = '#8b5cf6' // Purple for FK
        let strokeDasharray: string | undefined

        if (isCrossService) {
          strokeColor = '#f59e0b' // Orange for cross-service
          strokeDasharray = '8,4'
        }

        edges.push({
          id: `${name}-fk-${field.name}-${field.fkTarget}`,
          source: name,
          sourceHandle: `field-${field.name}`,
          target: field.fkTarget,
          targetHandle: 'field-id',
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: strokeColor,
            strokeWidth: 2,
            strokeDasharray,
          },
          labelStyle: {
            fill: '#9ca3af',
            fontSize: 9,
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: '#111827',
            fillOpacity: 0.9,
          },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: strokeColor,
            width: 15,
            height: 15,
          },
          zIndex: 0,
        })

        edgeSet.add(edgeId)
        edgeSet.add(reverseEdgeId)
      })
    })

    // Apply layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      'LR'
    )

    return {
      initialNodes: layoutedNodes,
      initialEdges: layoutedEdges,
      services: serviceList,
    }
  }, [graph])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onLayout = useCallback(
    (direction: 'TB' | 'LR') => {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        nodes,
        edges,
        direction
      )
      setNodes([...layoutedNodes])
      setEdges([...layoutedEdges])

      window.requestAnimationFrame(() => {
        fitView({ padding: 0.1 })
      })
    },
    [nodes, edges, setNodes, setEdges, fitView]
  )

  const entityCount = nodes.filter(n => n.type === 'entity').length

  return (
    <div className="h-full w-full bg-gray-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background color="#374151" gap={20} />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'serviceGroup') return 'transparent'
            return (node.data?.color as typeof SERVICE_COLOR_PALETTE[0])?.header || '#3b82f6'
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="bg-gray-900 border-gray-700"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Layout Controls */}
      <div className="absolute top-4 left-4 bg-gray-800/90 rounded-lg px-2 py-1.5 flex gap-1">
        <button
          onClick={() => onLayout('LR')}
          className="px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded"
          title="Horizontal layout"
        >
          ↔ Horizontal
        </button>
        <button
          onClick={() => onLayout('TB')}
          className="px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded"
          title="Vertical layout"
        >
          ↕ Vertical
        </button>
      </div>

      {/* Legend + Zoom Controls */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        {/* Legend */}
        <div className="bg-gray-800/90 rounded-lg px-3 py-2 text-xs">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-purple-500"></div>
                <span className="text-gray-400">FK ref</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-green-500"></div>
                <span className="text-gray-400">relation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-cyan-500"></div>
                <span className="text-gray-400">through</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5" style={{ borderTop: '2px dashed #f59e0b' }}></div>
                <span className="text-gray-400">cross-service</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400">🔑</span>
                <span className="text-gray-400">foreign key</span>
              </div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-700 flex gap-3">
            <span className="text-gray-500">{entityCount} entities</span>
            <span className="text-gray-500">{services.length} services</span>
          </div>
        </div>

        {/* Zoom Controls - horizontal, full width */}
        <div className="bg-gray-800/90 rounded-lg flex overflow-hidden">
          <button
            onClick={() => zoomIn({ duration: 200 })}
            className="flex-1 py-2 text-green-400 hover:bg-green-600 hover:text-white transition-colors border-r border-gray-700 flex items-center justify-center"
            title="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          <button
            onClick={() => zoomOut({ duration: 200 })}
            className="flex-1 py-2 text-orange-400 hover:bg-orange-600 hover:text-white transition-colors border-r border-gray-700 flex items-center justify-center"
            title="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
            </svg>
          </button>
          <button
            onClick={() => fitView({ padding: 0.1, duration: 200 })}
            className="flex-1 py-2 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-center"
            title="Fit view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export function SchemaGraph({ graph }: SchemaGraphProps) {
  return (
    <ReactFlowProvider>
      <SchemaGraphInner graph={graph} />
    </ReactFlowProvider>
  )
}
