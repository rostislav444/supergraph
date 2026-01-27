import { useMemo } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Graph, Relation } from '@/types'

interface SchemaGraphProps {
  graph: Graph
}

// Service colors for visual distinction
const SERVICE_COLORS: Record<string, { bg: string; border: string; header: string }> = {
  default: { bg: 'bg-gray-800', border: 'border-gray-600', header: 'bg-blue-600' },
}

const SERVICE_COLOR_PALETTE = [
  { bg: 'bg-gray-800', border: 'border-blue-500', header: 'bg-blue-600' },
  { bg: 'bg-gray-800', border: 'border-purple-500', header: 'bg-purple-600' },
  { bg: 'bg-gray-800', border: 'border-emerald-500', header: 'bg-emerald-600' },
  { bg: 'bg-gray-800', border: 'border-orange-500', header: 'bg-orange-600' },
  { bg: 'bg-gray-800', border: 'border-cyan-500', header: 'bg-cyan-600' },
  { bg: 'bg-gray-800', border: 'border-pink-500', header: 'bg-pink-600' },
  { bg: 'bg-gray-800', border: 'border-yellow-500', header: 'bg-yellow-600' },
  { bg: 'bg-gray-800', border: 'border-red-500', header: 'bg-red-600' },
]

// Custom node component for entities
function EntityNode({
  data,
}: {
  data: { label: string; fields: string[]; service: string; colors: typeof SERVICE_COLORS.default }
}) {
  return (
    <div
      className={`${data.colors.bg} border-2 ${data.colors.border} rounded-lg shadow-lg min-w-[200px] overflow-hidden`}
    >
      {/* Header */}
      <div className={`${data.colors.header} px-3 py-2`}>
        <div className="font-semibold text-white text-sm">{data.label}</div>
        <div className="text-xs text-white/70">{data.service}</div>
      </div>
      {/* Fields */}
      <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
        {data.fields.slice(0, 10).map((field) => (
          <div key={field} className="text-xs text-gray-300 py-0.5 font-mono">
            {field}
          </div>
        ))}
        {data.fields.length > 10 && (
          <div className="text-xs text-gray-500 py-0.5">+{data.fields.length - 10} more...</div>
        )}
      </div>
    </div>
  )
}

// Service group node (container)
function ServiceGroupNode({ data }: { data: { label: string; color: string } }) {
  return (
    <div
      className="rounded-xl border-2 border-dashed p-4"
      style={{
        borderColor: data.color,
        backgroundColor: `${data.color}10`,
        minWidth: '100%',
        minHeight: '100%',
      }}
    >
      <div className="text-sm font-semibold mb-2" style={{ color: data.color }}>
        {data.label}
      </div>
    </div>
  )
}

const nodeTypes = {
  entity: EntityNode,
  serviceGroup: ServiceGroupNode,
}

export function SchemaGraph({ graph }: SchemaGraphProps) {
  // Convert graph to nodes and edges, grouped by service
  const { initialNodes, initialEdges, services } = useMemo(() => {
    const entities = Object.entries(graph.entities || {})
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Group entities by service
    const serviceGroups: Record<string, Array<[string, (typeof graph.entities)[string]]>> = {}
    entities.forEach(([name, entity]) => {
      const service = entity.service || 'unknown'
      if (!serviceGroups[service]) {
        serviceGroups[service] = []
      }
      serviceGroups[service].push([name, entity])
    })

    const serviceNames = Object.keys(serviceGroups)

    // Assign colors to services
    const serviceColorMap: Record<string, typeof SERVICE_COLORS.default> = {}
    serviceNames.forEach((service, index) => {
      serviceColorMap[service] = SERVICE_COLOR_PALETTE[index % SERVICE_COLOR_PALETTE.length]
    })

    // Layout parameters
    const nodeWidth = 220
    const nodeHeight = 280
    const gapX = 60
    const gapY = 40
    const serviceGapX = 150
    const servicePadding = 40

    let currentX = 0

    // Create nodes for each service group
    serviceNames.forEach((service) => {
      const serviceEntities = serviceGroups[service]
      const colors = serviceColorMap[service]

      // Calculate grid for this service
      const cols = Math.min(3, Math.ceil(Math.sqrt(serviceEntities.length)))
      const rows = Math.ceil(serviceEntities.length / cols)

      const groupWidth = cols * (nodeWidth + gapX) + servicePadding * 2
      const groupHeight = rows * (nodeHeight + gapY) + servicePadding * 2 + 30 // +30 for label

      // Add service group background node
      nodes.push({
        id: `service-${service}`,
        type: 'serviceGroup',
        position: { x: currentX, y: 0 },
        data: {
          label: service,
          color:
            colors.header === 'bg-blue-600'
              ? '#3b82f6'
              : colors.header === 'bg-purple-600'
                ? '#a855f7'
                : colors.header === 'bg-emerald-600'
                  ? '#10b981'
                  : colors.header === 'bg-orange-600'
                    ? '#f97316'
                    : colors.header === 'bg-cyan-600'
                      ? '#06b6d4'
                      : colors.header === 'bg-pink-600'
                        ? '#ec4899'
                        : colors.header === 'bg-yellow-600'
                          ? '#ca8a04'
                          : colors.header === 'bg-red-600'
                            ? '#dc2626'
                            : '#6b7280',
        },
        style: {
          width: groupWidth,
          height: groupHeight,
          zIndex: -1,
        },
        selectable: false,
        draggable: false,
      })

      // Add entity nodes within this service
      serviceEntities.forEach(([name, entity], index) => {
        const col = index % cols
        const row = Math.floor(index / cols)

        nodes.push({
          id: name,
          type: 'entity',
          position: {
            x: currentX + servicePadding + col * (nodeWidth + gapX),
            y: servicePadding + 30 + row * (nodeHeight + gapY),
          },
          data: {
            label: name,
            fields: Object.keys(entity.fields || {}),
            service: service,
            colors: colors,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        })

        // Create edges for relations
        const relations = entity.relations || {}
        Object.entries(relations).forEach(([relName, relation]) => {
          const rel = relation as Relation
          // Only create edge if target exists
          if (graph.entities[rel.target]) {
            const isCrossService = graph.entities[rel.target].service !== service
            edges.push({
              id: `${name}-${relName}-${rel.target}`,
              source: name,
              target: rel.target,
              label: relName,
              type: 'smoothstep',
              animated: rel.cardinality === 'many',
              style: {
                stroke: isCrossService ? '#f59e0b' : rel.cardinality === 'one' ? '#8b5cf6' : '#22c55e',
                strokeWidth: isCrossService ? 3 : 2,
                strokeDasharray: isCrossService ? '5,5' : undefined,
              },
              labelStyle: {
                fill: '#9ca3af',
                fontSize: 10,
              },
              labelBgStyle: {
                fill: '#1f2937',
                fillOpacity: 0.9,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: isCrossService ? '#f59e0b' : rel.cardinality === 'one' ? '#8b5cf6' : '#22c55e',
              },
            })
          }
        })
      })

      currentX += groupWidth + serviceGapX
    })

    return { initialNodes: nodes, initialEdges: edges, services: serviceNames }
  }, [graph])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <div className="h-full w-full bg-gray-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background color="#374151" gap={20} />
        <Controls className="bg-gray-800 border-gray-700" />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'serviceGroup') return 'transparent'
            return '#3b82f6'
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="bg-gray-900 border-gray-700"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-gray-800/90 rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-purple-500"></div>
            <span className="text-gray-400">one</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-500"></div>
            <span className="text-gray-400">many</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-0.5 bg-amber-500"
              style={{ borderTop: '2px dashed #f59e0b', height: 0 }}
            ></div>
            <span className="text-gray-400">cross-service</span>
          </div>
        </div>
        <div className="mt-2 text-gray-500">{services.length} services</div>
      </div>
    </div>
  )
}
