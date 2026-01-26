"""
Internal API router for Supergraph services.

Provides generic CRUD endpoints that services can mount:
- POST /internal/query - Query records
- POST /internal/create - Create record
- POST /internal/update - Partial update (PATCH)
- POST /internal/rewrite - Full replace (PUT)
- POST /internal/delete - Delete records

Usage:
    from supergraph.service import create_internal_router

    internal_router = create_internal_router(
        model=Person,
        db_session=get_db,
    )
    app.include_router(internal_router, prefix="/person")
"""

from __future__ import annotations


from datetime import date, datetime
from typing import Any, Callable, List, Optional, TypeVar

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, delete, func, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase

from supergraph.core.query_types import (
    InternalQueryRequest,
    InternalQueryResponse,
    InternalMutationRequest,
    InternalMutationResponse,
    NormalizedFilter,
)


ModelT = TypeVar("ModelT", bound=DeclarativeBase)


class InternalRouter:
    """
    Factory for creating internal API routers for SQLAlchemy models.
    """

    def __init__(
        self,
        model: type[ModelT],
        get_session: Callable[[], AsyncSession],
    ):
        self.model = model
        self.get_session = get_session

    def create_router(self, prefix: str = "") -> APIRouter:
        """Create FastAPI router with all internal endpoints."""
        router = APIRouter(prefix=prefix)

        @router.post("/internal/query")
        async def internal_query(
            request: InternalQueryRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalQueryResponse:
            return await self._handle_query(request, session)

        @router.post("/internal/create")
        async def internal_create(
            request: InternalMutationRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalMutationResponse:
            return await self._handle_create(request, session)

        @router.post("/internal/update")
        async def internal_update(
            request: InternalMutationRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalMutationResponse:
            return await self._handle_update(request, session)

        @router.post("/internal/rewrite")
        async def internal_rewrite(
            request: InternalMutationRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalMutationResponse:
            return await self._handle_rewrite(request, session)

        @router.post("/internal/delete")
        async def internal_delete(
            request: InternalMutationRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalMutationResponse:
            return await self._handle_delete(request, session)

        return router

    async def _handle_query(
        self,
        request: InternalQueryRequest,
        session: AsyncSession,
    ) -> InternalQueryResponse:
        """Handle query request."""
        # Build base query
        stmt = select(self.model)

        # Apply filters
        stmt = self._apply_filters(stmt, request.filters)

        # Apply order
        for order in request.order:
            column = getattr(self.model, order.field, None)
            if column is not None:
                if order.dir == "desc":
                    stmt = stmt.order_by(column.desc())
                else:
                    stmt = stmt.order_by(column.asc())

        # Count total before pagination
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        if request.offset:
            stmt = stmt.offset(request.offset)
        if request.limit:
            stmt = stmt.limit(request.limit)

        # Execute
        result = await session.execute(stmt)
        rows = result.scalars().all()

        # Convert to dicts with requested fields
        items = []
        for row in rows:
            item = self._model_to_dict(row, request.fields)
            items.append(item)

        return InternalQueryResponse(
            items=items,
            total=total,
            limit=request.limit,
            offset=request.offset,
        )

    async def _handle_create(
        self,
        request: InternalMutationRequest,
        session: AsyncSession,
    ) -> InternalMutationResponse:
        """Handle create request."""
        # Coerce data types to match model columns
        coerced_data = self._coerce_data(request.data)

        # Create new instance
        instance = self.model(**coerced_data)
        session.add(instance)
        await session.commit()
        await session.refresh(instance)

        # Return created item
        response_fields = request.response or list(request.data.keys()) + ["id"]
        item = self._model_to_dict(instance, response_fields)

        return InternalMutationResponse(items=[item], count=1)

    async def _handle_update(
        self,
        request: InternalMutationRequest,
        session: AsyncSession,
    ) -> InternalMutationResponse:
        """Handle partial update request (PATCH semantics)."""
        if not request.filters:
            raise HTTPException(status_code=400, detail="Filters required for update")

        # Coerce data types
        coerced_data = self._coerce_data(request.data)

        # Build update statement
        stmt = update(self.model)
        stmt = self._apply_filters_to_update(stmt, request.filters)
        stmt = stmt.values(**coerced_data)

        # Execute update
        result = await session.execute(stmt)
        await session.commit()

        # Fetch updated items
        select_stmt = select(self.model)
        select_stmt = self._apply_filters(select_stmt, request.filters)
        fetch_result = await session.execute(select_stmt)
        rows = fetch_result.scalars().all()

        response_fields = request.response or list(request.data.keys()) + ["id"]
        items = [self._model_to_dict(row, response_fields) for row in rows]

        return InternalMutationResponse(items=items, count=result.rowcount)

    async def _handle_rewrite(
        self,
        request: InternalMutationRequest,
        session: AsyncSession,
    ) -> InternalMutationResponse:
        """Handle full replace request (PUT semantics)."""
        if not request.filters:
            raise HTTPException(status_code=400, detail="Filters required for rewrite")

        # First fetch existing records
        select_stmt = select(self.model)
        select_stmt = self._apply_filters(select_stmt, request.filters)
        fetch_result = await session.execute(select_stmt)
        rows = fetch_result.scalars().all()

        if not rows:
            raise HTTPException(status_code=404, detail="No records found to rewrite")

        # Coerce data types
        coerced_data = self._coerce_data(request.data)

        # Update each record with full replacement
        items = []
        for row in rows:
            # Reset all fields to data values
            for key, value in coerced_data.items():
                if hasattr(row, key):
                    setattr(row, key, value)
            items.append(row)

        await session.commit()

        response_fields = request.response or list(request.data.keys()) + ["id"]
        result_items = [self._model_to_dict(row, response_fields) for row in items]

        return InternalMutationResponse(items=result_items, count=len(items))

    async def _handle_delete(
        self,
        request: InternalMutationRequest,
        session: AsyncSession,
    ) -> InternalMutationResponse:
        """Handle delete request."""
        if not request.filters:
            raise HTTPException(status_code=400, detail="Filters required for delete")

        # Build delete statement
        stmt = delete(self.model)
        stmt = self._apply_filters_to_delete(stmt, request.filters)

        # Execute delete
        result = await session.execute(stmt)
        await session.commit()

        return InternalMutationResponse(items=[], count=result.rowcount)

    def _apply_filters(self, stmt, filters: list[NormalizedFilter]):
        """Apply filters to select statement."""
        for f in filters:
            column = getattr(self.model, f.field, None)
            if column is None:
                continue

            if f.op == "eq":
                stmt = stmt.where(column == f.value)
            elif f.op == "in":
                stmt = stmt.where(column.in_(f.value))
            elif f.op == "gte":
                stmt = stmt.where(column >= f.value)
            elif f.op == "lte":
                stmt = stmt.where(column <= f.value)
            elif f.op == "gt":
                stmt = stmt.where(column > f.value)
            elif f.op == "lt":
                stmt = stmt.where(column < f.value)
            elif f.op == "icontains":
                stmt = stmt.where(column.ilike(f"%{f.value}%"))
            elif f.op == "isnull":
                if f.value:
                    stmt = stmt.where(column.is_(None))
                else:
                    stmt = stmt.where(column.isnot(None))

        return stmt

    def _apply_filters_to_update(self, stmt, filters: list[NormalizedFilter]):
        """Apply filters to update statement."""
        for f in filters:
            column = getattr(self.model, f.field, None)
            if column is None:
                continue

            if f.op == "eq":
                stmt = stmt.where(column == f.value)
            elif f.op == "in":
                stmt = stmt.where(column.in_(f.value))

        return stmt

    def _apply_filters_to_delete(self, stmt, filters: list[NormalizedFilter]):
        """Apply filters to delete statement."""
        for f in filters:
            column = getattr(self.model, f.field, None)
            if column is None:
                continue

            if f.op == "eq":
                stmt = stmt.where(column == f.value)
            elif f.op == "in":
                stmt = stmt.where(column.in_(f.value))

        return stmt

    def _model_to_dict(self, instance: ModelT, fields: Optional[List[str]]) -> dict[str, Any]:
        """Convert model instance to dict with selected fields."""
        result = {}
        if fields:
            for field in fields:
                if hasattr(instance, field):
                    result[field] = getattr(instance, field)
        else:
            # Return all columns
            for column in instance.__table__.columns:
                result[column.name] = getattr(instance, column.name)
        return result

    def _coerce_data(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Coerce data values to match model column types.

        Handles:
        - int -> str for String columns
        - str -> date for Date columns (YYYY-MM-DD format)
        - str -> datetime for DateTime columns
        """
        if not data:
            return data

        mapper = inspect(self.model)
        coerced = {}

        for key, value in data.items():
            if value is None:
                coerced[key] = value
                continue

            # Find the column
            column = mapper.columns.get(key)
            if column is None:
                coerced[key] = value
                continue

            col_type = column.type.__class__.__name__.lower()

            # String columns - convert int/float to str
            if col_type in ('string', 'text', 'varchar'):
                if isinstance(value, (int, float)):
                    coerced[key] = str(value)
                else:
                    coerced[key] = value

            # Date columns - parse string to date
            elif col_type == 'date':
                if isinstance(value, str):
                    try:
                        # Try YYYY-MM-DD format
                        coerced[key] = datetime.strptime(value[:10], '%Y-%m-%d').date()
                    except ValueError:
                        # Try other formats or use today as fallback
                        coerced[key] = date.today()
                elif isinstance(value, date):
                    coerced[key] = value
                else:
                    coerced[key] = value

            # DateTime columns - parse string to datetime
            elif col_type in ('datetime', 'timestamp'):
                if isinstance(value, str):
                    try:
                        coerced[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                    except ValueError:
                        coerced[key] = datetime.now()
                elif isinstance(value, datetime):
                    coerced[key] = value
                else:
                    coerced[key] = value

            # Integer columns - convert str to int
            elif col_type in ('integer', 'biginteger', 'smallinteger'):
                if isinstance(value, str) and value.isdigit():
                    coerced[key] = int(value)
                else:
                    coerced[key] = value

            else:
                coerced[key] = value

        return coerced


def create_internal_router(
    model: type[ModelT],
    get_session: Callable[[], AsyncSession],
    prefix: str = "",
) -> APIRouter:
    """
    Create an internal API router for a model.

    Args:
        model: SQLAlchemy model class
        get_session: Dependency that returns AsyncSession
        prefix: URL prefix for routes

    Returns:
        FastAPI router with internal CRUD endpoints
    """
    factory = InternalRouter(model, get_session)
    return factory.create_router(prefix)


class UnifiedInternalRouter:
    """
    Creates unified /internal/* endpoints that handle multiple entities.

    Usage:
        from supergraph.service import create_unified_internal_router

        router = create_unified_internal_router(
            entity_map={"Person": Person, "Contact": Contact},
            get_session=get_session,
        )
        app.include_router(router)
    """

    def __init__(
        self,
        entity_map: dict[str, type[ModelT]],
        get_session: Callable[[], AsyncSession],
    ):
        self.entity_map = entity_map
        self.get_session = get_session

    def _get_model(self, entity_name: str) -> type[ModelT]:
        """Get model by entity name."""
        if entity_name not in self.entity_map:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown entity: {entity_name}. Available: {list(self.entity_map.keys())}"
            )
        return self.entity_map[entity_name]

    def create_router(self) -> APIRouter:
        """Create FastAPI router with unified internal endpoints."""
        router = APIRouter()

        @router.post("/internal/query", response_model=InternalQueryResponse)
        async def internal_query(
            request: InternalQueryRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalQueryResponse:
            # Determine model from entity field or use first available
            entity = request.entity
            if not entity:
                entity = list(self.entity_map.keys())[0]
            model = self._get_model(entity)
            handler = InternalRouter(model, self.get_session)
            return await handler._handle_query(request, session)

        @router.post("/internal/create", response_model=InternalMutationResponse)
        async def internal_create(
            request: InternalMutationRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalMutationResponse:
            model = self._get_model(request.entity)
            handler = InternalRouter(model, self.get_session)
            return await handler._handle_create(request, session)

        @router.post("/internal/update", response_model=InternalMutationResponse)
        async def internal_update(
            request: InternalMutationRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalMutationResponse:
            model = self._get_model(request.entity)
            handler = InternalRouter(model, self.get_session)
            return await handler._handle_update(request, session)

        @router.post("/internal/rewrite", response_model=InternalMutationResponse)
        async def internal_rewrite(
            request: InternalMutationRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalMutationResponse:
            model = self._get_model(request.entity)
            handler = InternalRouter(model, self.get_session)
            return await handler._handle_rewrite(request, session)

        @router.post("/internal/delete", response_model=InternalMutationResponse)
        async def internal_delete(
            request: InternalMutationRequest,
            session: AsyncSession = Depends(self.get_session),
        ) -> InternalMutationResponse:
            model = self._get_model(request.entity)
            handler = InternalRouter(model, self.get_session)
            return await handler._handle_delete(request, session)

        return router


def create_unified_internal_router(
    entity_map: dict[str, type[ModelT]],
    get_session: Callable[[], AsyncSession],
) -> APIRouter:
    """
    Create a unified internal API router for multiple entities.

    This creates /internal/* endpoints at the root level that handle
    all entities specified in entity_map based on the 'entity' field
    in the request body.

    Args:
        entity_map: Dict mapping entity names to SQLAlchemy models
        get_session: Dependency that returns AsyncSession

    Returns:
        FastAPI router with unified internal CRUD endpoints

    Example:
        router = create_unified_internal_router(
            entity_map={"Person": Person, "Contact": Contact},
            get_session=get_session,
        )
        app.include_router(router)
    """
    factory = UnifiedInternalRouter(entity_map, get_session)
    return factory.create_router()
