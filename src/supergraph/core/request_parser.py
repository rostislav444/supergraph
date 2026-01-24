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


from dataclasses import dataclass, field
from typing import Any, Literal

from .errors import ValidationError


# Operation types
OperationType = Literal["query", "create", "update", "rewrite", "delete"]

# HTTP method aliases
HTTP_ALIASES: dict[str, OperationType] = {
    "POST": "create",
    "PATCH": "update",
    "PUT": "rewrite",
    "DELETE": "delete",
}

# All recognized operation keys
OPERATION_KEYS = {"query", "create", "update", "rewrite", "delete", "transaction"} | set(HTTP_ALIASES.keys())


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
        """Parse entity mutation from dict."""
        return cls(
            entity=entity,
            operation=operation,
            data=data.get("data", {}),
            filters=data.get("filters", {}),
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

        for op in ["create", "update", "rewrite", "delete", "query"]:
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

        return cls(
            operation=operation,
            entity=entity,
            data=entity_data.get("data", {}),
            filters=entity_data.get("filters", {}),
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

    def __init__(self, known_entities: set[str]):
        """
        Initialize parser.

        Args:
            known_entities: Set of valid entity names from graph schema
        """
        self.known_entities = known_entities

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
                # Mutation
                for entity, entity_data in value.items():
                    if entity not in self.known_entities:
                        raise ValidationError(f"Unknown entity: {entity}")
                    result.mutations.append(
                        EntityMutation.from_dict(entity, normalized_key, entity_data)
                    )

            elif key in self.known_entities:
                # Single entity shorthand (query)
                result.queries[key] = EntityQuery.from_dict(key, value)

            else:
                raise ValidationError(f"Unknown key: {key}")

        if result.is_empty():
            raise ValidationError("Empty request")

        return result

    def _parse_legacy_format(self, body: dict) -> ParsedRequest:
        """Parse legacy format with action/entity at root."""
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


def parse_request(body: dict[str, Any], known_entities: set[str]) -> ParsedRequest:
    """
    Convenience function to parse a request.

    Args:
        body: Raw request body
        known_entities: Set of valid entity names

    Returns:
        ParsedRequest
    """
    parser = RequestParser(known_entities)
    return parser.parse(body)
