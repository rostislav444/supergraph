#!/usr/bin/env python3
"""
Supergraph CLI - Main entry point.

Usage:
    supergraph init                    # Initialize new project
    supergraph create-service <name>   # Create new service
    supergraph sync                    # Sync config -> docker-compose, gateway
    supergraph dev                     # Run development server
"""

from __future__ import annotations

import argparse
from typing import List, Optional
import sys
from pathlib import Path

from .config import load_config, SupergraphConfig
from .builder import ServiceBuilder
from .sync import ConfigSync


def cmd_init(args: argparse.Namespace) -> int:
    """Initialize a new supergraph project."""
    project_name = args.name or Path.cwd().name
    config_path = Path("supergraph.yaml")

    if config_path.exists() and not args.force:
        print(f"Error: {config_path} already exists. Use --force to overwrite.")
        return 1

    # Create default config
    default_config = f'''# Supergraph Configuration
version: 1
project: {project_name}

gateway:
  port: 8000

services: {{}}

postgres:
  host: postgres
  port: 5432
  user: postgres
  password: postgres
'''

    config_path.write_text(default_config)
    print(f"Created {config_path}")

    # Create directories
    for dir_name in ["services", "gateway"]:
        Path(dir_name).mkdir(exist_ok=True)
        print(f"Created {dir_name}/")

    print(f"\nProject '{project_name}' initialized!")
    print("Next steps:")
    print("  supergraph create-service <name>  # Add a service")
    print("  supergraph sync                   # Generate docker-compose.yml")

    return 0


def cmd_create_service(args: argparse.Namespace) -> int:
    """Create a new microservice."""
    config = load_config()
    if not config:
        print("Error: supergraph.yaml not found. Run 'supergraph init' first.")
        return 1

    builder = ServiceBuilder(config)

    try:
        builder.create_service(
            name=args.name,
            port=args.port,
            database=args.database,
            entities=args.entities.split(",") if args.entities else None,
        )
        print(f"\nService '{args.name}' created!")
        print("Next steps:")
        print(f"  1. Define models in services/{args.name}/models.py")
        print(f"  2. Run 'supergraph sync' to update docker-compose.yml")
        return 0
    except Exception as e:
        print(f"Error creating service: {e}")
        return 1


def cmd_sync(args: argparse.Namespace) -> int:
    """Sync configuration to docker-compose and gateway."""
    config = load_config()
    if not config:
        print("Error: supergraph.yaml not found. Run 'supergraph init' first.")
        return 1

    sync = ConfigSync(config)

    try:
        sync.sync_all()
        print("Sync completed!")
        return 0
    except Exception as e:
        print(f"Error during sync: {e}")
        return 1


def cmd_dev(args: argparse.Namespace) -> int:
    """Run development server."""
    import subprocess

    config = load_config()
    if not config:
        print("Error: supergraph.yaml not found.")
        return 1

    # Run docker-compose up
    print("Starting development environment...")
    result = subprocess.run(
        ["docker-compose", "up", "--build"],
        cwd=Path.cwd()
    )
    return result.returncode


def create_parser() -> argparse.ArgumentParser:
    """Create CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="supergraph",
        description="Supergraph - JSON Query DSL for microservices"
    )
    parser.add_argument("--version", action="version", version="%(prog)s 0.1.0")

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # init
    init_parser = subparsers.add_parser("init", help="Initialize new project")
    init_parser.add_argument("--name", help="Project name")
    init_parser.add_argument("--force", "-f", action="store_true", help="Overwrite existing config")

    # create-service
    create_parser = subparsers.add_parser("create-service", help="Create new service")
    create_parser.add_argument("name", help="Service name (snake_case)")
    create_parser.add_argument("--port", "-p", type=int, help="Service port")
    create_parser.add_argument("--database", "-d", help="Database name")
    create_parser.add_argument("--entities", "-e", help="Comma-separated entity names")

    # sync
    sync_parser = subparsers.add_parser("sync", help="Sync config to docker-compose and gateway")
    sync_parser.add_argument("--dry-run", action="store_true", help="Show changes without applying")

    # dev
    dev_parser = subparsers.add_parser("dev", help="Run development server")
    dev_parser.add_argument("--detach", "-d", action="store_true", help="Run in background")

    return parser


def app(args: Optional[List[str]] = None) -> int:
    """Main CLI application."""
    parser = create_parser()
    parsed = parser.parse_args(args)

    if not parsed.command:
        parser.print_help()
        return 0

    commands = {
        "init": cmd_init,
        "create-service": cmd_create_service,
        "sync": cmd_sync,
        "dev": cmd_dev,
    }

    handler = commands.get(parsed.command)
    if handler:
        return handler(parsed)

    parser.print_help()
    return 1


def main() -> None:
    """Entry point for CLI."""
    sys.exit(app())


if __name__ == "__main__":
    main()
