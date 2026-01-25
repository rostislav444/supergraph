"""
Redis client for messaging.

Provides singleton Redis connection for pub/sub, caching, and RPC.
"""

from __future__ import annotations

import logging
from typing import Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


class RedisClient:
    """
    Singleton Redis client for messaging operations.

    Usage:
        client = RedisClient.get_instance("redis://redis:6379")
        await client.connect()

        # Publish
        await client.publish("channel", "message")

        # Get/Set
        await client.set("key", "value", ex=3600)
        value = await client.get("key")
    """

    _instance: Optional[RedisClient] = None
    _redis: Optional[aioredis.Redis] = None

    def __init__(self, redis_url: str):
        """
        Initialize Redis client.

        Args:
            redis_url: Redis connection URL
        """
        self.redis_url = redis_url
        self._connected = False

    @classmethod
    def get_instance(cls, redis_url: Optional[str] = None) -> RedisClient:
        """
        Get singleton instance of Redis client.

        Args:
            redis_url: Redis URL (required on first call)

        Returns:
            RedisClient instance
        """
        if cls._instance is None:
            if redis_url is None:
                raise ValueError("redis_url is required on first call to get_instance")
            cls._instance = cls(redis_url)
        return cls._instance

    async def connect(self):
        """Connect to Redis"""
        if self._connected:
            return

        logger.info(f"Connecting to Redis: {self.redis_url}")
        self._redis = await aioredis.from_url(
            self.redis_url,
            encoding="utf-8",
            decode_responses=True
        )
        self._connected = True
        logger.info("Redis client connected")

    async def disconnect(self):
        """Disconnect from Redis"""
        if self._redis:
            await self._redis.close()
            self._connected = False
            logger.info("Redis client disconnected")

    @property
    def redis(self) -> aioredis.Redis:
        """Get underlying Redis connection"""
        if not self._connected or not self._redis:
            raise RuntimeError("Redis client not connected. Call await client.connect() first.")
        return self._redis

    # === Key-Value operations ===

    async def get(self, key: str) -> Optional[str]:
        """Get value by key"""
        return await self.redis.get(key)

    async def set(self, key: str, value: str, ex: Optional[int] = None) -> bool:
        """
        Set key-value pair.

        Args:
            key: Key name
            value: Value to store
            ex: Expiration time in seconds (TTL)

        Returns:
            True if successful
        """
        return await self.redis.set(key, value, ex=ex)

    async def delete(self, *keys: str) -> int:
        """Delete one or more keys. Returns number of keys deleted."""
        return await self.redis.delete(*keys)

    async def exists(self, *keys: str) -> int:
        """Check if keys exist. Returns number of existing keys."""
        return await self.redis.exists(*keys)

    async def expire(self, key: str, seconds: int) -> bool:
        """Set expiration time for a key"""
        return await self.redis.expire(key, seconds)

    # === Pub/Sub operations ===

    async def publish(self, channel: str, message: str) -> int:
        """
        Publish message to channel.

        Args:
            channel: Channel name
            message: Message to publish

        Returns:
            Number of subscribers that received the message
        """
        return await self.redis.publish(channel, message)

    def pubsub(self) -> aioredis.client.PubSub:
        """Get pub/sub instance for subscribing to channels"""
        return self.redis.pubsub()

    # === Hash operations ===

    async def hget(self, name: str, key: str) -> Optional[str]:
        """Get value from hash"""
        return await self.redis.hget(name, key)

    async def hset(self, name: str, key: str, value: str) -> int:
        """Set value in hash"""
        return await self.redis.hset(name, key, value)

    async def hgetall(self, name: str) -> dict:
        """Get all key-value pairs from hash"""
        return await self.redis.hgetall(name)

    async def hdel(self, name: str, *keys: str) -> int:
        """Delete keys from hash"""
        return await self.redis.hdel(name, *keys)


# Global instance accessor
_global_client: Optional[RedisClient] = None


def get_redis_client(redis_url: Optional[str] = None) -> RedisClient:
    """
    Get global Redis client instance.

    Args:
        redis_url: Redis URL (required on first call)

    Returns:
        RedisClient instance
    """
    global _global_client
    if _global_client is None:
        if redis_url is None:
            raise ValueError("redis_url is required on first call")
        _global_client = RedisClient(redis_url)
    return _global_client


async def init_redis(redis_url: str):
    """
    Initialize global Redis client.

    Call this during application startup.

    Args:
        redis_url: Redis connection URL
    """
    client = get_redis_client(redis_url)
    await client.connect()
    logger.info("Redis messaging initialized")


async def close_redis():
    """Close global Redis client"""
    global _global_client
    if _global_client:
        await _global_client.disconnect()
        _global_client = None
