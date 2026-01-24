"""
Supergraph Playground - Visual query builder.

Serves the bundled React frontend or falls back to CDN-based minimal playground.

Usage:
    from supergraph.playground import mount_playground

    # Mount to FastAPI app
    mount_playground(app, path="/playground")

    # Or get HTML directly
    from supergraph.playground import get_playground_html
    html = get_playground_html(api_url="/query")
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles


# Path to bundled frontend (populated during package build)
DIST_PATH = Path(__file__).parent / "dist"


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
    """
    index_path = DIST_PATH / "index.html"

    if index_path.exists():
        # Use bundled frontend
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

    # Fallback: CDN-based minimal playground
    return _get_fallback_playground_html(api_url, graph_url, title)


def _get_fallback_playground_html(api_url: str, graph_url: str, title: str) -> str:
    """Generate minimal playground HTML when bundled dist is not available."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eaeaea;
            min-height: 100vh;
        }}
        .header {{
            background: rgba(0,0,0,0.3);
            padding: 16px 24px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            display: flex;
            align-items: center;
            gap: 12px;
        }}
        .header h1 {{
            font-size: 20px;
            font-weight: 600;
            background: linear-gradient(90deg, #e94560, #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        .container {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            height: calc(100vh - 60px);
        }}
        .panel {{
            display: flex;
            flex-direction: column;
            border-right: 1px solid rgba(255,255,255,0.1);
        }}
        .panel:last-child {{ border-right: none; }}
        .panel-header {{
            padding: 12px 16px;
            background: rgba(0,0,0,0.2);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #888;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        textarea {{
            flex: 1;
            background: transparent;
            color: #0f0;
            border: none;
            padding: 16px;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            resize: none;
            outline: none;
        }}
        pre {{
            flex: 1;
            margin: 0;
            padding: 16px;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            overflow: auto;
            color: #eee;
        }}
        .btn {{
            background: linear-gradient(90deg, #e94560, #ff6b6b);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: transform 0.1s, box-shadow 0.1s;
        }}
        .btn:hover {{
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(233, 69, 96, 0.4);
        }}
        .btn:active {{ transform: translateY(0); }}
        .loading {{ opacity: 0.6; }}
        .error {{ color: #ff6b6b; }}
        .success {{ color: #4ecdc4; }}
        @media (max-width: 768px) {{
            .container {{ grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e94560" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2a10 10 0 0 0-6.88 17.23L12 12V2z"/>
        </svg>
        <h1>Supergraph Playground</h1>
    </div>
    <div class="container">
        <div class="panel">
            <div class="panel-header">
                <span>Query</span>
                <button class="btn" onclick="executeQuery()">Execute</button>
            </div>
            <textarea id="query" spellcheck="false">{{
  "action": "query",
  "entity": "Person",
  "filters": {{}},
  "select": {{
    "fields": ["id", "first_name", "last_name"],
    "relations": {{}},
    "limit": 10,
    "offset": 0
  }}
}}</textarea>
        </div>
        <div class="panel">
            <div class="panel-header">
                <span>Result</span>
                <span id="status"></span>
            </div>
            <pre id="result">// Execute a query to see results</pre>
        </div>
    </div>
    <script>
        const API_URL = "{api_url}";
        const GRAPH_URL = "{graph_url}";

        // Load schema on startup
        async function loadSchema() {{
            try {{
                const res = await fetch(GRAPH_URL);
                const schema = await res.json();
                console.log('Schema loaded:', schema);
            }} catch (e) {{
                console.warn('Could not load schema:', e);
            }}
        }}

        async function executeQuery() {{
            const queryEl = document.getElementById('query');
            const resultEl = document.getElementById('result');
            const statusEl = document.getElementById('status');

            statusEl.textContent = 'Loading...';
            statusEl.className = 'loading';

            try {{
                const query = JSON.parse(queryEl.value);
                const start = performance.now();

                const response = await fetch(API_URL, {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify(query),
                }});

                const data = await response.json();
                const duration = Math.round(performance.now() - start);

                resultEl.textContent = JSON.stringify(data, null, 2);

                if (response.ok) {{
                    statusEl.textContent = `${{duration}}ms`;
                    statusEl.className = 'success';
                }} else {{
                    statusEl.textContent = `Error ${{response.status}}`;
                    statusEl.className = 'error';
                }}
            }} catch (err) {{
                resultEl.textContent = 'Error: ' + err.message;
                statusEl.textContent = 'Error';
                statusEl.className = 'error';
            }}
        }}

        // Keyboard shortcut: Ctrl/Cmd + Enter to execute
        document.getElementById('query').addEventListener('keydown', (e) => {{
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {{
                e.preventDefault();
                executeQuery();
            }}
        }});

        loadSchema();
    </script>
</body>
</html>"""


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

    # Serve static assets if bundled dist exists
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
    """Check if the full React playground is bundled."""
    return (DIST_PATH / "index.html").exists()


__all__ = [
    "get_playground_html",
    "mount_playground",
    "is_bundled",
    "DIST_PATH",
]
