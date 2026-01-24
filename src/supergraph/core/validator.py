"""
Query validator and normalizer.

Validates incoming JSONQuery against the graph schema and normalizes
filters/order into structured format.
"""

from __future__ import annotations

from typing import Any, List, Optional, Tuple

from .query_types import (
    JSONQuery,
    NormalizedFilter,
    NormalizedOrder,
    NormalizedQuery,
    NormalizedSelectionNode,
    SelectionNode,
)


# Supported filter operators
SUPPORTED_OPS = {"eq", "in", "icontains", "gte", "lte", "isnull"}


class QueryValidator:
    """
    Validates and normalizes JSON queries against the graph schema.

    Usage:
        validator = QueryValidator(graph)
        errors, normalized = validator.validate_and_normalize(query)
    """

    def __init__(self, graph: dict):
        """
        Initialize validator with graph schema.

        Args:
            graph: Compiled graph JSON (from GraphCompiler or hardcoded)
        """
        self.graph = graph
        self.entities = graph.get("entities", {})

    def validate_and_normalize(
        self, query: JSONQuery
    ) -> tuple[list[str], NormalizedQuery | None]:
        """
        Validate and normalize the query.

        Returns:
            Tuple of (errors, normalized_query).
            If errors is non-empty, normalized_query is None.
        """
        errors: list[str] = []

        # Check entity exists
        if query.entity not in self.entities:
            errors.append(f"Entity '{query.entity}' not found")
            return errors, None

        entity_def = self.entities[query.entity]

        # Normalize and validate root filters
        root_filters, filter_errors = self._normalize_and_validate_filters(
            query.filters, entity_def, f"{query.entity}"
        )
        errors.extend(filter_errors)

        # Check if this is a single-item query (has id__eq filter)
        is_single = any(f.field == "id" and f.op == "eq" for f in root_filters)

        # Normalize and validate selection
        normalized_select, select_errors = self._normalize_selection(
            query.select, entity_def, f"{query.entity}"
        )
        errors.extend(select_errors)

        if errors:
            return errors, None

        return errors, NormalizedQuery(
            action=query.action,
            entity=query.entity,
            filters=root_filters,
            select=normalized_select,
            is_single=is_single,
        )

    def _normalize_and_validate_filters(
        self, raw_filters: dict[str, Any], entity_def: dict, path: str
    ) -> tuple[list[NormalizedFilter], list[str]]:
        """
        Parse and validate filters.

        Input: {"name__icontains": "test", "id__in": [1,2]}
        Output: [NormalizedFilter(field="name", op="icontains", value="test"), ...]
        """
        filters: list[NormalizedFilter] = []
        errors: list[str] = []
        fields_def = entity_def.get("fields", {})

        for key, value in raw_filters.items():
            # Parse field__op format
            if "__" in key:
                parts = key.rsplit("__", 1)
                field_name = parts[0]
                op = parts[1]
            else:
                # Default to 'eq' if no operator specified
                field_name = key
                op = "eq"

            # Validate field exists
            if field_name not in fields_def:
                errors.append(f"{path}: field '{field_name}' not found")
                continue

            # Validate operator is supported
            if op not in SUPPORTED_OPS:
                errors.append(f"{path}: operator '{op}' not supported")
                continue

            # Validate operator is allowed for this field
            field_def = fields_def[field_name]
            allowed_ops = field_def.get("filters", [])
            if op not in allowed_ops:
                errors.append(
                    f"{path}: operator '{op}' not allowed for field '{field_name}' "
                    f"(allowed: {allowed_ops})"
                )
                continue

            filters.append(NormalizedFilter(field=field_name, op=op, value=value))

        return filters, errors

    def _normalize_and_validate_order(
        self, raw_order: list[str], entity_def: dict, path: str
    ) -> tuple[list[NormalizedOrder], list[str]]:
        """
        Parse and validate order.

        Input: ["-created_at", "name"]
        Output: [NormalizedOrder(field="created_at", dir="desc"), ...]
        """
        order: list[NormalizedOrder] = []
        errors: list[str] = []
        fields_def = entity_def.get("fields", {})

        for item in raw_order:
            if item.startswith("-"):
                field_name = item[1:]
                direction = "desc"
            else:
                field_name = item
                direction = "asc"

            # Validate field exists
            if field_name not in fields_def:
                errors.append(f"{path}: order field '{field_name}' not found")
                continue

            # Validate field is sortable
            field_def = fields_def[field_name]
            if not field_def.get("sortable", False):
                errors.append(f"{path}: field '{field_name}' is not sortable")
                continue

            order.append(NormalizedOrder(field=field_name, dir=direction))

        return order, errors

    def _normalize_selection(
        self, selection: SelectionNode, entity_def: dict, path: str
    ) -> tuple[NormalizedSelectionNode, list[str]]:
        """
        Recursively normalize and validate a selection node.
        """
        errors: list[str] = []
        fields_def = entity_def.get("fields", {})
        relations_def = entity_def.get("relations", {})

        # Validate requested fields exist
        validated_fields: list[str] = []
        for field_name in selection.fields:
            if field_name not in fields_def:
                errors.append(f"{path}: field '{field_name}' not found")
            else:
                validated_fields.append(field_name)

        # Normalize filters
        normalized_filters, filter_errors = self._normalize_and_validate_filters(
            selection.filters, entity_def, path
        )
        errors.extend(filter_errors)

        # Normalize order
        normalized_order, order_errors = self._normalize_and_validate_order(
            selection.order, entity_def, path
        )
        errors.extend(order_errors)

        # Recursively validate relations
        normalized_relations: dict[str, NormalizedSelectionNode] = {}
        for relation_name, relation_selection in selection.relations.items():
            # Check relation exists
            if relation_name not in relations_def:
                errors.append(f"{path}: relation '{relation_name}' not found")
                continue

            relation_def = relations_def[relation_name]
            target_entity_name = relation_def.get("target")

            # Check target entity exists
            if target_entity_name not in self.entities:
                errors.append(
                    f"{path}.{relation_name}: target entity '{target_entity_name}' not found"
                )
                continue

            target_entity_def = self.entities[target_entity_name]

            # Recursively normalize nested selection
            nested_normalized, nested_errors = self._normalize_selection(
                relation_selection, target_entity_def, f"{path}.{relation_name}"
            )
            errors.extend(nested_errors)
            normalized_relations[relation_name] = nested_normalized

        return (
            NormalizedSelectionNode(
                fields=validated_fields,
                filters=normalized_filters,
                order=normalized_order,
                limit=selection.limit,
                offset=selection.offset,
                relations=normalized_relations,
            ),
            errors,
        )
