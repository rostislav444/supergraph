"""
Supergraph Playground - Visual query builder.

Serves the bundled React frontend.

Usage:
    from supergraph.playground import mount_playground

    # Mount to FastAPI app
    mount_playground(app, path="/playground")

    # Or get HTML directly
    from supergraph.playground import get_playground_html
    html = get_playground_html(api_url="/query")
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles


# Path to bundled frontend (populated during package build)
# Can be overridden via SUPERGRAPH_PLAYGROUND_DIST environment variable
_dist_override = os.environ.get("SUPERGRAPH_PLAYGROUND_DIST")
DIST_PATH = Path(_dist_override) if _dist_override else Path(__file__).parent / "dist"


def get_playground_html(
    *,
    api_url: str = "/query",
    graph_url: str = "/__graph",
    title: str = "Supergraph Playground",
    assets_path: str = "/playground/assets",
) -> str:
    """
    Get Playground HTML with injected configuration.

    Args:
        api_url: URL for query endpoint
        graph_url: URL for graph schema endpoint
        title: Page title
        assets_path: Path to static assets

    Returns:
        HTML string

    Raises:
        FileNotFoundError: If bundled playground is not available
    """
    index_path = DIST_PATH / "index.html"

    if not index_path.exists():
        raise FileNotFoundError(
            f"Playground not found at {index_path}. "
            "Make sure the playground is built and included in the package."
        )

    html = index_path.read_text()

    # Inject configuration before </head>
    config_script = f"""
    <script>
        window.SUPERGRAPH_CONFIG = {{
            apiUrl: "{api_url}",
            graphUrl: "{graph_url}",
        }};
    </script>
"""
    html = html.replace("</head>", f"{config_script}</head>")

    # Fix asset paths if needed (Vite uses relative paths)
    html = html.replace('="/assets/', f'="{assets_path}/')
    html = html.replace("='/assets/", f"='{assets_path}/")

    return html


def mount_playground(
    app: FastAPI,
    path: str = "/playground",
    api_url: str = "/query",
    graph_url: str = "/__graph",
) -> None:
    """
    Mount Playground to FastAPI application.

    Args:
        app: FastAPI application
        path: URL path for playground (default: /playground)
        api_url: URL for query endpoint
        graph_url: URL for graph schema endpoint

    Example:
        from fastapi import FastAPI
        from supergraph.playground import mount_playground

        app = FastAPI()
        mount_playground(app)
        # Access at http://localhost:8000/playground
    """
    # Normalize path
    path = path.rstrip("/")
    assets_path = f"{path}/assets"

    # Serve static assets
    dist_assets = DIST_PATH / "assets"
    if dist_assets.exists() and dist_assets.is_dir():
        app.mount(
            assets_path,
            StaticFiles(directory=str(dist_assets)),
            name="supergraph_playground_assets",
        )

    @app.get(path, response_class=HTMLResponse, include_in_schema=False)
    @app.get(f"{path}/", response_class=HTMLResponse, include_in_schema=False)
    async def playground_html():
        """Supergraph Playground - Visual query builder."""
        return get_playground_html(
            api_url=api_url,
            graph_url=graph_url,
            assets_path=assets_path,
        )


def is_bundled() -> bool:
    """Check if the playground is bundled."""
    return (DIST_PATH / "index.html").exists()


__all__ = [
    "get_playground_html",
    "mount_playground",
    "is_bundled",
    "DIST_PATH",
]
