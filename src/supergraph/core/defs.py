"""
Core dataclass definitions for the Supergraph system.

These define the schema structure for entities, fields, relations, and services.
"""

from __future__ import annotations


from dataclasses import dataclass, field
from typing import Literal


@dataclass
class ServiceDef:
    """Definition of a backend service."""
    name: str
    url: str


@dataclass
class FieldDef:
    """Definition of an entity field."""
    name: str
    type: str  # int, string, bool, datetime, json, int?, string?
    filters: list[str] = field(default_factory=list)  # eq, in, icontains, gte, lte, isnull
    sortable: bool = False
    nullable: bool = True  # whether field can be null (False = required)


@dataclass
class ThroughDef:
    """
    Definition of a relation that goes through an intermediate model (e.g., Relationship).

    Example: Person -> owned_properties goes through Relationship model
    where Person.id matches Relationship.object_id and the target Property.id
    matches Relationship.subject_id.
    """
    model: str  # "Relationship"
    relationship_type: str  # "property_owner"
    parent_match_field: str  # field in through model that matches parent key (e.g., "object_id")
    target_key_field: str  # field in through model that links to target (e.g., "subject_id")


@dataclass
class RefDef:
    """
    Definition of a direct reference relation (foreign key).

    Example: Relationship.property where subject_id -> Property.id
    """
    from_field: str  # local field (e.g., "subject_id")
    to_field: str  # target entity field (e.g., "id")


@dataclass
class RelationDef:
    """Definition of a relation between entities."""
    name: str
    target: str  # target entity name
    cardinality: Literal["one", "many"]
    through: ThroughDef | None = None  # for relations via intermediate model
    ref: RefDef | None = None  # for direct FK relations


@dataclass
class AccessDef:
    """Access control definition for an entity."""
    tenant_strategy: Literal["none", "direct", "via_relations"] = "none"
    tenant_field: Optional[str] = None  # for "direct" strategy, e.g., "rc_id"


@dataclass
class EntityDef:
    """Complete definition of an entity in the supergraph."""
    name: str
    service: str  # service name
    keys: list[str]  # primary key fields
    fields: dict[str, FieldDef]
    relations: dict[str, RelationDef] = field(default_factory=dict)
    access: AccessDef = field(default_factory=AccessDef)


@dataclass
class GraphDef:
    """Complete supergraph definition."""
    version: int
    services: dict[str, ServiceDef]
    entities: dict[str, EntityDef]
