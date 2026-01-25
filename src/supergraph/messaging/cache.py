"""
Distributed cache decorator для Redis.

Паттерн: Cache-aside с автоматической инвалидацией через Pub/Sub.
"""

from __future__ import annotations

import functools
import json
import logging
from typing import Any, Callable, Optional

from .client import get_redis_client
from .pubsub import RedisSubscriber

logger = logging.getLogger(__name__)


def redis_cache(
    key: str,
    ttl: int = 3600,
    prefix: str = "cache",
    invalidate_on: Optional[list[str]] = None,
):
    """
    Decorator для кэширования результатов функции в Redis.

    Паттерн Cache-aside:
    1. Проверяет Redis кэш
    2. Если есть - возвращает из кэша
    3. Если нет - вызывает функцию, кэширует результат
    4. Опционально подписывается на события инвалидации

    Args:
        key: Key pattern с плейсхолдерами (e.g., "camera:mac:{mac_address}")
        ttl: Time to live в секундах
        prefix: Префикс для ключей
        invalidate_on: List каналов для авто-инвалидации

    Usage:
        @redis_cache(
            key="camera:mac:{mac_address}",
            ttl=3600,
            invalidate_on=["camera.updated", "camera.deleted"]
        )
        async def get_camera_by_mac(mac_address: str):
            # Дорогая операция (HTTP, DB query)
            return await fetch_from_db(mac_address)

        # First call - fetches from DB, caches result
        camera = await get_camera_by_mac("AA:BB:CC:DD:EE:FF")

        # Second call - returns from cache
        camera = await get_camera_by_mac("AA:BB:CC:DD:EE:FF")

        # When "camera.updated" event is published, cache is invalidated
    """

    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key from pattern and function arguments
            cache_key = _build_cache_key(key, prefix, func, args, kwargs)

            # Try to get from cache
            client = get_redis_client()
            try:
                cached = await client.get(cache_key)
                if cached:
                    logger.debug(f"Cache HIT: {cache_key}")
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Cache read error for {cache_key}: {e}")
                # Continue to function call on cache error

            # Cache miss - call function
            logger.debug(f"Cache MISS: {cache_key}")
            result = await func(*args, **kwargs)

            # Cache result
            try:
                payload = json.dumps(result, ensure_ascii=False, default=str)
                await client.set(cache_key, payload, ex=ttl)
                logger.debug(f"Cached result for {cache_key} (TTL: {ttl}s)")
            except Exception as e:
                logger.warning(f"Cache write error for {cache_key}: {e}")
                # Don't fail on cache write error

            return result

        # Setup invalidation listeners if specified
        if invalidate_on:
            _setup_cache_invalidation(key, prefix, invalidate_on, func)

        return wrapper

    return decorator


def _build_cache_key(
    key_pattern: str,
    prefix: str,
    func: Callable,
    args: tuple,
    kwargs: dict
) -> str:
    """
    Build cache key from pattern and function arguments.

    Supports patterns like:
    - "camera:mac:{mac_address}"
    - "user:{user_id}:settings"
    - "complex:{complex_id}:cameras"
    """
    # Get function signature
    import inspect
    sig = inspect.signature(func)
    bound_args = sig.bind(*args, **kwargs)
    bound_args.apply_defaults()

    # Format key with arguments
    try:
        formatted_key = key_pattern.format(**bound_args.arguments)
    except KeyError as e:
        logger.error(f"Missing argument for cache key pattern {key_pattern}: {e}")
        # Fallback to function name + args hash
        args_hash = hash((args, tuple(sorted(kwargs.items()))))
        formatted_key = f"{func.__name__}:{args_hash}"

    return f"{prefix}:{formatted_key}"


def _setup_cache_invalidation(
    key_pattern: str,
    prefix: str,
    channels: list[str],
    func: Callable
):
    """
    Setup automatic cache invalidation on Pub/Sub events.

    When event is received, extracts keys from event data and invalidates cache.
    """
    subscriber = RedisSubscriber()

    for channel in channels:
        async def invalidation_handler(data: dict):
            """Handler for cache invalidation events"""
            try:
                # Try to build cache key from event data
                cache_key = f"{prefix}:{key_pattern.format(**data)}"
                client = get_redis_client()
                deleted = await client.delete(cache_key)
                if deleted:
                    logger.info(f"Cache invalidated: {cache_key} (event: {channel})")
            except KeyError:
                # Event data doesn't match key pattern
                logger.debug(f"Could not invalidate cache for {key_pattern} from event {channel}")
            except Exception as e:
                logger.error(f"Cache invalidation error: {e}", exc_info=True)

        subscriber.subscribe(channel, invalidation_handler)


class CacheManager:
    """
    Manager для ручного управления кэшем.

    Usage:
        cache = CacheManager()

        # Set
        await cache.set("camera:mac:AA:BB:CC", {"id": 123}, ttl=3600)

        # Get
        data = await cache.get("camera:mac:AA:BB:CC")

        # Invalidate
        await cache.invalidate("camera:mac:AA:BB:CC")

        # Invalidate pattern
        await cache.invalidate_pattern("camera:mac:*")
    """

    def __init__(self, prefix: str = "cache", redis_url: Optional[str] = None):
        """
        Initialize cache manager.

        Args:
            prefix: Key prefix
            redis_url: Redis URL (optional)
        """
        self.prefix = prefix
        self.client = get_redis_client(redis_url)

    def _make_key(self, key: str) -> str:
        """Build full cache key with prefix"""
        return f"{self.prefix}:{key}"

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        full_key = self._make_key(key)
        try:
            data = await self.client.get(full_key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Cache get error for {full_key}: {e}")
        return None

    async def set(self, key: str, value: Any, ttl: int = 3600) -> bool:
        """Set value in cache"""
        full_key = self._make_key(key)
        try:
            payload = json.dumps(value, ensure_ascii=False, default=str)
            await self.client.set(full_key, payload, ex=ttl)
            logger.debug(f"Cached {full_key} (TTL: {ttl}s)")
            return True
        except Exception as e:
            logger.error(f"Cache set error for {full_key}: {e}")
            return False

    async def invalidate(self, key: str) -> bool:
        """Invalidate (delete) cache key"""
        full_key = self._make_key(key)
        try:
            deleted = await self.client.delete(full_key)
            if deleted:
                logger.info(f"Cache invalidated: {full_key}")
            return bool(deleted)
        except Exception as e:
            logger.error(f"Cache invalidate error for {full_key}: {e}")
            return False

    async def invalidate_pattern(self, pattern: str) -> int:
        """
        Invalidate all keys matching pattern.

        Warning: This uses SCAN which can be slow on large datasets.

        Args:
            pattern: Key pattern (e.g., "camera:mac:*")

        Returns:
            Number of keys invalidated
        """
        full_pattern = self._make_key(pattern)
        try:
            count = 0
            async for key in self.client.redis.scan_iter(match=full_pattern):
                await self.client.delete(key)
                count += 1
            logger.info(f"Invalidated {count} keys matching {full_pattern}")
            return count
        except Exception as e:
            logger.error(f"Cache invalidate pattern error: {e}")
            return 0

    async def exists(self, key: str) -> bool:
        """Check if key exists in cache"""
        full_key = self._make_key(key)
        try:
            return bool(await self.client.exists(full_key))
        except Exception as e:
            logger.error(f"Cache exists check error for {full_key}: {e}")
            return False
