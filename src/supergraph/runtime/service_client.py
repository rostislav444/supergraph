"""
HTTP client for calling backend services.

Makes POST /internal/query calls to services with normalized filters.
"""

from __future__ import annotations


from typing import Any

import httpx

from ..core.errors import ServiceError
from ..core.query_types import (
    InternalQueryRequest,
    InternalQueryResponse,
    NormalizedFilter,
    NormalizedOrder,
)


class ServiceClient:
    """
    HTTP client for internal service queries.

    Usage:
        client = ServiceClient()
        response = await client.fetch(
            service_url="http://person:8002",
            resource="/person",
            filters=[NormalizedFilter(field="id", op="in", value=[1,2,3])],
            fields=["id", "first_name"],
        )
    """

    def __init__(self, timeout: float = 30.0):
        """
        Initialize service client.

        Args:
            timeout: HTTP request timeout in seconds
        """
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def fetch(
        self,
        service_url: str,
        resource: str,
        filters: list[NormalizedFilter],
        fields: list[str],
        order: Optional[List[NormalizedOrder]] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> InternalQueryResponse:
        """
        Fetch data from a service.

        Args:
            service_url: Base URL of the service (e.g., "http://person:8002")
            resource: Resource path (e.g., "/person")
            filters: List of normalized filters
            fields: List of fields to return
            order: Optional ordering
            limit: Optional limit for pagination
            offset: Offset for pagination

        Returns:
            InternalQueryResponse with items and pagination info

        Raises:
            ServiceError: If the service returns an error
        """
        client = await self._get_client()

        # Build request
        url = f"{service_url.rstrip('/')}/internal/query"
        request = InternalQueryRequest(
            filters=filters,
            fields=fields,
            order=order or [],
            limit=limit,
            offset=offset,
        )

        try:
            response = await client.post(
                url,
                json=request.model_dump(),
            )

            if response.status_code != 200:
                raise ServiceError(
                    service=service_url,
                    status_code=response.status_code,
                    message=response.text,
                )

            data = response.json()
            return InternalQueryResponse(
                items=data.get("items", []),
                total=data.get("total", 0),
                limit=data.get("limit"),
                offset=data.get("offset", 0),
            )

        except httpx.RequestError as e:
            raise ServiceError(
                service=service_url,
                status_code=0,
                message=str(e),
            )

    async def fetch_by_ids(
        self,
        service_url: str,
        resource: str,
        ids: list[Any],
        id_field: str,
        fields: list[str],
    ) -> InternalQueryResponse:
        """
        Convenience method to fetch by a list of IDs.

        Args:
            service_url: Base URL of the service
            resource: Resource path
            ids: List of IDs to fetch
            id_field: Field name to filter on (usually "id")
            fields: List of fields to return

        Returns:
            InternalQueryResponse with items
        """
        if not ids:
            return InternalQueryResponse(items=[], total=0, limit=None, offset=0)

        filters = [NormalizedFilter(field=id_field, op="in", value=ids)]
        return await self.fetch(
            service_url=service_url,
            resource=resource,
            filters=filters,
            fields=fields,
            limit=None,  # No limit when fetching by IDs
            offset=0,
        )
