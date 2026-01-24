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
        """
        self.services = services
        self.title = title
        self.cors_origins = cors_origins or ["http://localhost:3000", "http://127.0.0.1:3000"]
        self.hcl_output_path = hcl_output_path or self._default_hcl_path()
        self.playground_enabled = playground
        self.playground_path = playground_path

        # Build graph
        self.graph = self._build_graph()

        # Save HCL
        self._save_hcl()

        # Create FastAPI app
        self.app = self._create_app()

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
        attached_relations = []

        for schema in results:
            if schema is None:
                continue

            for entity_name, entity_def in schema.get("entities", {}).items():
                entities[entity_name] = entity_def

            if "attached_relations" in schema:
                attached_relations.extend(schema["attached_relations"])

        # Apply attached relations
        for attach in attached_relations:
            parent_entity = attach.get("parent_entity")
            if parent_entity in entities:
                if "relations" not in entities[parent_entity]:
                    entities[parent_entity]["relations"] = {}

                rel_name = attach["name"]
                entities[parent_entity]["relations"][rel_name] = {
                    "target": attach["target_entity"],
                    "cardinality": attach.get("cardinality", "many"),
                }

                if attach.get("through"):
                    entities[parent_entity]["relations"][rel_name]["through"] = attach["through"]

                if attach.get("ref"):
                    entities[parent_entity]["relations"][rel_name]["ref"] = attach["ref"]

        # Build legacy graph first
        legacy_graph = {
            "version": 1,
            "services": {name: {"url": url} for name, url in self.services.items()},
            "entities": entities,
        }

        # Transform to new format with relation_providers and presets
        return transform_graph_to_new_format(legacy_graph)

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

        # Mount playground
        if self.playground_enabled:
            mount_playground(
                app,
                path=self.playground_path,
                api_url="/query",
                graph_url="/__graph",
            )

        return app
