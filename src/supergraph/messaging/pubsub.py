"""
Redis Pub/Sub для межсервисного общения.

Publisher - публикует события
Subscriber - подписывается и обрабатывает события
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Dict, Optional

from .client import get_redis_client

logger = logging.getLogger(__name__)


class RedisPublisher:
    """
    Publisher для публикации событий в Redis.

    Usage:
        publisher = RedisPublisher()

        # Publish event
        await publisher.publish(
            "camera.updated",
            {"id": 123, "mac_address": "AA:BB:CC:DD:EE:FF"}
        )
    """

    def __init__(self, redis_url: Optional[str] = None):
        """
        Initialize publisher.

        Args:
            redis_url: Redis URL (optional if already initialized)
        """
        self.client = get_redis_client(redis_url)

    async def publish(self, channel: str, data: Dict[str, Any]) -> int:
        """
        Publish event to channel.

        Args:
            channel: Channel name (e.g., "camera.updated")
            data: Event data (will be JSON serialized)

        Returns:
            Number of subscribers that received the message
        """
        try:
            payload = json.dumps(data, ensure_ascii=False)
            count = await self.client.publish(channel, payload)
            logger.debug(f"Published to {channel}: {count} subscribers received")
            return count
        except Exception as e:
            logger.error(f"Failed to publish to {channel}: {e}", exc_info=True)
            return 0

    async def publish_raw(self, channel: str, message: str) -> int:
        """
        Publish raw string message to channel.

        Args:
            channel: Channel name
            message: Raw message

        Returns:
            Number of subscribers that received the message
        """
        try:
            count = await self.client.publish(channel, message)
            logger.debug(f"Published raw to {channel}: {count} subscribers")
            return count
        except Exception as e:
            logger.error(f"Failed to publish raw to {channel}: {e}", exc_info=True)
            return 0


class RedisSubscriber:
    """
    Subscriber для получения событий из Redis Pub/Sub.

    Usage:
        subscriber = RedisSubscriber()

        @subscriber.on("camera.updated")
        async def handle_camera_update(data: dict):
            print(f"Camera updated: {data}")

        # Start listening
        await subscriber.start()
    """

    def __init__(self, redis_url: Optional[str] = None):
        """
        Initialize subscriber.

        Args:
            redis_url: Redis URL (optional if already initialized)
        """
        self.client = get_redis_client(redis_url)
        self._handlers: Dict[str, list[Callable]] = {}
        self._pubsub = None
        self._listener_task: Optional[asyncio.Task] = None
        self._running = False

    def on(self, channel: str):
        """
        Decorator to register handler for channel.

        Usage:
            @subscriber.on("camera.updated")
            async def handle_camera_update(data: dict):
                pass
        """
        def decorator(func: Callable):
            if channel not in self._handlers:
                self._handlers[channel] = []
            self._handlers[channel].append(func)
            logger.info(f"Registered handler for channel: {channel}")
            return func
        return decorator

    def subscribe(self, channel: str, handler: Callable):
        """
        Programmatically subscribe to channel.

        Args:
            channel: Channel name
            handler: Async function to handle messages
        """
        if channel not in self._handlers:
            self._handlers[channel] = []
        self._handlers[channel].append(handler)
        logger.info(f"Subscribed to channel: {channel}")

    async def start(self):
        """Start listening for messages"""
        if self._running:
            logger.warning("Subscriber already running")
            return

        if not self._handlers:
            logger.warning("No handlers registered, subscriber not started")
            return

        # Connect to Redis if not connected
        await self.client.connect()

        # Create pubsub instance
        self._pubsub = self.client.pubsub()

        # Subscribe to all channels
        channels = list(self._handlers.keys())
        await self._pubsub.subscribe(*channels)
        logger.info(f"Subscribed to Redis channels: {channels}")

        # Start listener task
        self._running = True
        self._listener_task = asyncio.create_task(self._listen())
        logger.info("Redis subscriber started")

    async def stop(self):
        """Stop listening for messages"""
        self._running = False

        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass

        if self._pubsub:
            await self._pubsub.close()

        logger.info("Redis subscriber stopped")

    async def _listen(self):
        """Listen for messages and dispatch to handlers"""
        logger.info("Redis listener started")
        try:
            while self._running:
                try:
                    message = await self._pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=1.0
                    )

                    if message and message["type"] == "message":
                        channel = message["channel"]
                        data = message["data"]
                        await self._handle_message(channel, data)

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Redis listener error: {e}", exc_info=True)
                    await asyncio.sleep(1)

        except asyncio.CancelledError:
            logger.info("Redis listener cancelled")

    async def _handle_message(self, channel: str, raw_data: str):
        """Handle incoming message"""
        handlers = self._handlers.get(channel, [])
        if not handlers:
            return

        # Parse JSON
        try:
            data = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in message from {channel}: {raw_data[:100]}")
            return

        logger.debug(f"Received message on {channel}: {data}")

        # Call all handlers
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(data)
                else:
                    handler(data)
            except Exception as e:
                logger.error(f"Error in handler for {channel}: {e}", exc_info=True)


# Helper functions

async def redis_publish(channel: str, data: Dict[str, Any], redis_url: Optional[str] = None) -> int:
    """
    Publish event to Redis channel (convenience function).

    Args:
        channel: Channel name
        data: Event data
        redis_url: Redis URL (optional)

    Returns:
        Number of subscribers
    """
    publisher = RedisPublisher(redis_url)
    return await publisher.publish(channel, data)


def redis_subscribe(channel: str):
    """
    Decorator to subscribe to Redis channel (convenience function).

    Usage:
        @redis_subscribe("camera.updated")
        async def handle_update(data: dict):
            pass

        # Then in startup:
        subscriber = RedisSubscriber()
        await subscriber.start()
    """
    # This is a module-level decorator that needs a global subscriber
    # We'll create it lazily
    global _global_subscriber

    if _global_subscriber is None:
        _global_subscriber = RedisSubscriber()

    return _global_subscriber.on(channel)


# Global subscriber for decorator pattern
_global_subscriber: Optional[RedisSubscriber] = None


def get_global_subscriber() -> RedisSubscriber:
    """Get global subscriber instance"""
    global _global_subscriber
    if _global_subscriber is None:
        _global_subscriber = RedisSubscriber()
    return _global_subscriber
