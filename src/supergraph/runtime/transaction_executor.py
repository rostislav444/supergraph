"""
Transaction executor with Saga pattern for Supergraph.

Handles multi-step transactions with:
- Variable binding ($person, $property)
- Reference resolution ($person.id)
- Compensation (rollback) on failure
- Multiple error handling strategies
"""

from __future__ import annotations


import re
from typing import Any

from typing import Optional

from supergraph.core.query_types import MutationResult, TransactionResult
from supergraph.core.request_parser import Transaction, TransactionStep, EntityMutation
from supergraph.core.errors import ExecutionError
from .mutation_executor import MutationExecutor


# Pattern for variable references: $varname or $varname.field
VAR_PATTERN = re.compile(r'\$(\w+)(?:\.(\w+))?')


class TransactionExecutor:
    """
    Executes transactions with saga pattern.

    Supports:
    - Sequential step execution
    - Variable binding for cross-step references
    - Automatic compensation (rollback) on failure
    - Multiple error strategies: rollback, stop, continue

    Example transaction:
    {
        "transaction": {
            "steps": [
                {"create": {"Person": {"data": {...}}}, "as": "$person"},
                {"create": {"Property": {"data": {...}}}, "as": "$property"},
                {"create": {"Relationship": {"data": {
                    "object_id": "$person.id",
                    "subject_id": "$property.id"
                }}}}
            ],
            "on_error": "rollback"
        }
    }
    """

    def __init__(self, mutation_executor: MutationExecutor, query_executor=None):
        """
        Initialize transaction executor.

        Args:
            mutation_executor: Executor for individual mutations
            query_executor: Executor for queries (needed for get_or_create)
        """
        self.mutation_executor = mutation_executor
        self.query_executor = query_executor

    async def execute(self, transaction: Transaction) -> TransactionResult:
        """
        Execute a transaction.

        Args:
            transaction: Parsed transaction

        Returns:
            TransactionResult with success/failure and all step results
        """
        variables: dict[str, Any] = {}
        results: list[MutationResult] = []
        completed_creates: list[tuple[str, Any]] = []  # (entity, id) for rollback

        try:
            for step in transaction.steps:
                # Resolve variable references in step data
                resolved_data = self._resolve_refs(step.data, variables)
                resolved_filters = self._resolve_refs(step.filters, variables)

                # Handle get_or_create specially
                if step.operation == "get_or_create":
                    result = await self._execute_get_or_create(
                        step, resolved_data, resolved_filters
                    )
                    results.append(result)

                    if result.success and step.alias and result.data:
                        var_name = step.alias.lstrip("$")
                        variables[var_name] = result.data

                    if not result.success and not step.optional:
                        if transaction.on_error == "rollback":
                            await self._compensate(completed_creates)
                            return TransactionResult(
                                success=False,
                                results=results,
                                variables=variables,
                                rolled_back=True,
                                error=f"get_or_create failed: {result.error}",
                            )
                        elif transaction.on_error == "stop":
                            return TransactionResult(
                                success=False,
                                results=results,
                                variables=variables,
                                error=f"get_or_create failed: {result.error}",
                            )
                    continue

                # Create mutation from step
                mutation = EntityMutation(
                    entity=step.entity,
                    operation=step.operation,
                    data=resolved_data,
                    filters=resolved_filters,
                    response=step.response,
                )

                # Execute mutation
                result = await self.mutation_executor.execute(mutation)
                results.append(result)

                if not result.success:
                    if step.optional:
                        # Optional step failed, continue
                        continue
                    elif transaction.on_error == "continue":
                        # Continue with errors
                        continue
                    elif transaction.on_error == "stop":
                        # Stop but don't rollback
                        return TransactionResult(
                            success=False,
                            results=results,
                            variables=variables,
                            error=f"Step failed: {result.error}",
                        )
                    else:
                        # Rollback
                        await self._compensate(completed_creates)
                        return TransactionResult(
                            success=False,
                            results=results,
                            variables=variables,
                            rolled_back=True,
                            error=f"Step failed, rolled back: {result.error}",
                        )

                # Store variable if alias specified
                if step.alias and result.data:
                    var_name = step.alias.lstrip("$")
                    variables[var_name] = result.data

                # Track created records for potential rollback
                if step.operation == "create" and result.success and result.data:
                    record_id = self._get_record_id(result.data)
                    if record_id is not None:
                        completed_creates.append((step.entity, record_id))

            # All steps completed successfully
            return TransactionResult(
                success=True,
                results=results,
                variables=variables,
            )

        except Exception as e:
            # Unexpected error - attempt rollback
            if transaction.on_error == "rollback":
                await self._compensate(completed_creates)
                return TransactionResult(
                    success=False,
                    results=results,
                    variables=variables,
                    rolled_back=True,
                    error=f"Transaction failed: {str(e)}",
                )
            raise

    async def _compensate(self, completed_creates: list[tuple[str, Any]]):
        """
        Execute compensation (delete) for all created records.

        Processes in reverse order (LIFO).
        """
        for entity, record_id in reversed(completed_creates):
            try:
                await self.mutation_executor.execute_compensation(entity, record_id)
            except Exception:
                # Log but continue with remaining compensations
                pass

    async def _execute_get_or_create(
        self,
        step: TransactionStep,
        resolved_data: dict[str, Any],
        resolved_filters: dict[str, Any],
    ) -> MutationResult:
        """
        Execute a get-or-create operation.

        1. Query for existing record using filters
        2. If found, return it
        3. If not found, create new record with data

        Args:
            step: Transaction step with get_or_create operation
            resolved_data: Data for creation (with variables resolved)
            resolved_filters: Lookup filters (with variables resolved)

        Returns:
            MutationResult with found or created record
        """
        # First, try to find existing record
        if self.query_executor:
            try:
                # Query with the lookup filters
                existing = await self.query_executor.execute_simple(
                    entity=step.entity,
                    filters=resolved_filters,
                    fields=step.response or ["id"],
                    limit=1,
                )

                if existing and len(existing) > 0:
                    # Found existing record
                    return MutationResult(
                        entity=step.entity,
                        operation="get_or_create",
                        success=True,
                        data=existing[0],
                        count=1,
                    )
            except Exception as e:
                # Query failed, proceed to create
                pass

        # Not found (or no query executor), create new record
        create_mutation = EntityMutation(
            entity=step.entity,
            operation="create",
            data=resolved_data,
            response=step.response,
        )

        result = await self.mutation_executor.execute(create_mutation)

        # Adjust operation name in result
        return MutationResult(
            entity=step.entity,
            operation="get_or_create",
            success=result.success,
            data=result.data,
            error=result.error,
            count=result.count,
        )

    def _resolve_refs(self, data: Any, variables: dict[str, Any]) -> Any:
        """
        Resolve variable references in data.

        Handles:
        - String values: "$person.id" -> actual id value
        - Nested dicts and lists
        - Mixed content
        """
        if isinstance(data, str):
            # Check if entire string is a variable reference
            match = VAR_PATTERN.fullmatch(data)
            if match:
                var_name, field_name = match.groups()
                return self._get_var_value(var_name, field_name, variables)

            # Check for embedded references
            def replace_ref(m):
                var_name, field_name = m.groups()
                value = self._get_var_value(var_name, field_name, variables)
                return str(value) if value is not None else m.group(0)

            return VAR_PATTERN.sub(replace_ref, data)

        elif isinstance(data, dict):
            return {k: self._resolve_refs(v, variables) for k, v in data.items()}

        elif isinstance(data, list):
            return [self._resolve_refs(item, variables) for item in data]

        else:
            return data

    def _get_var_value(self, var_name: str, field_name: Optional[str], variables: dict[str, Any]) -> Any:
        """Get value from variable, optionally accessing a field."""
        if var_name not in variables:
            raise ExecutionError(f"Unknown variable: ${var_name}")

        value = variables[var_name]

        if field_name:
            if isinstance(value, dict):
                if field_name not in value:
                    raise ExecutionError(f"Variable ${var_name} has no field '{field_name}'")
                return value[field_name]
            else:
                raise ExecutionError(f"Variable ${var_name} is not an object, cannot access .{field_name}")

        return value

    def _get_record_id(self, data: dict[str, Any]) -> Any:
        """Extract record ID from mutation result."""
        # Try common ID field names
        for key in ("id", "pk", "_id"):
            if key in data:
                return data[key]
        return None
