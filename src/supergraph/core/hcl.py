"""
HCL (HashiCorp Configuration Language) generator for Supergraph.

Generates human-readable supergraph schema in HCL format.

New format supports:
- relation_providers block for defining relation backends
- presets block for reusable relation patterns
- entities use `rel { use = "preset" }` or `rel { ref {...} }`
"""

from __future__ import annotations

from typing import Any


# Default filters by field type
DEFAULT_FILTERS = {
    "int": ["eq", "in", "gte", "lte", "isnull"],
    "string": ["eq", "in", "icontains", "isnull"],
    "bool": ["eq", "isnull"],
    "datetime": ["eq", "gte", "lte", "isnull"],
}


def to_hcl(graph: dict[str, Any]) -> str:
    """
    Convert GraphJSON to HCL format.

    Example output:
    ```hcl
    version = 1

    services {
      person    = "http://person:8002"
      property  = "http://property:8001"
      relations = "http://relations:8003"
    }

    defaults {
      filters {
        int      = ["eq", "in", "gte", "lte", "isnull"]
        string   = ["eq", "in", "icontains", "isnull"]
      }
    }

    relation_providers {
      relations_db {
        service       = "relations"
        entity        = "Relationship"
        subject_field = "subject_id"
        object_field  = "object_id"
        type_field    = "relationship_type"
        status_field  = "status"
      }
    }

    presets {
      rel "owner_of_property" {
        provider    = "relations_db"
        type        = "property_owner"
        status      = "active"
        direction   = "out"
        target      = "Property"
        cardinality = "many"
      }
    }

    entity "Person" {
      service = "person"
      keys    = ["id"]
      rel "owned_properties" { use = "owner_of_property" }
    }
    ```
    """
    lines = []
    lines.append(f'version = {graph.get("version", 1)}')
    lines.append("")

    # Services block
    services = graph.get("services", {})
    if services:
        lines.append("services {")
        max_name_len = max(len(name) for name in services.keys()) if services else 0
        for name, svc in services.items():
            url = svc["url"] if isinstance(svc, dict) else svc
            padding = " " * (max_name_len - len(name))
            lines.append(f'  {name}{padding} = "{url}"')
        lines.append("}")
        lines.append("")

    # Defaults block
    lines.append("defaults {")
    lines.append("  filters {")
    for type_name, filters in DEFAULT_FILTERS.items():
        lines.append(f"    {type_name:8} = {_format_list(filters)}")
    lines.append("  }")
    lines.append("}")
    lines.append("")

    # Relation providers block
    providers = graph.get("relation_providers", {})
    if providers:
        lines.append("relation_providers {")
        for prov_name, prov_def in providers.items():
            lines.append(f'  {prov_name} {{')
            lines.append(f'    service       = "{prov_def["service"]}"')
            lines.append(f'    entity        = "{prov_def["entity"]}"')
            lines.append(f'    subject_field = "{prov_def.get("subject_field", "subject_id")}"')
            lines.append(f'    object_field  = "{prov_def.get("object_field", "object_id")}"')
            lines.append(f'    type_field    = "{prov_def.get("type_field", "relationship_type")}"')
            if prov_def.get("status_field"):
                lines.append(f'    status_field  = "{prov_def["status_field"]}"')
            if prov_def.get("meta_field"):
                lines.append(f'    meta_field    = "{prov_def["meta_field"]}"')
            lines.append("  }")
        lines.append("}")
        lines.append("")

    # Presets block
    presets = graph.get("presets", {})
    if presets:
        lines.append("presets {")
        for preset_name, preset_def in presets.items():
            lines.append(f'  rel "{preset_name}" {{')
            lines.append(f'    provider    = "{preset_def["provider"]}"')
            if preset_def.get("type"):
                lines.append(f'    type        = "{preset_def["type"]}"')
            if preset_def.get("status"):
                lines.append(f'    status      = "{preset_def["status"]}"')
            lines.append(f'    direction   = "{preset_def.get("direction", "out")}"')
            lines.append(f'    target      = "{preset_def["target"]}"')
            lines.append(f'    cardinality = "{preset_def.get("cardinality", "many")}"')
            lines.append("  }")
        lines.append("}")
        lines.append("")

    # Entities
    for name, entity in graph.get("entities", {}).items():
        lines.append(f'entity "{name}" {{')
        lines.append(f'  service = "{entity["service"]}"')
        lines.append(f'  keys    = {_format_list(entity.get("keys", ["id"]))}')

        # Fields
        fields = entity.get("fields", {})
        if fields:
            lines.append("")
            for field_name, field_def in fields.items():
                field_lines = _format_field(field_name, field_def)
                lines.extend(field_lines)

        # Access
        access = entity.get("access", {})
        tenant_strategy = access.get("tenant_strategy", "none")
        if tenant_strategy != "none" and tenant_strategy:
            tenant_field = access.get("tenant_field")
            if tenant_strategy == "direct" and tenant_field:
                lines.append(f'  access.direct "{tenant_field}"')

        # Relations
        relations = entity.get("relations", {})
        if relations:
            lines.append("")
            for rel_name, rel_def in relations.items():
                rel_lines = _format_relation(rel_name, rel_def)
                lines.extend(rel_lines)

        lines.append("}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _format_field(field_name: str, field_def: dict) -> list[str]:
    """Format a field in HCL format - compact one-liner style."""
    lines = []
    field_type = field_def.get("type", "string")
    nullable = field_def.get("nullable", True)
    enum_values = field_def.get("enum_values", [])

    # Build inline attributes
    attrs = [f'type = "{field_type}"']

    if not nullable:
        attrs.append("required")

    if enum_values:
        # Short enum inline
        if len(enum_values) <= 3:
            attrs.append(f'values = {_format_list(enum_values)}')
        else:
            # Just indicate it's an enum, values are in schema
            attrs.append(f'values = [{len(enum_values)}]')

    lines.append(f'  field "{field_name}" {{ {", ".join(attrs)} }}')
    return lines


def _format_relation(rel_name: str, rel_def: dict) -> list[str]:
    """Format a relation in HCL format."""
    lines = []
    kind = rel_def.get("kind", "")

    # Provider-based relation using preset
    if kind == "provider" and rel_def.get("preset"):
        lines.append(f'  rel "{rel_name}" {{ use = "{rel_def["preset"]}" }}')

    # Ref relation (direct FK)
    elif kind == "ref" or ("ref" in rel_def and "through" not in rel_def):
        ref = rel_def.get("ref", {})
        from_field = ref.get("from_field", "")
        to_entity = ref.get("to_entity", rel_def.get("target", ""))
        to_field = ref.get("to_field", "id")
        cardinality = rel_def.get("cardinality", "many")

        lines.append(f'  rel "{rel_name}" {{')
        lines.append(f'    ref {{ from = "{from_field}" to = "{to_entity}.{to_field}" }}')
        lines.append(f'    cardinality = "{cardinality}"')
        lines.append("  }")

    # Provider relation (inline, no preset)
    elif kind == "provider":
        lines.append(f'  rel "{rel_name}" {{')
        lines.append(f'    provider    = "{rel_def.get("provider", "relations_db")}"')
        if rel_def.get("type"):
            lines.append(f'    type        = "{rel_def["type"]}"')
        if rel_def.get("status"):
            lines.append(f'    status      = "{rel_def["status"]}"')
        lines.append(f'    direction   = "{rel_def.get("direction", "out")}"')
        lines.append(f'    target      = "{rel_def.get("target", "")}"')
        lines.append(f'    cardinality = "{rel_def.get("cardinality", "many")}"')
        lines.append("  }")

    # Legacy through relation -> show as provider
    elif "through" in rel_def:
        through = rel_def["through"]
        direction = "out" if through.get("parent_match_field") == "object_id" else "in"
        lines.append(f'  rel "{rel_name}" {{')
        lines.append('    provider    = "relations_db"')
        if through.get("relationship_type"):
            lines.append(f'    type        = "{through["relationship_type"]}"')
        lines.append(f'    direction   = "{direction}"')
        lines.append(f'    target      = "{rel_def.get("target", "")}"')
        lines.append(f'    cardinality = "{rel_def.get("cardinality", "many")}"')
        lines.append("  }")

    return lines


def _format_list(items: list) -> str:
    """Format list as HCL array."""
    if not items:
        return "[]"
    quoted = [f'"{item}"' for item in items]
    return "[" + ", ".join(quoted) + "]"


# =============================================================================
# Graph transformation helpers
# =============================================================================


def transform_graph_to_new_format(graph: dict[str, Any]) -> dict[str, Any]:
    """
    Transform legacy GraphJSON to new format with relation_providers and presets.

    This converts:
    - through relations -> kind=provider
    - ref relations -> kind=ref
    - adds relation_providers block
    - creates presets for common patterns
    """
    # Default relations_db provider
    relation_providers = {
        "relations_db": {
            "service": "relations",
            "entity": "Relationship",
            "subject_field": "subject_id",
            "object_field": "object_id",
            "type_field": "relationship_type",
            "status_field": "status",
            "meta_field": "meta",
        }
    }

    # Collect presets
    presets = {}
    preset_counter = 0

    # Transform entities
    new_entities = {}
    for entity_name, entity_def in graph.get("entities", {}).items():
        new_entity = {
            "service": entity_def["service"],
            "resource": entity_def.get("resource", "/" + entity_name.lower()),
            "keys": entity_def.get("keys", ["id"]),
            "fields": entity_def.get("fields", {}),
            "access": entity_def.get("access", {"tenant_strategy": "none"}),
            "relations": {},
        }

        for rel_name, rel_def in entity_def.get("relations", {}).items():
            if "through" in rel_def:
                # Convert through to provider relation
                through = rel_def["through"]
                parent_match = through.get("parent_match_field", "")
                direction = "out" if parent_match == "object_id" else "in"
                rel_type = through.get("relationship_type", "")
                status = through.get("status", "")

                # Create or find preset
                preset_key = f"{rel_type}_{direction}_{status}"
                if preset_key not in presets:
                    preset_name = f"{rel_type}_{direction}" if rel_type else f"preset_{preset_counter}"
                    preset_counter += 1
                    presets[preset_key] = {
                        "name": preset_name,
                        "provider": "relations_db",
                        "type": rel_type,
                        "status": status,
                        "direction": direction,
                        "target": rel_def.get("target", ""),
                        "cardinality": rel_def.get("cardinality", "many"),
                    }

                preset_info = presets[preset_key]
                new_entity["relations"][rel_name] = {
                    "kind": "provider",
                    "preset": preset_info["name"],
                    "provider": "relations_db",
                    "target": rel_def.get("target", ""),
                    "cardinality": rel_def.get("cardinality", "many"),
                    "direction": direction,
                    "type": rel_type,
                    "status": status,
                }

            elif "ref" in rel_def:
                # Convert to kind=ref
                ref = rel_def["ref"]
                new_entity["relations"][rel_name] = {
                    "kind": "ref",
                    "target": rel_def.get("target", ""),
                    "cardinality": rel_def.get("cardinality", "one"),
                    "ref": {
                        "from_field": ref.get("from_field", ""),
                        "to_entity": rel_def.get("target", ""),
                        "to_field": ref.get("to_field", "id"),
                    },
                }

            else:
                # Keep as-is
                new_entity["relations"][rel_name] = rel_def

        new_entities[entity_name] = new_entity

    # Build final presets dict
    final_presets = {}
    for preset_key, preset_info in presets.items():
        name = preset_info.pop("name")
        final_presets[name] = preset_info

    return {
        "version": 1,
        "services": graph.get("services", {}),
        "relation_providers": relation_providers,
        "presets": final_presets,
        "entities": new_entities,
    }
