# Supergraph

**JSON Query DSL for microservices** — A powerful alternative to GraphQL Federation.

Query data across multiple services with a simple JSON syntax. No GraphQL schemas, no code generation, just declarative ViewSets and automatic schema discovery.

```json
{
  "Person": {
    "filters": {"id__eq": 1},
    "select": {
      "fields": ["id", "first_name", "last_name"],
      "relations": {
        "owned_properties": {
          "fields": ["id", "name", "status"],
          "relations": {
            "property": {
              "fields": ["id", "address"]
            }
          }
        }
      }
    }
  }
}
```

## Features

- **JSON Query DSL** — Intuitive JSON syntax instead of GraphQL
- **Cross-service relations** — Traverse data across microservices in a single request
- **ViewSet pattern** — DRF-style declarative configuration
- **Built-in IAM** — Tenant isolation with automatic guard injection
- **Auto-discovery** — Gateway discovers schemas from services automatically
- **Playground** — Visual query builder bundled with the package
- **CLI tooling** — Scaffold services with Django-like `manage.py`
- **Mutations & Transactions** — Create, update, delete with saga pattern

## Installation

```bash
pip install supergraph
```

## Quick Start

### 1. Initialize a project

```bash
supergraph init my-project
cd my-project
```

Creates:
```
my-project/
├── supergraph.yaml     # Main configuration
├── services/           # Microservices directory
└── gateway/            # API gateway
```

### 2. Create services

```bash
supergraph create-service person --port 8001
supergraph create-service property --port 8002
supergraph create-service relations --port 8003
```

Each service gets a complete structure:
```
services/person/
├── main.py
├── manage.py              # Django-like commands
├── settings/
│   ├── config.py
│   └── db/
│       ├── db_config.py
│       └── alembic.ini
├── models/
│   ├── migrations/
│   └── models.py
├── views/
├── services/
├── signals/
├── manage/
│   └── commands/
└── tests/
```

### 3. Run migrations

```bash
cd services/person
python manage.py makemigrations
python manage.py migrate
```

### 4. Start development

```bash
supergraph dev
# or
docker-compose up
```

---

## ViewSets — Defining Your API

Supergraph uses **ViewSets** (similar to Django REST Framework) to declare how entities are exposed. This keeps your SQLAlchemy models clean.

### ModelViewSet — Basic Entity

```python
from sqlalchemy import Column, Integer, String
from supergraph import ModelViewSet, AccessConfig
from settings.db.db_config import Base

# 1. Define your model (plain SQLAlchemy)
class Person(Base):
    __tablename__ = "persons"

    id = Column(Integer, primary_key=True)
    first_name = Column(String(100))
    last_name = Column(String(100))
    email = Column(String(255))


# 2. Define the ViewSet
class PersonViewSet(ModelViewSet):
    model = Person

    # Auto-inferred from model:
    # - service = "person"
    # - resource = "/person"
    # - fields = all columns with types and default filters
    # - keys = ["id"]

    # Optional overrides:
    fields_exclude = ["internal_note"]  # Hide fields
    filter_overrides = {
        "email": ["eq", "icontains"],   # Custom filter operators
    }
    sortable_fields = {"id", "first_name", "last_name"}

    # Pagination
    pagination_default_limit = 50
    pagination_max_limit = 200

    # Access control
    access = AccessConfig.none()  # No tenant isolation
```

### Field Auto-Discovery

Fields are automatically discovered from SQLAlchemy columns with smart defaults:

| SQLAlchemy Type | Supergraph Type | Default Filters |
|-----------------|-----------------|-----------------|
| `Integer` | `int` | `eq`, `in`, `gte`, `lte`, `isnull` |
| `String`, `Text` | `string` | `eq`, `in`, `icontains`, `isnull` |
| `Boolean` | `bool` | `eq`, `isnull` |
| `Float`, `Numeric` | `float` | `eq`, `in`, `gte`, `lte`, `isnull` |
| `DateTime`, `Date` | `datetime`/`date` | `eq`, `gte`, `lte`, `isnull` |
| `JSON`, `JSONB` | `json` | `eq`, `isnull` |

### RelationsViewSet — Cross-Service Relations

For junction tables and cross-service relations, use `RelationsViewSet`:

```python
from supergraph import RelationsViewSet, AttachRelation, Through, Ref

class Relationship(Base):
    __tablename__ = "relationships"

    id = Column(Integer, primary_key=True)
    subject_id = Column(Integer)       # Target entity ID (e.g., Property.id)
    object_id = Column(Integer)        # Parent entity ID (e.g., Person.id)
    relationship_type = Column(String(50))
    status = Column(String(20))


class RelationshipViewSet(RelationsViewSet):
    model = Relationship
    service = "relations"  # Override auto-inferred name

    # Attach relations to OTHER entities
    attach = [
        # Person → owned_properties (via Relationship)
        AttachRelation(
            parent_entity="Person",
            name="owned_properties",
            target_entity="Relationship",
            cardinality="many",
            through=Through(
                parent_key="id",              # Person.id
                child_match_field="object_id", # Relationship.object_id
                target_key_field="subject_id", # For next hop
                static_filters={
                    "relationship_type": "property_owner",
                    "status": "active",
                }
            ),
        ),

        # Relationship → property (direct FK)
        AttachRelation(
            parent_entity="Relationship",
            name="property",
            target_entity="Property",
            cardinality="one",
            ref=Ref(
                from_field="subject_id",  # Relationship.subject_id
                to_field="id"             # Property.id
            ),
        ),

        # Property → owners (reverse lookup)
        AttachRelation(
            parent_entity="Property",
            name="owners",
            target_entity="Relationship",
            cardinality="many",
            through=Through(
                parent_key="id",
                child_match_field="subject_id",
                target_key_field="object_id",
                static_filters={
                    "relationship_type": "property_owner",
                    "status": "active",
                }
            ),
        ),
    ]
```

### Relation Types

**Through** — Many-to-many via junction table:
```python
Through(
    parent_key="id",           # Key in parent to match
    child_match_field="fk",    # Field in junction matching parent
    target_key_field="target", # Field for next hop
    static_filters={...}       # Always applied
)
```

**Ref** — Direct foreign key:
```python
Ref(
    from_field="user_id",  # FK field in parent
    to_field="id"          # PK field in target
)
```

---

## JSON Query DSL

### Query Formats

**Simple query:**
```json
{
  "Person": {
    "filters": {"id__eq": 1},
    "fields": ["id", "first_name"]
  }
}
```

**Full query with select:**
```json
{
  "action": "query",
  "entity": "Person",
  "filters": {"name__icontains": "john"},
  "select": {
    "fields": ["id", "first_name", "last_name"],
    "order": ["-created_at", "first_name"],
    "limit": 10,
    "offset": 0,
    "relations": {
      "owned_properties": {
        "fields": ["id", "status"],
        "filters": {"status__eq": "active"},
        "limit": 5,
        "relations": {
          "property": {
            "fields": ["id", "name", "address"]
          }
        }
      }
    }
  }
}
```

**Multi-entity query:**
```json
{
  "query": {
    "Person": {"filters": {"id__in": [1, 2, 3]}},
    "Property": {"filters": {"status__eq": "active"}}
  }
}
```

### Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `{"id__eq": 1}` |
| `in` | In list | `{"id__in": [1, 2, 3]}` |
| `icontains` | Case-insensitive contains | `{"name__icontains": "john"}` |
| `gte` | Greater than or equal | `{"age__gte": 18}` |
| `lte` | Less than or equal | `{"price__lte": 100}` |
| `isnull` | Is null check | `{"deleted_at__isnull": true}` |

### Order Syntax

```json
{
  "order": ["-created_at", "name"]
}
```
- Prefix with `-` for descending
- No prefix for ascending

### Response Format

**Single entity:**
```json
{
  "data": {
    "id": 1,
    "first_name": "John",
    "owned_properties": [
      {
        "id": 10,
        "status": "active",
        "property": {
          "id": 100,
          "name": "Main Office"
        }
      }
    ]
  }
}
```

**List response:**
```json
{
  "data": {
    "items": [...],
    "pagination": {
      "total": 150,
      "limit": 10,
      "offset": 0,
      "has_next": true
    }
  }
}
```

---

## Mutations

### Create

```json
{
  "create": {
    "Person": {
      "data": {
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@example.com"
      },
      "response": ["id", "first_name", "created_at"]
    }
  }
}
```

**Aliases:** `POST`, `insert`

### Update (Partial)

```json
{
  "update": {
    "Person": {
      "filters": {"id__eq": 1},
      "data": {
        "email": "newemail@example.com"
      }
    }
  }
}
```

**Aliases:** `PATCH`, `partial_update`

### Rewrite (Full Replace)

```json
{
  "rewrite": {
    "Person": {
      "filters": {"id__eq": 1},
      "data": {
        "first_name": "John",
        "last_name": "Smith",
        "email": "john.smith@example.com"
      }
    }
  }
}
```

**Aliases:** `PUT`, `replace`

### Delete

```json
{
  "delete": {
    "Person": {
      "filters": {"id__eq": 1}
    }
  }
}
```

**Aliases:** `DELETE`, `remove`

---

## Transactions

Execute multiple operations atomically with variable binding:

```json
{
  "transaction": {
    "steps": [
      {
        "create": {
          "Person": {
            "data": {"first_name": "John"},
            "as": "$person"
          }
        }
      },
      {
        "create": {
          "Property": {
            "data": {
              "name": "New Property",
              "owner_id": "$person.id"
            }
          }
        }
      }
    ],
    "on_error": "rollback"
  }
}
```

**Error handling modes:**
- `rollback` — Undo all changes on error
- `stop` — Stop at error, keep completed
- `continue` — Skip errors, continue

---

## Gateway

### Setup

```python
from supergraph import Gateway

gateway = Gateway(
    services={
        "person": "http://person:8001",
        "property": "http://property:8002",
        "relations": "http://relations:8003",
    },
    title="My API",
    cors_origins=["http://localhost:3000"],
    playground=True,
    playground_path="/playground",
)

app = gateway.app

# Run with uvicorn
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Unified query/mutation endpoint |
| `/query` | POST | Execute queries |
| `/__graph` | GET | Get compiled schema (JSON) |
| `/__graph.hcl` | GET | Get schema (HCL format) |
| `/playground` | GET | Visual query builder |
| `/health` | GET | Health check |

### REST-style Endpoints

The gateway also exposes REST endpoints:

```
GET    /entity/Person           # List
GET    /entity/Person/1         # Get by ID
POST   /entity/Person           # Create
PATCH  /entity/Person/1         # Update
PUT    /entity/Person/1         # Replace
DELETE /entity/Person/1         # Delete
```

---

## IAM & Access Control

### Tenant Isolation

```python
class PropertyViewSet(ModelViewSet):
    model = Property

    # Direct field-based isolation
    access = AccessConfig.direct(tenant_field="rc_id")
    # Adds automatic guard: rc_id IN principal.rc_ids
```

### Access Strategies

```python
# No isolation
AccessConfig.none()

# Direct field check
AccessConfig.direct(tenant_field="rc_id")

# Via relations (complex scenarios)
AccessConfig.via_relations(tenant_field="rc_id")
```

### How Guards Work

1. IAM service checks principal's permissions
2. Returns scopes: `[{"field": "rc_id", "op": "in", "values": [1, 2]}]`
3. Guards are injected into every query step
4. Client cannot see or bypass guards

---

## Service Internal API

Each service must expose these endpoints for the gateway:

### Schema Endpoint

```python
from supergraph import get_service_schema

@app.get("/__schema")
async def schema():
    return get_service_schema([PersonViewSet, PropertyViewSet])
```

### Query Endpoint

```python
from supergraph import InternalQueryRequest, InternalQueryResponse

@app.post("/internal/query")
async def internal_query(
    request: InternalQueryRequest,
    session: AsyncSession = Depends(get_session)
) -> InternalQueryResponse:
    return await execute_internal_query(session, Person, request)
```

### Mutation Endpoints

```python
@app.post("/internal/create")
@app.post("/internal/update")
@app.post("/internal/rewrite")
@app.post("/internal/delete")
async def internal_mutation(request, session = Depends(get_session)):
    return await execute_internal_mutation(session, Person, request)
```

---

## CLI Commands

### Project Commands

```bash
supergraph init [name]           # Initialize project
supergraph create-service <name> # Create new service
supergraph sync                  # Sync config → docker-compose
supergraph dev                   # Run development server
```

### Service Management (manage.py)

Each service has a Django-like `manage.py`:

```bash
python manage.py makemigrations        # Create migration
python manage.py migrate               # Apply migrations
python manage.py showmigrations        # Show migration status
python manage.py flushdata             # Clear data
python manage.py dropdb                # Delete database
python manage.py recreatedb            # Recreate database
python manage.py rebuild               # Full rebuild
python manage.py initial_data          # Load initial data (custom)
```

### Custom Commands

Create custom commands in `manage/commands/`:

```python
# manage/commands/seed_data.py
from manage.base import BaseCommand

class SeedDataCommand(BaseCommand):
    name = "seed_data"
    help = "Seed database with test data"

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=100)

    def handle(self, args) -> int:
        print(f"Seeding {args.count} records...")
        # Your logic here
        return 0
```

```bash
python manage.py seed_data --count 500
```

---

## Playground

The bundled playground provides:

- **Visual query builder** — Point-and-click query construction
- **Schema explorer** — Browse entities, fields, relations
- **Syntax highlighting** — JSON editor with validation
- **Autocomplete** — Field and operator suggestions
- **Query history** — Save and replay queries

Access at: `http://localhost:8000/playground`

---

## Configuration

### supergraph.yaml

```yaml
version: 1
project: my-app

gateway:
  port: 8000

services:
  person:
    port: 8001
    database: person_db
  property:
    port: 8002
    database: property_db
  relations:
    port: 8003
    database: relations_db

postgres:
  host: postgres
  port: 5432
  user: postgres
  password: postgres
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Gateway                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Request → Parser → Validator → Planner → Executor → Response││
│  │                        │                     │               ││
│  │                   IAM Guard              Service             ││
│  │                   Injection              Clients             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │  Person  │        │ Property │        │Relations │
   │ Service  │        │ Service  │        │ Service  │
   │   :8001  │        │   :8002  │        │   :8003  │
   └──────────┘        └──────────┘        └──────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                        ┌──────────┐
                        │ Postgres │
                        │    DB    │
                        └──────────┘
```

**Execution Flow:**
1. Client sends JSON query to Gateway
2. Gateway validates against compiled schema
3. IAM injects guard filters
4. Planner builds execution DAG
5. Executor runs steps in topological order
6. Assembler stitches results
7. Response returned to client

---

## License

MIT
