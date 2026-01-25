"""
ViewSet base classes for Supergraph - DRF-style configuration.

Models stay pure ORM. All graph configuration lives here.

Usage:
    class PersonViewSet(ModelViewSet):
        model = Person
        # service/resource auto-inferred: "person" / "/person"

    class RelationshipViewSet(RelationsViewSet):
        model = Relationship
        service = "relations"  # override default

        attach = [
            # Add "ownedProperties" field to Person entity
            AttachRelation(
                parent_entity="Person",
                field_name="ownedProperties",
                target_entity="Property",
                relationship_type="property_owner",
            ),
        ]
"""

from __future__ import annotations


from dataclasses import dataclass, field
from typing import Any, Literal, Optional, List

from sqlalchemy import inspect
from sqlalchemy.orm import DeclarativeBase


# =============================================================================
# Configuration dataclasses
# =============================================================================


@dataclass
class Through:
    """Through relation configuration (for many-to-many via junction table)."""
    parent_key: str = "id"
    child_match_field: str = ""  # Field in child that matches parent key
    target_key_field: str = ""   # Field to extract for next hop
    static_filters: dict[str, Any] = field(default_factory=dict)  # e.g. {"relationship_type": "owner"}


@dataclass
class Ref:
    """Direct reference configuration (FK relation)."""
    from_field: str = ""
    to_field: str = "id"


@dataclass
class AttachRelation:
    """
    Attach a relation to a foreign entity.

    Used by RelationsViewSet to inject relations into other entities
    without modifying their viewsets.

    Simplified approach:
    - Auto-infers subject_type/object_type from entity names
    - Defaults: status="active", id_field="id"
    - No need for Through class in simple cases

    Example:
        AttachRelation(
            parent_entity="Person",        # Add field to Person
            field_name="ownedProperties",  # Field name
            target_entity="Property",      # Returns Property objects
            relationship_type="property_owner",  # How to find relation
        )
    """
    parent_entity: str          # Entity to attach field to (e.g. "Person")
    field_name: str             # Name of the GraphQL field (e.g. "ownedProperties")
    target_entity: str          # Target entity type (e.g. "Property")
    relationship_type: str      # Relationship type in DB (e.g. "property_owner")

    # Optional overrides (with sensible defaults)
    parent_id_field: str = "id"
    target_id_field: str = "id"
    filters: dict[str, Any] = field(default_factory=lambda: {"status": "active"})
    cardinality: Literal["one", "many"] = "many"

    # Legacy support (deprecated - use simplified approach above)
    through: Through | None = None
    ref: Ref | None = None


@dataclass
class RelationConfig:
    """Relation configuration for direct declaration in viewsets."""
    target: str
    cardinality: Literal["one", "many"] = "many"
    through: Through | None = None
    ref: Ref | None = None


@dataclass
class AccessConfig:
    """Access control configuration."""
    tenant_strategy: Literal["none", "direct", "via_relations"] = "none"
    tenant_field: Optional[str] = None

    @classmethod
    def none(cls) -> "AccessConfig":
        return cls(tenant_strategy="none")

    @classmethod
    def direct(cls, tenant_field: str) -> "AccessConfig":
        return cls(tenant_strategy="direct", tenant_field=tenant_field)

    @classmethod
    def via_relations(cls, tenant_field: str) -> "AccessConfig":
        return cls(tenant_strategy="via_relations", tenant_field=tenant_field)


# =============================================================================
# Auto-discovery helpers
# =============================================================================

# Default filters by column type
DEFAULT_FILTERS_BY_TYPE = {
    "int": ["eq", "in", "gte", "lte", "isnull"],
    "string": ["eq", "in", "icontains", "isnull"],
    "bool": ["eq", "isnull"],
    "float": ["eq", "in", "gte", "lte", "isnull"],
    "datetime": ["eq", "gte", "lte", "isnull"],
    "date": ["eq", "gte", "lte", "isnull"],
}

# Types that are sortable by default
DEFAULT_SORTABLE_TYPES = {"int", "string", "float", "datetime", "date", "bool"}


def get_column_type(column) -> str:
    """Map SQLAlchemy column type to simple type string."""
    type_name = column.type.__class__.__name__.lower()

    if type_name in ("integer", "biginteger", "smallinteger"):
        return "int"
    elif type_name in ("string", "text", "varchar"):
        return "string"
    elif type_name in ("boolean",):
        return "bool"
    elif type_name in ("float", "numeric", "decimal"):
        return "float"
    elif type_name in ("datetime", "timestamp"):
        return "datetime"
    elif type_name in ("date",):
        return "date"
    elif type_name in ("json", "jsonb"):
        return "json"
    else:
        return "string"


def introspect_model_fields(
    model: type[DeclarativeBase],
    fields_include: Optional[List[str]] = None,
    fields_exclude: Optional[List[str]] = None,
    filter_overrides: dict[str, list[str]] | None = None,
    sortable_fields: set[str] | None = None,
) -> dict[str, dict]:
    """
    Auto-discover fields from SQLAlchemy model.

    Returns dict of field definitions ready for GraphJSON.
    """
    fields_exclude = fields_exclude or []
    filter_overrides = filter_overrides or {}
    mapper = inspect(model)

    result = {}

    for column in mapper.columns:
        field_name = column.key

        # Skip excluded fields
        if field_name in fields_exclude:
            continue

        # If include list specified, only include those
        if fields_include is not None and field_name not in fields_include:
            continue

        # Determine type
        field_type = get_column_type(column)

        # Determine filters
        if field_name in filter_overrides:
            filters = filter_overrides[field_name]
        else:
            filters = DEFAULT_FILTERS_BY_TYPE.get(field_type, ["eq", "in"])

        # Determine sortable
        if sortable_fields is not None:
            sortable = field_name in sortable_fields
        else:
            # By default, scalar types except json are sortable
            sortable = field_type in DEFAULT_SORTABLE_TYPES

        result[field_name] = {
            "type": field_type,
            "filters": filters,
            "sortable": sortable,
        }

    return result


def get_model_keys(model: type[DeclarativeBase]) -> list[str]:
    """Get primary key field names from model."""
    mapper = inspect(model)
    return [pk.name for pk in mapper.primary_key]


# =============================================================================
# ViewSet base classes
# =============================================================================


class ModelViewSet:
    """
    Base viewset for entity models.

    Provides auto-discovery of fields from SQLAlchemy model.
    Override attributes to customize behavior.

    Example:
        class PersonViewSet(ModelViewSet):
            model = Person
            # service and resource are auto-inferred from model name
            # service = "person"  (optional override)
            # resource = "/person"  (optional override)

            # Optional overrides
            fields_exclude = ["internal_note"]
            filter_overrides = {"name": ["eq", "icontains"]}
    """

    # Required
    model: type[DeclarativeBase]

    # Optional - auto-inferred from model name if not specified
    service: Optional[str] = None
    resource: Optional[str] = None

    # Optional field configuration
    fields_include: Optional[List[str]] = None  # None = all fields
    fields_exclude: list[str] = []
    filter_overrides: dict[str, list[str]] = {}
    sortable_fields: set[str] | None = None  # None = auto by type

    # Pagination defaults
    pagination_default_limit: int = 50
    pagination_max_limit: int = 200

    # Relations declared directly on this entity
    relations: dict[str, RelationConfig] = {}

    # Access control
    access: AccessConfig = field(default_factory=AccessConfig.none)

    # Cache configuration
    cache: Optional["CacheConfig"] = None

    @classmethod
    def get_entity_name(cls) -> str:
        """Get entity name (model class name)."""
        return cls.model.__name__

    @classmethod
    def get_service(cls) -> str:
        """Get service name. Auto-inferred from model name if not specified."""
        if cls.service is not None:
            return cls.service
        return cls.model.__name__.lower()

    @classmethod
    def get_resource(cls) -> str:
        """Get resource path. Auto-inferred from model name if not specified."""
        if cls.resource is not None:
            return cls.resource
        return "/" + cls.model.__name__.lower()

    @classmethod
    def get_fields(cls) -> dict[str, dict]:
        """Get field definitions with auto-discovery."""
        return introspect_model_fields(
            cls.model,
            fields_include=cls.fields_include,
            fields_exclude=cls.fields_exclude,
            filter_overrides=cls.filter_overrides,
            sortable_fields=cls.sortable_fields,
        )

    @classmethod
    def get_keys(cls) -> list[str]:
        """Get primary key fields."""
        return get_model_keys(cls.model)

    @classmethod
    def get_relations(cls) -> dict[str, dict]:
        """Get relations as dict for GraphJSON."""
        result = {}
        for name, config in cls.relations.items():
            rel = {"target": config.target, "cardinality": config.cardinality}
            if config.through:
                rel["through"] = {
                    "model": config.target,
                    "relationship_type": config.through.static_filters.get("relationship_type", ""),
                    "parent_match_field": config.through.child_match_field,
                    "target_key_field": config.through.target_key_field,
                }
            if config.ref:
                rel["ref"] = {
                    "from_field": config.ref.from_field,
                    "to_field": config.ref.to_field,
                }
            result[name] = rel
        return result

    @classmethod
    def get_access(cls) -> dict:
        """Get access config as dict."""
        # Handle both dataclass instance and class default
        access = cls.access
        if isinstance(access, type):
            access = AccessConfig.none()
        return {
            "tenant_strategy": access.tenant_strategy,
            "tenant_field": access.tenant_field,
        }

    @classmethod
    def to_entity_dict(cls) -> dict:
        """Convert to entity dict for GraphJSON."""
        return {
            "service": cls.get_service(),
            "resource": cls.get_resource(),
            "keys": cls.get_keys(),
            "fields": cls.get_fields(),
            "relations": cls.get_relations(),
            "access": cls.get_access(),
        }


class RelationsViewSet(ModelViewSet):
    """
    ViewSet for relations service.

    In addition to being an entity itself, it can attach relations
    to other entities without modifying their viewsets.

    Example (simplified approach):
        class RelationshipViewSet(RelationsViewSet):
            model = Relationship
            service = "relations"

            attach = [
                # Person.ownedProperties -> [Property]
                AttachRelation(
                    parent_entity="Person",
                    field_name="ownedProperties",
                    target_entity="Property",
                    relationship_type="property_owner",
                ),
                # Property.owners -> [Person]
                AttachRelation(
                    parent_entity="Property",
                    field_name="owners",
                    target_entity="Person",
                    relationship_type="property_owner",
                ),
            ]
    """

    # Relations to attach to other entities
    attach: list[AttachRelation] = []

    @classmethod
    def get_attached_relations(cls) -> list[AttachRelation]:
        """Get list of relations to attach to other entities."""
        return cls.attach


# Fix dataclass default issue for class attributes
ModelViewSet.access = AccessConfig.none()
ModelViewSet.relations = {}
ModelViewSet.fields_exclude = []
ModelViewSet.filter_overrides = {}
ModelViewSet.cache = None
RelationsViewSet.attach = []
