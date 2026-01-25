"""
Subscription - Declarative WebSocket endpoints for real-time data streams.

Usage:
    class CameraEventsSubscription(Subscription):
        entity = "CameraEvents"
        channels = ["camera.events"]
        schema = CameraEventData
        filters = {"camera_id": ["eq", "in"]}
        access = AccessConfig.direct(tenant_field="rc_id")
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Type

from pydantic import BaseModel

from .base import AccessConfig


@dataclass
class SubscriptionConfig:
    """WebSocket subscription configuration."""
    channel_pattern: str = "{entity_name}"
    max_connections_per_client: int = 10
    heartbeat_interval: int = 30


class Subscription:
    """
    Declarative WebSocket subscription endpoint.

    Similar to ModelViewSet but for real-time data streams.
    Auto-discovered by Gateway and federated through /subscribe.

    Example:
        class CameraEventsSubscription(Subscription):
            entity = "CameraEvents"
            channels = ["camera.events"]

            schema = CameraEventData

            filters = {
                "camera_id": ["eq", "in"],
                "event_type": ["eq", "in"],
            }

            access = AccessConfig.direct(tenant_field="rc_id")
    """

    entity: str
    channels: list[str] | str

    service: Optional[str] = None
    schema: Optional[Type[BaseModel]] = None
    filters: dict[str, list[str]] = {}
    access: AccessConfig = AccessConfig.none()
    config: SubscriptionConfig = SubscriptionConfig()

    @classmethod
    async def transform(cls, data: dict, context: Any) -> dict:
        """Transform data before sending to client."""
        return data

    @classmethod
    async def before_subscribe(cls, filters: dict, principal: Any) -> bool:
        """Hook called before subscribing."""
        return True

    @classmethod
    def get_channel(cls, filters: dict) -> str:
        """Determine Redis channel based on filters."""
        if isinstance(cls.channels, list):
            return cls.channels[0]
        return cls.channels

    @classmethod
    def match_filter(cls, data: dict, filters: dict) -> bool:
        """Check if data matches subscription filters."""
        for filter_item in filters:
            field = filter_item["field"]
            op = filter_item["op"]
            value = filter_item["value"]

            if field not in data:
                return False

            data_value = data[field]

            if op == "eq" and data_value != value:
                return False
            elif op == "in" and data_value not in value:
                return False

        return True

    @classmethod
    def get_service(cls) -> str:
        """Get service name. Auto-inferred from entity name if not specified."""
        if cls.service is not None:
            return cls.service
        return cls.entity.lower()

    @classmethod
    def get_schema_def(cls) -> dict:
        """Generate schema definition for /__schema endpoint."""
        channels_list = cls.channels if isinstance(cls.channels, list) else [cls.channels]

        access = cls.access
        if isinstance(access, type):
            access = AccessConfig.none()

        access_dict = {
            "tenant_strategy": access.tenant_strategy,
            "tenant_field": access.tenant_field,
        }

        schema_def = {}
        if cls.schema:
            schema_def = cls.schema.model_json_schema()

        return {
            "type": "websocket",
            "entity": cls.entity,
            "service": cls.get_service(),
            "channels": channels_list,
            "filters": cls.filters,
            "access": access_dict,
            "schema": schema_def,
        }


Subscription.filters = {}
Subscription.access = AccessConfig.none()
Subscription.config = SubscriptionConfig()
