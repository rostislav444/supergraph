"""
IAM visualization endpoints for Playground.

Provides endpoints to fetch IAM role bindings, policies, and visualize them.
"""

from typing import Any, Optional
from fastapi import APIRouter, Query, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, delete as sql_delete, insert
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
import os


router = APIRouter(prefix="/__iam", tags=["iam"])

# Database connection for IAM
DATABASE_URL = os.getenv("IAM_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/iam_db")
engine = create_async_engine(DATABASE_URL)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    """Get database session."""
    async with async_session_factory() as session:
        yield session


async def fetch_iam_data(session: AsyncSession, user_id: Optional[int] = None) -> dict[str, Any]:
    """
    Fetch IAM data from database.

    Returns:
        {
            "roles": [...],
            "policies": [...],
            "bindings": [...]
        }
    """
    # Define models inline to avoid import issues
    try:
        from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, Enum, Table
        from sqlalchemy.orm import declarative_base, relationship
        import enum

        Base = declarative_base()

        class PolicyEffect(str, enum.Enum):
            ALLOW = "allow"
            DENY = "deny"

        # Association table for many-to-many relationship
        role_policies = Table(
            'iam_role_policies',
            Base.metadata,
            Column('role_id', Integer, ForeignKey('iam_roles.id'), primary_key=True),
            Column('policy_id', Integer, ForeignKey('iam_policies.id'), primary_key=True)
        )

        class Role(Base):
            __tablename__ = 'iam_roles'
            id = Column(Integer, primary_key=True)
            name = Column(String)
            description = Column(String)
            policies = relationship('Policy', secondary=role_policies, lazy='selectin')

        class Policy(Base):
            __tablename__ = 'iam_policies'
            id = Column(Integer, primary_key=True)
            name = Column(String)
            effect = Column(String)
            statements = Column(JSON)

        class RoleBinding(Base):
            __tablename__ = 'iam_role_bindings'
            id = Column(Integer, primary_key=True)
            user_id = Column(Integer, ForeignKey('users.id'))
            role_id = Column(Integer, ForeignKey('iam_roles.id'))
            scope_type = Column(String, nullable=True)
            scope_id = Column(Integer, nullable=True)
            role = relationship('Role', lazy='selectin')
            user = relationship('User', lazy='selectin')

        class User(Base):
            __tablename__ = 'users'
            id = Column(Integer, primary_key=True)
            username = Column(String)
            email = Column(String)

        # Fetch roles with policies
        roles_result = await session.execute(
            select(Role).options(selectinload(Role.policies))
        )
        roles_orm = roles_result.scalars().all()

        # Fetch bindings with relations
        bindings_query = select(RoleBinding).options(
            selectinload(RoleBinding.role),
            selectinload(RoleBinding.user)
        )
        if user_id is not None:
            bindings_query = bindings_query.where(RoleBinding.user_id == user_id)

        bindings_result = await session.execute(bindings_query)
        bindings_orm = bindings_result.scalars().all()

        # Convert to dictionaries
        roles = []
        for role in roles_orm:
            roles.append({
                "id": role.id,
                "name": role.name,
                "description": role.description,
                "policies": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "effect": p.effect,
                        "statements": p.statements
                    }
                    for p in role.policies
                ]
            })

        bindings = []
        for binding in bindings_orm:
            bindings.append({
                "id": binding.id,
                "user_id": binding.user_id,
                "role_id": binding.role_id,
                "scope_type": binding.scope_type,
                "scope_id": binding.scope_id,
                "role": {
                    "id": binding.role.id,
                    "name": binding.role.name
                } if binding.role else None,
                "user": {
                    "id": binding.user.id,
                    "username": binding.user.username,
                    "email": binding.user.email
                } if binding.user else None
            })

        # Extract all policies from roles
        policies = []
        policy_ids = set()
        for role in roles:
            for policy in role.get("policies", []):
                if policy["id"] not in policy_ids:
                    policies.append(policy)
                    policy_ids.add(policy["id"])

        return {
            "roles": roles,
            "policies": policies,
            "bindings": bindings
        }
    except Exception as e:
        print(f"Error fetching IAM data: {e}")
        return {
            "roles": [],
            "policies": [],
            "bindings": []
        }


@router.get("/data")
async def get_iam_data(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    session: AsyncSession = Depends(get_db)
):
    """
    Get IAM data for visualization.

    Returns roles, policies, and bindings in a format suitable for visualization.
    """
    data = await fetch_iam_data(session, user_id)

    return {
        "success": True,
        "data": data
    }


@router.get("/graph")
async def get_iam_graph(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    session: AsyncSession = Depends(get_db)
):
    """
    Get IAM data as graph structure for React Flow.

    Returns nodes and edges for visualization.
    """
    data = await fetch_iam_data(session, user_id=None)

    # Filter by user_id if provided
    bindings = data["bindings"]
    if user_id is not None:
        bindings = [b for b in bindings if b["user_id"] == user_id]

    nodes = []
    edges = []

    # Track unique users
    user_ids = set()

    # Create nodes and edges from bindings
    for binding in bindings:
        user = binding.get("user", {})
        role = binding.get("role", {})

        # User node
        user_node_id = f"user_{user['id']}"
        if user_node_id not in user_ids:
            nodes.append({
                "id": user_node_id,
                "type": "user",
                "data": {
                    "label": user.get("username", f"User {user['id']}"),
                    "email": user.get("email"),
                },
                "position": {"x": 100, "y": len(user_ids) * 150}
            })
            user_ids.add(user_node_id)

        # Role node
        role_node_id = f"role_{role['id']}"
        scope_label = ""
        if binding.get("scope_type"):
            scope_label = f" @ {binding['scope_type']}:{binding['scope_id']}"

        nodes.append({
            "id": role_node_id + f"_binding_{binding['id']}",
            "type": "role",
            "data": {
                "label": role.get("name") + scope_label,
                "scope_type": binding.get("scope_type"),
                "scope_id": binding.get("scope_id")
            },
            "position": {"x": 400, "y": len(edges) * 100}
        })

        # Edge: User -> Role
        edges.append({
            "id": f"edge_{binding['id']}",
            "source": user_node_id,
            "target": role_node_id + f"_binding_{binding['id']}",
            "type": "default",
            "animated": False
        })

        # Find policies for this role
        role_full = next((r for r in data["roles"] if r["id"] == role["id"]), None)
        if role_full:
            for policy in role_full.get("policies", []):
                policy_node_id = f"policy_{policy['id']}"

                # Policy node (only add once)
                if not any(n["id"] == policy_node_id for n in nodes):
                    nodes.append({
                        "id": policy_node_id,
                        "type": "policy",
                        "data": {
                            "label": policy.get("name"),
                            "effect": policy.get("effect"),
                            "statements": policy.get("statements", [])
                        },
                        "position": {"x": 700, "y": len(nodes) * 80}
                    })

                # Edge: Role -> Policy
                edge_id = f"edge_role_{role['id']}_policy_{policy['id']}"
                if not any(e["id"] == edge_id for e in edges):
                    edges.append({
                        "id": edge_id,
                        "source": role_node_id + f"_binding_{binding['id']}",
                        "target": policy_node_id,
                        "type": "default",
                        "animated": False
                    })

    return {
        "success": True,
        "nodes": nodes,
        "edges": edges
    }


@router.get("/tree")
async def get_iam_tree(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    session: AsyncSession = Depends(get_db)
):
    """
    Get IAM data as hierarchical tree structure.

    Returns nested tree for visualization.
    """
    data = await fetch_iam_data(session, user_id=None)

    # Filter by user_id if provided
    bindings = data["bindings"]
    if user_id is not None:
        bindings = [b for b in bindings if b["user_id"] == user_id]

    # Build tree: User -> RoleBindings -> Roles -> Policies
    tree = []

    # Group bindings by user
    users_map = {}
    for binding in bindings:
        user = binding.get("user", {})
        user_id = user["id"]

        if user_id not in users_map:
            users_map[user_id] = {
                "id": user_id,
                "username": user.get("username"),
                "email": user.get("email"),
                "bindings": []
            }

        users_map[user_id]["bindings"].append(binding)

    # Build tree structure
    for user_id, user_data in users_map.items():
        user_node = {
            "type": "user",
            "label": f"User: {user_data['username']} ({user_data['email']})",
            "children": []
        }

        for binding in user_data["bindings"]:
            role = binding.get("role", {})
            scope_label = ""
            if binding.get("scope_type"):
                scope_label = f" @ {binding['scope_type']}:{binding['scope_id']}"

            role_node = {
                "type": "role",
                "label": f"Role: {role.get('name')}{scope_label}",
                "children": []
            }

            # Find full role data with policies
            role_full = next((r for r in data["roles"] if r["id"] == role["id"]), None)
            if role_full:
                for policy in role_full.get("policies", []):
                    policy_node = {
                        "type": "policy",
                        "label": f"Policy: {policy.get('name')} ({policy.get('effect')})",
                        "children": []
                    }

                    # Add statements as children
                    for i, statement in enumerate(policy.get("statements", [])):
                        actions = statement.get("actions", [])
                        resources = statement.get("resources", [])
                        conditions = statement.get("conditions", {})

                        statement_node = {
                            "type": "statement",
                            "label": f"Statement {i+1}",
                            "children": [
                                {
                                    "type": "detail",
                                    "label": f"Actions: {', '.join(actions)}"
                                },
                                {
                                    "type": "detail",
                                    "label": f"Resources: {', '.join(resources)}"
                                },
                                {
                                    "type": "detail",
                                    "label": f"Conditions: {conditions if conditions else 'None'}"
                                }
                            ]
                        }

                        policy_node["children"].append(statement_node)

                    role_node["children"].append(policy_node)

            user_node["children"].append(role_node)

        tree.append(user_node)

    return {
        "success": True,
        "tree": tree
    }


# =============================================================================
# Pydantic models for request/response
# =============================================================================

class PolicyStatementModel(BaseModel):
    """Policy statement model."""
    actions: list[str]
    resources: list[str]
    conditions: dict = {}


class PolicyCreateModel(BaseModel):
    """Policy creation model."""
    name: str
    effect: str  # "ALLOW" or "DENY"
    statements: list[PolicyStatementModel]


class PolicyUpdateModel(BaseModel):
    """Policy update model."""
    name: Optional[str] = None
    effect: Optional[str] = None
    statements: Optional[list[PolicyStatementModel]] = None


class RoleCreateModel(BaseModel):
    """Role creation model."""
    name: str
    description: str = ""
    policy_ids: list[int] = []


class RoleUpdateModel(BaseModel):
    """Role update model."""
    name: Optional[str] = None
    description: Optional[str] = None
    policy_ids: Optional[list[int]] = None


# =============================================================================
# Helper function to get models
# =============================================================================

def get_models():
    """Get SQLAlchemy models."""
    from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, Enum, Table
    from sqlalchemy.orm import declarative_base, relationship
    import enum

    Base = declarative_base()

    class PolicyEffect(str, enum.Enum):
        ALLOW = "allow"
        DENY = "deny"

    # Association table for many-to-many relationship
    role_policies = Table(
        'iam_role_policies',
        Base.metadata,
        Column('role_id', Integer, ForeignKey('iam_roles.id'), primary_key=True),
        Column('policy_id', Integer, ForeignKey('iam_policies.id'), primary_key=True)
    )

    class Role(Base):
        __tablename__ = 'iam_roles'
        id = Column(Integer, primary_key=True)
        name = Column(String)
        description = Column(String)
        policies = relationship('Policy', secondary=role_policies, lazy='selectin')

    class Policy(Base):
        __tablename__ = 'iam_policies'
        id = Column(Integer, primary_key=True)
        name = Column(String)
        effect = Column(String)
        statements = Column(JSON)

    return Base, Role, Policy, role_policies


# =============================================================================
# CRUD Endpoints for Roles
# =============================================================================

@router.get("/roles")
async def list_roles(session: AsyncSession = Depends(get_db)):
    """
    Get list of all roles with their policies.
    """
    try:
        _, Role, Policy, _ = get_models()

        result = await session.execute(
            select(Role).options(selectinload(Role.policies))
        )
        roles_orm = result.scalars().all()

        roles = []
        for role in roles_orm:
            roles.append({
                "id": role.id,
                "name": role.name,
                "description": role.description,
                "policies": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "effect": p.effect,
                        "statements": p.statements
                    }
                    for p in role.policies
                ]
            })

        return {
            "success": True,
            "data": roles
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/roles")
async def create_role(
    role_data: RoleCreateModel,
    session: AsyncSession = Depends(get_db)
):
    """
    Create a new role with optional policy associations.
    """
    try:
        _, Role, Policy, _ = get_models()

        # Check if role with same name exists
        result = await session.execute(
            select(Role).where(Role.name == role_data.name)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Role '{role_data.name}' already exists")

        # Fetch policies if policy_ids provided
        policies = []
        if role_data.policy_ids:
            result = await session.execute(
                select(Policy).where(Policy.id.in_(role_data.policy_ids))
            )
            policies = list(result.scalars().all())

        # Create role
        new_role = Role(
            name=role_data.name,
            description=role_data.description,
            policies=policies
        )
        session.add(new_role)
        await session.commit()
        await session.refresh(new_role)

        return {
            "success": True,
            "data": {
                "id": new_role.id,
                "name": new_role.name,
                "description": new_role.description,
                "policy_ids": role_data.policy_ids
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/roles/{role_id}")
async def update_role(
    role_id: int,
    role_data: RoleUpdateModel,
    session: AsyncSession = Depends(get_db)
):
    """
    Update an existing role.
    """
    try:
        _, Role, Policy, _ = get_models()

        # Fetch role
        result = await session.execute(
            select(Role).where(Role.id == role_id).options(selectinload(Role.policies))
        )
        role = result.scalar_one_or_none()

        if not role:
            raise HTTPException(status_code=404, detail=f"Role {role_id} not found")

        # Update fields
        if role_data.name is not None:
            role.name = role_data.name
        if role_data.description is not None:
            role.description = role_data.description
        if role_data.policy_ids is not None:
            # Update policies
            result = await session.execute(
                select(Policy).where(Policy.id.in_(role_data.policy_ids))
            )
            role.policies = list(result.scalars().all())

        await session.commit()
        await session.refresh(role)

        return {
            "success": True,
            "data": {
                "id": role.id,
                "name": role.name,
                "description": role.description,
                "policies": [p.id for p in role.policies]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: int,
    session: AsyncSession = Depends(get_db)
):
    """
    Delete a role.
    """
    try:
        _, Role, _, _ = get_models()

        # Fetch role
        result = await session.execute(
            select(Role).where(Role.id == role_id)
        )
        role = result.scalar_one_or_none()

        if not role:
            raise HTTPException(status_code=404, detail=f"Role {role_id} not found")

        await session.delete(role)
        await session.commit()

        return {
            "success": True,
            "message": f"Role {role_id} deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CRUD Endpoints for Policies
# =============================================================================

@router.get("/policies")
async def list_policies(session: AsyncSession = Depends(get_db)):
    """
    Get list of all policies.
    """
    try:
        _, _, Policy, _ = get_models()

        result = await session.execute(select(Policy))
        policies_orm = result.scalars().all()

        policies = []
        for policy in policies_orm:
            policies.append({
                "id": policy.id,
                "name": policy.name,
                "effect": policy.effect,
                "statements": policy.statements
            })

        return {
            "success": True,
            "data": policies
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/policies")
async def create_policy(
    policy_data: PolicyCreateModel,
    session: AsyncSession = Depends(get_db)
):
    """
    Create a new policy.
    """
    try:
        _, _, Policy, _ = get_models()

        # Check if policy with same name exists
        result = await session.execute(
            select(Policy).where(Policy.name == policy_data.name)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Policy '{policy_data.name}' already exists")

        # Convert statements to dict
        statements = [stmt.model_dump() for stmt in policy_data.statements]

        # Create policy
        new_policy = Policy(
            name=policy_data.name,
            effect=policy_data.effect,
            statements=statements
        )
        session.add(new_policy)
        await session.commit()
        await session.refresh(new_policy)

        return {
            "success": True,
            "data": {
                "id": new_policy.id,
                "name": new_policy.name,
                "effect": new_policy.effect,
                "statements": new_policy.statements
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/policies/{policy_id}")
async def update_policy(
    policy_id: int,
    policy_data: PolicyUpdateModel,
    session: AsyncSession = Depends(get_db)
):
    """
    Update an existing policy.
    """
    try:
        _, _, Policy, _ = get_models()

        # Fetch policy
        result = await session.execute(
            select(Policy).where(Policy.id == policy_id)
        )
        policy = result.scalar_one_or_none()

        if not policy:
            raise HTTPException(status_code=404, detail=f"Policy {policy_id} not found")

        # Update fields
        if policy_data.name is not None:
            policy.name = policy_data.name
        if policy_data.effect is not None:
            policy.effect = policy_data.effect
        if policy_data.statements is not None:
            statements = [stmt.model_dump() for stmt in policy_data.statements]
            policy.statements = statements

        await session.commit()
        await session.refresh(policy)

        return {
            "success": True,
            "data": {
                "id": policy.id,
                "name": policy.name,
                "effect": policy.effect,
                "statements": policy.statements
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/policies/{policy_id}")
async def delete_policy(
    policy_id: int,
    session: AsyncSession = Depends(get_db)
):
    """
    Delete a policy.
    """
    try:
        _, _, Policy, _ = get_models()

        # Fetch policy
        result = await session.execute(
            select(Policy).where(Policy.id == policy_id)
        )
        policy = result.scalar_one_or_none()

        if not policy:
            raise HTTPException(status_code=404, detail=f"Policy {policy_id} not found")

        await session.delete(policy)
        await session.commit()

        return {
            "success": True,
            "message": f"Policy {policy_id} deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Role-Policy Association Endpoints
# =============================================================================

@router.post("/roles/{role_id}/policies/{policy_id}")
async def attach_policy_to_role(
    role_id: int,
    policy_id: int,
    session: AsyncSession = Depends(get_db)
):
    """
    Attach a policy to a role.
    """
    try:
        _, Role, Policy, role_policies = get_models()

        # Check if role and policy exist
        role_result = await session.execute(
            select(Role).where(Role.id == role_id).options(selectinload(Role.policies))
        )
        role = role_result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=404, detail=f"Role {role_id} not found")

        policy_result = await session.execute(
            select(Policy).where(Policy.id == policy_id)
        )
        policy = policy_result.scalar_one_or_none()
        if not policy:
            raise HTTPException(status_code=404, detail=f"Policy {policy_id} not found")

        # Check if already attached
        if policy in role.policies:
            return {
                "success": True,
                "message": f"Policy {policy_id} already attached to role {role_id}"
            }

        # Attach policy
        role.policies.append(policy)
        await session.commit()

        return {
            "success": True,
            "message": f"Policy {policy_id} attached to role {role_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/roles/{role_id}/policies/{policy_id}")
async def detach_policy_from_role(
    role_id: int,
    policy_id: int,
    session: AsyncSession = Depends(get_db)
):
    """
    Detach a policy from a role.
    """
    try:
        _, Role, Policy, _ = get_models()

        # Fetch role with policies
        role_result = await session.execute(
            select(Role).where(Role.id == role_id).options(selectinload(Role.policies))
        )
        role = role_result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=404, detail=f"Role {role_id} not found")

        # Find and remove policy
        policy_to_remove = None
        for policy in role.policies:
            if policy.id == policy_id:
                policy_to_remove = policy
                break

        if not policy_to_remove:
            raise HTTPException(status_code=404, detail=f"Policy {policy_id} not attached to role {role_id}")

        role.policies.remove(policy_to_remove)
        await session.commit()

        return {
            "success": True,
            "message": f"Policy {policy_id} detached from role {role_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Role Definition Graph Endpoint (for React Flow)
# =============================================================================

@router.get("/roles/graph")
async def get_roles_graph(session: AsyncSession = Depends(get_db)):
    """
    Get roles and policies as a graph for React Flow visualization.

    Returns nodes and edges showing Role -> Policy -> Statements relationships.
    """
    try:
        _, Role, _, _ = get_models()

        # Fetch all roles with policies
        result = await session.execute(
            select(Role).options(selectinload(Role.policies))
        )
        roles_orm = result.scalars().all()

        nodes = []
        edges = []

        # Create role nodes
        for i, role in enumerate(roles_orm):
            role_node_id = f"role_{role.id}"
            nodes.append({
                "id": role_node_id,
                "type": "role",
                "data": {
                    "label": role.name,
                    "description": role.description,
                    "type": "role"
                },
                "position": {"x": 100, "y": i * 200}
            })

            # Create policy nodes and edges
            for j, policy in enumerate(role.policies):
                policy_node_id = f"policy_{policy.id}"

                # Add policy node if not exists
                if not any(n["id"] == policy_node_id for n in nodes):
                    nodes.append({
                        "id": policy_node_id,
                        "type": "policy",
                        "data": {
                            "label": policy.name,
                            "effect": policy.effect,
                            "statements_count": len(policy.statements),
                            "statements": policy.statements,
                            "type": "policy"
                        },
                        "position": {"x": 500, "y": len(nodes) * 100}
                    })

                # Add edge from role to policy
                edge_id = f"edge_{role.id}_{policy.id}"
                if not any(e["id"] == edge_id for e in edges):
                    edges.append({
                        "id": edge_id,
                        "source": role_node_id,
                        "target": policy_node_id,
                        "type": "default",
                        "animated": False
                    })

        return {
            "success": True,
            "nodes": nodes,
            "edges": edges
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
