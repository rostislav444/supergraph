"""
Core module - definitions, types, and validation.
"""

from __future__ import annotations

from typing import Optional

from .defs import (
    AccessDef,
    EntityDef,
    FieldDef,
    GraphDef,
    RefDef,
    RelationDef,
    ServiceDef,
    ThroughDef,
)
from .errors import (
    ExecutionError,
    GraphConfigError,
    IAMError,
    ServiceError,
    SupergraphError,
    ValidationError,
)
from .query_types import (
    InternalQueryRequest,
    InternalQueryResponse,
    InternalMutationRequest,
    InternalMutationResponse,
    JSONQuery,
    MutationResult,
    NormalizedFilter,
    NormalizedOrder,
    NormalizedQuery,
    NormalizedSelectionNode,
    PaginationInfo,
    SelectionNode,
    TransactionResult,
)
from .request_parser import (
    EntityMutation,
    EntityQuery,
    ParsedRequest,
    RequestParser,
    Transaction,
    TransactionStep,
    parse_request,
)
from .validator import QueryValidator
from .registry import (
    GraphRegistry,
    EntityIR,
    FieldIR,
    RelationIR,
    ThroughIR,
    RefIR,
    AccessIR,
    ServiceIR,
)
from .compiler import (
    GraphCompiler,
    CompilationResult,
    CompilationError,
    compile_graph,
)

__all__ = [
    # Definitions
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
    "InternalMutationRequest",
    "InternalMutationResponse",
    "MutationResult",
    "TransactionResult",
    "PaginationInfo",
    # Request parser
    "EntityQuery",
    "EntityMutation",
    "Transaction",
    "TransactionStep",
    "ParsedRequest",
    "RequestParser",
    "parse_request",
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
]
