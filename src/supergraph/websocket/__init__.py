"""
WebSocket module for real-time subscriptions.

Provides:
- WebSocketManager: Connection and subscription management
- SubscriptionParser: JSON DSL parsing and validation
- WebSocketRouter: Gateway integration
"""

from __future__ import annotations

from .manager import WebSocketManager, ConnectionInfo, SubscriptionInfo
from .subscription import SubscriptionParser, SubscriptionRequest, NormalizedSubscription
from .router import WebSocketRouter, create_websocket_router

__all__ = [
    # Manager
    "WebSocketManager",
    "ConnectionInfo",
    "SubscriptionInfo",
    # Parser
    "SubscriptionParser",
    "SubscriptionRequest",
    "NormalizedSubscription",
    # Router
    "WebSocketRouter",
    "create_websocket_router",
]
