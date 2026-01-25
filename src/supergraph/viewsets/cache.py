"""
Cache configuration for ViewSets.

Declarative cache sync - no manual code needed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import DeclarativeBase

@dataclass
class CacheConfig:
    """
    Cache configuration for ModelViewSet.

    Usage:
        class CameraViewSet(ModelViewSet):
            model = Camera

            cache = CacheConfig(
                index_by=["mac_address", "ip_address"],
                ttl=3600,
                on_change=True
            )

        Creates cache keys:
        - camera:mac_address:{value}
        - camera:ip_address:{value}
    """

    index_by: list[str] = field(default_factory=list)
    ttl: int = 3600
    on_change: bool = True
    on_delete: bool = True
    builder: Optional[Callable] = None
    prefix: Optional[str] = None


def build_cache_key(prefix: str, field_name: str, instance: "DeclarativeBase") -> str:
    """Build cache key from field name and model instance."""
    value = getattr(instance, field_name, None)
    if value is None:
        return None
    return f"{prefix}:{field_name}:{value}"


def register_cache_handlers(viewset_class):
    """Register SQLAlchemy event listeners for cache sync."""
    from sqlalchemy import event
    import asyncio
    from supergraph.messaging import CacheManager, redis_publish

    cache_config = viewset_class.cache
    if not cache_config:
        return

    model = viewset_class.model
    prefix = cache_config.prefix or viewset_class.get_entity_name().lower()
    cache = CacheManager(prefix=prefix)

    async def sync_to_cache(instance):
        if cache_config.builder:
            data = cache_config.builder(instance)
        else:
            data = {c.name: getattr(instance, c.name) for c in instance.__table__.columns}

        for field_name in cache_config.index_by:
            key = build_cache_key(prefix, field_name, instance)
            if key:
                await cache.set(key.replace(f"{prefix}:", ""), data, ttl=cache_config.ttl)

        await redis_publish(f"{prefix}.updated", data)

    async def invalidate_cache(instance):
        for field_name in cache_config.index_by:
            key = build_cache_key(prefix, field_name, instance)
            if key:
                await cache.invalidate(key.replace(f"{prefix}:", ""))

        data = {c.name: getattr(instance, c.name) for c in instance.__table__.columns}
        await redis_publish(f"{prefix}.deleted", data)

    if cache_config.on_change:
        @event.listens_for(model, "after_insert")
        @event.listens_for(model, "after_update")
        def on_change(mapper, connection, target):
            asyncio.create_task(sync_to_cache(target))

    if cache_config.on_delete:
        @event.listens_for(model, "after_delete")
        def on_delete(mapper, connection, target):
            asyncio.create_task(invalidate_cache(target))


def init_cache_handlers(viewsets: list):
    """Initialize cache handlers for all ViewSets with cache config."""
    for viewset in viewsets:
        if hasattr(viewset, "cache") and viewset.cache:
            register_cache_handlers(viewset)
