"""
Pydantic models for JSON Query DSL.

These define the structure of incoming queries and normalized internal representations.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


# --- Normalized types (internal representation after validation) ---

class NormalizedFilter(BaseModel):
    """
    Normalized filter representation.

    Input: {"name__icontains": "test"}
    Normalized: NormalizedFilter(field="name", op="icontains", value="test")
    """
    field: str
    op: str  # eq, in, icontains, gte, lte, isnull
    value: Any


class NormalizedOrder(BaseModel):
    """
    Normalized order representation.

    Input: "-created_at"
    Normalized: NormalizedOrder(field="created_at", dir="desc")
    """
    field: str
    dir: Literal["asc", "desc"]


# --- Input types (from client) ---

class SelectionNode(BaseModel):
    """
    Selection node for query - defines what to fetch at each level.

    Supports nested relations with their own filters/order/pagination.
    """
    fields: list[str] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)  # raw: {"name__icontains": "test"}
    order: list[str] = Field(default_factory=list)  # raw: ["-created_at", "name"]
    limit: Optional[int] = None
    offset: int = 0
    relations: dict[str, SelectionNode] = Field(default_factory=dict)


class JSONQuery(BaseModel):
    """
    Main query structure from client.

    Example:
    {
        "action": "query",
        "entity": "Person",
        "filters": {"id__eq": 145},
        "select": {
            "fields": ["id", "first_name"],
            "relations": {
                "owned_properties": {...}
            }
        }
    }
    """
    action: Literal["query"]  # MVP: only query supported
    entity: str
    filters: dict[str, Any] = Field(default_factory=dict)  # root filters
    select: SelectionNode = Field(default_factory=SelectionNode)


# --- Normalized query (after validation) ---

class NormalizedSelectionNode(BaseModel):
    """Selection node with normalized filters and order."""
    fields: list[str]
    filters: list[NormalizedFilter]
    order: list[NormalizedOrder]
    limit: Optional[int]
    offset: int
    relations: dict[str, NormalizedSelectionNode]


class NormalizedQuery(BaseModel):
    """Query with all filters/order normalized."""
    action: Literal["query"]
    entity: str
    filters: list[NormalizedFilter]
    select: NormalizedSelectionNode
    is_single: bool = False  # True if root query is for single item (id__eq)


# --- Service request/response types ---

class InternalQueryRequest(BaseModel):
    """
    Request format for internal service calls.

    POST /internal/query
    """
    entity: Optional[str] = None  # Entity name (optional for backwards compatibility)
    filters: list[NormalizedFilter]
    fields: list[str]
    order: list[NormalizedOrder] = Field(default_factory=list)
    limit: Optional[int] = None
    offset: int = 0


class InternalQueryResponse(BaseModel):
    """
    Response format from internal service calls.

    Always returns items + total for pagination.
    """
    items: list[dict[str, Any]]
    total: int
    limit: Optional[int] = None
    offset: int = 0


class PaginationInfo(BaseModel):
    """Pagination metadata in response."""
    total: int
    limit: Optional[int]
    offset: int
    has_next: bool


# --- Mutation types ---

class InternalMutationRequest(BaseModel):
    """
    Request format for internal service mutations.

    POST /internal/create
    POST /internal/update
    POST /internal/rewrite
    DELETE /internal/delete
    POST /internal/get_or_create
    """
    entity: str  # Entity name (e.g., "Person", "Contact")
    operation: Literal["create", "update", "rewrite", "delete", "get_or_create"]
    data: dict[str, Any] = Field(default_factory=dict)
    filters: list[NormalizedFilter] = Field(default_factory=list)  # For update/rewrite/delete
    response: Optional[List[str]] = None  # Fields to return


class InternalMutationResponse(BaseModel):
    """
    Response format from internal service mutations.

    For create: returns created item
    For update/rewrite: returns updated items
    For delete: returns deleted count
    """
    items: list[dict[str, Any]] = Field(default_factory=list)
    count: int = 0  # Number of affected rows


class MutationResult(BaseModel):
    """Result of a single mutation operation."""
    entity: str
    operation: Literal["create", "update", "rewrite", "delete", "get_or_create"]
    success: bool
    data: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None
    error: Optional[str] = None
    count: int = 0


class TransactionResult(BaseModel):
    """Result of a transaction execution."""
    success: bool
    results: list[MutationResult] = Field(default_factory=list)
    variables: dict[str, Any] = Field(default_factory=dict)  # Resolved $refs
    rolled_back: bool = False
    error: Optional[str] = None
