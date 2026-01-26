"""
Plan executor - executes PlanSteps and collects results.

Handles:
- Topological sorting of steps by dependencies
- Resolving parent references ($step_x.field) in filters
- Executing steps via ServiceClient
"""

from __future__ import annotations

from typing import Any

from ..core.errors import ExecutionError
from ..core.query_types import InternalQueryResponse, NormalizedFilter
from .context import ExecutionContext
from .planner import PlanStep
from .service_client import ServiceClient


class PlanExecutor:
    """
    Executes a plan (list of PlanSteps) against backend services.

    Usage:
        executor = PlanExecutor(service_client)
        results = await executor.execute(steps, context)
    """

    def __init__(self, service_client: ServiceClient):
        """
        Initialize executor.

        Args:
            service_client: HTTP client for service calls
        """
        self.client = service_client

    async def execute(
        self,
        steps: list[PlanStep],
        context: ExecutionContext,
    ) -> dict[str, InternalQueryResponse]:
        """
        Execute all steps and return results.

        Args:
            steps: List of PlanSteps to execute
            context: Execution context with graph and services

        Returns:
            Dict mapping step.id to InternalQueryResponse
        """
        # Topologically sort steps
        sorted_steps = self._topological_sort(steps)

        # Execute steps in order
        results: dict[str, InternalQueryResponse] = {}

        for step in sorted_steps:
            try:
                result = await self._execute_step(step, results, context)
                results[step.id] = result
            except Exception as e:
                raise ExecutionError(str(e), step_id=step.id)

        return results

    def _topological_sort(self, steps: list[PlanStep]) -> list[PlanStep]:
        """
        Sort steps by dependency order (parents before children).

        Steps without depends_on come first.
        """
        # Build adjacency map
        step_map = {step.id: step for step in steps}
        visited: set[str] = set()
        result: list[PlanStep] = []

        def visit(step_id: str):
            if step_id in visited:
                return
            step = step_map.get(step_id)
            if not step:
                return
            # Visit dependency first
            if step.depends_on and step.depends_on not in visited:
                visit(step.depends_on)
            visited.add(step_id)
            result.append(step)

        for step in steps:
            visit(step.id)

        return result

    async def _execute_step(
        self,
        step: PlanStep,
        results: dict[str, InternalQueryResponse],
        context: ExecutionContext,
    ) -> InternalQueryResponse:
        """
        Execute a single step.

        Args:
            step: The step to execute
            results: Results from previously executed steps
            context: Execution context

        Returns:
            InternalQueryResponse from the service
        """
        # Get service URL
        service_url = context.get_service_url(step.service)
        if not service_url:
            raise ExecutionError(f"Service '{step.service}' not found")

        # Resolve filters (including parent references)
        resolved_filters = self._resolve_filters(step, results)

        # Combine with guard filters
        all_filters = resolved_filters + step.guard

        # Check if we have any items to fetch (for dependent steps)
        if step.depends_on and step.child_match_field:
            # Find the IN filter for the child_match_field
            match_filter = next(
                (f for f in all_filters if f.field == step.child_match_field and f.op == "in"),
                None
            )
            if match_filter and not match_filter.value:
                # No parent IDs to match - return empty result
                return InternalQueryResponse(items=[], total=0, limit=step.limit, offset=step.offset)

        # Execute the fetch
        return await self.client.fetch(
            service_url=service_url,
            resource=step.resource,
            filters=all_filters,
            fields=step.select_fields,
            order=step.order,
            limit=step.limit,
            offset=step.offset,
            entity=step.entity,
        )

    def _resolve_filters(
        self,
        step: PlanStep,
        results: dict[str, InternalQueryResponse],
    ) -> list[NormalizedFilter]:
        """
        Resolve filters, replacing parent references with actual values.

        For dependent steps, adds IN filter with parent IDs.
        """
        resolved: list[NormalizedFilter] = []

        # If this step depends on another, create the linking filter
        if step.depends_on and step.parent_key_field and step.child_match_field:
            parent_result = results.get(step.depends_on)
            if parent_result:
                # Extract parent key values
                parent_ids = self._extract_field_values(
                    parent_result.items,
                    step.parent_key_field
                )
                # Add IN filter
                resolved.append(
                    NormalizedFilter(
                        field=step.child_match_field,
                        op="in",
                        value=parent_ids,
                    )
                )

        # Add original filters
        resolved.extend(step.filters)

        return resolved

    def _extract_field_values(self, items: list[dict], field: str) -> list[Any]:
        """Extract unique values of a field from items."""
        values = []
        seen = set()
        for item in items:
            value = item.get(field)
            if value is not None and value not in seen:
                values.append(value)
                seen.add(value)
        return values
