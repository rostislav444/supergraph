"""WebSocket connection manager with Redis Pub/Sub integration"""

import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from dataclasses import dataclass, field
from fastapi import WebSocket

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


@dataclass
class SubscriptionInfo:
    """Information about a subscription for a connection."""
    entity: str
    filters: list  # Normalized filters
    fields: list[str]


@dataclass
class ConnectionInfo:
    """Information about a WebSocket connection."""
    websocket: WebSocket
    subscriptions: Dict[str, SubscriptionInfo] = field(default_factory=dict)  # room -> SubscriptionInfo
    user_id: Optional[int] = None


class WebSocketManager:
    """
    WebSocket connection manager with Redis Pub/Sub.

    Manages:
    - WebSocket connections from clients
    - Subscription to Redis channels
    - Broadcasting messages to subscribed clients
    - Connection lifecycle
    """

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self._connections: Dict[str, ConnectionInfo] = {}
        self._room_connections: Dict[str, Set[str]] = {}  # room -> set of connection_ids
        self._redis: Optional[aioredis.Redis] = None
        self._pubsub: Optional[aioredis.client.PubSub] = None
        self._listener_task: Optional[asyncio.Task] = None
        self._running = False

    async def startup(self):
        """Initialize Redis connection and start listener"""
        logger.info(f"WebSocket manager connecting to Redis: {self.redis_url}")
        self._redis = await aioredis.from_url(
            self.redis_url,
            encoding="utf-8",
            decode_responses=True
        )
        self._pubsub = self._redis.pubsub()

        # Start listener task
        self._running = True
        self._listener_task = asyncio.create_task(self._redis_listener())
        logger.info("WebSocket manager started with Redis Pub/Sub")

    async def shutdown(self):
        """Cleanup on shutdown"""
        self._running = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self._pubsub:
            await self._pubsub.close()
        if self._redis:
            await self._redis.close()
        logger.info("WebSocket manager shutdown complete")

    async def _redis_listener(self):
        """Listen for Redis Pub/Sub messages and broadcast to clients"""
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
                        logger.debug(f"Redis message received on {channel}: {data[:100] if len(data) > 100 else data}...")
                        await self._broadcast_to_room(channel, data)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Redis listener error: {e}", exc_info=True)
                    await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Redis listener cancelled")

    async def _broadcast_to_room(self, room: str, message: str):
        """Broadcast message to all connections subscribed to a room"""
        connection_ids = self._room_connections.get(room, set()).copy()

        if not connection_ids:
            logger.debug(f"No connections in room {room}, skipping broadcast")
            return

        logger.debug(f"Broadcasting to {len(connection_ids)} connections in {room}")

        # Parse message data
        try:
            data = json.loads(message) if isinstance(message, str) else message
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in message: {message}")
            return

        disconnected = []
        for conn_id in connection_ids:
            conn_info = self._connections.get(conn_id)
            if conn_info:
                # Get subscription info for this room
                sub_info = conn_info.subscriptions.get(room)
                if not sub_info:
                    continue

                # Apply filters (client-side filtering)
                if not self._match_filters(data, sub_info.filters):
                    continue

                # Select only requested fields
                filtered_data = self._select_fields(data, sub_info.fields)

                # Format response
                response = {
                    sub_info.entity: filtered_data
                }

                try:
                    await conn_info.websocket.send_json(response)
                except Exception as e:
                    logger.warning(f"Failed to send to {conn_id}: {e}")
                    disconnected.append(conn_id)

        # Clean up disconnected clients
        for conn_id in disconnected:
            await self.disconnect(conn_id)

    def _match_filters(self, data: dict, filters: list) -> bool:
        """Check if data matches all filters"""
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
            elif op == "gte" and data_value < value:
                return False
            elif op == "lte" and data_value > value:
                return False
            elif op == "icontains" and value.lower() not in str(data_value).lower():
                return False

        return True

    def _select_fields(self, data: dict, fields: list[str]) -> dict:
        """Select only requested fields from data"""
        if not fields:
            return data  # Return all fields if none specified

        return {field: data.get(field) for field in fields if field in data}

    async def connect(self, websocket: WebSocket, connection_id: str, user_id: Optional[int] = None):
        """Register new WebSocket connection"""
        await websocket.accept()
        self._connections[connection_id] = ConnectionInfo(
            websocket=websocket,
            user_id=user_id
        )
        logger.info(f"WebSocket connected: {connection_id} (total: {len(self._connections)})")

    async def disconnect(self, connection_id: str):
        """Remove WebSocket connection and clean up subscriptions"""
        conn_info = self._connections.pop(connection_id, None)
        if conn_info:
            # Remove from all rooms
            for room in list(conn_info.subscriptions.keys()):
                await self._leave_room_internal(connection_id, room)
        logger.info(f"WebSocket disconnected: {connection_id} (total: {len(self._connections)})")

    async def subscribe(
        self,
        connection_id: str,
        room: str,
        subscription_info: SubscriptionInfo
    ):
        """
        Subscribe connection to a room with subscription details.

        Args:
            connection_id: Connection ID
            room: Redis channel/room name
            subscription_info: Subscription metadata (entity, filters, fields)
        """
        if connection_id not in self._connections:
            logger.warning(f"Connection {connection_id} not found")
            return

        conn_info = self._connections[connection_id]

        # Check if already subscribed
        if room in conn_info.subscriptions:
            logger.debug(f"Connection {connection_id} already subscribed to {room}")
            return

        # Add subscription info to connection
        conn_info.subscriptions[room] = subscription_info

        # Add connection to room
        if room not in self._room_connections:
            self._room_connections[room] = set()
            # Subscribe to Redis channel for this room
            if self._pubsub:
                await self._pubsub.subscribe(room)
                logger.info(f"Subscribed to Redis channel: {room}")

        self._room_connections[room].add(connection_id)
        logger.info(f"Connection {connection_id} subscribed to {room} for entity {subscription_info.entity}")

    async def unsubscribe(self, connection_id: str, room: str):
        """Unsubscribe connection from a room"""
        await self._leave_room_internal(connection_id, room)

    async def _leave_room_internal(self, connection_id: str, room: str):
        """Internal method to leave a room"""
        if connection_id in self._connections:
            self._connections[connection_id].subscriptions.pop(room, None)

        if room in self._room_connections:
            self._room_connections[room].discard(connection_id)
            # Unsubscribe from Redis if no more connections in room
            if not self._room_connections[room]:
                if self._pubsub:
                    await self._pubsub.unsubscribe(room)
                    logger.info(f"Unsubscribed from Redis channel: {room}")
                del self._room_connections[room]

    def get_connection_subscriptions(self, connection_id: str) -> Dict[str, SubscriptionInfo]:
        """Get subscriptions for a connection"""
        conn_info = self._connections.get(connection_id)
        return conn_info.subscriptions.copy() if conn_info else {}

    @property
    def connection_count(self) -> int:
        """Get total number of active connections"""
        return len(self._connections)

    @property
    def subscription_count(self) -> int:
        """Get total number of active subscriptions across all connections"""
        return sum(len(conn.subscriptions) for conn in self._connections.values())
