"""
Service schema generation for auto-discovery.

Gateway calls /__schema endpoint to discover entities and websockets.
"""

from __future__ import annotations

from typing import Any

from ..viewsets import ModelViewSet, RelationsViewSet, Subscription


def get_service_schema(viewsets: list) -> dict[str, Any]:
    """
    Generate service schema from list of ViewSets.

    Supports:
    - ModelViewSet → entities (HTTP endpoints)
    - RelationsViewSet → entities + attached_relations
    - Subscription → websockets (real-time subscriptions)

    Args:
        viewsets: List of ViewSet classes

    Returns:
        Schema dict for Gateway auto-discovery

    Example:
        @app.get("/__schema")
        async def schema():
            return get_service_schema([
                PersonViewSet,
                CameraEventsSubscription,
            ])

        Returns:
        {
            "version": 1,
            "entities": {
                "Person": {...}
            },
            "websockets": {
                "CameraEvents": {...}
            },
            "attached_relations": [...]
        }
    """
    entities = {}
    websockets = {}
    attached_relations = []

    for vs in viewsets:
        # Check if it's a class (not instance)
        if not isinstance(vs, type):
            raise TypeError(f"Expected ViewSet class, got instance: {vs}")

        # ModelViewSet or RelationsViewSet → HTTP entity
        if issubclass(vs, ModelViewSet):
            entity_name = vs.get_entity_name()
            entities[entity_name] = vs.to_entity_dict()

            # RelationsViewSet also provides attached relations
            if issubclass(vs, RelationsViewSet):
                for attach in vs.get_attached_relations():
                    rel_def = {
                        "parent_entity": attach.parent_entity,
                        "name": attach.name,
                        "target_entity": attach.target_entity,
                        "cardinality": attach.cardinality,
                    }

                    # Provider relation (simplified format with relationship_type)
                    if attach.relationship_type:
                        rel_def["kind"] = "provider"
                        rel_def["provider"] = "relations_db"
                        rel_def["type"] = attach.relationship_type
                        rel_def["status"] = attach.filters.get("status", "active")
                        rel_def["direction"] = attach.direction

                    # Explicit through relation
                    if attach.through:
                        rel_def["through"] = {
                            "parent_key": attach.through.parent_key,
                            "child_match_field": attach.through.child_match_field,
                            "target_key_field": attach.through.target_key_field,
                            "static_filters": attach.through.static_filters,
                        }

                    # Explicit ref relation
                    if attach.ref:
                        rel_def["ref"] = {
                            "from_field": attach.ref.from_field,
                            "to_field": attach.ref.to_field,
                        }

                    attached_relations.append(rel_def)

        # Subscription → WebSocket subscription
        elif issubclass(vs, Subscription):
            websocket_def = vs.get_schema_def()
            websockets[vs.entity] = websocket_def

        else:
            raise TypeError(f"Unknown ViewSet type: {vs}")

    result = {
        "version": 1,
        "entities": entities,
    }

    # Only include websockets if there are any
    if websockets:
        result["websockets"] = websockets

    # Only include attached_relations if there are any
    if attached_relations:
        result["attached_relations"] = attached_relations

    return result
