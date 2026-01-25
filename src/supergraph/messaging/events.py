"""
EventConfig для автоматической публикации событий из ViewSets.

При изменении данных автоматически публикует события в Redis Pub/Sub.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class EventConfig:
    """
    Конфигурация событий для ModelViewSet.

    Usage:
        class CameraViewSet(ModelViewSet):
            model = Camera

            events = EventConfig(
                publish={
                    "create": "camera.created",
                    "update": "camera.updated",
                    "delete": "camera.deleted",
                },
                payload_fields=["id", "mac_address", "model", "settings"]
            )
    """

    # Mapping: operation -> channel name
    publish: dict[str, str] = field(default_factory=dict)

    # Fields to include in event payload
    payload_fields: Optional[list[str]] = None

    # Custom payload builder
    payload_builder: Optional[Callable] = None

    # Whether to publish on batch operations
    publish_batch: bool = False

    def get_channel(self, operation: str) -> Optional[str]:
        """Get channel name for operation"""
        return self.publish.get(operation)

    def should_publish(self, operation: str) -> bool:
        """Check if should publish for operation"""
        return operation in self.publish

    def build_payload(self, instance: Any, operation: str) -> dict:
        """
        Build event payload from model instance.

        Args:
            instance: Model instance
            operation: Operation type (create/update/delete)

        Returns:
            Event payload dict
        """
        if self.payload_builder:
            return self.payload_builder(instance, operation)

        # Default payload builder
        payload = {"operation": operation}

        if self.payload_fields:
            # Extract specified fields
            for field in self.payload_fields:
                if hasattr(instance, field):
                    value = getattr(instance, field)
                    # Handle nested objects
                    if hasattr(value, "__dict__"):
                        payload[field] = {k: v for k, v in value.__dict__.items() if not k.startswith("_")}
                    else:
                        payload[field] = value
        else:
            # Extract all non-private fields
            if hasattr(instance, "__dict__"):
                payload.update({
                    k: v for k, v in instance.__dict__.items()
                    if not k.startswith("_")
                })

        return payload


async def publish_model_event(
    event_config: EventConfig,
    operation: str,
    instance: Any,
    redis_url: Optional[str] = None
):
    """
    Publish model event to Redis.

    Args:
        event_config: Event configuration
        operation: Operation type (create/update/delete)
        instance: Model instance
        redis_url: Redis URL (optional)
    """
    if not event_config.should_publish(operation):
        return

    channel = event_config.get_channel(operation)
    if not channel:
        return

    # Build payload
    try:
        payload = event_config.build_payload(instance, operation)
    except Exception as e:
        logger.error(f"Failed to build event payload: {e}", exc_info=True)
        return

    # Publish
    try:
        from .pubsub import redis_publish
        count = await redis_publish(channel, payload, redis_url)
        logger.info(f"Published {operation} event to {channel}: {count} subscribers")
    except Exception as e:
        logger.error(f"Failed to publish event to {channel}: {e}", exc_info=True)


# Helper for setting up event handlers in services


class EventPublisher:
    """
    Helper class для публикации событий из сервисов.

    Usage:
        # In service
        publisher = EventPublisher("camera")

        # After create
        await publisher.publish_created(camera_instance, ["id", "mac_address"])

        # After update
        await publisher.publish_updated(camera_instance)

        # After delete
        await publisher.publish_deleted(camera_id)
    """

    def __init__(self, entity_name: str, redis_url: Optional[str] = None):
        """
        Initialize event publisher.

        Args:
            entity_name: Entity name (e.g., "camera")
            redis_url: Redis URL (optional)
        """
        self.entity_name = entity_name.lower()
        self.redis_url = redis_url

    async def publish_created(self, instance: Any, fields: Optional[list[str]] = None):
        """Publish created event"""
        await self._publish("created", instance, fields)

    async def publish_updated(self, instance: Any, fields: Optional[list[str]] = None):
        """Publish updated event"""
        await self._publish("updated", instance, fields)

    async def publish_deleted(self, instance_or_id: Any, fields: Optional[list[str]] = None):
        """Publish deleted event"""
        # If just ID passed, create dict
        if isinstance(instance_or_id, (int, str)):
            instance = {"id": instance_or_id}
        else:
            instance = instance_or_id

        await self._publish("deleted", instance, fields)

    async def _publish(self, operation: str, instance: Any, fields: Optional[list[str]] = None):
        """Internal publish method"""
        channel = f"{self.entity_name}.{operation}"

        # Build payload
        if isinstance(instance, dict):
            payload = instance
        else:
            payload = {}
            if fields:
                for field in fields:
                    if hasattr(instance, field):
                        payload[field] = getattr(instance, field)
            else:
                # All fields
                if hasattr(instance, "__dict__"):
                    payload = {k: v for k, v in instance.__dict__.items() if not k.startswith("_")}

        payload["operation"] = operation

        # Publish
        try:
            from .pubsub import redis_publish
            count = await redis_publish(channel, payload, self.redis_url)
            logger.info(f"Published {self.entity_name}.{operation}: {count} subscribers")
        except Exception as e:
            logger.error(f"Failed to publish {channel}: {e}", exc_info=True)
