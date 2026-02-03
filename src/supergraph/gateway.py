"""
Supergraph Gateway - main entry point for creating a gateway application.

Usage:
    from supergraph import Gateway

    gateway = Gateway(
        services={
            "person": "http://person:8002",
            "property": "http://property:8001",
            "relations": "http://relations:8003",
        },
    )

    app = gateway.app
"""

from __future__ import annotations


import asyncio
import os
from typing import Any, List, Optional

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .api import create_supergraph_app
from .core.hcl import to_hcl, transform_graph_to_new_format
from .playground import mount_playground


class Gateway:
    """
    Supergraph Gateway that auto-discovers schemas from services.

    Features:
    - Fetches schemas from all services at startup
    - Merges schemas and applies attached relations
    - Generates and saves supergraph.hcl
    - Provides FastAPI app with query/mutation endpoints
    """

    def __init__(
        self,
        services: dict[str, str],
        *,
        title: str = "Supergraph Gateway",
        cors_origins: Optional[List[str]] = None,
        hcl_output_path: Optional[str] = None,
        playground: bool = True,
        playground_path: str = "/playground",
        redis_url: Optional[str] = None,
    ):
        """
        Initialize gateway.

        Args:
            services: Dict of service name -> URL
            title: FastAPI app title
            cors_origins: CORS allowed origins (default: localhost:3000)
            hcl_output_path: Path to save supergraph.hcl (default: ./supergraph.hcl)
            playground: Enable visual playground (default: True)
            playground_path: URL path for playground (default: /playground)
            redis_url: Redis URL for WebSocket subscriptions (optional)
        """
        self.services = services
        self.title = title
        self.cors_origins = cors_origins or ["http://localhost:3000", "http://127.0.0.1:3000"]
        self.hcl_output_path = hcl_output_path or self._default_hcl_path()
        self.playground_enabled = playground
        self.playground_path = playground_path
        self.redis_url = redis_url or os.getenv("REDIS_URL")

        # Build graph
        self.graph = self._build_graph()

        # Save HCL
        self._save_hcl()

        # Create FastAPI app
        self.app = self._create_app()

        # Store reference to gateway on app for refresh endpoint
        self.app.state.gateway = self

    def _default_hcl_path(self) -> str:
        """Get default HCL output path."""
        # Try to find the caller's directory
        import inspect
        frame = inspect.currentframe()
        if frame and frame.f_back and frame.f_back.f_back:
            caller_file = frame.f_back.f_back.f_globals.get("__file__")
            if caller_file:
                return os.path.join(os.path.dirname(caller_file), "supergraph.hcl")
        return "supergraph.hcl"

    def _build_graph(self) -> dict[str, Any]:
        """Build graph by discovering schemas from services."""
        try:
            return self._discover_schemas_sync()
        except Exception as e:
            print(f"Warning: Could not discover schemas: {e}")
            return {"version": 1, "services": {}, "entities": {}}

    def _discover_schemas_sync(self) -> dict[str, Any]:
        """Synchronous wrapper for schema discovery."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    return pool.submit(lambda: asyncio.run(self._discover_schemas())).result()
            else:
                return asyncio.run(self._discover_schemas())
        except RuntimeError:
            return asyncio.run(self._discover_schemas())

    async def _discover_schemas(self) -> dict[str, Any]:
        """Discover schemas from all services."""
        async with httpx.AsyncClient() as client:
            tasks = [
                self._fetch_schema(client, name, url)
                for name, url in self.services.items()
            ]
            results = await asyncio.gather(*tasks)

        # Merge schemas
        entities = {}
        websockets = {}
        attached_relations = []

        for schema in results:
            if schema is None:
                continue

            # Merge HTTP entities
            for entity_name, entity_def in schema.get("entities", {}).items():
                entities[entity_name] = entity_def

            # Merge WebSocket entities
            for ws_name, ws_def in schema.get("websockets", {}).items():
                websockets[ws_name] = ws_def

            # Collect attached relations
            if "attached_relations" in schema:
                attached_relations.extend(schema["attached_relations"])

        # Apply attached relations
        for attach in attached_relations:
            parent_entity = attach.get("parent_entity")
            if parent_entity in entities:
                if "relations" not in entities[parent_entity]:
                    entities[parent_entity]["relations"] = {}

                rel_name = attach["name"]
                rel_def = {
                    "target": attach["target_entity"],
                    "cardinality": attach.get("cardinality", "many"),
                }

                # Copy provider relation fields
                if attach.get("kind"):
                    rel_def["kind"] = attach["kind"]
                if attach.get("provider"):
                    rel_def["provider"] = attach["provider"]
                if attach.get("type"):
                    rel_def["type"] = attach["type"]
                if attach.get("status"):
                    rel_def["status"] = attach["status"]
                if attach.get("direction"):
                    rel_def["direction"] = attach["direction"]

                # Copy through/ref for legacy format
                if attach.get("through"):
                    rel_def["through"] = attach["through"]
                if attach.get("ref"):
                    rel_def["ref"] = attach["ref"]

                entities[parent_entity]["relations"][rel_name] = rel_def

        # Build legacy graph first
        legacy_graph = {
            "version": 1,
            "services": {name: {"url": url} for name, url in self.services.items()},
            "entities": entities,
        }

        # Transform to new format with relation_providers and presets
        transformed_graph = transform_graph_to_new_format(legacy_graph)

        # Add websockets to transformed graph
        if websockets:
            transformed_graph["websockets"] = websockets

        return transformed_graph

    async def _fetch_schema(self, client: httpx.AsyncClient, name: str, url: str) -> dict | None:
        """Fetch schema from a single service."""
        try:
            response = await client.get(f"{url}/__schema", timeout=10.0)
            if response.status_code == 200:
                return response.json()
            print(f"Warning: {name} returned {response.status_code}")
            return None
        except Exception as e:
            print(f"Warning: Could not fetch schema from {name}: {e}")
            return None

    def _save_hcl(self):
        """Save graph as HCL file."""
        try:
            hcl_content = to_hcl(self.graph)
            os.makedirs(os.path.dirname(self.hcl_output_path) or ".", exist_ok=True)
            with open(self.hcl_output_path, "w") as f:
                f.write(hcl_content)
            print(f"Supergraph saved: {self.hcl_output_path}")
        except Exception as e:
            print(f"Warning: Could not save HCL: {e}")

    async def refresh_schema(self) -> dict[str, Any]:
        """
        Refresh schema by re-discovering from all services.
        Returns the new graph and updates internal state.
        """
        print("Refreshing supergraph schema...")
        new_graph = await self._discover_schemas()

        # Check if we got entities
        entity_count = len(new_graph.get("entities", {}))
        if entity_count > 0:
            self.graph = new_graph
            self._save_hcl()
            print(f"Schema refreshed: {entity_count} entities")
            return {"status": "ok", "entities": entity_count}
        else:
            print("Warning: Refresh returned no entities, keeping old schema")
            return {"status": "warning", "message": "No entities found, keeping old schema"}

    def _create_app(self) -> FastAPI:
        """Create FastAPI application."""
        app = FastAPI(
            title=self.title,
            description="Supergraph Gateway - JSON Query DSL",
            version="1.0.0",
        )

        # CORS
        app.add_middleware(
            CORSMiddleware,
            allow_origins=self.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Include supergraph router
        supergraph_router = create_supergraph_app(self.graph)
        app.include_router(supergraph_router)

        # Health check
        @app.get("/health")
        async def health():
            return {"status": "ok"}

        # HCL endpoint
        @app.get("/__graph.hcl", response_class=PlainTextResponse)
        async def graph_hcl():
            return to_hcl(self.graph)

        # Schema refresh endpoint
        @app.post("/__refresh")
        async def refresh_schema():
            """
            Manually refresh the supergraph schema by re-discovering from all services.
            Use this after services restart or when schema changes.
            """
            gateway = app.state.gateway
            result = await gateway.refresh_schema()
            return result

        # Also expose current schema info
        @app.get("/__status")
        async def schema_status():
            """Get current schema status."""
            entity_count = len(self.graph.get("entities", {}))
            service_count = len(self.graph.get("services", {}))
            return {
                "entities": entity_count,
                "services": service_count,
                "version": self.graph.get("version", 1),
            }

        # WebSocket subscriptions (auto-discovered)
        if self.graph.get("websockets") and self.redis_url:
            self._setup_websocket_federation(app)
        elif self.graph.get("websockets") and not self.redis_url:
            print("Warning: WebSocket entities found in schema but no redis_url provided. WebSocket endpoint not created.")

        # Mount playground
        if self.playground_enabled:
            mount_playground(
                app,
                path=self.playground_path,
                api_url="/query",
                graph_url="/__graph",
            )

        return app

    def _setup_websocket_federation(self, app: FastAPI):
        """Setup WebSocket federation for real-time subscriptions"""
        from .websocket import create_websocket_router
        from .api.router import get_principal

        ws_router = create_websocket_router(
            graph=self.graph,
            redis_url=self.redis_url
        )

        @app.on_event("startup")
        async def ws_startup():
            await ws_router.startup()
            websocket_count = len(self.graph.get("websockets", {}))
            print(f"WebSocket federation enabled: {websocket_count} subscription(s) discovered")

        @app.on_event("shutdown")
        async def ws_shutdown():
            await ws_router.shutdown()

        @app.websocket("/subscribe")
        async def websocket_endpoint(websocket: WebSocket):
            # Get principal (from query params, headers, or default)
            principal = await get_principal()
            await ws_router.handle_connection(websocket, principal)
