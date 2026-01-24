"""
Service builder - generates microservice scaffolding with Django-like manage.py.

Generated structure:
    services/{name}/
    ├── main.py
    ├── manage.py
    ├── requirements.txt
    ├── Dockerfile
    ├── settings/
    │   ├── __init__.py
    │   ├── config.py
    │   └── db/
    │       ├── __init__.py
    │       ├── db_config.py
    │       └── alembic.ini
    ├── models/
    │   ├── __init__.py
    │   ├── migrations/
    │   │   ├── __init__.py
    │   │   ├── env.py
    │   │   ├── script.py.mako
    │   │   └── versions/
    │   │       └── __init__.py
    │   └── models.py
    ├── views/
    │   └── __init__.py
    ├── services/
    │   └── __init__.py
    ├── signals/
    │   └── __init__.py
    ├── manage/
    │   ├── __init__.py
    │   ├── base.py
    │   └── commands/
    │       ├── __init__.py
    │       └── initial_data.py
    └── tests/
        ├── __init__.py
        └── pytest.ini
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, List, Optional

from .config import SupergraphConfig, ServiceConfig


class ServiceBuilder:
    """Builds new microservice scaffolding with Django-like structure."""

    def __init__(self, config: SupergraphConfig):
        self.config = config
        self.base_path = Path("services")

    def create_service(
        self,
        name: str,
        port: Optional[int] = None,
        database: Optional[str] = None,
        entities: Optional[List[str]] = None,
    ) -> ServiceConfig:
        """Create a new microservice with full structure."""
        # Validate name
        if not name or not name.replace("_", "").isalnum():
            raise ValueError(f"Invalid service name: {name}")

        if name in self.config.services:
            raise ValueError(f"Service '{name}' already exists")

        # Add to config
        service = self.config.add_service(name, port, database)
        if entities:
            service.entities = entities

        # Create directory structure
        service_path = self.base_path / name
        self._create_directory_structure(service_path)

        # Create all files
        self._create_service_files(service_path, service)

        # Update config file
        self.config.save()

        return service

    def _create_directory_structure(self, path: Path) -> None:
        """Create service directory structure."""
        dirs = [
            path,
            path / "settings",
            path / "settings" / "db",
            path / "models",
            path / "models" / "migrations",
            path / "models" / "migrations" / "versions",
            path / "views",
            path / "services",
            path / "signals",
            path / "manage",
            path / "manage" / "commands",
            path / "tests",
        ]
        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)

    def _create_service_files(self, path: Path, service: ServiceConfig) -> None:
        """Create all service files."""
        ctx = self._build_context(service)

        # Root level files
        self._write_file(path / "main.py", self._tpl_main(ctx))
        self._write_file(path / "manage.py", self._tpl_manage(ctx))
        self._write_file(path / "requirements.txt", self._tpl_requirements())
        self._write_file(path / "Dockerfile", self._tpl_dockerfile(ctx))

        # settings/
        self._write_file(path / "settings" / "__init__.py", self._tpl_settings_init(ctx))
        self._write_file(path / "settings" / "config.py", self._tpl_config(ctx))
        self._write_file(path / "settings" / "db" / "__init__.py", "")
        self._write_file(path / "settings" / "db" / "db_config.py", self._tpl_db_config(ctx))
        self._write_file(path / "settings" / "db" / "alembic.ini", self._tpl_alembic_ini(ctx))

        # models/
        self._write_file(path / "models" / "__init__.py", self._tpl_models_init(ctx))
        self._write_file(path / "models" / "models.py", self._tpl_models(ctx))
        self._write_file(path / "models" / "migrations" / "__init__.py", "")
        self._write_file(path / "models" / "migrations" / "env.py", self._tpl_migrations_env(ctx))
        self._write_file(path / "models" / "migrations" / "script.py.mako", self._tpl_script_mako())
        self._write_file(path / "models" / "migrations" / "versions" / "__init__.py", "# Alembic versions\n")

        # views/
        self._write_file(path / "views" / "__init__.py", self._tpl_views_init(ctx))

        # services/
        self._write_file(path / "services" / "__init__.py", "")

        # signals/
        self._write_file(path / "signals" / "__init__.py", self._tpl_signals_init())

        # manage/
        self._write_file(path / "manage" / "__init__.py", "")
        self._write_file(path / "manage" / "base.py", self._tpl_manage_base())
        self._write_file(path / "manage" / "commands" / "__init__.py", self._tpl_commands_init())
        self._write_file(path / "manage" / "commands" / "initial_data.py", self._tpl_initial_data(ctx))

        # tests/
        self._write_file(path / "tests" / "__init__.py", "")
        self._write_file(path / "tests" / "pytest.ini", self._tpl_pytest_ini())

    def _build_context(self, service: ServiceConfig) -> dict[str, Any]:
        """Build template context."""
        name_title = service.name.replace("_", " ").title().replace(" ", "")
        return {
            "service_name": service.name,
            "service_name_title": name_title,
            "service_name_upper": service.name.upper(),
            "port": service.port,
            "database": service.database or service.name,
            "entities": service.entities,
            "postgres": {
                "host": self.config.postgres.host,
                "port": self.config.postgres.port,
                "user": self.config.postgres.user,
                "password": self.config.postgres.password,
            },
        }

    def _write_file(self, path: Path, content: str) -> None:
        """Write content to file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    # =========================================================================
    # ROOT LEVEL TEMPLATES
    # =========================================================================

    def _tpl_main(self, ctx: dict) -> str:
        return f'''#!/usr/bin/env python3
"""
{ctx["service_name_title"]} Service - Main entry point.
"""

import uvicorn
from supergraph.service import create_service_app
from views import register_views

app = create_service_app("{ctx["service_name"]}")

# Register views
register_views(app)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port={ctx["port"]})
'''

    def _tpl_manage(self, ctx: dict) -> str:
        return f'''#!/usr/bin/env python3
"""
{ctx["service_name_title"]} Service Management Tool.
Django-like management for migrations and database operations.
"""

import argparse
import importlib
import inspect
import pkgutil
import re
import shutil
import socket
import sys
from pathlib import Path
from typing import Optional

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

# Add current directory to PYTHONPATH
current_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(current_dir))

from settings.config import settings
from manage.commands import discover_commands
from manage.base import BaseCommand


class {ctx["service_name_title"]}Manager:
    def __init__(self):
        self.migrations_dir = current_dir / "models" / "migrations"
        self.service_root = current_dir

    # --- Database helpers ---
    def _ensure_database_exists(self, db_url: str) -> None:
        try:
            url = make_url(db_url)
        except Exception:
            return

        if url.drivername.startswith("sqlite"):
            return

        database_name = url.database
        if not database_name:
            return

        admin_url = url.set(database="postgres")
        engine = create_engine(admin_url)
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {{"name": database_name}},
            ).scalar()
            if not exists:
                print(f"Creating database '{{database_name}}'")
                conn.execute(text(f'CREATE DATABASE "{{database_name}}"'))

    def get_database_url(self) -> str:
        """Get database URL with sync driver."""
        db_url = settings.DATABASE_URL

        if "postgres:5432" in db_url:
            try:
                socket.gethostbyname("postgres")
                print("Connecting to database in Docker")
            except socket.gaierror:
                print("Connecting to local database")
                db_url = db_url.replace("postgres:5432", "localhost:5432")

        if db_url.startswith("postgresql+asyncpg://"):
            db_url = db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
        elif db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://")

        try:
            self._ensure_database_exists(db_url)
        except Exception as exc:
            print(f"Warning: Could not check/create database: {{exc}}")

        return db_url

    # --- Migration helpers ---
    def _import_all_models(self) -> None:
        try:
            import models
            for module_info in pkgutil.walk_packages(models.__path__, f"{{models.__name__}}."):
                if module_info.ispkg or "migrations" in module_info.name:
                    continue
                try:
                    importlib.import_module(module_info.name)
                except ImportError as exc:
                    print(f"Warning: Could not import {{module_info.name}}: {{exc}}")
        except ImportError as exc:
            print(f"Warning: Could not import models package: {{exc}}")

    def get_alembic_config(self) -> Config:
        alembic_cfg = Config()
        alembic_cfg.set_main_option("script_location", str(self.migrations_dir))
        alembic_cfg.set_main_option("sqlalchemy.url", self.get_database_url())
        return alembic_cfg

    def ensure_migration_env(self) -> None:
        versions_dir = self.migrations_dir / "versions"
        versions_dir.mkdir(parents=True, exist_ok=True)

        init_file = versions_dir / "__init__.py"
        if not init_file.exists():
            init_file.write_text("# Alembic versions\\n", encoding="utf-8")

    def get_next_migration_number(self) -> str:
        versions_dir = self.migrations_dir / "versions"
        if not versions_dir.exists():
            return "0001"

        existing_files = [f for f in versions_dir.iterdir() if f.suffix == ".py" and f.name != "__init__.py"]
        if not existing_files:
            return "0001"

        numbers = []
        for file_path in existing_files:
            match = re.match(r"^(\\d{{4}})_", file_path.name)
            if match:
                numbers.append(int(match.group(1)))

        if not numbers:
            return "0001"

        return f"{{max(numbers) + 1:04d}}"

    def showmigrations(self) -> None:
        print("Migration status:")

        try:
            versions_dir = self.migrations_dir / "versions"
            if not versions_dir.exists():
                print("   Migrations directory not found")
                return

            migration_files = []
            for file_path in versions_dir.iterdir():
                if file_path.suffix == ".py" and file_path.name != "__init__.py":
                    match = re.match(r"^(\\d{{4}})_", file_path.name)
                    if match:
                        migration_files.append((int(match.group(1)), file_path))

            if not migration_files:
                print("   No migrations found")
                return

            migration_files.sort(key=lambda x: x[0])

            try:
                engine = create_engine(self.get_database_url())
                with engine.connect() as conn:
                    result = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
                    current_revision = result[0] if result else None

                for _, file_path in migration_files:
                    content = file_path.read_text()
                    revision_match = re.search(r"revision: str = ['\"]([^'\"]+)['\"]", content)
                    if revision_match:
                        revision = revision_match.group(1)
                        status = "[APPLIED]" if revision == current_revision else "[PENDING]"
                        print(f"   {{status}} {{file_path.name}}")
                    else:
                        print(f"   [?] {{file_path.name}}")
            except Exception:
                for _, file_path in migration_files:
                    print(f"   [?] {{file_path.name}}")

        except Exception as exc:
            print(f"Error showing migrations: {{exc}}")

    def makemigrations(self, message: str = "Auto migration") -> bool:
        print(f"Creating migration: {{message}}")

        try:
            self._import_all_models()
            self.ensure_migration_env()
            from settings.db.db_config import Base

            if not Base.metadata.sorted_tables:
                print("Error: No models loaded. Check model imports.")
                return False

            alembic_cfg = self.get_alembic_config()
            command.revision(alembic_cfg, autogenerate=True, message=message)

            print("Migration created successfully")
            return True
        except Exception as exc:
            print(f"Error creating migration: {{exc}}")
            return False

    def migrate(self, target: str = "head") -> bool:
        print(f"Applying migrations to: {{target}}")

        try:
            alembic_cfg = self.get_alembic_config()
            command.upgrade(alembic_cfg, target)
            print("Migrations applied successfully")
            return True
        except Exception as exc:
            print(f"Error applying migrations: {{exc}}")
            return False

    def flushdata(self) -> bool:
        print("Flushing data from database...")

        self._import_all_models()

        try:
            engine = create_engine(self.get_database_url())
            from settings.db.db_config import Base

            with engine.connect() as conn:
                conn.execute(text("SET session_replication_role = replica;"))
                for table in reversed(Base.metadata.sorted_tables):
                    conn.execute(text(f"TRUNCATE TABLE {{table.name}} RESTART IDENTITY CASCADE;"))
                conn.execute(text("SET session_replication_role = DEFAULT;"))
                conn.commit()

            print("Data flushed successfully")
            return True
        except Exception as exc:
            print(f"Error flushing data: {{exc}}")
            return False

    def dropdb(self, *, force: bool = False) -> bool:
        print("WARNING: Full database deletion!")
        if not force:
            confirm = input("Are you sure? All data will be lost (yes/no): ")
            if confirm.lower() != "yes":
                print("Operation cancelled")
                return False

        self._import_all_models()

        db_url = make_url(self.get_database_url())
        driver = db_url.drivername

        if driver.startswith("sqlite"):
            db_path = db_url.database
            if db_path:
                path = Path(db_path)
                if path.exists():
                    path.unlink()
                path.parent.mkdir(parents=True, exist_ok=True)
                path.touch()
            print("SQLite database recreated")
            return True

        database_name = db_url.database
        if not database_name:
            print("Error: Could not determine database name")
            return False

        admin_url = db_url.set(database="postgres")
        engine = create_engine(admin_url)
        safe_db_name = database_name.replace('"', '""')

        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                conn.execute(
                    text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :name"),
                    {{"name": database_name}},
                )
                conn.execute(text(f'DROP DATABASE IF EXISTS "{{safe_db_name}}"'))
                conn.execute(text(f'CREATE DATABASE "{{safe_db_name}}"'))
            print("Database recreated from scratch")
            return True
        except Exception as exc:
            print(f"Error recreating database: {{exc}}")
            return False

    def recreatedb(self) -> bool:
        print("Full database recreation...")
        return self.dropdb(force=True)

    def _remove_existing_migrations(self) -> None:
        versions_dir = self.migrations_dir / "versions"
        if not versions_dir.exists():
            return

        for entry in versions_dir.iterdir():
            if entry.name.startswith("__init__"):
                continue
            if entry.is_file():
                entry.unlink(missing_ok=True)
            elif entry.is_dir():
                shutil.rmtree(entry, ignore_errors=True)

    def _clear_pycache(self) -> None:
        for pycache_dir in self.service_root.rglob("__pycache__"):
            shutil.rmtree(pycache_dir, ignore_errors=True)

    def init_migrations(self, message: str = "initial") -> bool:
        print("Reinitializing migrations...")

        self._remove_existing_migrations()
        self._clear_pycache()
        self.ensure_migration_env()

        try:
            engine = create_engine(self.get_database_url())
            with engine.connect() as conn:
                conn.execute(text("DROP TABLE IF EXISTS alembic_version CASCADE;"))
                conn.commit()
                print("Cleared alembic_version table")
        except Exception as exc:
            print(f"Warning: Could not clear alembic_version: {{exc}}")

        return self.makemigrations(message)

    def rebuild(self, message: str = "initial") -> bool:
        print("Full rebuild: database + migrations...")

        self._import_all_models()

        if not self.recreatedb():
            return False

        if not self.init_migrations(message):
            return False

        if not self.migrate("head"):
            return False

        return True


def _print_help(dynamic_commands) -> None:
    print("\\nAvailable commands:\\n")
    builtins = [
        ("makemigrations", "Create a new migration"),
        ("migrate", "Apply migrations"),
        ("flushdata", "Clear data from database"),
        ("dropdb", "Delete all tables (with confirmation)"),
        ("recreatedb", "Fully recreate database"),
        ("init_migrations", "Recreate initial migrations"),
        ("rebuild", "recreate + init_migrations + migrate"),
        ("showmigrations", "Show migration status"),
    ]
    for name, descr in builtins:
        print(f"  {{name:18}} {{descr}}")
    if dynamic_commands:
        print("\\nCustom commands:")
        for name, descr in dynamic_commands:
            print(f"  {{name:18}} {{descr}}")
    print("\\nExample: python manage.py makemigrations -m \\"message\\"")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="{ctx["service_name_title"]} Service Management Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    subparsers.add_parser("help", help="Show help")

    makemigrations_parser = subparsers.add_parser("makemigrations", help="Create a new migration")
    makemigrations_parser.add_argument("-m", "--message", default="Auto migration", help="Migration message")

    migrate_parser = subparsers.add_parser("migrate", help="Apply migrations")
    migrate_parser.add_argument("target", nargs="?", default="head", help="Migration version to apply")

    subparsers.add_parser("flushdata", help="Clear data from database")
    subparsers.add_parser("dropdb", help="Delete all tables from database")
    subparsers.add_parser("recreatedb", help="Fully recreate database from scratch")
    subparsers.add_parser("init_migrations", help="Delete all migrations and create new initial files")
    subparsers.add_parser("rebuild", help="Composite: recreate -> init -> migrate")
    subparsers.add_parser("showmigrations", help="Show migration status")

    dynamic_commands = []
    for cmd in discover_commands():
        if not isinstance(cmd, BaseCommand) or not cmd.name:
            continue
        parser_cmd = subparsers.add_parser(cmd.name, help=cmd.help or cmd.name)
        cmd.add_arguments(parser_cmd)
        parser_cmd.set_defaults(_dynamic_cmd=cmd)
        dynamic_commands.append((cmd.name, cmd.help or cmd.name))

    args = parser.parse_args()

    if not args.command or args.command == "help":
        _print_help(dynamic_commands)
        return

    manager = {ctx["service_name_title"]}Manager()

    if args.command == "makemigrations":
        manager.makemigrations(args.message)
    elif args.command == "migrate":
        manager.migrate(args.target)
    elif args.command == "flushdata":
        manager.flushdata()
    elif args.command == "dropdb":
        manager.dropdb()
    elif args.command == "recreatedb":
        manager.recreatedb()
    elif args.command == "init_migrations":
        manager.init_migrations()
    elif args.command == "rebuild":
        manager.rebuild()
    elif args.command == "showmigrations":
        manager.showmigrations()
    elif hasattr(args, "_dynamic_cmd"):
        args._dynamic_cmd.handle(args)


if __name__ == "__main__":
    main()
'''

    def _tpl_requirements(self) -> str:
        return '''fastapi>=0.100.0
uvicorn>=0.23.0
sqlalchemy>=2.0.0
asyncpg>=0.28.0
psycopg2-binary>=2.9.0
alembic>=1.12.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
supergraph>=0.1.0
pytest>=7.0.0
pytest-asyncio>=0.21.0
'''

    def _tpl_dockerfile(self, ctx: dict) -> str:
        return f'''FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    libpq-dev \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE {ctx["port"]}

CMD ["python", "main.py"]
'''

    # =========================================================================
    # SETTINGS TEMPLATES
    # =========================================================================

    def _tpl_settings_init(self, ctx: dict) -> str:
        return f'''"""
{ctx["service_name_title"]} Service Settings.
"""

from .config import settings

__all__ = ["settings"]
'''

    def _tpl_config(self, ctx: dict) -> str:
        return f'''"""
{ctx["service_name_title"]} Service Configuration.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Service settings loaded from environment variables."""

    # Service
    SERVICE_NAME: str = "{ctx["service_name"]}"
    ENV: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://{ctx["postgres"]["user"]}:{ctx["postgres"]["password"]}@{ctx["postgres"]["host"]}:{ctx["postgres"]["port"]}/{ctx["database"]}"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = {ctx["port"]}

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
'''

    def _tpl_db_config(self, ctx: dict) -> str:
        return f'''"""
{ctx["service_name_title"]} Database Configuration.
"""

from sqlalchemy import Column, Integer, Boolean, DateTime, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base, declared_attr
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

from settings.config import settings

# Database URL
DATABASE_URL = settings.DATABASE_URL

# Async engine for main operations
engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_recycle=300,
)

# Sync engine for migrations
sync_database_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
sync_engine = create_engine(
    sync_database_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_recycle=300,
)

# Session factories
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=sync_engine
)

# Base model
Base = declarative_base()


class BaseModel(Base):
    """Base model with common fields."""

    __abstract__ = True

    @declared_attr
    def __tablename__(cls):
        return cls.__name__.lower()

    id = Column(Integer, primary_key=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<{{self.__class__.__name__}}(id={{self.id}})>"


async def get_session() -> AsyncSession:
    """Get async session for dependency injection."""
    async with async_session_factory() as session:
        yield session


def sync_session():
    """Get sync session."""
    return SessionLocal()


__all__ = [
    "engine",
    "sync_engine",
    "async_session_factory",
    "SessionLocal",
    "Base",
    "BaseModel",
    "get_session",
    "sync_session",
]
'''

    def _tpl_alembic_ini(self, ctx: dict) -> str:
        return f'''# Alembic Configuration for {ctx["service_name_title"]}

[alembic]
script_location = %(here)s/../models/migrations

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
'''

    # =========================================================================
    # MODELS TEMPLATES
    # =========================================================================

    def _tpl_models_init(self, ctx: dict) -> str:
        return f'''"""
{ctx["service_name_title"]} Models.
"""

from .models import *
'''

    def _tpl_models(self, ctx: dict) -> str:
        model_name = ctx["service_name_title"]
        return f'''"""
{model_name} models.
"""

from sqlalchemy import Column, String, Text
from settings.db.db_config import Base, BaseModel


class {model_name}(BaseModel):
    """Main {model_name} model."""

    __tablename__ = "{ctx["service_name"]}"

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    class Api:
        """Supergraph API configuration."""
        fields = ["id", "name", "description", "is_active", "created_at", "updated_at"]
        filters = {{
            "id": ["eq", "in"],
            "name": ["eq", "icontains"],
            "is_active": ["eq"],
        }}
        sortable = ["id", "name", "created_at"]
'''

    def _tpl_migrations_env(self, ctx: dict) -> str:
        return f'''"""
Alembic migrations environment for {ctx["service_name_title"]}.
"""

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import sys
from pathlib import Path

# Add service root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from settings.db.db_config import Base
from settings.config import settings

# Import models to register them
import models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url():
    url = settings.DATABASE_URL
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={{"paramstyle": "named"}},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
'''

    def _tpl_script_mako(self) -> str:
        return '''"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
'''

    # =========================================================================
    # VIEWS TEMPLATES
    # =========================================================================

    def _tpl_views_init(self, ctx: dict) -> str:
        return f'''"""
{ctx["service_name_title"]} Views.
"""

from fastapi import FastAPI
from supergraph.viewsets import ModelViewSet
from models import {ctx["service_name_title"]}


class {ctx["service_name_title"]}ViewSet(ModelViewSet):
    """ViewSet for {ctx["service_name_title"]} model."""
    model = {ctx["service_name_title"]}


def register_views(app: FastAPI) -> None:
    """Register all views."""
    {ctx["service_name_title"]}ViewSet.register(app)
'''

    # =========================================================================
    # SIGNALS TEMPLATES
    # =========================================================================

    def _tpl_signals_init(self) -> str:
        return '''"""
Signals module for event-driven architecture.

Usage:
    from signals import signal

    # Define a signal
    user_created = signal("user_created")

    # Connect a handler
    @user_created.connect
    def on_user_created(sender, **kwargs):
        print(f"User created: {kwargs}")

    # Emit the signal
    user_created.send(sender=self, user_id=123)
"""

from typing import Callable, Dict, List, Any


class Signal:
    """Simple signal implementation."""

    def __init__(self, name: str):
        self.name = name
        self._handlers: List[Callable] = []

    def connect(self, handler: Callable) -> Callable:
        """Connect a handler to this signal. Can be used as a decorator."""
        self._handlers.append(handler)
        return handler

    def disconnect(self, handler: Callable) -> None:
        """Disconnect a handler from this signal."""
        if handler in self._handlers:
            self._handlers.remove(handler)

    def send(self, sender: Any = None, **kwargs) -> List[Any]:
        """Send signal to all connected handlers."""
        results = []
        for handler in self._handlers:
            try:
                result = handler(sender, **kwargs)
                results.append(result)
            except Exception as e:
                print(f"Error in signal handler {handler.__name__}: {e}")
        return results


_signals: Dict[str, Signal] = {}


def signal(name: str) -> Signal:
    """Get or create a signal by name."""
    if name not in _signals:
        _signals[name] = Signal(name)
    return _signals[name]


__all__ = ["Signal", "signal"]
'''

    # =========================================================================
    # MANAGE TEMPLATES
    # =========================================================================

    def _tpl_manage_base(self) -> str:
        return '''"""
Base command class for custom management commands.
"""

from __future__ import annotations

import argparse
from abc import ABC, abstractmethod


class BaseCommand(ABC):
    """Base class for management commands (Django-like)."""

    name: str = ""
    help: str = ""

    def add_arguments(self, parser: argparse.ArgumentParser) -> None:
        """Add command arguments (optional)."""
        pass

    @abstractmethod
    def handle(self, args: argparse.Namespace) -> int:
        """Main command logic. Returns exit code (0 = ok)."""
        raise NotImplementedError
'''

    def _tpl_commands_init(self) -> str:
        return '''"""
Command discovery module.
"""

import importlib
import inspect
import pkgutil
from typing import List

from manage.base import BaseCommand


def discover_commands() -> List[BaseCommand]:
    """Discover all custom commands."""
    commands: List[BaseCommand] = []
    try:
        pkg = importlib.import_module("manage.commands")
    except ImportError:
        return commands

    for module_info in pkgutil.walk_packages(pkg.__path__, pkg.__name__ + "."):
        if module_info.ispkg:
            continue
        try:
            module = importlib.import_module(module_info.name)
        except ImportError:
            continue
        for _, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, BaseCommand) and obj is not BaseCommand:
                try:
                    commands.append(obj())
                except Exception:
                    continue
    return commands


__all__ = ["discover_commands"]
'''

    def _tpl_initial_data(self, ctx: dict) -> str:
        return f'''"""
Initial data command for {ctx["service_name_title"]}.

Usage:
    python manage.py initial_data
"""

from manage.base import BaseCommand


class InitialDataCommand(BaseCommand):
    """Load initial data into the database."""

    name = "initial_data"
    help = "Load initial data into the database"

    def handle(self, args) -> int:
        """Load initial data."""
        print("Loading initial data...")

        # TODO: Add your initial data loading logic here
        # Example:
        # from settings.db.db_config import sync_session
        # from models import {ctx["service_name_title"]}
        #
        # session = sync_session()
        # try:
        #     item = {ctx["service_name_title"]}(name="Example", description="Initial data")
        #     session.add(item)
        #     session.commit()
        #     print(f"Created: {{item}}")
        # finally:
        #     session.close()

        print("Initial data loaded successfully")
        return 0
'''

    # =========================================================================
    # TESTS TEMPLATES
    # =========================================================================

    def _tpl_pytest_ini(self) -> str:
        return '''[pytest]
asyncio_mode = auto
testpaths = .
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
'''
