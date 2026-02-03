import { useState, useEffect } from 'react'
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

interface GraphData {
  nodes: Node[]
  edges: Edge[]
}

type TabMode = 'roles' | 'policies' | 'graph'

export default function IAMAdmin() {
  const [tabMode, setTabMode] = useState<TabMode>('roles')
  const [roles, setRoles] = useState<Role[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [showPolicyForm, setShowPolicyForm] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)

  useEffect(() => {
    loadRoles()
    loadPolicies()
  }, [])

  useEffect(() => {
    if (tabMode === 'graph') {
      loadGraph()
    }
  }, [tabMode])

  const loadRoles = async () => {
    try {
      const response = await fetch('/__iam/roles')
      const result = await response.json()
      if (result.success) {
        setRoles(result.data)
      }
    } catch (err: any) {
      setError(err.message)
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
      setError(err.message)
    }
  }

  const loadGraph = async () => {
    try {
      const response = await fetch('/__iam/roles/graph')
      const result = await response.json()
      if (result.success) {
        setGraphData(result)
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  const deleteRole = async (roleId: number) => {
    if (!confirm('Delete this role?')) return

    try {
      await fetch(`/__iam/roles/${roleId}`, { method: 'DELETE' })
      loadRoles()
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
    } catch (err: any) {
      setError(err.message)
    }
  }

  const renderRolesTab = () => {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Roles ({roles.length})</h2>
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

        <div className="grid gap-4">
          {roles.map((role) => (
            <div key={role.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{role.name}</h3>
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
                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-400 mb-2">POLICIES ({role.policies.length})</div>
                  <div className="space-y-2">
                    {role.policies.map((policy) => (
                      <div key={policy.id} className="bg-gray-900 rounded p-3 text-sm">
                        <div className="flex justify-between items-start mb-2">
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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Policies ({policies.length})</h2>
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

        <div className="grid gap-4">
          {policies.map((policy) => (
            <div key={policy.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-xl font-bold text-white">{policy.name}</h3>
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

              <div className="space-y-3 mt-4">
                {policy.statements.map((stmt, idx) => (
                  <div key={idx} className="bg-gray-900 rounded p-4 text-sm">
                    <div className="font-semibold text-gray-300 mb-2">Statement {idx + 1}</div>
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

  const renderGraphTab = () => {
    if (!graphData) {
      return <div className="text-white">Loading graph...</div>
    }

    return (
      <div className="h-full">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-white mb-2">IAM Roles & Policies Graph</h2>
          <p className="text-sm text-gray-400">Visual representation of roles and their attached policies</p>
        </div>
        <div className="h-[calc(100vh-250px)] bg-gray-900 rounded-lg border border-gray-700">
          <ReactFlow
            nodes={graphData.nodes}
            edges={graphData.edges}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>
    )
  }

  // Role Form Component
  const renderRoleForm = () => {
    const [name, setName] = useState(editingRole?.name || '')
    const [description, setDescription] = useState(editingRole?.description || '')
    const [selectedPolicyIds, setSelectedPolicyIds] = useState<number[]>(
      editingRole?.policies.map(p => p.id) || []
    )

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()

      const payload = {
        name,
        description,
        policy_ids: selectedPolicyIds
      }

      try {
        if (editingRole) {
          // Update existing role
          await fetch(`/__iam/roles/${editingRole.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        } else {
          // Create new role
          await fetch('/__iam/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        }

        setShowRoleForm(false)
        setEditingRole(null)
        loadRoles()
      } catch (err: any) {
        setError(err.message)
      }
    }

    const togglePolicy = (policyId: number) => {
      if (selectedPolicyIds.includes(policyId)) {
        setSelectedPolicyIds(selectedPolicyIds.filter(id => id !== policyId))
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
                  <label key={policy.id} className="flex items-start gap-3 cursor-pointer hover:bg-gray-800 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={selectedPolicyIds.includes(policy.id)}
                      onChange={() => togglePolicy(policy.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{policy.name}</span>
                        <span className={clsx(
                          'text-xs px-2 py-0.5 rounded',
                          policy.effect === 'ALLOW' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                        )}>
                          {policy.effect}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {policy.statements.length} statement(s)
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowRoleForm(false)
                  setEditingRole(null)
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                {editingRole ? 'Update Role' : 'Create Role'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Policy Form Component
  const renderPolicyForm = () => {
    const [name, setName] = useState(editingPolicy?.name || '')
    const [effect, setEffect] = useState(editingPolicy?.effect || 'ALLOW')
    const [statements, setStatements] = useState<PolicyStatement[]>(
      editingPolicy?.statements || [{ actions: [], resources: [], conditions: {} }]
    )

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()

      const payload = {
        name,
        effect,
        statements
      }

      try {
        if (editingPolicy) {
          // Update existing policy
          await fetch(`/__iam/policies/${editingPolicy.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        } else {
          // Create new policy
          await fetch('/__iam/policies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        }

        setShowPolicyForm(false)
        setEditingPolicy(null)
        loadPolicies()
        loadRoles() // Refresh roles to show updated policies
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
      const values = value.split(',').map(v => v.trim()).filter(Boolean)
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
                <label className="block text-sm font-medium text-gray-300">
                  Statements ({statements.length})
                </label>
                <button
                  type="button"
                  onClick={addStatement}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
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
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Conditions (JSON)
                        </label>
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

            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowPolicyForm(false)
                  setEditingPolicy(null)
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                {editingPolicy ? 'Update Policy' : 'Create Policy'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 p-6">
      {/* Header with tabs */}
      <div className="flex items-center justify-between mb-6 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-bold text-white">IAM Administration</h1>

        <div className="flex bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setTabMode('roles')}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              tabMode === 'roles' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            )}
          >
            🔑 Roles
          </button>
          <button
            onClick={() => setTabMode('policies')}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              tabMode === 'policies' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            )}
          >
            📋 Policies
          </button>
          <button
            onClick={() => setTabMode('graph')}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              tabMode === 'graph' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            )}
          >
            📊 Graph
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tabMode === 'roles' && renderRolesTab()}
        {tabMode === 'policies' && renderPoliciesTab()}
        {tabMode === 'graph' && renderGraphTab()}
      </div>

      {/* Modals */}
      {showRoleForm && renderRoleForm()}
      {showPolicyForm && renderPolicyForm()}
    </div>
  )
}
