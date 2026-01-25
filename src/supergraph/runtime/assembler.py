"""
Response assembler - combines step results into final response.

Handles:
- Attaching child results to parent items
- Building pagination wrappers
- Creating the final response structure
"""

from __future__ import annotations

from typing import Any

from ..core.query_types import InternalQueryResponse, PaginationInfo
from .planner import PlanStep


class ResponseAssembler:
    """
    Assembles final response from step results.

    Usage:
        assembler = ResponseAssembler()
        response = assembler.assemble(steps, results, is_single=True)
    """

    def assemble(
        self,
        steps: list[PlanStep],
        results: dict[str, InternalQueryResponse],
        is_single: bool = False,
    ) -> dict[str, Any]:
        """
        Assemble final response from execution results.

        Args:
            steps: List of executed PlanSteps
            results: Dict mapping step.id to InternalQueryResponse
            is_single: True if this is a single-item query (id__eq)

        Returns:
            Final response dict with "data" key
        """
        # Build step lookup by ID
        step_map = {step.id: step for step in steps}

        # Find root step (no depends_on)
        root_step = next((s for s in steps if s.depends_on is None), None)
        if not root_step:
            return {"data": None}

        # Get root result
        root_result = results.get(root_step.id)
        if not root_result:
            return {"data": None}

        # CRITICAL: Convert ALL step results to mutable dicts ONCE
        # This ensures we modify the same objects throughout assembly
        mutable_results: dict[str, list[dict]] = {}
        for step_id, result in results.items():
            mutable_results[step_id] = [dict(item) for item in result.items]

        # Process child steps in reverse dependency order (deepest first)
        child_steps = [s for s in steps if s.depends_on is not None]
        child_steps = self._sort_by_depth(child_steps, step_map)

        for step in child_steps:
            self._attach_children(step, step_map, results, mutable_results)

        # Get the root items (now with all nested relations attached)
        root_items = mutable_results[root_step.id]

        # Build final response
        if is_single:
            if root_items:
                return {"data": root_items[0]}
            return {"data": None}
        else:
            pagination = PaginationInfo(
                total=root_result.total,
                limit=root_result.limit,
                offset=root_result.offset,
                has_next=self._has_next(root_result),
            )
            return {
                "data": {
                    "items": root_items,
                    "pagination": pagination.model_dump(),
                }
            }

    def _sort_by_depth(
        self,
        steps: list[PlanStep],
        step_map: dict[str, PlanStep],
    ) -> list[PlanStep]:
        """Sort steps by depth (deepest first)."""

        def get_depth(step: PlanStep) -> int:
            depth = 0
            current = step
            while current.depends_on:
                depth += 1
                current = step_map.get(current.depends_on)
                if current is None:
                    break
            return depth

        return sorted(steps, key=get_depth, reverse=True)

    def _attach_children(
        self,
        step: PlanStep,
        step_map: dict[str, PlanStep],
        results: dict[str, InternalQueryResponse],
        mutable_results: dict[str, list[dict]],
    ):
        """
        Attach child results to parent items.

        Modifies mutable_results in place.
        """
        if not step.depends_on or not step.attach_as:
            return

        parent_step = step_map.get(step.depends_on)
        if not parent_step:
            return

        child_result = results.get(step.id)
        if not child_result:
            return

        # Get parent items from mutable results (these are the objects we modify)
        parent_items = mutable_results.get(parent_step.id, [])
        # Get child items from mutable results (already converted to dicts)
        child_items = mutable_results.get(step.id, [])

        # Build index of children by match field
        children_by_key: dict[Any, list[dict]] = {}
        if step.child_match_field:
            for child in child_items:
                key = child.get(step.child_match_field)
                if key is not None:
                    if key not in children_by_key:
                        children_by_key[key] = []
                    children_by_key[key].append(child)

        # Attach to each parent item (modifying the mutable dict)
        for parent_item in parent_items:
            parent_key = parent_item.get(step.parent_key_field)

            if step.cardinality == "one":
                # Attach single item or null
                children = children_by_key.get(parent_key, [])
                parent_item[step.attach_as] = children[0] if children else None
            else:
                # Attach list directly (no pagination wrapper for nested relations)
                children = children_by_key.get(parent_key, [])
                parent_item[step.attach_as] = children

    def _has_next(self, result: InternalQueryResponse) -> bool:
        """Check if there are more items after current page."""
        if result.limit is None:
            return False
        return result.total > result.offset + len(result.items)
