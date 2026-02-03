"""
Request parser for Supergraph JSON Query DSL.

Supports multiple request formats:

1. Single entity shorthand:
   {"Person": {"filters": {...}, "fields": [...]}}

2. Multi-entity query:
   {"query": {"Person": {...}, "Property": {...}}}

3. Mutations:
   {"create": {"Person": {"data": {...}, "response": [...]}}}
   {"update": {"Person": {"filters": {...}, "data": {...}}}}
   {"rewrite": {"Person": {"filters": {...}, "data": {...}}}}

4. HTTP method aliases:
   {"POST": {"Person": {...}}}   -> create
   {"PATCH": {"Person": {...}}}  -> update
   {"PUT": {"Person": {...}}}    -> rewrite

5. Transactions:
   {"transaction": {"steps": [...], "on_error": "rollback"}}

6. Combined operations:
   {"query": {"Person": {...}}, "create": {"Order": {...}}}
"""

from __future__ import annotations


import warnings
from dataclasses import dataclass, field
from typing import Any, List, Literal, Optional

from .errors import ValidationError
from .utils import to_snake_case


# Operation types
OperationType = Literal["query", "create", "update", "rewrite", "delete", "get_or_create"]

# HTTP method aliases
HTTP_ALIASES: dict[str, OperationType] = {
    "POST": "create",
    "PATCH": "update",
    "PUT": "rewrite",
    "DELETE": "delete",
}

# All recognized operation keys
OPERATION_KEYS = {"query", "create", "update", "rewrite", "delete", "transaction", "get_or_create"} | set(HTTP_ALIASES.keys())


@dataclass
class EntityQuery:
    """Parsed query for a single entity."""
    entity: str
    filters: dict[str, Any] = field(default_factory=dict)
    fields: Optional[List[str]] = None
    order: Optional[List[str]] = None
    limit: Optional[int] = None
    offset: int = 0
    relations: dict[str, "EntityQuery"] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, entity: str, data: dict) -> "EntityQuery":
        """Parse entity query from dict."""
        # Support both flat and nested "select" format
        if "select" in data:
            select = data["select"]
            return cls(
                entity=entity,
                filters=data.get("filters", {}),
                fields=select.get("fields"),
                order=select.get("order"),
                limit=select.get("limit"),
                offset=select.get("offset", 0),
                relations={
                    name: EntityQuery.from_dict(name, rel_data)
                    for name, rel_data in select.get("relations", {}).items()
                },
            )
        else:
            # Flat format
            return cls(
                entity=entity,
                filters=data.get("filters", {}),
                fields=data.get("fields"),
                order=data.get("order"),
                limit=data.get("limit"),
                offset=data.get("offset", 0),
                relations={
                    name: EntityQuery.from_dict(name, rel_data)
                    for name, rel_data in data.get("relations", {}).items()
                },
            )


@dataclass
class EntityMutation:
    """Parsed mutation for a single entity."""
    entity: str
    operation: OperationType
    data: dict[str, Any] = field(default_factory=dict)
    filters: dict[str, Any] = field(default_factory=dict)  # For update/rewrite/delete
    response: Optional[List[str]] = None  # Fields to return after mutation
    alias: Optional[str] = None  # For transaction variable binding ($person)

    @classmethod
    def from_dict(cls, entity: str, operation: OperationType, data: dict) -> "EntityMutation":
        """
        Parse entity mutation from dict.

        Supports both 'id' (safe single-record) and 'filters' (legacy) formats.
        When 'id' is provided, it's converted to {"id__eq": value} filter.
        """
        # Support 'id' as a safer alternative to 'filters' for single-record mutations
        filters = data.get("filters", {})
        if "id" in data and data["id"] is not None:
            # Convert id to filter - this ensures only one record is affected
            filters = {"id__eq": data["id"]}

        return cls(
            entity=entity,
            operation=operation,
            data=data.get("data", {}),
            filters=filters,
            response=data.get("response"),
            alias=data.get("as"),
        )


@dataclass
class TransactionStep:
    """Single step in a transaction."""
    operation: OperationType
    entity: str
    data: dict[str, Any] = field(default_factory=dict)
    filters: dict[str, Any] = field(default_factory=dict)
    response: Optional[List[str]] = None
    alias: Optional[str] = None  # Variable name for referencing ($person)
    depends_on: Optional[List[str]] = None  # Explicit dependencies
    optional: bool = False  # If true, failure doesn't trigger rollback

    @classmethod
    def from_dict(cls, step_data: dict) -> "TransactionStep":
        """Parse transaction step from dict."""
        # Find operation type
        operation = None
        entity = None
        entity_data = None

        for op in ["create", "update", "rewrite", "delete", "query", "get_or_create"]:
            if op in step_data:
                operation = op
                # Entity is the key inside operation
                op_data = step_data[op]
                if isinstance(op_data, dict) and len(op_data) == 1:
                    entity = list(op_data.keys())[0]
                    entity_data = op_data[entity]
                break

        if not operation or not entity:
            raise ValidationError("Transaction step must have operation with entity")

        # Support 'id' as safer alternative to 'filters'
        filters = entity_data.get("filters", {})
        if "id" in entity_data and entity_data["id"] is not None:
            filters = {"id__eq": entity_data["id"]}

        return cls(
            operation=operation,
            entity=entity,
            data=entity_data.get("data", {}),
            filters=filters,
            response=entity_data.get("response"),
            alias=step_data.get("as"),
            depends_on=step_data.get("depends_on"),
            optional=step_data.get("optional", False),
        )


@dataclass
class Transaction:
    """Parsed transaction with multiple steps."""
    steps: list[TransactionStep]
    on_error: Literal["rollback", "stop", "continue"] = "rollback"

    @classmethod
    def from_dict(cls, data: dict) -> "Transaction":
        """Parse transaction from dict."""
        steps = [TransactionStep.from_dict(s) for s in data.get("steps", [])]
        return cls(
            steps=steps,
            on_error=data.get("on_error", "rollback"),
        )


@dataclass
class ParsedRequest:
    """Fully parsed request with all operations."""
    queries: dict[str, EntityQuery] = field(default_factory=dict)
    mutations: list[EntityMutation] = field(default_factory=list)
    transaction: Transaction | None = None

    def is_empty(self) -> bool:
        return not self.queries and not self.mutations and not self.transaction

    def has_mutations(self) -> bool:
        return bool(self.mutations) or self.transaction is not None


class RequestParser:
    """
    Parser for Supergraph request format.

    Handles all supported formats and normalizes to ParsedRequest.
    """

    def __init__(self, known_entities: set[str], graph: dict | None = None):
        """
        Initialize parser.

        Args:
            known_entities: Set of valid entity names from graph schema
            graph: Full graph schema (needed for nested compilation)
        """
        self.known_entities = known_entities
        self.graph = graph

    def parse(self, body: dict[str, Any]) -> ParsedRequest:
        """
        Parse request body into normalized structure.

        Args:
            body: Raw request body

        Returns:
            ParsedRequest with queries, mutations, and/or transaction
        """
        result = ParsedRequest()

        # Handle legacy format first
        if "action" in body and "entity" in body:
            return self._parse_legacy_format(body)

        for key, value in body.items():
            # Normalize HTTP aliases
            normalized_key = HTTP_ALIASES.get(key, key)

            if key == "transaction":
                if result.transaction:
                    raise ValidationError("Only one transaction allowed per request")
                result.transaction = Transaction.from_dict(value)

            elif normalized_key == "query":
                # Multi-entity query
                for entity, entity_data in value.items():
                    if entity not in self.known_entities:
                        raise ValidationError(f"Unknown entity: {entity}")
                    result.queries[entity] = EntityQuery.from_dict(entity, entity_data)

            elif normalized_key in ("create", "update", "rewrite", "delete"):
                # Mutation - check for nested syntax
                for entity, entity_data in value.items():
                    if entity not in self.known_entities:
                        raise ValidationError(f"Unknown entity: {entity}")

                    # Check for nested syntax - compile to transaction
                    if "nested" in entity_data and self.graph:
                        from .nested_compiler import NestedCompiler
                        compiler = NestedCompiler(self.graph)
                        nested_tx = compiler.compile(entity, normalized_key, entity_data)
                        if result.transaction:
                            # Merge with existing transaction
                            result.transaction.steps.extend(nested_tx.steps)
                        else:
                            result.transaction = nested_tx
                    else:
                        result.mutations.append(
                            EntityMutation.from_dict(entity, normalized_key, entity_data)
                        )

            elif normalized_key == "get_or_create":
                # Get-or-create operation - compile to special transaction
                for entity, entity_data in value.items():
                    if entity not in self.known_entities:
                        raise ValidationError(f"Unknown entity: {entity}")

                    if self.graph:
                        from .nested_compiler import NestedCompiler
                        compiler = NestedCompiler(self.graph)
                        goc_tx = compiler.compile_get_or_create(
                            entity=entity,
                            lookup=entity_data.get("lookup", {}),
                            defaults=entity_data.get("defaults", {}),
                            response=entity_data.get("response"),
                        )
                        if result.transaction:
                            result.transaction.steps.extend(goc_tx.steps)
                        else:
                            result.transaction = goc_tx
                    else:
                        raise ValidationError("get_or_create requires graph schema")

            elif key in self.known_entities:
                # Single entity shorthand (query)
                result.queries[key] = EntityQuery.from_dict(key, value)

            else:
                raise ValidationError(f"Unknown key: {key}")

        if result.is_empty():
            raise ValidationError("Empty request")

        return result

    def _parse_legacy_format(self, body: dict) -> ParsedRequest:
        """
        Parse legacy format with action/entity at root.

        DEPRECATED: Use the new format instead:
            {"Entity": {"fields": [...], "filters": {...}}}
        """
        warnings.warn(
            "Legacy request format {'action': ..., 'entity': ...} is deprecated. "
            "Use {'EntityName': {'fields': [...], 'filters': {...}}} instead.",
            DeprecationWarning,
            stacklevel=3,
        )
        action = body.get("action", "query")
        entity = body["entity"]

        if entity not in self.known_entities:
            raise ValidationError(f"Unknown entity: {entity}")

        result = ParsedRequest()

        if action == "query":
            result.queries[entity] = EntityQuery.from_dict(entity, body)
        else:
            # Mutation in legacy format
            result.mutations.append(
                EntityMutation.from_dict(entity, action, body)
            )

        return result


def parse_request(
    body: dict[str, Any],
    known_entities: set[str],
    graph: dict | None = None,
    normalize_case: bool = False,
) -> ParsedRequest:
    """
    Convenience function to parse a request.

    Args:
        body: Raw request body
        known_entities: Set of valid entity names
        graph: Full graph schema (needed for nested compilation)
        normalize_case: If True, converts camelCase relation names to snake_case

    Returns:
        ParsedRequest
    """
    if normalize_case:
        body = normalize_relation_names(body)
    parser = RequestParser(known_entities, graph)
    return parser.parse(body)


def normalize_relation_names(data: dict[str, Any]) -> dict[str, Any]:
    """
    Recursively normalize relation names from camelCase to snake_case.

    This allows clients to use camelCase (e.g., "ownedProperties") while
    the internal schema uses snake_case (e.g., "owned_properties").

    Only normalizes keys in "relations" dicts, preserving entity names
    and other keys as-is.

    Example:
        {"Person": {"relations": {"ownedProperties": {...}}}}
        ->
        {"Person": {"relations": {"owned_properties": {...}}}}
    """
    if not isinstance(data, dict):
        return data

    result = {}
    for key, value in data.items():
        if key == "relations" and isinstance(value, dict):
            # Normalize relation names
            result[key] = {
                to_snake_case(rel_name): normalize_relation_names(rel_data)
                for rel_name, rel_data in value.items()
            }
        elif isinstance(value, dict):
            result[key] = normalize_relation_names(value)
        elif isinstance(value, list):
            result[key] = [
                normalize_relation_names(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            result[key] = value

    return result
