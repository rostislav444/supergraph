"""
Service app factory for Supergraph services.

Creates a pre-configured FastAPI application with:
- CORS middleware
- Health check endpoints
- Lifecycle hooks for database
"""

from __future__ import annotations


import asyncio
import os
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, close_db


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
