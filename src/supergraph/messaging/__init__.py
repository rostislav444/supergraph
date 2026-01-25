"""
Messaging module - Redis-based inter-service communication.

Provides:
- RedisClient: Connection management
- Publisher/Subscriber: Pub/Sub messaging
- CacheManager: Distributed caching
- EventConfig: Auto-publishing from ViewSets

Patterns:
1. Cache-aside: Cache expensive operations with auto-invalidation
2. Pub/Sub: Event-driven communication between services
3. Signal-based sync: Auto-publish on model changes

Usage:
    # Initialize Redis
    from supergraph.messaging import init_redis
    await init_redis("redis://redis:6379")

    # Pub/Sub
    from supergraph.messaging import redis_publish, redis_subscribe

    await redis_publish("camera.updated", {"id": 123, "mac": "AA:BB:CC"})

    @redis_subscribe("camera.updated")
    async def handle_update(data):
        print(f"Camera updated: {data}")

    # Cache
    from supergraph.messaging import redis_cache

    @redis_cache(key="camera:mac:{mac}", ttl=3600)
    async def get_camera_by_mac(mac: str):
        return await fetch_from_db(mac)

    # Events in ViewSets
    from supergraph import ModelViewSet
    from supergraph.messaging import EventConfig

    class CameraViewSet(ModelViewSet):
        model = Camera
        events = EventConfig(
            publish={
                "create": "camera.created",
                "update": "camera.updated",
            },
            payload_fields=["id", "mac_address"]
        )
"""

from __future__ import annotations

from .client import (
    RedisClient,
    get_redis_client,
    init_redis,
    close_redis,
)
from .pubsub import (
    RedisPublisher,
    RedisSubscriber,
    redis_publish,
    redis_subscribe,
    get_global_subscriber,
)
from .cache import (
    redis_cache,
    CacheManager,
)
from .events import (
    EventConfig,
    EventPublisher,
    publish_model_event,
)

__all__ = [
    # Client
    "RedisClient",
    "get_redis_client",
    "init_redis",
    "close_redis",
    # Pub/Sub
    "RedisPublisher",
    "RedisSubscriber",
    "redis_publish",
    "redis_subscribe",
    "get_global_subscriber",
    # Cache
    "redis_cache",
    "CacheManager",
    # Events
    "EventConfig",
    "EventPublisher",
    "publish_model_event",
]
