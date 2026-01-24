"""
Custom exceptions for the Supergraph system.
"""

from __future__ import annotations

from typing import Optional



class SupergraphError(Exception):
    """Base exception for all supergraph errors."""
    pass


class ValidationError(SupergraphError):
    """Raised when query validation fails."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__(f"Validation failed: {errors}")


class ExecutionError(SupergraphError):
    """Raised when query execution fails."""

    def __init__(self, message: str, step_id: Optional[str] = None):
        self.step_id = step_id
        super().__init__(f"Execution failed{f' at step {step_id}' if step_id else ''}: {message}")


class ServiceError(SupergraphError):
    """Raised when a backend service call fails."""

    def __init__(self, service: str, status_code: int, message: str):
        self.service = service
        self.status_code = status_code
        super().__init__(f"Service '{service}' returned {status_code}: {message}")


class GraphConfigError(SupergraphError):
    """Raised when graph configuration is invalid."""
    pass


class IAMError(SupergraphError):
    """Raised when IAM check fails."""

    def __init__(self, message: str = "Access denied"):
        super().__init__(message)
