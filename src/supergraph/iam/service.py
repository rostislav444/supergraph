"""
IAM (Identity and Access Management) service.

Handles access control decisions and returns scopes/masks.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..runtime.context import Principal


@dataclass
class IAMScope:
    """A single scope restriction from IAM."""
    field: str
    op: str
    values: list[Any]


@dataclass
class IAMResponse:
    """
    Response from IAM access check.

    Contains:
    - allow: Whether the action is allowed
    - scopes: Mandatory filter restrictions (e.g., rc_id IN [1,2,3])
    - field_masks: Fields to hide per entity
    - relation_masks: Relations to hide per entity
    """
    allow: bool = True
    scopes: list[IAMScope] = field(default_factory=list)
    field_masks: dict[str, list[str]] = field(default_factory=dict)  # entity -> hidden fields
    relation_masks: dict[str, list[str]] = field(default_factory=dict)  # entity -> hidden relations


class IAMService:
    """
    IAM service for access control.

    MVP Implementation:
    - Allows all requests
    - Returns rc_ids from principal as scopes for direct strategy

    Production would:
    - Check roles and permissions
    - Return appropriate scopes and masks
    """

    async def check_access(
        self,
        principal: Principal,
        action: str,
        entity: str,
        graph: dict,
    ) -> IAMResponse:
        """
        Check if principal can perform action on entity.

        Args:
            principal: The authenticated user/service
            action: The action being performed (query, create, update, delete)
            entity: The entity being accessed
            graph: The supergraph schema (to check access definitions)

        Returns:
            IAMResponse with allow/deny and any restrictions
        """
        # MVP: Allow all requests
        # In production, check roles/permissions here

        # Get entity access definition
        entity_def = graph.get("entities", {}).get(entity, {})
        access_def = entity_def.get("access", {})
        tenant_strategy = access_def.get("tenant_strategy", "none")

        scopes: list[IAMScope] = []

        # Apply tenant restrictions based on strategy
        if tenant_strategy == "direct":
            tenant_field = access_def.get("tenant_field", "rc_id")

            # Determine which tenant values to use based on the field
            tenant_values = []

            if tenant_field == "rc_id" and principal.rc_ids:
                # Use rc_ids for residential complex filtering
                tenant_values = principal.rc_ids
            elif tenant_field == "company_id" and principal.extra.get("company_ids"):
                # Use company_ids from extra for company filtering
                tenant_values = principal.extra["company_ids"]
            elif tenant_field == "id" and principal.extra.get("company_ids"):
                # Special case: Company entity filters by its own id field
                # Use company_ids from extra
                tenant_values = principal.extra["company_ids"]

            # Add scope if we have tenant values
            if tenant_values:
                scopes.append(
                    IAMScope(
                        field=tenant_field,
                        op="in",
                        values=tenant_values,
                    )
                )

        return IAMResponse(
            allow=True,
            scopes=scopes,
            field_masks={},
            relation_masks={},
        )


# Global IAM service instance
iam_service = IAMService()
