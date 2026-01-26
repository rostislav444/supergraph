"""
Service module - utilities for building Supergraph services.

Provides:
- create_service_app: Factory for creating FastAPI service apps
- create_internal_router: Factory for internal API routes
- Database utilities (Base, get_session, init_db)
"""

from __future__ import annotations

from typing import Optional

from .app import create_service_app
from .database import Base, get_session, init_db, close_db, get_engine
from .internal_api import create_internal_router, InternalRouter, create_unified_internal_router, UnifiedInternalRouter
from .schema import get_service_schema

__all__ = [
    # App factory
    "create_service_app",
    # Database
    "Base",
    "get_session",
    "init_db",
    "close_db",
    "get_engine",
    # Internal API
    "create_internal_router",
    "InternalRouter",
    "create_unified_internal_router",
    "UnifiedInternalRouter",
    # Schema
    "get_service_schema",
]
