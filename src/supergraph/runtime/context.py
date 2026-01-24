"""
Execution context for query processing.

Contains all dependencies needed during query execution.
"""

from __future__ import annotations


from dataclasses import dataclass, field
from typing import Any


@dataclass
class Principal:
    """
    Represents the authenticated user/service making the request.

    Used by IAM for access control decisions.
    """
    id: int | Optional[str] = None
    roles: list[str] = field(default_factory=list)
    rc_ids: list[int] = field(default_factory=list)  # Residential complex IDs user has access to
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExecutionContext:
    """
    Context passed through query execution pipeline.

    Contains:
    - graph: The compiled supergraph schema
    - principal: Authenticated user info for IAM
    - services: Service URL mapping (from graph)
    """
    graph: dict
    principal: Principal
    services: dict[str, dict] = field(default_factory=dict)

    def __post_init__(self):
        """Extract services from graph if not provided."""
        if not self.services and self.graph:
            self.services = self.graph.get("services", {})

    def get_service_url(self, service_name: str) -> Optional[str]:
        """Get URL for a service by name."""
        service = self.services.get(service_name)
        return service.get("url") if service else None

    def get_entity(self, entity_name: str) -> dict | None:
        """Get entity definition by name."""
        return self.graph.get("entities", {}).get(entity_name)
