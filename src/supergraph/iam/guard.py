"""
Guard injection - adds IAM mandatory filters to plan steps.

Guards are filters that the client cannot override or bypass.
They are added by the server based on IAM policies.
"""

from __future__ import annotations

from typing import Optional

from ..core.query_types import NormalizedFilter
from ..runtime.planner import PlanStep
from .service import IAMResponse


def inject_guards(
    steps: list[PlanStep],
    iam_response: IAMResponse,
    graph: dict,
) -> list[PlanStep]:
    """
    Inject IAM guard filters into plan steps.

    Guards are added to PlanStep.guard and are combined with client filters
    during execution. The client cannot see or modify guards.

    Args:
        steps: List of plan steps to modify
        iam_response: IAM check result with scopes
        graph: Supergraph schema

    Returns:
        Modified list of steps (same objects, modified in place)
    """
    entities = graph.get("entities", {})

    for step in steps:
        entity_def = entities.get(step.entity, {})
        access_def = entity_def.get("access", {})
        tenant_strategy = access_def.get("tenant_strategy", "none")

        # Apply scopes as guards based on entity's tenant strategy
        if tenant_strategy == "direct":
            # Direct strategy: apply scopes directly to this entity
            for scope in iam_response.scopes:
                guard_filter = NormalizedFilter(
                    field=scope.field,
                    op=scope.op,
                    value=scope.values,
                )
                step.guard.append(guard_filter)

        elif tenant_strategy == "via_relations":
            # Via relations strategy: more complex, requires prefetch
            # MVP: Not implemented yet - would need to add prefetch steps
            # to get allowed IDs from related entities
            pass

        # tenant_strategy == "none": no guard needed

    return steps


def filter_masked_fields(
    steps: list[PlanStep],
    iam_response: IAMResponse,
) -> list[PlanStep]:
    """
    Remove masked fields from step selections.

    If IAM specifies certain fields should be hidden,
    remove them from select_fields.

    Args:
        steps: List of plan steps
        iam_response: IAM check result with field masks

    Returns:
        Modified list of steps
    """
    for step in steps:
        masked = iam_response.field_masks.get(step.entity, [])
        if masked:
            step.select_fields = [f for f in step.select_fields if f not in masked]

    return steps


def filter_masked_relations(
    steps: list[PlanStep],
    iam_response: IAMResponse,
) -> list[PlanStep]:
    """
    Remove steps for masked relations.

    If IAM specifies certain relations should be hidden,
    remove those steps entirely.

    Args:
        steps: List of plan steps
        iam_response: IAM check result with relation masks

    Returns:
        Filtered list of steps (masked relation steps removed)
    """
    # Build set of masked relations per entity
    # relation_masks format: {entity: [relation_names]}
    masked_relations: set[tuple[str, str]] = set()
    for entity, relations in iam_response.relation_masks.items():
        for relation in relations:
            masked_relations.add((entity, relation))

    # Find root step
    root_step = next((s for s in steps if s.depends_on is None), None)
    if not root_step:
        return steps

    # Filter out masked relation steps
    # We need to remove steps where (parent_entity, attach_as) is masked
    step_map = {s.id: s for s in steps}
    filtered: list[PlanStep] = []

    for step in steps:
        if step.depends_on and step.attach_as:
            parent_step = step_map.get(step.depends_on)
            if parent_step:
                # Check if this relation is masked
                if (parent_step.entity, step.attach_as) in masked_relations:
                    # Skip this step and all its children
                    continue
        filtered.append(step)

    return filtered
