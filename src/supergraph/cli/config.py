"""
Configuration loading and validation for supergraph projects.
"""

from __future__ import annotations


from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import yaml


@dataclass
class ServiceConfig:
    """Configuration for a single service."""
    name: str
    port: int
    database: Optional[str] = None
    entities: list[str] = field(default_factory=list)


@dataclass
class GatewayConfig:
    """Configuration for the gateway."""
    port: int = 8000


@dataclass
class PostgresConfig:
    """PostgreSQL configuration."""
    host: str = "postgres"
    port: int = 5432
    user: str = "postgres"
    password: str = "postgres"


@dataclass
class SupergraphConfig:
    """Main supergraph configuration."""
    version: int
    project: str
    gateway: GatewayConfig
    services: dict[str, ServiceConfig]
    postgres: PostgresConfig

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SupergraphConfig":
        """Create config from dictionary."""
        gateway_data = data.get("gateway", {})
        gateway = GatewayConfig(
            port=gateway_data.get("port", 8000)
        )

        postgres_data = data.get("postgres", {})
        postgres = PostgresConfig(
            host=postgres_data.get("host", "postgres"),
            port=postgres_data.get("port", 5432),
            user=postgres_data.get("user", "postgres"),
            password=postgres_data.get("password", "postgres"),
        )

        services = {}
        for name, svc_data in data.get("services", {}).items():
            services[name] = ServiceConfig(
                name=name,
                port=svc_data.get("port", 8001 + len(services)),
                database=svc_data.get("database"),
                entities=svc_data.get("entities", []),
            )

        return cls(
            version=data.get("version", 1),
            project=data.get("project", "supergraph"),
            gateway=gateway,
            services=services,
            postgres=postgres,
        )

    def get_next_port(self) -> int:
        """Get next available port for a new service."""
        used_ports = {self.gateway.port}
        for svc in self.services.values():
            used_ports.add(svc.port)

        port = 8001
        while port in used_ports:
            port += 1
        return port

    def add_service(self, name: str, port: Optional[int] = None, database: Optional[str] = None) -> ServiceConfig:
        """Add a new service to the configuration."""
        if port is None:
            port = self.get_next_port()

        if database is None:
            database = f"{name}_db"

        service = ServiceConfig(
            name=name,
            port=port,
            database=database,
        )
        self.services[name] = service
        return service

    def to_dict(self) -> dict[str, Any]:
        """Convert config to dictionary for YAML serialization."""
        return {
            "version": self.version,
            "project": self.project,
            "gateway": {
                "port": self.gateway.port,
            },
            "services": {
                name: {
                    "port": svc.port,
                    "database": svc.database,
                    "entities": svc.entities,
                }
                for name, svc in self.services.items()
            },
            "postgres": {
                "host": self.postgres.host,
                "port": self.postgres.port,
                "user": self.postgres.user,
                "password": self.postgres.password,
            },
        }

    def save(self, path: Path | str = "supergraph.yaml") -> None:
        """Save configuration to YAML file."""
        path = Path(path)
        content = yaml.dump(self.to_dict(), default_flow_style=False, sort_keys=False)
        path.write_text(content)


def load_config(path: Path | str = "supergraph.yaml") -> SupergraphConfig | None:
    """Load configuration from YAML file."""
    path = Path(path)
    if not path.exists():
        return None

    data = yaml.safe_load(path.read_text())
    return SupergraphConfig.from_dict(data)
