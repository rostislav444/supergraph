import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
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
import ELK from 'elkjs/lib/elk.bundled.js'
import type { Graph, Relation } from '@/types'

interface SchemaGraphProps {
  graph: Graph
}

// Layout types
type LayoutType = 'elk-layered'

// Service colors for visual distinction
const SERVICE_COLOR_PALETTE = [
  { border: '#3b82f6', header: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)' }, // blue
  { border: '#a855f7', header: '#a855f7', bg: 'rgba(168, 85, 247, 0.08)' }, // purple
  { border: '#10b981', header: '#10b981', bg: 'rgba(16, 185, 129, 0.08)' }, // emerald
  { border: '#f97316', header: '#f97316', bg: 'rgba(249, 115, 22, 0.08)' }, // orange
  { border: '#06b6d4', header: '#06b6d4', bg: 'rgba(6, 182, 212, 0.08)' }, // cyan
  { border: '#ec4899', header: '#ec4899', bg: 'rgba(236, 72, 153, 0.08)' }, // pink
  { border: '#eab308', header: '#eab308', bg: 'rgba(234, 179, 8, 0.08)' }, // yellow
  { border: '#ef4444', header: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' }, // red
]

const NODE_WIDTH = 220
const NODE_HEADER_HEIGHT = 44
const FIELD_HEIGHT = 18
const NODE_PADDING = 12
const GROUP_PADDING = 40

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
    fields: Array<{ name: string; type: string; isFk?: boolean; fkTarget?: string; isPolymorphicFk?: boolean }>
    service: string
    color: (typeof SERVICE_COLOR_PALETTE)[0]
  }
}) {
  return (
    <div
      className="rounded-lg shadow-xl relative cursor-pointer hover:shadow-2xl transition-shadow"
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
        {data.fields.map((field) => {
          // Polymorphic FK: subject_id receives (target), object_id sends (source)
          const isSubjectId = field.name === 'subject_id' && field.isPolymorphicFk
          const isObjectId = field.name === 'object_id' && field.isPolymorphicFk

          return (
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
                  id="field-id-target"
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
              {/* Source handle for 'id' field - sends to Relationship.subject_id */}
              {field.name === 'id' && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id="field-id"
                  style={{
                    background: '#fbbf24', // Yellow - matches input to Relationship
                    width: 6,
                    height: 6,
                    right: -14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              {/* Target handle for subject_id (polymorphic incoming) */}
              {isSubjectId && (
                <Handle
                  type="target"
                  position={Position.Left}
                  id="field-subject_id"
                  style={{
                    background: '#fbbf24', // Yellow - input to Relationship
                    width: 6,
                    height: 6,
                    left: -14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              {/* Source handle for object_id (polymorphic outgoing) */}
              {isObjectId && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id="field-object_id"
                  style={{
                    background: '#f97316', // Orange - output from Relationship
                    width: 6,
                    height: 6,
                    right: -14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              {/* Source handle for regular FK fields - sends connections */}
              {field.isFk && !field.isPolymorphicFk && (
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
              {/* FK indicator */}
              {field.isFk && (
                <span
                  className="text-[8px]"
                  style={{ color: field.isPolymorphicFk ? '#fbbf24' : '#fbbf24' }}
                  title={`FK → ${field.fkTarget}`}
                >
                  {field.isPolymorphicFk ? '🔗' : '🔑'}
                </span>
              )}
              <span style={{ color: field.isFk ? '#fbbf24' : '#9ca3af' }}>
                {field.name}
              </span>
              <span
                className="text-[9px] ml-auto font-semibold"
                style={{ color: field.isFk ? (field.isPolymorphicFk ? '#f97316' : '#fbbf24') : getTypeColor(field.type) }}
              >
                {field.type}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Service group node (background for microservice)
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
        className="px-3 py-2 text-sm font-semibold"
        style={{ color: data.color.border }}
      >
        📦 {data.label}
      </div>
    </div>
  )
}

const nodeTypes = {
  entity: EntityNode,
  serviceGroup: ServiceGroupNode,
}

// ELK instance
const elk = new ELK()

// ELK layout options for internal group layout
const elkLayoutOptions = {
  'elk-layered': {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.spacing.nodeNode': '40',
    'elk.layered.spacing.nodeNodeBetweenLayers': '60',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.padding': `[top=${GROUP_PADDING + 10},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
  },
}

interface ElkEdge {
  id: string
  sources: string[]
  targets: string[]
}


// Layout each service group internally using ELK
async function layoutServiceGroup(
  serviceNodes: Node[],
  internalEdges: Edge[], // Edges between entities within this group
  layoutType: LayoutType
): Promise<{ nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>; width: number; height: number }> {
  const nodeIds = new Set(serviceNodes.map(n => n.id))

  // Filter edges to only include those within this group
  const groupEdges: ElkEdge[] = internalEdges
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    }))

  const elkGraph = {
    id: 'group',
    layoutOptions: elkLayoutOptions[layoutType],
    children: serviceNodes.map(node => ({
      id: node.id,
      width: NODE_WIDTH,
      height: calculateNodeHeight((node.data.fields as Array<unknown>).length),
    })),
    edges: groupEdges,
  }

  const layouted = await elk.layout(elkGraph)

  let maxX = 0, maxY = 0
  const nodes = layouted.children?.map(child => {
    const x = child.x ?? 0
    const y = child.y ?? 0
    const w = child.width ?? NODE_WIDTH
    const h = child.height ?? 100
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
    return { id: child.id, x, y, width: w, height: h }
  }) || []

  return { nodes, width: maxX + GROUP_PADDING * 2, height: maxY + GROUP_PADDING * 2 + 30 }
}

// Apply mind-map style layout: Relations in center, others around it
async function applyElkLayout(
  nodes: Node[],
  edges: Edge[],
  layoutType: LayoutType,
  serviceColorMap: Record<string, (typeof SERVICE_COLOR_PALETTE)[0]>
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (nodes.length === 0) return { nodes, edges }

  const entityNodes = nodes.filter(n => n.type === 'entity')

  // Group entities by service
  const serviceGroups: Record<string, Node[]> = {}
  entityNodes.forEach(node => {
    const service = node.data.service as string
    if (!serviceGroups[service]) serviceGroups[service] = []
    serviceGroups[service].push(node)
  })

  const services = Object.keys(serviceGroups)

  // Count connections between services (through edges)
  const serviceConnections: Record<string, Set<string>> = {}
  services.forEach(s => serviceConnections[s] = new Set())

  edges.forEach(edge => {
    const sourceNode = entityNodes.find(n => n.id === edge.source)
    const targetNode = entityNodes.find(n => n.id === edge.target)
    if (sourceNode && targetNode) {
      const sourceService = sourceNode.data.service as string
      const targetService = targetNode.data.service as string
      if (sourceService !== targetService) {
        serviceConnections[sourceService].add(targetService)
        serviceConnections[targetService].add(sourceService)
      }
    }
  })

  // Find central service (most connections) - usually 'relations'
  let centralService = 'relations'
  let maxConnections = 0
  services.forEach(service => {
    const connections = serviceConnections[service].size
    if (connections > maxConnections || (service === 'relations' && connections >= maxConnections)) {
      maxConnections = connections
      centralService = service
    }
  })

  // Layout each service group internally
  const groupLayouts: Record<string, { nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>; width: number; height: number }> = {}

  for (const service of services) {
    groupLayouts[service] = await layoutServiceGroup(serviceGroups[service], edges, layoutType)
  }

  // Position service groups using force-directed algorithm
  const otherServices = services.filter(s => s !== centralService)

  // Count edge connections between each service pair
  const edgeCountBetween: Record<string, Record<string, number>> = {}
  services.forEach(s => edgeCountBetween[s] = {})

  edges.forEach(edge => {
    const sourceNode = entityNodes.find(n => n.id === edge.source)
    const targetNode = entityNodes.find(n => n.id === edge.target)
    if (sourceNode && targetNode) {
      const s1 = sourceNode.data.service as string
      const s2 = targetNode.data.service as string
      if (s1 !== s2) {
        edgeCountBetween[s1][s2] = (edgeCountBetween[s1][s2] || 0) + 1
        edgeCountBetween[s2][s1] = (edgeCountBetween[s2][s1] || 0) + 1
      }
    }
  })

  // Initialize positions: center for central, random around for others
  const centerX = 1500
  const centerY = 1000

  const positions: Record<string, { x: number; y: number }> = {
    [centralService]: { x: centerX, y: centerY }
  }

  // Initial placement: spread services based on connection strength to center
  otherServices.forEach((service, index) => {
    const connectionsToCenter = edgeCountBetween[service][centralService] || 0
    // More connections = closer (smaller initial distance)
    const baseDistance = 400 + Math.max(0, 10 - connectionsToCenter) * 50
    const angle = (2 * Math.PI * index) / otherServices.length - Math.PI / 2
    positions[service] = {
      x: centerX + Math.cos(angle) * baseDistance,
      y: centerY + Math.sin(angle) * baseDistance,
    }
  })

  // Calculate diagonal size for each group (for collision detection)
  const groupDiagonals: Record<string, number> = {}
  services.forEach(s => {
    const layout = groupLayouts[s]
    groupDiagonals[s] = Math.sqrt(layout.width ** 2 + layout.height ** 2) / 2
  })

  // Force-directed iterations
  const iterations = 150
  const gap = 80 // Minimum gap between groups

  for (let iter = 0; iter < iterations; iter++) {
    const forces: Record<string, { fx: number; fy: number }> = {}
    services.forEach(s => forces[s] = { fx: 0, fy: 0 })

    // Repulsion between all pairs - ALWAYS apply, stronger when overlapping
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        const s1 = services[i]
        const s2 = services[j]
        const dx = positions[s2].x - positions[s1].x
        const dy = positions[s2].y - positions[s1].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1

        // Minimum distance = sum of diagonals + gap
        const minDist = groupDiagonals[s1] + groupDiagonals[s2] + gap

        // Always repel, but stronger when overlapping
        let force: number
        if (dist < minDist) {
          // Overlapping - strong repulsion
          force = (minDist - dist) * 5
        } else {
          // Not overlapping - gentle repulsion to spread out
          force = 1000 / (dist * dist)
        }

        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        forces[s1].fx -= fx
        forces[s1].fy -= fy
        forces[s2].fx += fx
        forces[s2].fy += fy
      }
    }

    // Attraction based on connections (pull connected services together)
    services.forEach(s1 => {
      services.forEach(s2 => {
        if (s1 >= s2) return
        const connections = edgeCountBetween[s1][s2] || 0
        if (connections > 0) {
          const dx = positions[s2].x - positions[s1].x
          const dy = positions[s2].y - positions[s1].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1

          // Ideal distance: groups should be close but not overlapping
          const minDist = groupDiagonals[s1] + groupDiagonals[s2] + gap
          const idealDist = minDist + 50 // Just outside minimum

          if (dist > idealDist) {
            // Pull together if too far
            const force = (dist - idealDist) * 0.02 * Math.sqrt(connections)
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            forces[s1].fx += fx
            forces[s1].fy += fy
            forces[s2].fx -= fx
            forces[s2].fy -= fy
          }
        }
      })
    })

    // Pull towards center - stronger for services with fewer connections
    otherServices.forEach(service => {
      const dx = centerX - positions[service].x
      const dy = centerY - positions[service].y

      // Count total connections this service has
      const totalConnections = Object.values(edgeCountBetween[service]).reduce((a, b) => a + b, 0)

      // Stronger pull for services with no/few connections
      const pullStrength = totalConnections === 0 ? 0.05 : (totalConnections < 3 ? 0.02 : 0.005)

      forces[service].fx += dx * pullStrength
      forces[service].fy += dy * pullStrength
    })

    // Apply forces (central service stays fixed)
    const damping = Math.max(0.1, 1 - iter / iterations)
    otherServices.forEach(service => {
      positions[service].x += forces[service].fx * damping
      positions[service].y += forces[service].fy * damping
    })
  }

  // Convert center positions to top-left positions for groups
  const groupPositions: Record<string, { x: number; y: number }> = {}
  services.forEach(service => {
    const layout = groupLayouts[service]
    groupPositions[service] = {
      x: positions[service].x - layout.width / 2,
      y: positions[service].y - layout.height / 2,
    }
  })

  // Build final nodes - groups first, then entities as children
  const allNodes: Node[] = []

  services.forEach(service => {
    const groupPos = groupPositions[service]
    const layout = groupLayouts[service]
    const color = serviceColorMap[service]
    const groupId = `group-${service}`

    // Add group node FIRST (parent must exist before children)
    allNodes.push({
      id: groupId,
      type: 'serviceGroup',
      position: { x: groupPos.x, y: groupPos.y },
      data: {
        label: service,
        color,
        width: layout.width,
        height: layout.height,
      },
      draggable: true,
      selectable: true,
      zIndex: -1,
    })

    // Add entity nodes as children of the group (relative positions)
    layout.nodes.forEach(layoutNode => {
      const originalNode = entityNodes.find(n => n.id === layoutNode.id)
      if (originalNode) {
        allNodes.push({
          ...originalNode,
          position: {
            // Position relative to parent group
            x: layoutNode.x + GROUP_PADDING,
            y: layoutNode.y + GROUP_PADDING + 30, // +30 for header
          },
          parentId: groupId, // Makes it move with the group
          extent: 'parent' as const, // Keep within parent bounds
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        })
      }
    })
  })

  return { nodes: allNodes, edges }
}

function SchemaGraphInner({ graph }: SchemaGraphProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const [isLayouting, setIsLayouting] = useState(false)
  const [isDragEnabled, setIsDragEnabled] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const initialLayoutApplied = useRef(false)

  // Convert graph to nodes and edges
  const { rawNodes, rawEdges, services, serviceColorMap } = useMemo(() => {
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
    const colorMap: Record<string, (typeof SERVICE_COLOR_PALETTE)[0]> = {}
    serviceList.forEach((service, index) => {
      colorMap[service] = SERVICE_COLOR_PALETTE[index % SERVICE_COLOR_PALETTE.length]
    })

    // Collect polymorphic relations (through Relationship entity)
    // Relations without direct FK (ref) likely go through Relationship junction table
    const polymorphicRelations: Array<{ parent: string; target: string; relationName: string }> = []
    const hasRelationshipEntity = !!graph.entities['Relationship']

    if (hasRelationshipEntity) {
      entities.forEach(([entityName, entity]) => {
        // Skip Relationship entity itself
        if (entityName === 'Relationship') return

        const relations = entity.relations || {}
        Object.entries(relations).forEach(([relName, relation]) => {
          const rel = relation as Relation
          // Relations WITHOUT ref (no direct FK) go through Relationship
          // These are the attached relations from RelationsViewSet
          if (!rel.ref && graph.entities[rel.target]) {
            polymorphicRelations.push({
              parent: entityName,
              target: rel.target,
              relationName: relName,
            })
          }
        })
      })
    }

    console.log('Polymorphic relations found:', polymorphicRelations.length, polymorphicRelations)

    // Get unique entities connected to Relationship
    const subjectEntities = new Set(polymorphicRelations.map(r => r.parent))
    const objectEntities = new Set(polymorphicRelations.map(r => r.target))

    // Create entity nodes
    entities.forEach(([name, entity]) => {
      const service = entity.service || 'unknown'
      const color = colorMap[service]

      // Analyze fields for FK
      const fieldsWithFk: Array<{ name: string; type: string; isFk?: boolean; fkTarget?: string }> = []
      const entityFields = entity.fields || {}

      Object.entries(entityFields).forEach(([fieldName, field]) => {
        let isFk = false
        let fkTarget = ''
        let isPolymorphicFk = false

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

        // Special case: Relationship entity's subject_id and object_id are polymorphic FKs
        if (name === 'Relationship') {
          if (fieldName === 'subject_id' && subjectEntities.size > 0) {
            isPolymorphicFk = true
            isFk = true
            fkTarget = `[${Array.from(subjectEntities).join(', ')}]`
          }
          if (fieldName === 'object_id' && objectEntities.size > 0) {
            isPolymorphicFk = true
            isFk = true
            fkTarget = `[${Array.from(objectEntities).join(', ')}]`
          }
        }

        fieldsWithFk.push({
          name: fieldName,
          type: field.type,
          isFk,
          fkTarget,
          isPolymorphicFk,
        } as { name: string; type: string; isFk?: boolean; fkTarget?: string; isPolymorphicFk?: boolean })
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

        // Relations WITHOUT ref (no direct FK) go through Relationship junction
        // This matches the simplified AttachRelation approach
        const isThroughRelation = !rel.ref && hasRelationshipEntity && name !== 'Relationship'

        // For "through" relations, create edges VIA Relationship entity
        if (isThroughRelation) {
          console.log(`Creating through-relation edges: ${name} → Relationship → ${rel.target}`)

          // Edge 1: Parent → Relationship (via subject_id)
          const inEdgeId = `${name}-to-Relationship`
          if (!edgeSet.has(inEdgeId)) {
            edges.push({
              id: `${name}-subject-Relationship`,
              source: name,
              sourceHandle: 'field-id',
              target: 'Relationship',
              targetHandle: 'field-subject_id',
              type: 'smoothstep',
              animated: true,
              style: {
                stroke: '#fbbf24', // Yellow dashed for input to Relationship
                strokeWidth: 2,
                strokeDasharray: '6,4',
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#fbbf24',
                width: 12,
                height: 12,
              },
              zIndex: 0,
            })
            edgeSet.add(inEdgeId)
          }

          // Edge 2: Relationship → Target (via object_id)
          const outEdgeId = `Relationship-to-${rel.target}`
          if (!edgeSet.has(outEdgeId)) {
            edges.push({
              id: `Relationship-object-${rel.target}`,
              source: 'Relationship',
              sourceHandle: 'field-object_id',
              target: rel.target,
              targetHandle: 'field-id-target',
              type: 'smoothstep',
              animated: true,
              style: {
                stroke: '#f97316', // Orange for output from Relationship
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#f97316',
                width: 12,
                height: 12,
              },
              zIndex: 0,
            })
            edgeSet.add(outEdgeId)
          }

          return // Don't create direct edge for through relations
        }

        const edgeId = `${name}-${rel.target}`
        const reverseEdgeId = `${rel.target}-${name}`

        if (edgeSet.has(edgeId)) return

        const isCrossService = graph.entities[rel.target].service !== service
        const isFkRelation = !!rel.ref

        let strokeColor = '#22c55e'
        let strokeWidth = 2
        let animated = rel.cardinality === 'many'
        let strokeDasharray: string | undefined

        if (isCrossService) {
          strokeColor = '#fbbf24' // Yellow for cross-service
          strokeWidth = 2
          strokeDasharray = '6,4'
          animated = true // Always animated for cross-service
        } else if (isFkRelation) {
          strokeColor = '#8b5cf6'
          animated = false
        } else if (rel.cardinality === 'one') {
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
        let animated = false

        if (isCrossService) {
          strokeColor = '#fbbf24' // Yellow for cross-service
          strokeDasharray = '6,4'
          animated = true // Animated for cross-service
        }

        edges.push({
          id: `${name}-fk-${field.name}-${field.fkTarget}`,
          source: name,
          sourceHandle: `field-${field.name}`,
          target: field.fkTarget,
          targetHandle: 'field-id-target',
          type: 'smoothstep',
          animated,
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

    return {
      rawNodes: nodes,
      rawEdges: edges,
      services: serviceList,
      serviceColorMap: colorMap,
    }
  }, [graph])

  const [nodes, setNodes, onNodesChange] = useNodesState(rawNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges)

  // Apply initial layout
  useEffect(() => {
    if (!initialLayoutApplied.current && rawNodes.length > 0) {
      initialLayoutApplied.current = true
      applyLayout()
    }
  }, [rawNodes])

  // Compute connected entities when an entity is selected
  // Includes transitive connections through Relationship entity
  const { connectedEntities, relevantEdgeIds } = useMemo(() => {
    if (!selectedEntity) {
      return { connectedEntities: new Set<string>(), relevantEdgeIds: new Set<string>() }
    }

    const connected = new Set<string>()
    const relevantEdges = new Set<string>()

    // Start with the selected entity
    connected.add(selectedEntity)

    // Find all edges connected to the selected entity (direct connections)
    rawEdges.forEach(edge => {
      if (edge.source === selectedEntity) {
        relevantEdges.add(edge.id)
        connected.add(edge.target)
      }
      if (edge.target === selectedEntity) {
        relevantEdges.add(edge.id)
        connected.add(edge.source)
      }
    })

    // Traverse through Relationship entity for transitive connections
    // If selected entity connects to Relationship, find what Relationship connects to
    if (connected.has('Relationship') && selectedEntity !== 'Relationship') {
      rawEdges.forEach(edge => {
        // Edges FROM Relationship to other entities
        if (edge.source === 'Relationship' && !connected.has(edge.target)) {
          relevantEdges.add(edge.id)
          connected.add(edge.target)
        }
        // Edges TO Relationship from other entities
        if (edge.target === 'Relationship' && !connected.has(edge.source)) {
          relevantEdges.add(edge.id)
          connected.add(edge.source)
        }
      })
    }

    return { connectedEntities: connected, relevantEdgeIds: relevantEdges }
  }, [selectedEntity, rawEdges])

  // Filter nodes and edges when entity is selected
  const filteredNodes = useMemo(() => {
    if (!selectedEntity) return rawNodes
    return rawNodes.filter(n => connectedEntities.has(n.id))
  }, [rawNodes, selectedEntity, connectedEntities])

  const filteredEdges = useMemo(() => {
    if (!selectedEntity) return rawEdges
    return rawEdges.filter(e => relevantEdgeIds.has(e.id))
  }, [rawEdges, selectedEntity, relevantEdgeIds])

  // Handle node click for entity selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'entity') {
      const entityName = node.id
      setSelectedEntity(prev => prev === entityName ? null : entityName)
    }
  }, [])

  // Apply layout when selection changes
  const applyFilteredLayout = useCallback(
    async (nodesToLayout: Node[], edgesToLayout: Edge[]) => {
      if (nodesToLayout.length === 0) return

      setIsLayouting(true)

      try {
        const { nodes: layoutedNodes } = await applyElkLayout(
          nodesToLayout,
          edgesToLayout,
          'elk-layered',
          serviceColorMap
        )
        setNodes([...layoutedNodes])
        setEdges([...edgesToLayout])

        window.requestAnimationFrame(() => {
          fitView({ padding: 0.2, duration: 300 })
        })
      } catch (error) {
        console.error('Layout error:', error)
      } finally {
        setIsLayouting(false)
      }
    },
    [serviceColorMap, setNodes, setEdges, fitView]
  )

  // Re-layout when selection changes
  useEffect(() => {
    if (selectedEntity !== null || initialLayoutApplied.current) {
      applyFilteredLayout(filteredNodes, filteredEdges)
    }
  }, [selectedEntity, filteredNodes, filteredEdges, applyFilteredLayout])

  const applyLayout = useCallback(
    async () => {
      setIsLayouting(true)

      try {
        const { nodes: layoutedNodes } = await applyElkLayout(
          rawNodes,
          rawEdges,
          'elk-layered',
          serviceColorMap
        )
        setNodes([...layoutedNodes])
        setEdges([...rawEdges])

        window.requestAnimationFrame(() => {
          fitView({ padding: 0.1, duration: 300 })
        })
      } catch (error) {
        console.error('Layout error:', error)
      } finally {
        setIsLayouting(false)
      }
    },
    [rawNodes, rawEdges, serviceColorMap, setNodes, setEdges, fitView]
  )

  const entityCount = nodes.filter(n => n.type === 'entity').length

  return (
    <div className="h-full w-full bg-gray-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        nodesDraggable={isDragEnabled}
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

      {/* Layout indicator */}
      {isLayouting && (
        <div className="absolute top-4 left-4 bg-gray-800/90 rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-400 animate-pulse">Computing layout...</span>
        </div>
      )}

      {/* Selected entity indicator */}
      {selectedEntity && (
        <div
          className="absolute top-4 left-4 rounded-lg px-3 py-1.5 flex items-center gap-2 bg-gray-800/90 border border-gray-600"
        >
          <span className="text-xs text-white font-medium">
            🔍 {selectedEntity}
          </span>
          <span className="text-[10px] text-gray-400">
            ({connectedEntities.size} connected)
          </span>
          <button
            onClick={() => setSelectedEntity(null)}
            className="text-gray-400 hover:text-white transition-colors ml-1"
            title="Show all entities"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

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
                <div className="w-4 h-0.5 relative">
                  <div className="absolute inset-0" style={{ borderTop: '2px dashed #fbbf24' }}></div>
                  <div className="absolute inset-0 animate-pulse" style={{ borderTop: '2px dashed #fbbf24', opacity: 0.5 }}></div>
                </div>
                <span className="text-gray-400">cross-service</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400">🔑</span>
                <span className="text-gray-400">foreign key</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5" style={{ borderTop: '2px dashed #fbbf24' }}></div>
                <span className="text-gray-400">→ Relation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-orange-500"></div>
                <span className="text-gray-400">Relation →</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">🔗</span>
                <span className="text-gray-400">polymorphic</span>
              </div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-700 flex flex-col gap-1">
            <div className="flex gap-3 items-center">
              <span className="text-gray-500">{selectedEntity ? connectedEntities.size : entityCount} entities</span>
              <span className="text-gray-500">{services.length} services</span>
              {selectedEntity && (
                <button
                  onClick={() => setSelectedEntity(null)}
                  className="ml-auto text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-0.5 rounded transition-colors"
                >
                  Show all
                </button>
              )}
            </div>
            <span className="text-gray-600 text-[10px]">Click entity to filter connections</span>
          </div>
        </div>

        {/* Controls - horizontal */}
        <div className="bg-gray-800/90 rounded-lg flex overflow-hidden">
          {/* Drag mode toggle */}
          <button
            onClick={() => setIsDragEnabled(!isDragEnabled)}
            className={`flex-1 py-2 px-3 transition-colors border-r border-gray-700 flex items-center justify-center gap-1.5 ${
              isDragEnabled
                ? 'bg-yellow-600 text-white'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            title={isDragEnabled ? 'Disable drag mode' : 'Enable drag mode'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
            </svg>
            <span className="text-xs">{isDragEnabled ? 'Drag' : 'Pan'}</span>
          </button>
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
