"""
Configuration sync - generates docker-compose.yml and gateway config.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
import yaml

from .config import SupergraphConfig


class ConfigSync:
    """Syncs supergraph.yaml to docker-compose.yml and gateway."""

    def __init__(self, config: SupergraphConfig):
        self.config = config

    def sync_all(self) -> None:
        """Sync all configuration files."""
        self.sync_docker_compose()
        self.sync_gateway()
        self.sync_init_sql()

    def sync_docker_compose(self, path: Path | str = "docker-compose.yml") -> None:
        """Generate docker-compose.yml from config."""
        path = Path(path)

        compose = {
            "version": "3.8",
            "services": {},
            "volumes": {
                "postgres_data": {},
            },
            "networks": {
                "supergraph": {
                    "driver": "bridge",
                },
            },
        }

        # PostgreSQL
        compose["services"]["postgres"] = {
            "image": "postgres:15-alpine",
            "environment": {
                "POSTGRES_USER": self.config.postgres.user,
                "POSTGRES_PASSWORD": self.config.postgres.password,
            },
            "volumes": [
                "postgres_data:/var/lib/postgresql/data",
                "./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro",
            ],
            "ports": [f"{self.config.postgres.port}:5432"],
            "networks": ["supergraph"],
            "healthcheck": {
                "test": ["CMD-SHELL", "pg_isready -U postgres"],
                "interval": "5s",
                "timeout": "5s",
                "retries": 5,
            },
        }

        # Gateway
        compose["services"]["gateway"] = {
            "build": {
                "context": "./gateway",
                "dockerfile": "Dockerfile",
            },
            "ports": [f"{self.config.gateway.port}:8000"],
            "environment": self._gateway_env(),
            "depends_on": self._gateway_depends_on(),
            "networks": ["supergraph"],
            "volumes": ["./gateway:/app"],
        }

        # Services
        for name, service in self.config.services.items():
            compose["services"][name] = {
                "build": {
                    "context": f"./services/{name}",
                    "dockerfile": "Dockerfile",
                },
                "ports": [f"{service.port}:{service.port}"],
                "environment": {
                    "DATABASE_URL": f"postgresql://{self.config.postgres.user}:{self.config.postgres.password}@postgres:5432/{service.database}",
                    "SERVICE_NAME": name,
                    "SERVICE_PORT": str(service.port),
                },
                "depends_on": {
                    "postgres": {"condition": "service_healthy"},
                },
                "networks": ["supergraph"],
                "volumes": [f"./services/{name}:/app"],
            }

        # Write file
        content = yaml.dump(compose, default_flow_style=False, sort_keys=False)
        path.write_text(content)
        print(f"Generated {path}")

    def sync_gateway(self) -> None:
        """Update gateway configuration."""
        gateway_path = Path("gateway")
        gateway_path.mkdir(exist_ok=True)

        # Generate graph.py with service URLs
        self._generate_gateway_graph(gateway_path / "graph.py")

        # Generate main.py if not exists
        main_path = gateway_path / "main.py"
        if not main_path.exists():
            self._generate_gateway_main(main_path)

        # Generate Dockerfile if not exists
        dockerfile_path = gateway_path / "Dockerfile"
        if not dockerfile_path.exists():
            self._generate_gateway_dockerfile(dockerfile_path)

        # Generate requirements.txt if not exists
        req_path = gateway_path / "requirements.txt"
        if not req_path.exists():
            self._generate_gateway_requirements(req_path)

        print(f"Updated gateway/")

    def sync_init_sql(self) -> None:
        """Generate init.sql for database initialization."""
        db_path = Path("db")
        db_path.mkdir(exist_ok=True)

        databases = [svc.database for svc in self.config.services.values() if svc.database]

        content = "-- Auto-generated database initialization\n\n"
        for db in databases:
            content += f"CREATE DATABASE {db};\n"

        (db_path / "init.sql").write_text(content)
        print(f"Generated db/init.sql")

    def _gateway_env(self) -> dict[str, str]:
        """Generate gateway environment variables."""
        env = {}
        for name, service in self.config.services.items():
            env_key = f"{name.upper()}_URL"
            env[env_key] = f"http://{name}:{service.port}"
        return env

    def _gateway_depends_on(self) -> dict[str, Any]:
        """Generate gateway depends_on configuration."""
        deps = {"postgres": {"condition": "service_healthy"}}
        for name in self.config.services:
            deps[name] = {"condition": "service_started"}
        return deps

    def _generate_gateway_graph(self, path: Path) -> None:
        """Generate gateway graph configuration."""
        services_dict = {}
        for name, service in self.config.services.items():
            services_dict[name] = {
                "url": f"http://{name}:{service.port}",
            }

        content = f'''"""
Auto-generated graph configuration.
DO NOT EDIT - regenerated by 'supergraph sync'
"""

SERVICES = {repr(services_dict)}

def get_graph():
    """Get graph configuration."""
    return {{
        "version": 1,
        "services": SERVICES,
        "entities": {{}},  # Populated at runtime from model introspection
    }}
'''
        path.write_text(content)

    def _generate_gateway_main(self, path: Path) -> None:
        """Generate gateway main.py."""
        content = '''"""
Supergraph Gateway - Main entry point.
"""

import uvicorn
from supergraph import Gateway
from graph import get_graph

# Create gateway
gateway = Gateway(get_graph())
app = gateway.create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
'''
        path.write_text(content)

    def _generate_gateway_dockerfile(self, path: Path) -> None:
        """Generate gateway Dockerfile."""
        content = '''FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "main.py"]
'''
        path.write_text(content)

    def _generate_gateway_requirements(self, path: Path) -> None:
        """Generate gateway requirements.txt."""
        content = '''fastapi>=0.100.0
uvicorn>=0.23.0
httpx>=0.24.0
pydantic>=2.0.0
supergraph>=0.1.0
'''
        path.write_text(content)
