"""
Service app factory for Supergraph services.

Creates a pre-configured FastAPI application with:
- CORS middleware
- Health check endpoints
- Lifecycle hooks for database
- Logging filter to suppress noisy healthcheck logs
"""

from __future__ import annotations


import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, close_db


class HealthcheckLogFilter(logging.Filter):
    """Filter out noisy healthcheck and schema endpoint logs."""

    FILTERED_PATHS = ("/__schema", "/health")

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        for path in self.FILTERED_PATHS:
            if f'"{path}' in message or f" {path} " in message:
                return False
        return True


def _setup_logging_filter():
    """Add filter to uvicorn access logger to suppress healthcheck logs."""
    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.addFilter(HealthcheckLogFilter())


def create_service_app(
    service_name: str,
    *,
    on_startup: Callable | None = None,
    on_shutdown: Callable | None = None,
    init_database: bool = True,
) -> FastAPI:
    """
    Create a FastAPI app for a Supergraph service.

    Args:
        service_name: Name of the service (used in title and logging)
        on_startup: Additional startup hook
        on_shutdown: Additional shutdown hook
        init_database: Whether to initialize database on startup

    Returns:
        Configured FastAPI application
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup
        _setup_logging_filter()
        if init_database:
            await init_db()
        if on_startup:
            await on_startup() if asyncio.iscoroutinefunction(on_startup) else on_startup()

        yield

        # Shutdown
        if on_shutdown:
            await on_shutdown() if asyncio.iscoroutinefunction(on_shutdown) else on_shutdown()
        if init_database:
            await close_db()

    app = FastAPI(
        title=f"{service_name.replace('_', ' ').title()} Service",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        return {"status": "ok", "service": service_name}

    return app
