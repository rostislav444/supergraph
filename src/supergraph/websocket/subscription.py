"""
Subscription parser for WebSocket JSON DSL.

Parses subscription requests from clients and validates against graph schema.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, Field

from ..core.query_types import NormalizedFilter
from ..core.validator import QueryValidator

logger = logging.getLogger(__name__)


class SubscriptionRequest(BaseModel):
    """
    Subscription request from client.

    Example:
    {
        "filters": {"camera_id__eq": 123},
        "fields": ["event_type", "timestamp"]
    }
    """
    filters: dict[str, Any] = Field(default_factory=dict)
    fields: list[str] = Field(default_factory=list)


class NormalizedSubscription(BaseModel):
    """Normalized subscription with validated filters."""
    entity: str
    filters: list[NormalizedFilter]
    fields: list[str]


class SubscriptionParser:
    """
    Parser for subscription requests.

    Validates subscriptions against graph schema and normalizes filters.
    """

    def __init__(self, graph: dict):
        """
        Initialize parser with graph schema.

        Args:
            graph: Compiled graph with entities and websockets
        """
        self.graph = graph
        self.websockets = graph.get("websockets", {})
        self.entities = graph.get("entities", {})

    def parse(self, subscribe_payload: dict) -> dict[str, NormalizedSubscription]:
        """
        Parse and validate subscription request.

        Args:
            subscribe_payload: Subscribe section from client request
                {
                    "CameraEvents": {"filters": {...}, "fields": [...]},
                    "AnotherEntity": {...}
                }

        Returns:
            Dict of entity -> normalized subscription

        Raises:
            ValueError: If validation fails
        """
        result = {}

        for entity, sub_request in subscribe_payload.items():
            # Validate entity exists as websocket
            if entity not in self.websockets:
                raise ValueError(f"WebSocket entity '{entity}' not found in schema")

            # Parse subscription request
            try:
                sub_req = SubscriptionRequest(**sub_request)
            except Exception as e:
                raise ValueError(f"Invalid subscription request for {entity}: {e}")

            # Get websocket definition
            ws_def = self.websockets[entity]

            # Normalize filters
            normalized_filters = self._normalize_filters(
                entity,
                sub_req.filters,
                ws_def["filters"]
            )

            # Validate fields
            validated_fields = self._validate_fields(
                entity,
                sub_req.fields,
                ws_def.get("schema", {})
            )

            result[entity] = NormalizedSubscription(
                entity=entity,
                filters=normalized_filters,
                fields=validated_fields,
            )

        return result

    def _normalize_filters(
        self,
        entity: str,
        raw_filters: dict,
        allowed_filters: dict[str, list[str]]
    ) -> list[NormalizedFilter]:
        """
        Normalize and validate filters.

        Args:
            entity: Entity name
            raw_filters: Raw filters from client {"field__op": value}
            allowed_filters: Allowed filters from schema {"field": ["op1", "op2"]}

        Returns:
            List of normalized filters

        Raises:
            ValueError: If filter is not allowed
        """
        normalized = []

        for filter_key, value in raw_filters.items():
            # Parse field__op format
            if "__" in filter_key:
                field, op = filter_key.rsplit("__", 1)
            else:
                # Default to eq
                field = filter_key
                op = "eq"

            # Validate field exists in allowed filters
            if field not in allowed_filters:
                raise ValueError(
                    f"Filter on field '{field}' not allowed for {entity}. "
                    f"Allowed filters: {list(allowed_filters.keys())}"
                )

            # Validate operator is allowed for this field
            if op not in allowed_filters[field]:
                raise ValueError(
                    f"Filter operator '{op}' not allowed for {entity}.{field}. "
                    f"Allowed operators: {allowed_filters[field]}"
                )

            normalized.append(
                NormalizedFilter(field=field, op=op, value=value)
            )

        return normalized

    def _validate_fields(
        self,
        entity: str,
        requested_fields: list[str],
        schema: dict
    ) -> list[str]:
        """
        Validate that requested fields exist in schema.

        Args:
            entity: Entity name
            requested_fields: Fields requested by client
            schema: Pydantic schema from WebSocketViewSet

        Returns:
            Validated list of fields

        Note:
            If no fields requested, returns empty list (meaning all fields).
            Schema validation is optional - if no schema defined, all fields allowed.
        """
        if not requested_fields:
            return []  # Empty = return all fields

        if not schema or "properties" not in schema:
            # No schema defined - allow all fields
            return requested_fields

        # Validate each field
        schema_fields = schema.get("properties", {})
        for field in requested_fields:
            if field not in schema_fields:
                raise ValueError(
                    f"Field '{field}' not found in {entity} schema. "
                    f"Available fields: {list(schema_fields.keys())}"
                )

        return requested_fields

    def get_channel(self, entity: str, normalized_filters: list[NormalizedFilter]) -> str:
        """
        Determine Redis channel to subscribe to based on entity and filters.

        Args:
            entity: Entity name
            normalized_filters: Normalized filters

        Returns:
            Redis channel name
        """
        ws_def = self.websockets.get(entity)
        if not ws_def:
            raise ValueError(f"WebSocket entity '{entity}' not found")

        channels = ws_def.get("channels", [])
        if not channels:
            raise ValueError(f"No channels defined for {entity}")

        # For now, return first channel
        # TODO: Smart channel selection based on filters
        # e.g., "camera.events.{camera_id}" if camera_id__eq filter present
        return channels[0]
