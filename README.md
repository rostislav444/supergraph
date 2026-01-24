# Supergraph

**JSON Query DSL for microservices** - A lightweight alternative to GraphQL Federation.

## Features

- **Simple JSON queries** - No GraphQL schema, just JSON
- **Automatic entity resolution** - Fetch related data across services
- **Built-in IAM** - Guard filters for multi-tenant access control
- **CLI tooling** - Scaffold services and sync configuration
- **Apollo-like Playground** - Visual query builder and explorer

## Installation

```bash
pip install supergraph
```

## Quick Start

### 1. Initialize a project

```bash
supergraph init
```

This creates:
- `supergraph.yaml` - Main configuration
- `services/` - Microservices directory
- `gateway/` - API gateway

### 2. Create a service

```bash
supergraph create-service users --port 8001
supergraph create-service orders --port 8002
```

### 3. Sync configuration

```bash
supergraph sync
```

Generates:
- `docker-compose.yml`
- Gateway configuration
- Database init scripts

### 4. Start development

```bash
docker-compose up
```

## Configuration

### supergraph.yaml

```yaml
version: 1
project: my-app

gateway:
  port: 8000

services:
  users:
    port: 8001
    database: users_db
    entities:
      - User
      - Profile

  orders:
    port: 8002
    database: orders_db
    entities:
      - Order
      - OrderItem

postgres:
  host: postgres
  port: 5432
  user: postgres
  password: postgres
```

## Query Language

### Basic Query

```json
{
  "User": {
    "fields": ["id", "name", "email"],
    "filters": { "id__eq": 1 }
  }
}
```

### Nested Relations

```json
{
  "User": {
    "fields": ["id", "name"],
    "filters": { "id__eq": 1 },
    "relations": {
      "orders": {
        "fields": ["id", "total", "status"],
        "filters": { "status__eq": "active" },
        "limit": 10
      }
    }
  }
}
```

### Response Format

```json
{
  "data": {
    "id": 1,
    "name": "John Doe",
    "orders": {
      "items": [
        { "id": 101, "total": 150.00, "status": "active" }
      ],
      "pagination": {
        "total": 25,
        "limit": 10,
        "offset": 0,
        "has_next": true
      }
    }
  }
}
```

## Service Definition

### Model with API config

```python
from sqlalchemy import Column, String, Integer
from supergraph.service import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(255))
    email = Column(String(255))

    class Api:
        fields = ["id", "name", "email"]
        filters = {
            "id": ["eq", "in"],
            "email": ["eq", "icontains"],
        }
        relations = {
            "orders": {
                "target": "Order",
                "cardinality": "many",
                "through": {
                    "model": "Order",
                    "foreign_key": "user_id",
                }
            }
        }
```

## Gateway API

### Endpoints

- `GET /__graph` - Get schema (JSON)
- `GET /__graph.hcl` - Get schema (HCL format)
- `POST /query` - Execute query

### Python Usage

```python
from supergraph import Gateway

gateway = Gateway(graph_config)
app = gateway.create_app()

# Run with uvicorn
uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Playground

The built-in playground provides:
- Visual query builder
- Schema explorer
- Syntax highlighting
- Autocomplete
- Query history

Access at: `http://localhost:3000` (when running with docker-compose)

## License

MIT
