"""
ViewSet base classes for Supergraph - DRF-style configuration.

Models stay pure ORM. All graph configuration lives here.

Usage:
    class PersonViewSet(ModelViewSet):
        model = Person
        # service auto-inferred: "person"

    class RelationshipViewSet(RelationsViewSet):
        model = Relationship
        service = "relations"  # override default

        attach = [
            # Add "ownedProperties" field to Person entity
            AttachRelation(
                parent_entity="Person",
                name="ownedProperties",
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

    Two modes:
    1. Simplified (via relationship_type): auto-resolves through relations service
    2. Explicit (via through/ref): manual configuration for complex cases

    Example (simplified):
        AttachRelation(
            parent_entity="Person",        # Add field to Person
            name="ownedProperties",        # Relation name
            target_entity="Property",      # Returns Property objects
            relationship_type="property_owner",  # How to find relation
        )

    Example (explicit ref):
        AttachRelation(
            parent_entity="Relationship",
            name="property",
            target_entity="Property",
            ref=Ref(from_field="subject_id", to_field="id"),
            cardinality="one",
        )
    """
    parent_entity: str          # Entity to attach field to (e.g. "Person")
    name: str                   # Relation name on parent (e.g. "ownedProperties")
    target_entity: str          # Target entity type (e.g. "Property")
    relationship_type: str = "" # Relationship type in DB (optional for ref relations)

    # Optional overrides (with sensible defaults)
    parent_id_field: str = "id"
    target_id_field: str = "id"
    filters: dict[str, Any] = field(default_factory=lambda: {"status": "active"})
    cardinality: Literal["one", "many"] = "many"
    # Direction for provider relations:
    # "in" = parent is subject (parent.id matches subject_id, get object_id for target)
    # "out" = parent is object (parent.id matches object_id, get subject_id for target)
    direction: Literal["in", "out"] = "out"

    # Explicit relation configuration (use instead of relationship_type for complex cases)
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


def get_column_type(column) -> tuple[str, list[str] | None]:
    """
    Map SQLAlchemy column type to simple type string.

    Returns:
        Tuple of (type_name, enum_values or None)
    """
    type_name = column.type.__class__.__name__.lower()

    if type_name in ("integer", "biginteger", "smallinteger"):
        return "int", None
    elif type_name in ("string", "text", "varchar"):
        return "string", None
    elif type_name in ("boolean",):
        return "bool", None
    elif type_name in ("float", "numeric", "decimal"):
        return "float", None
    elif type_name in ("datetime", "timestamp"):
        return "datetime", None
    elif type_name in ("date",):
        return "date", None
    elif type_name in ("json", "jsonb"):
        return "json", None
    elif type_name == "enum":
        # Extract enum values from SQLAlchemy Enum type
        enum_values = None
        if hasattr(column.type, 'enum_class') and column.type.enum_class is not None:
            # Python Enum class
            enum_values = [e.value for e in column.type.enum_class]
        elif hasattr(column.type, 'enums'):
            # String-based enum
            enum_values = list(column.type.enums)
        return "enum", enum_values
    else:
        return "string", None


def table_name_to_entity_name(table_name: str) -> str:
    """
    Convert snake_case table name to PascalCase entity name.
    Also handles plural table names by converting to singular.

    Examples:
        "person" -> "Person"
        "persons" -> "Person"
        "camera_event" -> "CameraEvent"
        "camera_events" -> "CameraEvent"
        "ftp_journal_entry" -> "FtpJournalEntry"
        "property_types" -> "PropertyType"
        "floor_plans" -> "FloorPlan" -> "Plan" (special case)
        "properties" -> "Property"
        "entries" -> "Entry"
    """
    # Special table name mappings (table_name -> entity_name)
    SPECIAL_MAPPINGS = {
        "floor_plans": "Plan",
        "property_types": "PropertyType",
        "geo_objects": "GeoObject",
        "camera_brands": "CameraBrand",
        "camera_models": "CameraModel",
    }

    if table_name in SPECIAL_MAPPINGS:
        return SPECIAL_MAPPINGS[table_name]

    # Convert to PascalCase
    words = table_name.split("_")

    # Handle last word plural -> singular
    last_word = words[-1]
    if last_word.endswith("ies"):
        # entries -> entry, properties -> property
        words[-1] = last_word[:-3] + "y"
    elif last_word.endswith("es") and not last_word.endswith("ses"):
        # Not for "ses" endings like "addresses"
        # boxes -> box, matches -> match
        if last_word.endswith("xes") or last_word.endswith("ches") or last_word.endswith("shes"):
            words[-1] = last_word[:-2]
        else:
            words[-1] = last_word[:-1]  # types -> type (actually just remove 's')
    elif last_word.endswith("s") and len(last_word) > 1:
        # persons -> person, events -> event
        words[-1] = last_word[:-1]

    return "".join(word.capitalize() for word in words)


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
    Includes foreign key information when present.
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

        # Determine type and enum values
        field_type, enum_values = get_column_type(column)

        # Determine filters
        if field_name in filter_overrides:
            filters = filter_overrides[field_name]
        else:
            # For enums, use string-like filters
            filter_type = "string" if field_type == "enum" else field_type
            filters = DEFAULT_FILTERS_BY_TYPE.get(filter_type, ["eq", "in"])

        # Determine sortable
        if sortable_fields is not None:
            sortable = field_name in sortable_fields
        else:
            # By default, scalar types except json are sortable (enums too)
            sortable = field_type in DEFAULT_SORTABLE_TYPES or field_type == "enum"

        # Determine nullable (primary keys are never nullable for our purposes)
        is_primary_key = column.primary_key
        nullable = column.nullable if not is_primary_key else True  # id is always auto-generated

        field_def = {
            "type": field_type,
            "filters": filters,
            "sortable": sortable,
            "nullable": nullable,
        }

        # Add enum values if present
        if enum_values is not None:
            field_def["enum_values"] = enum_values

        # Check for foreign key and extract target entity
        if column.foreign_keys:
            for fk in column.foreign_keys:
                # fk.target_fullname is like "person.id" or "camera_event.id"
                target_table = fk.column.table.name
                target_column = fk.column.name
                target_entity = table_name_to_entity_name(target_table)

                field_def["fk"] = {
                    "target_entity": target_entity,
                    "target_field": target_column,
                }
                break  # Only take the first FK if multiple (rare case)

        result[field_name] = field_def

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
            # service is auto-inferred from model name
            # service = "person"  (optional override)

            # Optional overrides
            fields_exclude = ["internal_note"]
            filter_overrides = {"name": ["eq", "icontains"]}
    """

    # Required
    model: type[DeclarativeBase]

    # Optional - auto-inferred from model name if not specified
    service: Optional[str] = None

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

    # Access control (set at module level below to avoid mutable default)
    access: AccessConfig

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

    Example:
        class RelationshipViewSet(RelationsViewSet):
            model = Relationship
            service = "relations"

            attach = [
                # Person.ownedProperties -> [Property]
                AttachRelation(
                    parent_entity="Person",
                    name="ownedProperties",
                    target_entity="Property",
                    relationship_type="property_owner",
                ),
                # Property.owners -> [Person]
                AttachRelation(
                    parent_entity="Property",
                    name="owners",
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
