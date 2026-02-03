"""
Nested serializer compiler - transforms nested mutations to transaction steps.

Converts Django REST Framework-like nested syntax:

{
    "create": {
        "Person": {
            "data": {"first_name": "John"},
            "nested": {
                "ownedProperties": [
                    {"data": {"address": "123 Main St"}}
                ]
            }
        }
    }
}

Into transaction format:

{
    "transaction": {
        "steps": [
            {"create": {"Person": {"data": {...}}}, "as": "$root"},
            {"create": {"Property": {"data": {...}}}, "as": "$nested_0"},
            {"create": {"Relationship": {"data": {
                "object_id": "$root.id",
                "subject_id": "$nested_0.id",
                "relationship_type": "property_owner"
            }}}}
        ]
    }
}
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional

from .request_parser import Transaction, TransactionStep
from .errors import ValidationError


@dataclass
class NestedItem:
    """A single nested item to create."""
    data: dict[str, Any]
    relation_type: Optional[str] = None  # Override for relationship_type


@dataclass
class NestedConfig:
    """Configuration for a nested relation."""
    field_name: str  # Relation field name (e.g., "ownedProperties")
    items: List[NestedItem]


class NestedCompiler:
    """
    Compiles nested mutation syntax to transaction steps.

    Requires access to the graph schema to:
    - Look up relation definitions
    - Determine target entities
    - Generate proper relationship records
    """

    def __init__(self, graph: dict[str, Any]):
        """
        Initialize compiler with graph schema.

        Args:
            graph: Graph schema from gateway
        """
        self.graph = graph
        self.entities = graph.get("entities", {})

    def has_nested(self, mutation_data: dict) -> bool:
        """Check if mutation data contains nested configuration."""
        return "nested" in mutation_data

    def compile(
        self,
        entity: str,
        operation: str,
        mutation_data: dict,
    ) -> Transaction:
        """
        Compile a mutation with nested data to a transaction.

        Args:
            entity: Parent entity name
            operation: Mutation operation (create, update)
            mutation_data: Full mutation data including "nested" key

        Returns:
            Transaction with all steps
        """
        if entity not in self.entities:
            raise ValidationError(f"Unknown entity: {entity}")

        entity_def = self.entities[entity]
        steps: List[TransactionStep] = []
        nested_counter = 0

        # Extract base data (without nested)
        base_data = mutation_data.get("data", {}).copy()
        response = mutation_data.get("response")
        nested = mutation_data.get("nested", {})

        # Step 1: Create/update parent entity
        root_alias = "$root"
        parent_step = TransactionStep(
            operation=operation,
            entity=entity,
            data=base_data,
            filters=mutation_data.get("filters", {}),
            response=response or ["id"],  # Always need id for relations
            alias=root_alias,
        )
        steps.append(parent_step)

        # Step 2+: Process each nested relation
        for rel_name, nested_items in nested.items():
            # Look up relation in entity definition
            relations = entity_def.get("relations", {})
            if rel_name not in relations:
                raise ValidationError(
                    f"Entity {entity} has no relation '{rel_name}'. "
                    f"Available: {list(relations.keys())}"
                )

            rel_def = relations[rel_name]
            target_entity = rel_def["target"]

            # Process each item in the nested list
            items_list = nested_items if isinstance(nested_items, list) else [nested_items]

            for item in items_list:
                item_data = item.get("data", {})
                item_alias = f"$nested_{nested_counter}"
                nested_counter += 1

                # Create the target entity
                target_step = TransactionStep(
                    operation="create",
                    entity=target_entity,
                    data=item_data,
                    response=["id"],
                    alias=item_alias,
                )
                steps.append(target_step)

                # If relation goes through intermediate model, create the link
                kind = rel_def.get("kind", "")

                if kind == "provider":
                    # Provider-based relation (through relations service)
                    relationship_type = item.get("relation_type") or rel_def.get("type", "")
                    direction = rel_def.get("direction", "out")

                    # Determine field mapping based on direction
                    if direction == "out":
                        parent_match_field = "object_id"
                        target_key_field = "subject_id"
                    else:
                        parent_match_field = "subject_id"
                        target_key_field = "object_id"

                    rel_data = {
                        parent_match_field: f"{root_alias}.id",
                        target_key_field: f"{item_alias}.id",
                    }

                    if relationship_type:
                        rel_data["relationship_type"] = relationship_type

                    # Add status if specified
                    status = rel_def.get("status")
                    if status:
                        rel_data["status"] = status

                    # Create relationship record
                    link_step = TransactionStep(
                        operation="create",
                        entity="Relationship",
                        data=rel_data,
                    )
                    steps.append(link_step)

                elif kind == "ref":
                    # Direct FK relation - update the parent with the FK
                    ref = rel_def["ref"]
                    from_field = ref.get("from_field")

                    if from_field:
                        # Add update step for parent to set FK
                        update_step = TransactionStep(
                            operation="update",
                            entity=entity,
                            filters={"id__eq": f"{root_alias}.id"},
                            data={from_field: f"{item_alias}.id"},
                        )
                        steps.append(update_step)

        return Transaction(steps=steps, on_error="rollback")

    def compile_get_or_create(
        self,
        entity: str,
        lookup: dict[str, Any],
        defaults: dict[str, Any],
        response: Optional[List[str]] = None,
    ) -> Transaction:
        """
        Compile a get-or-create operation to transaction steps.

        This creates a 2-step transaction:
        1. Query for existing record
        2. Create if not found (using conditional logic)

        Note: Since we don't have conditional execution in transactions yet,
        this returns a special marker that the executor handles.

        Args:
            entity: Entity name
            lookup: Filter conditions to find existing
            defaults: Additional data for creation
            response: Fields to return

        Returns:
            Transaction with get-or-create semantics
        """
        # Merge lookup and defaults for creation
        create_data = {**lookup, **defaults}

        # Remove filter operators from lookup for create data
        clean_create_data = {}
        for key, value in create_data.items():
            # Strip filter operators (e.g., "email__eq" -> "email")
            clean_key = key.split("__")[0] if "__" in key else key
            clean_create_data[clean_key] = value

        # Create a special step that the executor will handle
        step = TransactionStep(
            operation="get_or_create",
            entity=entity,
            data=clean_create_data,
            filters=lookup,
            response=response or ["id"],
            alias="$result",
        )

        return Transaction(steps=[step], on_error="rollback")


def compile_nested_mutation(
    graph: dict[str, Any],
    entity: str,
    operation: str,
    mutation_data: dict,
) -> Transaction:
    """
    Convenience function to compile a nested mutation.

    Args:
        graph: Graph schema
        entity: Parent entity name
        operation: Mutation operation
        mutation_data: Mutation data with nested key

    Returns:
        Transaction
    """
    compiler = NestedCompiler(graph)
    return compiler.compile(entity, operation, mutation_data)
