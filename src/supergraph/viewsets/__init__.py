"""
ViewSets - DRF-style configuration for Supergraph entities.

Models stay pure ORM. All graph configuration lives in viewsets.
"""

from __future__ import annotations

from typing import Optional

from .base import (
    AccessConfig,
    AttachRelation,
    ModelViewSet,
    Ref,
    RelationConfig,
    RelationsViewSet,
    Through,
)
from .websocket import (
    Subscription,
    SubscriptionConfig,
)
from .cache import (
    CacheConfig,
    register_cache_handlers,
    init_cache_handlers,
)

__all__ = [
    "ModelViewSet",
    "RelationsViewSet",
    "AttachRelation",
    "RelationConfig",
    "Through",
    "Ref",
    "AccessConfig",
    "Subscription",
    "SubscriptionConfig",
    "CacheConfig",
    "register_cache_handlers",
    "init_cache_handlers",
]
