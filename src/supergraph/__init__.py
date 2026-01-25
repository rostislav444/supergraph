"""
Supergraph - JSON Query DSL runtime for microservices.

A replacement for GraphQL Federation that uses:
- JSON Query DSL instead of GraphQL
- Execution plan (DAG) built from query
- IAM guards injected at plan level

Usage:
    from supergraph import create_supergraph_app, JSONQuery
    from fastapi import FastAPI

    app = FastAPI()
    graph = {...}  # Your compiled graph
    app.include_router(create_supergraph_app(graph))
"""

from __future__ import annotations

from typing import Optional

from .api import create_supergraph_app, router
from .core import (
    AccessDef,
    AccessIR,
    CompilationError,
    CompilationResult,
    compile_graph,
    EntityDef,
    EntityIR,
    ExecutionError,
    FieldDef,
    FieldIR,
    GraphCompiler,
    GraphConfigError,
    GraphDef,
    GraphRegistry,
    IAMError,
    InternalQueryRequest,
    InternalQueryResponse,
    JSONQuery,
    NormalizedFilter,
    NormalizedOrder,
    NormalizedQuery,
    NormalizedSelectionNode,
    PaginationInfo,
    QueryValidator,
    RefDef,
    RefIR,
    RelationDef,
    RelationIR,
    SelectionNode,
    ServiceDef,
    ServiceError,
    ServiceIR,
    SupergraphError,
    ThroughDef,
    ThroughIR,
    ValidationError,
)
from .iam import IAMResponse, IAMScope, IAMService, inject_guards
from .runtime import (
    ExecutionContext,
    PlanExecutor,
    PlanStep,
    Principal,
    QueryPlanner,
    ResponseAssembler,
    ServiceClient,
)
from .viewsets import (
    AccessConfig,
    AttachRelation,
    ModelViewSet,
    Ref,
    RelationConfig,
    RelationsViewSet,
    Through,
    Subscription,
    SubscriptionConfig,
    CacheConfig,
    init_cache_handlers,
)
from .gateway import Gateway
from .playground import get_playground_html, mount_playground
from .service import (
    Base,
    InternalRouter,
    close_db,
    create_internal_router,
    create_service_app,
    get_engine,
    get_service_schema,
    get_session,
    init_db,
)

__version__ = "0.1.0"

__all__ = [
    # API
    "router",
    "create_supergraph_app",
    # Core definitions
    "ServiceDef",
    "FieldDef",
    "ThroughDef",
    "RefDef",
    "RelationDef",
    "AccessDef",
    "EntityDef",
    "GraphDef",
    # Errors
    "SupergraphError",
    "ValidationError",
    "ExecutionError",
    "ServiceError",
    "GraphConfigError",
    "IAMError",
    # Query types
    "NormalizedFilter",
    "NormalizedOrder",
    "SelectionNode",
    "JSONQuery",
    "NormalizedSelectionNode",
    "NormalizedQuery",
    "InternalQueryRequest",
    "InternalQueryResponse",
    "PaginationInfo",
    # Validator
    "QueryValidator",
    # Registry
    "GraphRegistry",
    "EntityIR",
    "FieldIR",
    "RelationIR",
    "ThroughIR",
    "RefIR",
    "AccessIR",
    "ServiceIR",
    # Compiler
    "GraphCompiler",
    "CompilationResult",
    "CompilationError",
    "compile_graph",
    # Runtime
    "Principal",
    "ExecutionContext",
    "ServiceClient",
    "PlanStep",
    "QueryPlanner",
    "PlanExecutor",
    "ResponseAssembler",
    # IAM
    "IAMScope",
    "IAMResponse",
    "IAMService",
    "inject_guards",
    # ViewSets
    "ModelViewSet",
    "RelationsViewSet",
    "AttachRelation",
    "RelationConfig",
    "Through",
    "Ref",
    "AccessConfig",
    "Subscription",
    "SubscriptionConfig",
    "CacheConfig",
    "init_cache_handlers",
    # Gateway
    "Gateway",
    # Playground
    "mount_playground",
    "get_playground_html",
    # Service utilities
    "create_service_app",
    "create_internal_router",
    "InternalRouter",
    "Base",
    "get_session",
    "get_service_schema",
    "init_db",
    "close_db",
    "get_engine",
]
