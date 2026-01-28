"""
TypeScript types generator from Supergraph schema.

Generates:
- Entity interfaces
- Filter types
- Relations types
- Create/Update input types
- Query config types
- Typed hooks using createTypedHooks
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


def map_field_type(field: dict) -> str:
    """Map schema field type to TypeScript type."""
    field_type = field.get("type", "string")
    nullable = field.get("nullable", False)

    base_type = {
        "string": "string",
        "int": "number",
        "bool": "boolean",
        "datetime": "string",
        "date": "string",
        "json": "Record<string, unknown>",
    }.get(field_type, "unknown")

    # Handle enums
    if field_type == "enum":
        enum_values = field.get("enum_values", [])
        if enum_values:
            base_type = " | ".join(f"'{v}'" for v in enum_values)
        else:
            base_type = "string"

    return f"{base_type} | null" if nullable else base_type


def get_filter_type(field: dict) -> str:
    """Get filter type for a field."""
    field_type = field.get("type", "string")

    filter_map = {
        "string": "StringFilter",
        "int": "NumberFilter",
        "bool": "BooleanFilter",
        "datetime": "DateFilter",
        "date": "DateFilter",
        "json": "JsonFilter",
    }

    if field_type == "enum":
        enum_values = field.get("enum_values", [])
        if enum_values:
            enum_type = " | ".join(f"'{v}'" for v in enum_values)
            return f"EnumFilter<{enum_type}>"
        return "StringFilter"

    return filter_map.get(field_type, "StringFilter")


def generate_entity_interface(entity_name: str, entity: dict) -> list[str]:
    """Generate TypeScript interface for entity."""
    lines = [f"export interface {entity_name} {{"]

    # Sort fields: id first, then FK fields, then alphabetical
    fields = sorted(
        entity.get("fields", {}).items(),
        key=lambda x: (
            0 if x[0] == "id" else (1 if x[0].endswith("_id") else 2),
            x[0],
        ),
    )

    for field_name, field in fields:
        ts_type = map_field_type(field)
        optional = "?" if field.get("nullable") else ""
        lines.append(f"  {field_name}{optional}: {ts_type}")

    # Relations
    relations = entity.get("relations", {})
    if relations:
        lines.append("  // Relations")
        for rel_name, rel in sorted(relations.items()):
            target = rel.get("target", "unknown")
            if rel.get("cardinality") == "many":
                lines.append(f"  {rel_name}?: {target}[]")
            else:
                lines.append(f"  {rel_name}?: {target} | null")

    lines.append("}")
    return lines


def generate_fields_type(entity_name: str, entity: dict) -> str:
    """Generate union type of field names."""
    field_names = list(entity.get("fields", {}).keys())
    if not field_names:
        return f"export type {entity_name}Fields = never"
    return f"export type {entity_name}Fields = {' | '.join(repr(f) for f in field_names)}"


def generate_filters_type(entity_name: str, entity: dict) -> list[str]:
    """Generate filters interface."""
    lines = [f"export interface {entity_name}Filters {{"]

    for field_name, field in sorted(entity.get("fields", {}).items()):
        filter_type = get_filter_type(field)
        lines.append(f"  {field_name}?: {filter_type}")

    lines.append("}")
    return lines


def generate_relations_type(entity_name: str, entity: dict) -> list[str]:
    """Generate relations config type."""
    relations = entity.get("relations", {})
    if not relations:
        return [f"export type {entity_name}Relations = Record<string, never>"]

    lines = [f"export interface {entity_name}Relations {{"]

    for rel_name, rel in sorted(relations.items()):
        target = rel.get("target", "unknown")
        lines.append(f"  {rel_name}?: {target}QueryConfig | true | string[]")

    lines.append("}")
    return lines


def generate_create_input_type(entity_name: str, entity: dict) -> list[str]:
    """Generate create input interface."""
    lines = [f"export interface {entity_name}CreateInput {{"]

    for field_name, field in sorted(entity.get("fields", {}).items()):
        if field_name == "id":
            continue  # Skip id for create
        ts_type = map_field_type(field)
        optional = "?" if field.get("nullable") else ""
        lines.append(f"  {field_name}{optional}: {ts_type}")

    lines.append("}")
    return lines


def generate_update_input_type(entity_name: str, entity: dict) -> list[str]:
    """Generate update input interface."""
    lines = [f"export interface {entity_name}UpdateInput {{", "  id: number"]

    for field_name, field in sorted(entity.get("fields", {}).items()):
        if field_name == "id":
            continue
        ts_type = map_field_type(field)
        lines.append(f"  {field_name}?: {ts_type}")

    lines.append("}")
    return lines


def generate_query_config_type(entity_name: str, entity: dict) -> list[str]:
    """Generate query config interface."""
    return [
        f"export interface {entity_name}QueryConfig {{",
        f"  fields?: {entity_name}Fields[]",
        f"  filters?: {entity_name}Filters",
        f"  relations?: {entity_name}Relations",
        f"  ordering?: OrderingConfig<{entity_name}Fields>[]",
        "  limit?: number",
        "  offset?: number",
        f"  exclude?: {entity_name}Fields[]",
        "}",
    ]


def generate_typed_hooks(entity_name: str) -> list[str]:
    """Generate typed hooks for entity."""
    return [
        f"export const {entity_name}Hooks = createTypedHooks<",
        f"  '{entity_name}',",
        f"  {entity_name},",
        f"  {entity_name}Fields,",
        f"  {entity_name}Filters,",
        f"  {entity_name}Relations,",
        f"  {entity_name}CreateInput,",
        f"  {entity_name}UpdateInput",
        f">('{entity_name}')",
    ]


def generate_typescript(graph: dict) -> str:
    """
    Generate TypeScript types from Supergraph schema.

    Args:
        graph: Compiled graph schema

    Returns:
        TypeScript source code as string
    """
    lines: list[str] = []

    # Header
    lines.extend(
        [
            "// Auto-generated TypeScript types from Supergraph schema",
            "// Do not edit manually - regenerate with: npx use-supergraph generate",
            f"// Generated at: {datetime.utcnow().isoformat()}Z",
            "",
            "import { createTypedHooks } from '@supergraph/use-supergraph'",
            "import type {",
            "  StringFilter,",
            "  NumberFilter,",
            "  BooleanFilter,",
            "  DateFilter,",
            "  EnumFilter,",
            "  JsonFilter,",
            "  OrderingConfig,",
            "} from '@supergraph/use-supergraph'",
            "",
        ]
    )

    entities = sorted(graph.get("entities", {}).items())

    # Entity names type
    lines.extend(
        [
            "// " + "=" * 76,
            "// Entity Names",
            "// " + "=" * 76,
            "",
            f"export type EntityName = {' | '.join(repr(name) for name, _ in entities)}",
            "",
        ]
    )

    # Generate types for each entity
    for entity_name, entity in entities:
        lines.extend(
            [
                "// " + "=" * 76,
                f"// {entity_name}",
                "// " + "=" * 76,
                "",
            ]
        )

        # Entity interface
        lines.extend(generate_entity_interface(entity_name, entity))
        lines.append("")

        # Fields type
        lines.append(generate_fields_type(entity_name, entity))
        lines.append("")

        # Filters type
        lines.extend(generate_filters_type(entity_name, entity))
        lines.append("")

        # Relations type
        lines.extend(generate_relations_type(entity_name, entity))
        lines.append("")

        # Create input
        lines.extend(generate_create_input_type(entity_name, entity))
        lines.append("")

        # Update input
        lines.extend(generate_update_input_type(entity_name, entity))
        lines.append("")

        # Query config
        lines.extend(generate_query_config_type(entity_name, entity))
        lines.append("")

        # Typed hooks
        lines.extend(generate_typed_hooks(entity_name))
        lines.append("")

    # Combined hooks export
    lines.extend(
        [
            "// " + "=" * 76,
            "// Combined Hooks Export",
            "// " + "=" * 76,
            "",
            "export const hooks = {",
        ]
    )

    for entity_name, _ in entities:
        lines.append(f"  {entity_name}: {entity_name}Hooks,")

    lines.extend(["}", ""])

    # Type map
    lines.extend(
        [
            "// Type maps for generic usage",
            "export type EntityTypeMap = {",
        ]
    )

    for entity_name, _ in entities:
        lines.append(f"  {entity_name}: {entity_name}")

    lines.extend(["}", ""])

    return "\n".join(lines)
