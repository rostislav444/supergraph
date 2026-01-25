"""
WebSocket router for Gateway.

Handles WebSocket connections and subscription management for federated WebSocket endpoints.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect

from .manager import WebSocketManager, SubscriptionInfo
from .subscription import SubscriptionParser
from ..runtime.context import Principal
from ..iam.guard import inject_guards

logger = logging.getLogger(__name__)


class WebSocketRouter:
    """
    WebSocket router for Gateway.

    Manages WebSocket connections from clients and federates subscriptions
    across multiple services.

    Features:
    - JSON DSL for subscriptions
    - IAM guard injection
    - Auto-discovery of WebSocket entities
    - Redis Pub/Sub integration
    """

    def __init__(self, graph: dict, redis_url: str):
        """
        Initialize WebSocket router.

        Args:
            graph: Compiled graph with entities and websockets
            redis_url: Redis connection URL
        """
        self.graph = graph
        self.redis_url = redis_url
        self.manager = WebSocketManager(redis_url)
        self.parser = SubscriptionParser(graph)
        self._started = False

    async def startup(self):
        """Start WebSocket manager and Redis listener"""
        if self._started:
            logger.warning("WebSocket router already started")
            return

        await self.manager.startup()
        self._started = True
        logger.info("WebSocket router started")

    async def shutdown(self):
        """Shutdown WebSocket manager"""
        await self.manager.shutdown()
        self._started = False
        logger.info("WebSocket router shutdown")

    async def handle_connection(self, websocket: WebSocket, principal: Principal):
        """
        Handle WebSocket connection from client.

        Flow:
        1. Accept connection
        2. Wait for subscription requests
        3. Validate and subscribe to Redis channels
        4. Stream updates to client
        5. Handle unsubscribe and disconnect

        Args:
            websocket: FastAPI WebSocket connection
            principal: Authenticated user principal
        """
        connection_id = str(uuid.uuid4())

        try:
            # Connect
            await self.manager.connect(websocket, connection_id, principal.id)

            # Send connection acknowledgment
            await websocket.send_json({
                "type": "connection_ack",
                "connection_id": connection_id
            })

            # Listen for messages from client
            while True:
                message = await websocket.receive_json()
                await self._handle_message(connection_id, message, principal)

        except WebSocketDisconnect:
            logger.info(f"Client {connection_id} disconnected")
        except Exception as e:
            logger.error(f"Error in WebSocket connection {connection_id}: {e}", exc_info=True)
            try:
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
            except:
                pass
        finally:
            await self.manager.disconnect(connection_id)

    async def _handle_message(self, connection_id: str, message: dict, principal: Principal):
        """
        Handle message from client.

        Supports:
        - subscribe: Subscribe to entity updates
        - unsubscribe: Unsubscribe from entity updates
        - ping: Heartbeat

        Args:
            connection_id: Connection ID
            message: Message from client
            principal: Authenticated user
        """
        message_type = message.get("type")

        if message_type == "subscribe":
            await self._handle_subscribe(connection_id, message, principal)

        elif message_type == "unsubscribe":
            await self._handle_unsubscribe(connection_id, message)

        elif message_type == "ping":
            await self._handle_ping(connection_id)

        else:
            logger.warning(f"Unknown message type: {message_type}")
            conn_info = self.manager._connections.get(connection_id)
            if conn_info:
                await conn_info.websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                })

    async def _handle_subscribe(
        self,
        connection_id: str,
        message: dict,
        principal: Principal
    ):
        """
        Handle subscribe request.

        Message format:
        {
            "type": "subscribe",
            "payload": {
                "CameraEvents": {
                    "filters": {"camera_id__eq": 123},
                    "fields": ["event_type", "timestamp"]
                }
            }
        }
        """
        payload = message.get("payload", {})

        if not payload:
            raise ValueError("Subscribe payload is required")

        # Parse and validate subscriptions
        try:
            subscriptions = self.parser.parse(payload)
        except ValueError as e:
            logger.warning(f"Subscription validation failed: {e}")
            conn_info = self.manager._connections.get(connection_id)
            if conn_info:
                await conn_info.websocket.send_json({
                    "type": "error",
                    "message": f"Subscription validation failed: {e}"
                })
            return

        # Process each subscription
        for entity, normalized_sub in subscriptions.items():
            # Apply IAM guards to filters
            ws_def = self.graph["websockets"][entity]
            access_config = ws_def.get("access", {})

            guarded_filters = self._apply_iam_guards(
                normalized_sub.filters,
                access_config,
                principal
            )

            # Determine Redis channel
            channel = self.parser.get_channel(entity, guarded_filters)

            # Create subscription info
            sub_info = SubscriptionInfo(
                entity=entity,
                filters=guarded_filters,
                fields=normalized_sub.fields,
            )

            # Subscribe connection to channel
            await self.manager.subscribe(connection_id, channel, sub_info)

            # Send acknowledgment
            conn_info = self.manager._connections.get(connection_id)
            if conn_info:
                await conn_info.websocket.send_json({
                    "type": "subscribed",
                    "entity": entity,
                    "channel": channel,
                    "filters": [f.model_dump() for f in guarded_filters],
                })

    async def _handle_unsubscribe(self, connection_id: str, message: dict):
        """
        Handle unsubscribe request.

        Message format:
        {
            "type": "unsubscribe",
            "payload": {
                "entities": ["CameraEvents"]
            }
        }
        """
        payload = message.get("payload", {})
        entities = payload.get("entities", [])

        conn_info = self.manager._connections.get(connection_id)
        if not conn_info:
            return

        # Find rooms to leave
        for room, sub_info in list(conn_info.subscriptions.items()):
            if sub_info.entity in entities:
                await self.manager.unsubscribe(connection_id, room)

                # Send acknowledgment
                await conn_info.websocket.send_json({
                    "type": "unsubscribed",
                    "entity": sub_info.entity,
                })

    async def _handle_ping(self, connection_id: str):
        """Handle ping (heartbeat) from client"""
        conn_info = self.manager._connections.get(connection_id)
        if conn_info:
            await conn_info.websocket.send_json({"type": "pong"})

    def _apply_iam_guards(
        self,
        filters: list[NormalizedFilter],
        access_config: dict,
        principal: Principal
    ) -> list[NormalizedFilter]:
        """
        Apply IAM guards to subscription filters.

        Similar to query guard injection, but for subscriptions.

        Args:
            filters: Original filters from subscription
            access_config: Access configuration from websocket definition
            principal: Authenticated user

        Returns:
            Filters with IAM guards injected
        """
        tenant_strategy = access_config.get("tenant_strategy", "none")

        if tenant_strategy == "none":
            return filters  # No guards needed

        tenant_field = access_config.get("tenant_field")
        if not tenant_field:
            logger.warning("Access strategy requires tenant_field but none provided")
            return filters

        # Inject tenant filter
        if tenant_strategy == "direct":
            # Add rc_id__in filter from principal
            guard_filter = NormalizedFilter(
                field=tenant_field,
                op="in",
                value=principal.rc_ids
            )

            # Check if filter already exists
            existing = next(
                (f for f in filters if f.field == tenant_field),
                None
            )

            if existing:
                # Intersect with existing filter
                if existing.op == "eq":
                    # Check if allowed
                    if existing.value not in principal.rc_ids:
                        raise PermissionError(
                            f"Access denied: {tenant_field}={existing.value} not in allowed scope"
                        )
                    # Keep existing filter (it's more restrictive)
                    return filters
                elif existing.op == "in":
                    # Intersect values
                    allowed = set(principal.rc_ids)
                    requested = set(existing.value)
                    intersection = allowed & requested
                    if not intersection:
                        raise PermissionError("Access denied: no allowed values in requested scope")
                    existing.value = list(intersection)
                    return filters
                else:
                    # Other operators - just add guard
                    return filters + [guard_filter]
            else:
                # Add guard filter
                return filters + [guard_filter]

        # TODO: Support "via_relations" strategy
        return filters


def create_websocket_router(graph: dict, redis_url: str) -> WebSocketRouter:
    """
    Factory for creating WebSocket router.

    Args:
        graph: Compiled graph schema
        redis_url: Redis connection URL

    Returns:
        Configured WebSocket router
    """
    return WebSocketRouter(graph, redis_url)
