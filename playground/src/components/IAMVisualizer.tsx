import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import clsx from 'clsx'

interface IAMData {
  roles: any[]
  policies: any[]
  bindings: any[]
}

interface GraphData {
  nodes: Node[]
  edges: Edge[]
}

interface Role {
  id: number
  name: string
  description: string
  policies: Policy[]
}

interface Policy {
  id: number
  name: string
  effect: string
  statements: PolicyStatement[]
}

interface PolicyStatement {
  actions: string[]
  resources: string[]
  conditions: Record<string, any>
}

// Role Form Modal Component
function RoleFormModal({
  editingRole,
  policies,
  onClose,
  onSave,
}: {
  editingRole: Role | null
  policies: Policy[]
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName] = useState(editingRole?.name || '')
  const [description, setDescription] = useState(editingRole?.description || '')
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<number[]>(
    editingRole?.policies.map((p) => p.id) || []
  )
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = {
      name,
      description,
      policy_ids: selectedPolicyIds,
    }

    try {
      if (editingRole) {
        await fetch(`/__iam/roles/${editingRole.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch('/__iam/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      onSave()
      onClose()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const togglePolicy = (policyId: number) => {
    if (selectedPolicyIds.includes(policyId)) {
      setSelectedPolicyIds(selectedPolicyIds.filter((id) => id !== policyId))
    } else {
      setSelectedPolicyIds([...selectedPolicyIds, policyId])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
        <h2 className="text-2xl font-bold text-white mb-4">
          {editingRole ? 'Edit Role' : 'Create New Role'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g., manager"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g., Manager role with property access"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Policies ({selectedPolicyIds.length} selected)
            </label>
            <div className="bg-gray-900 rounded-lg p-3 max-h-64 overflow-auto space-y-2">
              {policies.map((policy) => (
                <label
                  key={policy.id}
                  className="flex items-start gap-3 cursor-pointer hover:bg-gray-800 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedPolicyIds.includes(policy.id)}
                    onChange={() => togglePolicy(policy.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{policy.name}</span>
                      <span
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded',
                          policy.effect === 'ALLOW'
                            ? 'bg-green-900 text-green-300'
                            : 'bg-red-900 text-red-300'
                        )}
                      >
                        {policy.effect}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{policy.statements.length} statement(s)</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              {editingRole ? 'Update Role' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Policy Form Modal Component
function PolicyFormModal({
  editingPolicy,
  onClose,
  onSave,
}: {
  editingPolicy: Policy | null
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName] = useState(editingPolicy?.name || '')
  const [effect, setEffect] = useState(editingPolicy?.effect || 'ALLOW')
  const [statements, setStatements] = useState<PolicyStatement[]>(
    editingPolicy?.statements || [{ actions: [], resources: [], conditions: {} }]
  )
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = {
      name,
      effect,
      statements,
    }

    try {
      if (editingPolicy) {
        await fetch(`/__iam/policies/${editingPolicy.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch('/__iam/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      onSave()
      onClose()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const addStatement = () => {
    setStatements([...statements, { actions: [], resources: [], conditions: {} }])
  }

  const removeStatement = (index: number) => {
    setStatements(statements.filter((_, i) => i !== index))
  }

  const updateStatement = (index: number, field: keyof PolicyStatement, value: any) => {
    const updated = [...statements]
    updated[index] = { ...updated[index], [field]: value }
    setStatements(updated)
  }

  const updateStatementArray = (index: number, field: 'actions' | 'resources', value: string) => {
    const values = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    updateStatement(index, field, values)
  }

  const updateConditions = (index: number, conditionsJson: string) => {
    try {
      const parsed = JSON.parse(conditionsJson)
      updateStatement(index, 'conditions', parsed)
    } catch {
      // Invalid JSON, ignore
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
        <h2 className="text-2xl font-bold text-white mb-4">
          {editingPolicy ? 'Edit Policy' : 'Create New Policy'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g., property_read_only"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Effect</label>
              <select
                value={effect}
                onChange={(e) => setEffect(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-300">Statements ({statements.length})</label>
              <button type="button" onClick={addStatement} className="text-sm text-blue-400 hover:text-blue-300">
                + Add Statement
              </button>
            </div>

            <div className="space-y-4">
              {statements.map((stmt, index) => (
                <div key={index} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-semibold text-gray-300">Statement {index + 1}</span>
                    {statements.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStatement(index)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Actions (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={stmt.actions.join(', ')}
                        onChange={(e) => updateStatementArray(index, 'actions', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                        placeholder="read, query, create, update, delete, *"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Resources (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={stmt.resources.join(', ')}
                        onChange={(e) => updateStatementArray(index, 'resources', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Property, PropertyFloor, PropertyUnit, Person, *"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Conditions (JSON)</label>
                      <textarea
                        value={JSON.stringify(stmt.conditions, null, 2)}
                        onChange={(e) => updateConditions(index, e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm font-mono focus:outline-none focus:border-blue-500"
                        placeholder='{"company_scope": true, "via_hierarchy": true}'
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              {editingPolicy ? 'Update Policy' : 'Create Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function IAMVisualizer() {
  const navigate = useNavigate()
  const location = useLocation()

  // Determine current view from URL
  const viewMode = location.pathname === '/iam/graph'
    ? 'graph'
    : location.pathname === '/iam/roles'
    ? 'roles'
    : location.pathname === '/iam/policies'
    ? 'policies'
    : 'bindings'

  const [data, setData] = useState<IAMData | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Admin functionality state
  const [roles, setRoles] = useState<Role[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [showPolicyForm, setShowPolicyForm] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)

  useEffect(() => {
    loadData()
    loadRoles()
    loadPolicies()
  }, [])

  // Load graph data when navigating to graph tab
  useEffect(() => {
    if (viewMode === 'graph' && !graphData) {
      loadGraph()
    }
  }, [viewMode])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      const url = userId ? `/__iam/data?user_id=${userId}` : '/__iam/data'
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error('Failed to load IAM data')
      }

      setData(result.data)
    } catch (err: any) {
      console.error('IAM data error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadGraph = async () => {
    try {
      const graphUrl = userId ? `/__iam/graph?user_id=${userId}` : '/__iam/graph'
      const graphResponse = await fetch(graphUrl)
      const graphResult = await graphResponse.json()
      setGraphData(graphResult)
    } catch (err: any) {
      console.error('Failed to load graph:', err)
      setError(err.message)
    }
  }

  const loadRoles = async () => {
    try {
      const response = await fetch('/__iam/roles')
      const result = await response.json()
      if (result.success) {
        setRoles(result.data)
      }
    } catch (err: any) {
      console.error('Failed to load roles:', err)
    }
  }

  const loadPolicies = async () => {
    try {
      const response = await fetch('/__iam/policies')
      const result = await response.json()
      if (result.success) {
        setPolicies(result.data)
      }
    } catch (err: any) {
      console.error('Failed to load policies:', err)
    }
  }

  const deleteRole = async (roleId: number) => {
    if (!confirm('Delete this role?')) return

    try {
      await fetch(`/__iam/roles/${roleId}`, { method: 'DELETE' })
      loadRoles()
      loadData() // Refresh bindings data
    } catch (err: any) {
      setError(err.message)
    }
  }

  const deletePolicy = async (policyId: number) => {
    if (!confirm('Delete this policy?')) return

    try {
      await fetch(`/__iam/policies/${policyId}`, { method: 'DELETE' })
      loadPolicies()
      loadRoles() // Reload roles to update their policies
      loadData() // Refresh bindings data
    } catch (err: any) {
      setError(err.message)
    }
  }

  const renderStats = () => {
    if (!data) return null

    const uniqueUsers = new Set(data.bindings.map((b) => b.user_id)).size

    return (
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-2xl font-bold text-white mb-1">{data.bindings.length}</div>
          <div className="text-xs text-gray-400">Bindings</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-2xl font-bold text-white mb-1">{data.roles.length}</div>
          <div className="text-xs text-gray-400">Roles</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-2xl font-bold text-white mb-1">{data.policies.length}</div>
          <div className="text-xs text-gray-400">Policies</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-2xl font-bold text-white mb-1">{uniqueUsers}</div>
          <div className="text-xs text-gray-400">Users</div>
        </div>
      </div>
    )
  }

  const renderTable = () => {
    if (!data || data.bindings.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400">
          No role bindings found. Run seed script to create test data.
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Scope
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Policies
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {data.bindings.map((binding, i) => {
              const user = binding.user || {}
              const role = binding.role || {}
              const roleData = data.roles.find((r) => r.id === role.id) || {}
              const policies = roleData.policies || []

              const scopeLabel = binding.scope_type
                ? `${binding.scope_type}:${binding.scope_id}`
                : 'global'

              return (
                <tr key={i} className="hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{user.username || `User ${user.id}`}</div>
                    {user.email && <div className="text-xs text-gray-500">{user.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-200">
                      {role.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-purple-900 text-purple-200">
                      {scopeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {policies.length > 0 ? (
                        policies.map((p: any, j: number) => (
                          <span
                            key={j}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-200"
                          >
                            {p.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-500 text-xs">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const renderFlow = () => {
    if (!graphData) {
      return (
        <div className="flex items-center justify-center h-96 text-gray-400">
          Loading graph...
        </div>
      )
    }

    const { nodes, edges } = graphData

    // Dark theme node styles
    const nodeTypes = {
      user: ({ data }: any) => (
        <div className="px-4 py-3 rounded-lg bg-blue-600 text-white border border-blue-500 shadow-lg min-w-[140px]">
          <div className="text-lg mb-1">👤</div>
          <div className="font-semibold text-sm">{data.label}</div>
          {data.email && <div className="text-xs opacity-75 mt-0.5">{data.email}</div>}
        </div>
      ),
      role: ({ data }: any) => (
        <div className="px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 font-medium min-w-[160px]">
          <div className="text-lg mb-1">🎭</div>
          <div className="text-sm">{data.label}</div>
        </div>
      ),
      policy: ({ data }: any) => (
        <div className="px-4 py-3 rounded-lg bg-gray-800 text-gray-200 border border-gray-600 font-medium min-w-[180px]">
          <div className="text-lg mb-1">📜</div>
          <div className="text-sm">{data.label}</div>
          <div className="text-xs text-gray-400 mt-1">{data.effect}</div>
        </div>
      ),
    }

    return (
      <div className="h-[600px] rounded-lg overflow-hidden border border-gray-700">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes as any}
          fitView
          className="bg-gray-900"
        >
          <Background color="#374151" />
          <Controls className="bg-gray-800 border border-gray-700" />
          <MiniMap
            className="bg-gray-800 border border-gray-700"
            maskColor="rgba(0, 0, 0, 0.6)"
          />
        </ReactFlow>
      </div>
    )
  }

  const renderRolesTab = () => {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Roles Management ({roles.length})</h3>
          <button
            onClick={() => {
              setEditingRole(null)
              setShowRoleForm(true)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Create Role
          </button>
        </div>

        <div className="grid gap-3">
          {roles.map((role) => (
            <div key={role.id} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-lg font-bold text-white mb-1">{role.name}</h4>
                  <p className="text-sm text-gray-400">{role.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingRole(role)
                      setShowRoleForm(true)
                    }}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteRole(role.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {role.policies.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-500 mb-2">POLICIES ({role.policies.length})</div>
                  <div className="space-y-2">
                    {role.policies.map((policy) => (
                      <div key={policy.id} className="bg-gray-800 rounded p-2 text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-white">{policy.name}</span>
                          <span className={clsx(
                            'text-xs px-2 py-0.5 rounded',
                            policy.effect === 'ALLOW' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                          )}>
                            {policy.effect}
                          </span>
                        </div>
                        {policy.statements.map((stmt, idx) => (
                          <div key={idx} className="text-xs text-gray-400 mt-1">
                            <span className="text-blue-400">Actions:</span> {stmt.actions.join(', ')} |{' '}
                            <span className="text-purple-400">Resources:</span> {stmt.resources.join(', ')}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderPoliciesTab = () => {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Policies Management ({policies.length})</h3>
          <button
            onClick={() => {
              setEditingPolicy(null)
              setShowPolicyForm(true)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Create Policy
          </button>
        </div>

        <div className="grid gap-3">
          {policies.map((policy) => (
            <div key={policy.id} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-lg font-bold text-white">{policy.name}</h4>
                    <span className={clsx(
                      'text-xs px-2 py-1 rounded font-medium',
                      policy.effect === 'ALLOW' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                    )}>
                      {policy.effect}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingPolicy(policy)
                      setShowPolicyForm(true)
                    }}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deletePolicy(policy.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-3">
                {policy.statements.map((stmt, idx) => (
                  <div key={idx} className="bg-gray-800 rounded p-3 text-sm">
                    <div className="font-semibold text-gray-300 mb-1">Statement {idx + 1}</div>
                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="text-blue-400 font-medium">Actions:</span>{' '}
                        <span className="text-gray-300">{stmt.actions.join(', ')}</span>
                      </div>
                      <div>
                        <span className="text-purple-400 font-medium">Resources:</span>{' '}
                        <span className="text-gray-300">{stmt.resources.join(', ')}</span>
                      </div>
                      {Object.keys(stmt.conditions).length > 0 && (
                        <div>
                          <span className="text-yellow-400 font-medium">Conditions:</span>{' '}
                          <pre className="text-gray-400 mt-1 text-xs">{JSON.stringify(stmt.conditions, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 p-6 min-h-full">
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">IAM Visualizer</h1>
          <p className="text-sm text-gray-400">Role Bindings, Policies & Permissions</p>
        </div>

        {/* Controls */}
        <div className="flex gap-3 items-center mb-6">
          <input
            type="number"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Filter by User ID..."
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Stats */}
        {data && renderStats()}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => navigate('/iam')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              viewMode === 'bindings'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            )}
          >
            👥 Bindings
          </button>
          <button
            onClick={() => navigate('/iam/graph')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              viewMode === 'graph'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            )}
          >
            📊 Graph
          </button>
          <button
            onClick={() => navigate('/iam/roles')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              viewMode === 'roles'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            )}
          >
            🔑 Roles
          </button>
          <button
            onClick={() => navigate('/iam/policies')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              viewMode === 'policies'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            )}
          >
            📋 Policies
          </button>
        </div>

        {/* Content */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-400 text-sm">Loading IAM data...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-800 text-red-300 p-4 rounded-lg">
              <p className="font-semibold text-sm">Error loading IAM data</p>
              <p className="mt-1 text-xs">{error}</p>
              <p className="mt-2 text-xs text-gray-400">
                Make sure IAM service is running and accessible at /__iam/data
              </p>
            </div>
          )}

          {!loading && !error && (
            <>
              {viewMode === 'bindings' && renderTable()}
              {viewMode === 'graph' && renderFlow()}
              {viewMode === 'roles' && renderRolesTab()}
              {viewMode === 'policies' && renderPoliciesTab()}
            </>
          )}
        </div>

        {/* Modals */}
        {showRoleForm && (
          <RoleFormModal
            editingRole={editingRole}
            policies={policies}
            onClose={() => {
              setShowRoleForm(false)
              setEditingRole(null)
            }}
            onSave={() => {
              loadRoles()
              loadData()
            }}
          />
        )}
        {showPolicyForm && (
          <PolicyFormModal
            editingPolicy={editingPolicy}
            onClose={() => {
              setShowPolicyForm(false)
              setEditingPolicy(null)
            }}
            onSave={() => {
              loadPolicies()
              loadRoles()
              loadData()
            }}
          />
        )}
      </div>
    </div>
  )
}
