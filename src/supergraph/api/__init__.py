"""
API module - FastAPI endpoints.
"""

from __future__ import annotations

from typing import Optional

from .router import create_supergraph_app, get_graph, get_principal, router, set_graph

__all__ = [
    "router",
    "set_graph",
    "get_graph",
    "get_principal",
    "create_supergraph_app",
]
