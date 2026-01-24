"""
MVP Gateway - minimal configuration example.

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

from supergraph import Gateway

gateway = Gateway(
    services={
        "person": "http://person:8002",
        "property": "http://property:8001",
        "relations": "http://relations:8003",
    },
)

app = gateway.app
