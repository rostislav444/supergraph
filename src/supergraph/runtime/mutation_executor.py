"""
Mutation executor for Supergraph.

Handles create, update, rewrite, and delete operations
by calling internal service endpoints.
"""

from __future__ import annotations


import httpx
from typing import Any

from supergraph.core.query_types import (
    NormalizedFilter,
    InternalMutationRequest,
    InternalMutationResponse,
    MutationResult,
)
from supergraph.core.request_parser import EntityMutation
from supergraph.core.errors import ExecutionError


class MutationExecutor:
    """
    Executes mutations against internal service endpoints.

    Each service exposes:
    - POST /internal/create - create new record
    - POST /internal/update - partial update (PATCH semantics)
    - POST /internal/rewrite - full replace (PUT semantics)
    - POST /internal/delete - delete records
    """

    def __init__(self, graph: dict[str, Any], http_client: httpx.AsyncClient | None = None):
        """
        Initialize mutation executor.

        Args:
            graph: GraphJSON schema
            http_client: Optional shared HTTP client
        """
        self.graph = graph
        self.http_client = http_client or httpx.AsyncClient(timeout=30.0)
        self._owns_client = http_client is None

    async def close(self):
        """Close HTTP client if we own it."""
        if self._owns_client:
            await self.http_client.aclose()

    def get_service_url(self, entity: str) -> str:
        """Get service URL for entity."""
        entity_def = self.graph["entities"].get(entity)
        if not entity_def:
            raise ExecutionError(f"Unknown entity: {entity}")

        service_name = entity_def["service"]
        service_def = self.graph["services"].get(service_name)
        if not service_def:
            raise ExecutionError(f"Unknown service: {service_name}")

        return service_def["url"]

    async def execute(self, mutation: EntityMutation) -> MutationResult:
        """
        Execute a single mutation.

        Args:
            mutation: Parsed mutation request

        Returns:
            MutationResult with success/failure and data
        """
        try:
            base_url = self.get_service_url(mutation.entity)

            # Build internal request
            filters = self._normalize_filters(mutation.filters)
            request = InternalMutationRequest(
                entity=mutation.entity,
                operation=mutation.operation,
                data=mutation.data,
                filters=filters,
                response=mutation.response,
            )

            # Determine endpoint (same pattern as service_client: /internal/{operation})
            endpoint = f"{base_url}/internal/{mutation.operation}"

            # Execute request
            response = await self.http_client.post(
                endpoint,
                json=request.model_dump(),
            )

            if response.status_code >= 400:
                return MutationResult(
                    entity=mutation.entity,
                    operation=mutation.operation,
                    success=False,
                    error=f"Service error: {response.status_code} - {response.text}",
                )

            result = InternalMutationResponse.model_validate(response.json())

            # Return appropriate data format
            if mutation.operation == "create":
                data = result.items[0] if result.items else None
            elif mutation.operation == "delete":
                data = None
            else:
                data = result.items

            return MutationResult(
                entity=mutation.entity,
                operation=mutation.operation,
                success=True,
                data=data,
                count=result.count,
            )

        except httpx.HTTPError as e:
            return MutationResult(
                entity=mutation.entity,
                operation=mutation.operation,
                success=False,
                error=f"HTTP error: {str(e)}",
            )
        except Exception as e:
            return MutationResult(
                entity=mutation.entity,
                operation=mutation.operation,
                success=False,
                error=f"Execution error: {str(e)}",
            )

    async def execute_compensation(self, entity: str, record_id: Any) -> bool:
        """
        Execute compensation (delete) for a created record.

        Used during transaction rollback.

        Args:
            entity: Entity name
            record_id: ID of record to delete

        Returns:
            True if compensation succeeded
        """
        try:
            base_url = self.get_service_url(entity)

            # Get primary key field
            entity_def = self.graph["entities"][entity]
            key_field = entity_def["keys"][0] if entity_def.get("keys") else "id"

            request = InternalMutationRequest(
                entity=entity,
                operation="delete",
                filters=[NormalizedFilter(field=key_field, op="eq", value=record_id)],
            )

            endpoint = f"{base_url}/internal/delete"
            response = await self.http_client.post(endpoint, json=request.model_dump())

            return response.status_code < 400

        except Exception:
            return False

    def _normalize_filters(self, filters: dict[str, Any]) -> list[NormalizedFilter]:
        """Convert filter dict to normalized filter list."""
        result = []
        for key, value in filters.items():
            if "__" in key:
                field, op = key.rsplit("__", 1)
            else:
                field, op = key, "eq"
            result.append(NormalizedFilter(field=field, op=op, value=value))
        return result

    def validate_mutation(self, mutation: EntityMutation) -> list[str]:
        """
        Validate mutation against schema.

        Returns list of validation errors (empty if valid).
        """
        errors = []

        entity_def = self.graph["entities"].get(mutation.entity)
        if not entity_def:
            errors.append(f"Unknown entity: {mutation.entity}")
            return errors

        # Validate data fields exist in schema
        fields = entity_def.get("fields", {})
        for field_name in mutation.data.keys():
            if field_name not in fields:
                # Allow unknown fields for flexibility (service will validate)
                pass

        # For update/rewrite/delete, filters are required
        if mutation.operation in ("update", "rewrite", "delete"):
            if not mutation.filters:
                errors.append(f"{mutation.operation} requires filters")

        return errors
