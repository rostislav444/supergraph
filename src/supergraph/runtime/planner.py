"""
Query planner - builds execution DAG from normalized query.

The planner analyzes the query and creates a series of PlanSteps
that can be executed in dependency order.
"""

from __future__ import annotations


from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from ..core.query_types import (
    NormalizedFilter,
    NormalizedOrder,
    NormalizedQuery,
    NormalizedSelectionNode,
)


@dataclass
class PlanStep:
    """
    A single step in the execution plan.

    Each step represents a fetch operation from a service.
    Steps can depend on other steps (via depends_on) to form a DAG.
    """
    id: str
    entity: str
    service: str
    resource: str

    # Filters
    filters: list[NormalizedFilter]  # Client filters (normalized)
    guard: list[NormalizedFilter] = field(default_factory=list)  # IAM mandatory filters

    # Selection
    select_fields: list[str] = field(default_factory=list)
    order: list[NormalizedOrder] = field(default_factory=list)
    limit: Optional[int] = None
    offset: int = 0

    # Dependency and attachment
    depends_on: Optional[str] = None  # ID of parent step
    parent_key_field: Optional[str] = None  # Field to extract from parent results
    child_match_field: Optional[str] = None  # Field in this entity to match against parent keys
    attach_as: Optional[str] = None  # Name of relation in response
    cardinality: Literal["one", "many"] | None = None

    def get_all_filters(self) -> list[NormalizedFilter]:
        """Get combined client filters and guard filters."""
        return self.filters + self.guard


class QueryPlanner:
    """
    Builds execution plan from normalized query.

    Usage:
        planner = QueryPlanner(graph)
        steps = planner.plan(normalized_query)
    """

    def __init__(self, graph: dict):
        """
        Initialize planner with graph schema.

        Args:
            graph: Compiled supergraph JSON
        """
        self.graph = graph
        self.entities = graph.get("entities", {})
        self.services = graph.get("services", {})
        self._step_counter = 0

    def _next_step_id(self, entity: str) -> str:
        """Generate unique step ID."""
        self._step_counter += 1
        return f"step_{entity.lower()}_{self._step_counter}"

    def plan(self, query: NormalizedQuery) -> list[PlanStep]:
        """
        Build execution plan from normalized query.

        Args:
            query: Validated and normalized query

        Returns:
            List of PlanSteps in dependency order (root first)
        """
        self._step_counter = 0
        steps: list[PlanStep] = []

        # Get root entity definition
        entity_def = self.entities.get(query.entity)
        if not entity_def:
            raise ValueError(f"Entity '{query.entity}' not found in graph")

        # Create root step
        root_step = self._create_step(
            entity_name=query.entity,
            entity_def=entity_def,
            selection=query.select,
            filters=query.filters,
            parent_step_id=None,
            attach_as=None,
            cardinality=None,
            parent_key_field=None,
            child_match_field=None,
            required_fields=[],  # No extra required fields for root
        )
        steps.append(root_step)

        # Plan nested relations
        self._plan_relations(
            selection=query.select,
            parent_entity_def=entity_def,
            parent_step=root_step,
            steps=steps,
        )

        return steps

    def _create_step(
        self,
        entity_name: str,
        entity_def: dict,
        selection: NormalizedSelectionNode,
        filters: list[NormalizedFilter],
        parent_step_id: Optional[str],
        attach_as: Optional[str],
        cardinality: Literal["one", "many"] | None,
        parent_key_field: Optional[str],
        child_match_field: Optional[str],
        required_fields: list[str],
    ) -> PlanStep:
        """Create a single plan step."""
        service_name = entity_def.get("service")
        resource = entity_def.get("resource")

        # Start with user-requested fields
        fields = list(selection.fields)

        # Add entity keys (always needed for linking)
        keys = entity_def.get("keys", ["id"])
        for key in keys:
            if key not in fields:
                fields.append(key)

        # Add child_match_field (needed for parent to link to us)
        if child_match_field and child_match_field not in fields:
            fields.append(child_match_field)

        # Add any extra required fields (for chaining to next level)
        for rf in required_fields:
            if rf not in fields:
                fields.append(rf)

        return PlanStep(
            id=self._next_step_id(entity_name),
            entity=entity_name,
            service=service_name,
            resource=resource,
            filters=filters,
            select_fields=fields,
            order=selection.order,
            limit=selection.limit,
            offset=selection.offset,
            depends_on=parent_step_id,
            parent_key_field=parent_key_field,
            child_match_field=child_match_field,
            attach_as=attach_as,
            cardinality=cardinality,
        )

    def _plan_relations(
        self,
        selection: NormalizedSelectionNode,
        parent_entity_def: dict,
        parent_step: PlanStep,
        steps: list[PlanStep],
    ):
        """
        Plan steps for nested relations.

        Recursively creates PlanSteps for each relation in the selection.
        """
        for relation_name, relation_selection in selection.relations.items():
            relation_def = parent_entity_def.get("relations", {}).get(relation_name)
            if not relation_def:
                continue

            target_entity_name = relation_def.get("target")
            target_entity_def = self.entities.get(target_entity_name)
            if not target_entity_def:
                continue

            cardinality = relation_def.get("cardinality", "many")

            # Determine how to link parent to child and what extra fields child needs
            parent_key_field, child_match_field, extra_filters, child_required_fields = (
                self._resolve_relation_mapping(
                    relation_def,
                    parent_entity_def,
                    target_entity_def,
                    relation_selection,
                )
            )

            # Combine relation selection filters with any extra filters from relation definition
            combined_filters = list(relation_selection.filters) + extra_filters

            # Create step for this relation
            # Pass child_required_fields so child step has the fields needed for further chaining
            relation_step = self._create_step(
                entity_name=target_entity_name,
                entity_def=target_entity_def,
                selection=relation_selection,
                filters=combined_filters,
                parent_step_id=parent_step.id,
                attach_as=relation_name,
                cardinality=cardinality,
                parent_key_field=parent_key_field,
                child_match_field=child_match_field,
                required_fields=child_required_fields,
            )
            steps.append(relation_step)

            # Recursively plan nested relations
            self._plan_relations(
                selection=relation_selection,
                parent_entity_def=target_entity_def,
                parent_step=relation_step,
                steps=steps,
            )

    def _resolve_relation_mapping(
        self,
        relation_def: dict,
        parent_entity_def: dict,
        target_entity_def: dict,
        relation_selection: NormalizedSelectionNode,
    ) -> tuple[str, str, list[NormalizedFilter], list[str]]:
        """
        Resolve how to link parent results to child query.

        Returns:
            Tuple of (parent_key_field, child_match_field, extra_filters, child_required_fields)
            - parent_key_field: field to extract from parent items
            - child_match_field: field in child to match against parent key
            - extra_filters: additional filters to add (e.g., relationship_type)
            - child_required_fields: fields the child MUST include for further chaining
        """
        extra_filters: list[NormalizedFilter] = []
        child_required_fields: list[str] = []

        kind = relation_def.get("kind", "")

        # New format: kind=provider (through relation provider like relations_db)
        if kind == "provider":
            # Get provider config from graph
            provider_name = relation_def.get("provider", "relations_db")
            provider = self.graph.get("relation_providers", {}).get(provider_name, {})

            subject_field = provider.get("subject_field", "subject_id")
            object_field = provider.get("object_field", "object_id")
            type_field = provider.get("type_field", "relationship_type")
            status_field = provider.get("status_field", "status")

            direction = relation_def.get("direction", "out")

            # Parent key is typically "id"
            parent_keys = parent_entity_def.get("keys", ["id"])
            parent_key_field = parent_keys[0]

            # Determine match field based on direction
            # direction="out": parent.id -> relationship.object_id, get subject_id for target
            # direction="in": parent.id -> relationship.subject_id, get object_id for target
            if direction == "out":
                child_match_field = object_field
                target_key_field = subject_field
            else:  # direction == "in"
                child_match_field = subject_field
                target_key_field = object_field

            # Child needs target_key_field for further chaining
            child_required_fields.append(target_key_field)
            child_required_fields.append(child_match_field)

            # Add type filter if specified
            rel_type = relation_def.get("type")
            if rel_type:
                extra_filters.append(
                    NormalizedFilter(field=type_field, op="eq", value=rel_type)
                )

            # Add status filter if specified
            status = relation_def.get("status")
            if status:
                extra_filters.append(
                    NormalizedFilter(field=status_field, op="eq", value=status)
                )

            return parent_key_field, child_match_field, extra_filters, child_required_fields

        # New format: kind=ref (direct FK relation)
        if kind == "ref":
            ref = relation_def.get("ref", {})
            # Parent key is the from_field (e.g., subject_id in Relationship)
            parent_key_field = ref.get("from_field")
            # Child matches on to_field (e.g., id in Property)
            child_match_field = ref.get("to_field", "id")

            # Child needs to return the match field
            child_required_fields.append(child_match_field)

            return parent_key_field, child_match_field, extra_filters, child_required_fields

        # Legacy: through relation (via intermediate model like Relationship)
        through = relation_def.get("through")
        if through:
            # Parent key is typically "id"
            parent_keys = parent_entity_def.get("keys", ["id"])
            parent_key_field = parent_keys[0]

            # Child (through entity) matches on parent_match_field (e.g., object_id)
            child_match_field = through.get("parent_match_field", "object_id")

            # Child needs target_key_field for further chaining (e.g., subject_id)
            target_key_field = through.get("target_key_field")
            if target_key_field:
                child_required_fields.append(target_key_field)

            # Also need parent_match_field to be returned for linking
            child_required_fields.append(child_match_field)

            # Add relationship_type filter if specified
            rel_type = through.get("relationship_type")
            if rel_type:
                extra_filters.append(
                    NormalizedFilter(field="relationship_type", op="eq", value=rel_type)
                )

            return parent_key_field, child_match_field, extra_filters, child_required_fields

        # Legacy: direct ref relation (FK)
        ref = relation_def.get("ref")
        if ref:
            # Parent key is the from_field (e.g., subject_id in Relationship)
            parent_key_field = ref.get("from_field")
            # Child matches on to_field (e.g., id in Property)
            child_match_field = ref.get("to_field", "id")

            # Child needs to return the match field
            child_required_fields.append(child_match_field)

            return parent_key_field, child_match_field, extra_filters, child_required_fields

        # Default: assume standard id-based relation
        parent_keys = parent_entity_def.get("keys", ["id"])
        target_keys = target_entity_def.get("keys", ["id"])
        return parent_keys[0], target_keys[0], extra_filters, child_required_fields
