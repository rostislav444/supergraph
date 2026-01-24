"""
FastAPI router for Supergraph API.

Endpoints:
- GET /__graph - Returns the compiled graph schema
- POST /query - Executes queries (legacy + new format)
- POST / - Unified endpoint for queries, mutations, and transactions

REST-style endpoints:
- GET    /entity/{entity} - Query entity
- POST   /entity/{entity} - Create record
- PATCH  /entity/{entity} - Update record (partial)
- PUT    /entity/{entity} - Rewrite record (full replace)
- DELETE /entity/{entity} - Delete record

Supported request formats:

1. Single entity shorthand (query):
   {"Person": {"filters": {...}, "fields": [...]}}

2. Multi-entity query:
   {"query": {"Person": {...}, "Property": {...}}}

3. Mutations:
   {"create": {"Person": {"data": {...}, "response": [...]}}}
   {"update": {"Person": {"filters": {...}, "data": {...}}}}
   {"rewrite": {"Person": {"filters": {...}, "data": {...}}}}

4. Transactions:
   {"transaction": {"steps": [...], "on_error": "rollback"}}

5. Combined operations:
   {"query": {"Person": {...}}, "create": {"Order": {...}}}

6. Legacy format (backwards compatible):
   {"action": "query", "entity": "Person", "filters": {...}, "select": {...}}
"""

from __future__ import annotations


import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..core.errors import ExecutionError, IAMError, ServiceError, ValidationError
from ..core.query_types import JSONQuery, MutationResult, TransactionResult
from ..core.request_parser import ParsedRequest, RequestParser, EntityQuery
from ..core.validator import QueryValidator
from ..iam.guard import filter_masked_fields, filter_masked_relations, inject_guards
from ..iam.service import iam_service
from ..runtime.assembler import ResponseAssembler
from ..runtime.context import ExecutionContext, Principal
from ..runtime.executor import PlanExecutor
from ..runtime.mutation_executor import MutationExecutor
from ..runtime.planner import QueryPlanner
from ..runtime.service_client import ServiceClient
from ..runtime.transaction_executor import TransactionExecutor


# Create router
router = APIRouter()

# Global instances (will be set by create_app or dependency injection)
_graph: dict | None = None
_service_client: ServiceClient | None = None
_mutation_executor: MutationExecutor | None = None


def set_graph(graph: dict):
    """Set the graph schema for the API."""
    global _graph, _mutation_executor
    _graph = graph
    _mutation_executor = MutationExecutor(graph)


def get_graph() -> dict:
    """Get the graph schema."""
    if _graph is None:
        raise RuntimeError("Graph not initialized. Call set_graph() first.")
    return _graph


def get_service_client() -> ServiceClient:
    """Get or create service client."""
    global _service_client
    if _service_client is None:
        _service_client = ServiceClient()
    return _service_client


def get_mutation_executor() -> MutationExecutor:
    """Get mutation executor."""
    if _mutation_executor is None:
        raise RuntimeError("Mutation executor not initialized. Call set_graph() first.")
    return _mutation_executor


async def get_principal() -> Principal:
    """
    Get the authenticated principal from request.

    MVP: Returns a default principal.
    Production: Extract from JWT token or session.
    """
    # MVP: Default principal with some rc_ids for testing
    return Principal(
        id=1,
        roles=["user"],
        rc_ids=[1, 2, 3],  # Test RC IDs
    )


@router.get("/__graph")
async def get_graph_endpoint(graph: dict = Depends(get_graph)) -> dict:
    """
    Return the compiled graph schema.

    Used by frontend for:
    - TypeScript type generation
    - Form/table building
    - Query building UI
    """
    return graph


@router.post("/")
@router.post("/query")
async def execute_request(
    request: Request,
    graph: dict = Depends(get_graph),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """
    Unified endpoint for queries, mutations, and transactions.

    Supports all request formats (see module docstring).
    """
    body = await request.json()

    # Parse request
    known_entities = set(graph.get("entities", {}).keys())
    parser = RequestParser(known_entities)

    try:
        parsed = parser.parse(body)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail={"error": str(e)})

    # Build response
    response: dict[str, Any] = {}

    # Execute queries
    if parsed.queries:
        query_results = await _execute_queries(parsed.queries, graph, principal)
        if len(parsed.queries) == 1 and not parsed.has_mutations():
            # Single query - return data directly
            entity = list(parsed.queries.keys())[0]
            return {"data": query_results.get(entity)}
        response["query"] = query_results

    # Execute mutations
    if parsed.mutations:
        mutation_results = await _execute_mutations(parsed.mutations, graph, principal)
        response["mutations"] = [r.model_dump() for r in mutation_results]

    # Execute transaction
    if parsed.transaction:
        tx_result = await _execute_transaction(parsed.transaction, graph, principal)
        response["transaction"] = tx_result.model_dump()

    return response


async def _execute_queries(
    queries: dict[str, EntityQuery],
    graph: dict,
    principal: Principal,
) -> dict[str, Any]:
    """Execute multiple queries and return results."""
    results = {}

    for entity, entity_query in queries.items():
        # Convert EntityQuery to JSONQuery for existing pipeline
        json_query = JSONQuery(
            action="query",
            entity=entity,
            filters=entity_query.filters,
            select={
                "fields": entity_query.fields or [],
                "order": entity_query.order or [],
                "limit": entity_query.limit,
                "offset": entity_query.offset,
                "relations": {
                    name: _entity_query_to_selection(rel)
                    for name, rel in entity_query.relations.items()
                },
            },
        )

        result = await _execute_single_query(json_query, graph, principal)
        results[entity] = result

    return results


def _entity_query_to_selection(eq: EntityQuery) -> dict:
    """Convert EntityQuery to selection dict."""
    return {
        "fields": eq.fields or [],
        "filters": eq.filters,
        "order": eq.order or [],
        "limit": eq.limit,
        "offset": eq.offset,
        "relations": {
            name: _entity_query_to_selection(rel)
            for name, rel in eq.relations.items()
        },
    }


async def _execute_single_query(
    query: JSONQuery,
    graph: dict,
    principal: Principal,
) -> dict[str, Any]:
    """Execute a single query through the existing pipeline."""
    # 1. Validate and normalize
    validator = QueryValidator(graph)
    errors, normalized_query = validator.validate_and_normalize(query)

    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    if normalized_query is None:
        raise HTTPException(status_code=400, detail={"errors": ["Validation failed"]})

    # 2. IAM check
    try:
        iam_response = await iam_service.check_access(
            principal=principal,
            action=query.action,
            entity=query.entity,
            graph=graph,
        )

        if not iam_response.allow:
            raise IAMError("Access denied")

    except IAMError as e:
        raise HTTPException(status_code=403, detail={"error": str(e)})

    # 3. Plan execution
    planner = QueryPlanner(graph)
    steps = planner.plan(normalized_query)

    # 4. Inject IAM guards
    steps = inject_guards(steps, iam_response, graph)
    steps = filter_masked_fields(steps, iam_response)
    steps = filter_masked_relations(steps, iam_response)

    # 5. Execute steps
    try:
        context = ExecutionContext(graph=graph, principal=principal)
        client = get_service_client()
        executor = PlanExecutor(client)
        results = await executor.execute(steps, context)

    except ServiceError as e:
        raise HTTPException(
            status_code=502,
            detail={"error": f"Service error: {e.service}", "message": str(e)},
        )
    except ExecutionError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Execution error", "step": e.step_id, "message": str(e)},
        )

    # 6. Assemble response
    assembler = ResponseAssembler()
    response = assembler.assemble(
        steps=steps,
        results=results,
        is_single=normalized_query.is_single,
    )

    return response.get("data")


async def _execute_mutations(
    mutations: list,
    graph: dict,
    principal: Principal,
) -> list[MutationResult]:
    """Execute mutations."""
    executor = get_mutation_executor()
    results = []

    for mutation in mutations:
        # TODO: Add IAM check for mutations
        result = await executor.execute(mutation)
        results.append(result)

    return results


async def _execute_transaction(
    transaction,
    graph: dict,
    principal: Principal,
) -> TransactionResult:
    """Execute transaction with saga pattern."""
    mutation_executor = get_mutation_executor()
    tx_executor = TransactionExecutor(mutation_executor)

    # TODO: Add IAM checks for transaction steps

    return await tx_executor.execute(transaction)


# =============================================================================
# REST-style Endpoints
# =============================================================================


@router.get("/entity/{entity}")
async def rest_query(
    entity: str,
    filters: Optional[str] = Query(None, description="JSON filters"),
    fields: Optional[str] = Query(None, description="JSON array of fields"),
    order: Optional[str] = Query(None, description="JSON array of order fields"),
    limit: Optional[int] = Query(None, description="Limit results"),
    offset: Optional[int] = Query(0, description="Offset results"),
    graph: dict = Depends(get_graph),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """
    REST-style query endpoint.

    GET /entity/Person?filters={"id__eq":1}&fields=["id","first_name"]
    """
    if entity not in graph.get("entities", {}):
        raise HTTPException(status_code=404, detail={"error": f"Entity '{entity}' not found"})

    # Parse query params
    parsed_filters = json.loads(filters) if filters else {}
    parsed_fields = json.loads(fields) if fields else None
    parsed_order = json.loads(order) if order else None

    entity_query = EntityQuery(
        entity=entity,
        filters=parsed_filters,
        fields=parsed_fields,
        order=parsed_order,
        limit=limit,
        offset=offset,
        relations={},
    )

    results = await _execute_queries({entity: entity_query}, graph, principal)
    return {"data": results.get(entity)}


@router.post("/entity/{entity}")
async def rest_create(
    entity: str,
    request: Request,
    graph: dict = Depends(get_graph),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """
    REST-style create endpoint.

    POST /entity/Person
    {"data": {"first_name": "Ivan"}, "response": ["id", "first_name"]}
    """
    if entity not in graph.get("entities", {}):
        raise HTTPException(status_code=404, detail={"error": f"Entity '{entity}' not found"})

    body = await request.json()
    from ..core.request_parser import EntityMutation

    mutation = EntityMutation(
        entity=entity,
        operation="create",
        data=body.get("data", {}),
        filters={},
        response=body.get("response"),
    )

    executor = get_mutation_executor()
    result = await executor.execute(mutation)

    return {"data": {entity: result.data}, "success": result.success}


@router.patch("/entity/{entity}")
async def rest_update(
    entity: str,
    request: Request,
    graph: dict = Depends(get_graph),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """
    REST-style update endpoint (partial update).

    PATCH /entity/Person
    {"filters": {"id__eq": 1}, "data": {"first_name": "Petro"}, "response": ["id"]}
    """
    if entity not in graph.get("entities", {}):
        raise HTTPException(status_code=404, detail={"error": f"Entity '{entity}' not found"})

    body = await request.json()
    from ..core.request_parser import EntityMutation

    mutation = EntityMutation(
        entity=entity,
        operation="update",
        data=body.get("data", {}),
        filters=body.get("filters", {}),
        response=body.get("response"),
    )

    executor = get_mutation_executor()
    result = await executor.execute(mutation)

    return {"data": {entity: result.data}, "success": result.success, "count": result.count}


@router.put("/entity/{entity}")
async def rest_rewrite(
    entity: str,
    request: Request,
    graph: dict = Depends(get_graph),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """
    REST-style rewrite endpoint (full replace).

    PUT /entity/Person
    {"filters": {"id__eq": 1}, "data": {"first_name": "Ivan", "last_name": "Petrov"}}
    """
    if entity not in graph.get("entities", {}):
        raise HTTPException(status_code=404, detail={"error": f"Entity '{entity}' not found"})

    body = await request.json()
    from ..core.request_parser import EntityMutation

    mutation = EntityMutation(
        entity=entity,
        operation="rewrite",
        data=body.get("data", {}),
        filters=body.get("filters", {}),
        response=body.get("response"),
    )

    executor = get_mutation_executor()
    result = await executor.execute(mutation)

    return {"data": {entity: result.data}, "success": result.success, "count": result.count}


@router.delete("/entity/{entity}")
async def rest_delete(
    entity: str,
    request: Request,
    graph: dict = Depends(get_graph),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """
    REST-style delete endpoint.

    DELETE /entity/Person
    {"filters": {"id__eq": 1}}
    """
    if entity not in graph.get("entities", {}):
        raise HTTPException(status_code=404, detail={"error": f"Entity '{entity}' not found"})

    body = await request.json()
    from ..core.request_parser import EntityMutation

    mutation = EntityMutation(
        entity=entity,
        operation="delete",
        data={},
        filters=body.get("filters", {}),
        response=None,
    )

    executor = get_mutation_executor()
    result = await executor.execute(mutation)

    return {"data": {entity: {"deleted": result.count}}, "success": result.success}


def create_supergraph_app(graph: dict) -> APIRouter:
    """
    Create a configured supergraph API router.

    Args:
        graph: Compiled graph schema

    Returns:
        Configured FastAPI router
    """
    set_graph(graph)
    return router
