"""
Graph registry - collects entity definitions from ViewSets.

Reads ViewSet configurations to build GraphJSON.
Models stay pure ORM - all configuration lives in viewsets.

Usage:
    from supergraph.core.registry import GraphRegistry
    from myapp.viewsets import PersonViewSet, PropertyViewSet, RelationshipViewSet

    registry = GraphRegistry()
    registry.register_service("person", "http://person:8002")
    registry.register_service("property", "http://property:8001")
    registry.register_service("relations", "http://relations:8003")

    registry.register(PersonViewSet)
    registry.register(PropertyViewSet)
    registry.register(RelationshipViewSet)

    graph = registry.build()  # Returns GraphJSON dict
"""

from __future__ import annotations


from dataclasses import dataclass, field
from typing import Any, Literal

from supergraph.viewsets.base import (
    AttachRelation,
    ModelViewSet,
    RelationsViewSet,
)


# =============================================================================
# Legacy IR dataclasses (backwards compatibility)
# =============================================================================


@dataclass
class FieldIR:
    """Intermediate representation of a field."""
    name: str
    type: str
    filters: list[str] = field(default_factory=list)
    sortable: bool = False


@dataclass
class ThroughIR:
    """Through relation definition."""
    model: str
    relationship_type: str
    parent_match_field: str
    target_key_field: str


@dataclass
class RefIR:
    """Direct reference relation definition."""
    from_field: str
    to_field: str = "id"


@dataclass
class RelationIR:
    """Intermediate representation of a relation."""
    name: str
    target: str
    cardinality: Literal["one", "many"]
    through: ThroughIR | None = None
    ref: RefIR | None = None


@dataclass
class AccessIR:
    """Access control definition."""
    tenant_strategy: Literal["none", "direct", "via_relations"] = "none"
    tenant_field: Optional[str] = None


@dataclass
class EntityIR:
    """Intermediate representation of an entity."""
    name: str
    service: str
    resource: str
    keys: list[str] = field(default_factory=lambda: ["id"])
    fields: dict[str, FieldIR] = field(default_factory=dict)
    relations: dict[str, RelationIR] = field(default_factory=dict)
    access: AccessIR = field(default_factory=AccessIR)


@dataclass
class ServiceIR:
    """Intermediate representation of a service."""
    name: str
    url: str


# =============================================================================
# ViewSet-based Registry (new approach)
# =============================================================================


class GraphRegistry:
    """
    Collects entity definitions from ViewSets.

    Two-phase registration:
    1. Register viewsets → entities
    2. Apply attached relations from RelationsViewSet

    Example:
        registry = GraphRegistry()
        registry.register_service("person", "http://person:8002")
        registry.register(PersonViewSet)
        registry.register(RelationshipViewSet)  # Has attach=[]
        graph = registry.build()
    """

    GRAPH_VERSION = 1

    def __init__(self):
        self.services: dict[str, ServiceIR] = {}
        self.viewsets: list[type[ModelViewSet]] = []
        self._entities: dict[str, dict] = {}
        self._attached_relations: list[AttachRelation] = []

    def register_service(self, name: str, url: str):
        """Register a service with its URL."""
        self.services[name] = ServiceIR(name=name, url=url)

    def register(self, viewset: type[ModelViewSet]):
        """
        Register a viewset.

        For RelationsViewSet, also collects attached relations.
        """
        self.viewsets.append(viewset)

        # Collect attached relations from RelationsViewSet
        if issubclass(viewset, RelationsViewSet):
            self._attached_relations.extend(viewset.get_attached_relations())

    def build(self) -> dict[str, Any]:
        """
        Build GraphJSON from registered viewsets.

        Returns:
            Complete GraphJSON dict ready for runtime
        """
        # Phase 1: Build entities from viewsets
        self._entities = {}
        for viewset in self.viewsets:
            entity_name = viewset.get_entity_name()
            self._entities[entity_name] = viewset.to_entity_dict()

        # Phase 2: Apply attached relations
        for attach in self._attached_relations:
            self._apply_attached_relation(attach)

        # Build final GraphJSON
        return {
            "version": self.GRAPH_VERSION,
            "services": {
                name: {"url": svc.url}
                for name, svc in self.services.items()
            },
            "entities": self._entities,
        }

    def _apply_attached_relation(self, attach: AttachRelation):
        """Apply an attached relation to parent entity."""
        parent_entity = self._entities.get(attach.parent_entity)
        if parent_entity is None:
            # Parent entity not registered yet - skip silently
            return

        # Build relation dict
        rel = {
            "target": attach.target_entity,
            "cardinality": attach.cardinality,
        }

        if attach.through:
            rel["through"] = {
                "model": attach.target_entity,
                "relationship_type": attach.through.static_filters.get("relationship_type", ""),
                "parent_match_field": attach.through.child_match_field,
                "target_key_field": attach.through.target_key_field,
            }

        if attach.ref:
            rel["ref"] = {
                "from_field": attach.ref.from_field,
                "to_field": attach.ref.to_field,
            }

        # Add relation to parent entity
        if "relations" not in parent_entity:
            parent_entity["relations"] = {}
        parent_entity["relations"][attach.name] = rel


def create_registry_from_viewsets(
    viewsets: list[type[ModelViewSet]],
    services: Optional[Dict[str, str]] = None,
) -> dict[str, Any]:
    """
    Convenience function to create GraphJSON from viewsets.

    Args:
        viewsets: List of viewset classes
        services: Optional dict of service name -> URL

    Returns:
        Complete GraphJSON dict
    """
    registry = GraphRegistry()

    # Register services
    if services:
        for name, url in services.items():
            registry.register_service(name, url)

    # Register viewsets
    for vs in viewsets:
        registry.register(vs)

    return registry.build()
