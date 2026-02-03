"""
Response assembler - combines step results into final response.

Handles:
- Attaching child results to parent items
- Building pagination wrappers
- Creating the final response structure
- Optional camelCase conversion for JSON output
"""

from __future__ import annotations

from typing import Any

from ..core.query_types import InternalQueryResponse, PaginationInfo
from ..core.utils import convert_keys_to_camel
from .planner import PlanStep


class ResponseAssembler:
    """
    Assembles final response from step results.

    Usage:
        assembler = ResponseAssembler()
        response = assembler.assemble(steps, results, is_single=True)

        # With camelCase conversion:
        response = assembler.assemble(steps, results, camel_case=True)
    """

    def assemble(
        self,
        steps: list[PlanStep],
        results: dict[str, InternalQueryResponse],
        is_single: bool = False,
        camel_case: bool = False,
    ) -> dict[str, Any]:
        """
        Assemble final response from execution results.

        Args:
            steps: List of executed PlanSteps
            results: Dict mapping step.id to InternalQueryResponse
            is_single: True if this is a single-item query (id__eq)
            camel_case: If True, convert all keys to camelCase in response

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
                data = root_items[0]
                if camel_case:
                    data = convert_keys_to_camel(data)
                return {"data": data}
            return {"data": None}
        else:
            pagination = PaginationInfo(
                total=root_result.total,
                limit=root_result.limit,
                offset=root_result.offset,
                has_next=self._has_next(root_result),
            )
            items = root_items
            if camel_case:
                items = convert_keys_to_camel(items)
            return {
                "data": {
                    "items": items,
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

        For two-hop relations (provider), uses link_through_step to map
        child items back to the original parent.
        """
        if not step.attach_as:
            return

        # Determine the actual parent step to attach to
        if step.attach_to_step_id:
            # Two-hop relation: attach to original parent, not depends_on
            parent_step = step_map.get(step.attach_to_step_id)
        elif step.depends_on:
            parent_step = step_map.get(step.depends_on)
        else:
            return

        if not parent_step:
            return

        child_result = results.get(step.id)
        if not child_result:
            return

        # Get parent items from mutable results (these are the objects we modify)
        parent_items = mutable_results.get(parent_step.id, [])
        # Get child items from mutable results (already converted to dicts)
        child_items = mutable_results.get(step.id, [])

        # Handle two-hop relations (through an intermediate step like Relationship)
        if step.attach_to_step_id and step.link_through_step_id and step.link_field:
            self._attach_via_link(
                step, parent_step, parent_items, child_items, mutable_results
            )
            return

        # Standard single-hop attachment
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

    def _attach_via_link(
        self,
        step: PlanStep,
        parent_step: PlanStep,
        parent_items: list[dict],
        child_items: list[dict],
        mutable_results: dict[str, list[dict]],
    ):
        """
        Attach children to parents via an intermediate linking step.

        Used for two-hop provider relations like:
        Company → Relationship → Property

        The link step (Relationship) contains both:
        - link_field (e.g., subject_id) → parent ID
        - parent_key_field (e.g., object_id) → child ID
        """
        # Get link items (e.g., Relationship records)
        link_items = mutable_results.get(step.link_through_step_id, [])

        # Build mapping: child_id → parent_id
        # Using link step: parent_key_field (object_id) → link_field (subject_id)
        # Note: IDs in Relationship are strings, but entity IDs may be integers
        # Use string keys for consistency
        child_to_parent: dict[str, str] = {}
        for link_item in link_items:
            child_id = link_item.get(step.parent_key_field)  # e.g., object_id
            parent_id = link_item.get(step.link_field)       # e.g., subject_id
            if child_id is not None and parent_id is not None:
                child_to_parent[str(child_id)] = str(parent_id)

        # Group children by their parent
        children_by_parent: dict[str, list[dict]] = {}

        for child in child_items:
            child_key = child.get(step.child_match_field)  # e.g., Property.id
            if child_key is None:
                continue
            parent_id = child_to_parent.get(str(child_key))
            if parent_id is not None:
                if parent_id not in children_by_parent:
                    children_by_parent[parent_id] = []
                children_by_parent[parent_id].append(child)

        # Attach to each parent item
        for parent_item in parent_items:
            parent_key = parent_item.get("id")  # Parent key is typically "id"
            parent_key_str = str(parent_key) if parent_key is not None else None

            if step.cardinality == "one":
                children = children_by_parent.get(parent_key_str, [])
                parent_item[step.attach_as] = children[0] if children else None
            else:
                children = children_by_parent.get(parent_key_str, [])
                parent_item[step.attach_as] = children

    def _has_next(self, result: InternalQueryResponse) -> bool:
        """Check if there are more items after current page."""
        if result.limit is None:
            return False
        return result.total > result.offset + len(result.items)
