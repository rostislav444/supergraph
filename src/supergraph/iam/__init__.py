"""
IAM (Identity and Access Management) module.
"""

from __future__ import annotations

from typing import Optional

from .guard import filter_masked_fields, filter_masked_relations, inject_guards
from .service import IAMResponse, IAMScope, IAMService, iam_service

__all__ = [
    "IAMScope",
    "IAMResponse",
    "IAMService",
    "iam_service",
    "inject_guards",
    "filter_masked_fields",
    "filter_masked_relations",
]
