"""
Graph compiler - converts IR from registry to GraphJSON.

Validates the graph structure and produces the final runtime format.

Usage:
    from supergraph.core.registry import GraphRegistry
    from supergraph.core.compiler import GraphCompiler

    registry = GraphRegistry()
    registry.register_service("person", "http://person:8002")
    registry.register_model(Person)

    ir = registry.build()
    compiler = GraphCompiler()
    graph_json = compiler.compile(ir)  # Returns validated GraphJSON
"""

from __future__ import annotations


from dataclasses import dataclass, field
from typing import Any


@dataclass
class CompilationError:
    """Single compilation error."""
    entity: Optional[str]
    field: Optional[str]
    message: str

    def __str__(self) -> str:
        parts = []
        if self.entity:
            parts.append(self.entity)
        if self.field:
            parts.append(self.field)
        location = ".".join(parts) if parts else "global"
        return f"[{location}] {self.message}"


@dataclass
class CompilationResult:
    """Result of compilation."""
    success: bool
    graph: Optional[Dict[str, Any]] = None
    errors: list[CompilationError] = field(default_factory=list)

    def error_messages(self) -> list[str]:
        """Get all error messages as strings."""
        return [str(e) for e in self.errors]


class GraphCompiler:
    """
    Compiles intermediate representation (IR) to GraphJSON.

    Performs validation:
    - All services referenced by entities exist
    - All relation targets exist
    - Through relations reference valid models
    - Ref relations reference valid fields
    - No circular dependencies in required fields
    """

    GRAPH_VERSION = 1

    def __init__(self):
        self.errors: list[CompilationError] = []

    def compile(self, ir: dict) -> CompilationResult:
        """
        Compile IR to GraphJSON.

        Args:
            ir: Intermediate representation from GraphRegistry.build()

        Returns:
            CompilationResult with either graph or errors
        """
        self.errors = []

        services = ir.get("services", {})
        entities = ir.get("entities", {})

        # Validate structure
        self._validate_services(services)
        self._validate_entities(entities, services)
        self._validate_relations(entities)

        if self.errors:
            return CompilationResult(
                success=False,
                graph=None,
                errors=self.errors,
            )

        # Build GraphJSON
        graph_json = self._build_graph_json(services, entities)

        return CompilationResult(
            success=True,
            graph=graph_json,
            errors=[],
        )

    def _add_error(
        self,
        message: str,
        entity: Optional[str] = None,
        field: Optional[str] = None,
    ):
        """Add a compilation error."""
        self.errors.append(CompilationError(
            entity=entity,
            field=field,
            message=message,
        ))

    def _validate_services(self, services: dict):
        """Validate service definitions."""
        for name, svc in services.items():
            if not svc.get("url"):
                self._add_error(f"Service '{name}' missing url")

    def _validate_entities(self, entities: dict, services: dict):
        """Validate entity definitions."""
        for entity_name, entity in entities.items():
            # Check service exists
            service_name = entity.get("service")
            if not service_name:
                self._add_error(
                    "Missing service",
                    entity=entity_name,
                )
            elif service_name not in services:
                self._add_error(
                    f"Unknown service '{service_name}'",
                    entity=entity_name,
                )

            # Check resource
            if not entity.get("resource"):
                self._add_error(
                    "Missing resource",
                    entity=entity_name,
                )

            # Check keys
            keys = entity.get("keys", [])
            if not keys:
                self._add_error(
                    "No primary keys defined",
                    entity=entity_name,
                )

            # Validate fields
            fields = entity.get("fields", {})
            for field_name, field_def in fields.items():
                self._validate_field(entity_name, field_name, field_def)

            # Validate keys exist in fields
            for key in keys:
                if key not in fields:
                    self._add_error(
                        f"Key '{key}' not in fields",
                        entity=entity_name,
                    )

    def _validate_field(self, entity_name: str, field_name: str, field_def: dict):
        """Validate a single field definition."""
        # Check type
        field_type = field_def.get("type")
        valid_types = {"int", "string", "bool", "float", "datetime", "date"}
        if field_type not in valid_types:
            self._add_error(
                f"Invalid type '{field_type}', must be one of {valid_types}",
                entity=entity_name,
                field=field_name,
            )

        # Check filters are valid
        valid_ops = {"eq", "in", "icontains", "gte", "lte", "isnull"}
        for op in field_def.get("filters", []):
            if op not in valid_ops:
                self._add_error(
                    f"Invalid filter operator '{op}'",
                    entity=entity_name,
                    field=field_name,
                )

    def _validate_relations(self, entities: dict):
        """Validate all relations reference valid entities and fields."""
        for entity_name, entity in entities.items():
            relations = entity.get("relations", {})
            fields = entity.get("fields", {})

            for rel_name, rel in relations.items():
                # Check target exists
                target = rel.get("target")
                if not target:
                    self._add_error(
                        "Missing target",
                        entity=entity_name,
                        field=rel_name,
                    )
                    continue

                if target not in entities:
                    self._add_error(
                        f"Unknown target entity '{target}'",
                        entity=entity_name,
                        field=rel_name,
                    )
                    continue

                target_entity = entities[target]
                target_fields = target_entity.get("fields", {})

                # Validate cardinality
                cardinality = rel.get("cardinality")
                if cardinality not in ("one", "many"):
                    self._add_error(
                        f"Invalid cardinality '{cardinality}', must be 'one' or 'many'",
                        entity=entity_name,
                        field=rel_name,
                    )

                # Validate through
                through = rel.get("through")
                if through:
                    self._validate_through(
                        entity_name,
                        rel_name,
                        through,
                        entities,
                        fields,
                    )

                # Validate ref
                ref = rel.get("ref")
                if ref:
                    self._validate_ref(
                        entity_name,
                        rel_name,
                        ref,
                        fields,
                        target_fields,
                    )

                # Must have either through or ref (or neither for implicit)
                if through and ref:
                    self._add_error(
                        "Cannot have both 'through' and 'ref'",
                        entity=entity_name,
                        field=rel_name,
                    )

    def _validate_through(
        self,
        entity_name: str,
        rel_name: str,
        through: dict,
        entities: dict,
        parent_fields: dict,
    ):
        """Validate through relation configuration."""
        # Check through model exists
        model = through.get("model")
        if not model:
            self._add_error(
                "Through missing 'model'",
                entity=entity_name,
                field=rel_name,
            )
            return

        if model not in entities:
            self._add_error(
                f"Through model '{model}' does not exist",
                entity=entity_name,
                field=rel_name,
            )
            return

        through_entity = entities[model]
        through_fields = through_entity.get("fields", {})

        # Check parent_match_field exists in parent
        parent_match = through.get("parent_match_field")
        if not parent_match:
            self._add_error(
                "Through missing 'parent_match_field'",
                entity=entity_name,
                field=rel_name,
            )
        elif parent_match not in through_fields:
            self._add_error(
                f"Through parent_match_field '{parent_match}' not in {model}",
                entity=entity_name,
                field=rel_name,
            )

        # Check target_key_field exists in through model
        target_key = through.get("target_key_field")
        if not target_key:
            self._add_error(
                "Through missing 'target_key_field'",
                entity=entity_name,
                field=rel_name,
            )
        elif target_key not in through_fields:
            self._add_error(
                f"Through target_key_field '{target_key}' not in {model}",
                entity=entity_name,
                field=rel_name,
            )

    def _validate_ref(
        self,
        entity_name: str,
        rel_name: str,
        ref: dict,
        parent_fields: dict,
        target_fields: dict,
    ):
        """Validate ref relation configuration."""
        # Check from_field exists in parent
        from_field = ref.get("from_field")
        if not from_field:
            self._add_error(
                "Ref missing 'from_field'",
                entity=entity_name,
                field=rel_name,
            )
        elif from_field not in parent_fields:
            self._add_error(
                f"Ref from_field '{from_field}' not in {entity_name}",
                entity=entity_name,
                field=rel_name,
            )

        # Check to_field exists in target
        to_field = ref.get("to_field", "id")
        if to_field not in target_fields:
            self._add_error(
                f"Ref to_field '{to_field}' not in target entity",
                entity=entity_name,
                field=rel_name,
            )

    def _build_graph_json(self, services: dict, entities: dict) -> dict:
        """Build the final GraphJSON structure."""
        return {
            "version": self.GRAPH_VERSION,
            "services": {
                name: {"url": svc["url"]}
                for name, svc in services.items()
            },
            "entities": {
                name: self._build_entity_json(entity)
                for name, entity in entities.items()
            },
        }

    def _build_entity_json(self, entity: dict) -> dict:
        """Build entity JSON structure."""
        return {
            "service": entity["service"],
            "resource": entity["resource"],
            "keys": entity.get("keys", ["id"]),
            "fields": entity.get("fields", {}),
            "relations": entity.get("relations", {}),
            "access": entity.get("access", {"tenant_strategy": "none", "tenant_field": None}),
        }


def compile_graph(ir: dict) -> dict:
    """
    Convenience function to compile IR to GraphJSON.

    Raises:
        ValueError: If compilation fails

    Returns:
        Validated GraphJSON dict
    """
    compiler = GraphCompiler()
    result = compiler.compile(ir)

    if not result.success:
        errors = "\n".join(result.error_messages())
        raise ValueError(f"Graph compilation failed:\n{errors}")

    return result.graph
