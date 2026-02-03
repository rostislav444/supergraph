"""
Utility functions for Supergraph.

Includes:
- Case conversion (camelCase <-> snake_case)
- Field name normalization
"""

from __future__ import annotations

import re
from typing import Any


# =============================================================================
# Case conversion utilities
# =============================================================================

# Pre-compiled regex patterns for better performance
_CAMEL_TO_SNAKE_PATTERN = re.compile(r'(?<!^)(?=[A-Z])')
_SNAKE_TO_CAMEL_PATTERN = re.compile(r'_([a-z])')


def to_snake_case(name: str) -> str:
    """
    Convert camelCase to snake_case.

    Examples:
        ownedProperties -> owned_properties
        firstName -> first_name
        HTTPResponse -> http_response
        getHTTPResponseCode -> get_http_response_code
    """
    # Handle consecutive uppercase (HTTP -> http)
    result = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', name)
    # Handle standard camelCase
    result = _CAMEL_TO_SNAKE_PATTERN.sub('_', result)
    return result.lower()


def to_camel_case(name: str) -> str:
    """
    Convert snake_case to camelCase.

    Examples:
        owned_properties -> ownedProperties
        first_name -> firstName
        http_response -> httpResponse
    """
    def replace_underscore(match):
        return match.group(1).upper()

    return _SNAKE_TO_CAMEL_PATTERN.sub(replace_underscore, name)


def to_pascal_case(name: str) -> str:
    """
    Convert snake_case to PascalCase.

    Examples:
        owned_properties -> OwnedProperties
        first_name -> FirstName
    """
    camel = to_camel_case(name)
    return camel[0].upper() + camel[1:] if camel else camel


# =============================================================================
# Deep conversion utilities
# =============================================================================


def convert_keys_to_snake(data: Any) -> Any:
    """
    Recursively convert all dict keys from camelCase to snake_case.

    Works with nested dicts and lists.

    Example:
        {"firstName": "John", "ownedProperties": [{"streetAddress": "123"}]}
        ->
        {"first_name": "John", "owned_properties": [{"street_address": "123"}]}
    """
    if isinstance(data, dict):
        return {
            to_snake_case(k): convert_keys_to_snake(v)
            for k, v in data.items()
        }
    elif isinstance(data, list):
        return [convert_keys_to_snake(item) for item in data]
    else:
        return data


def convert_keys_to_camel(data: Any) -> Any:
    """
    Recursively convert all dict keys from snake_case to camelCase.

    Works with nested dicts and lists.

    Example:
        {"first_name": "John", "owned_properties": [{"street_address": "123"}]}
        ->
        {"firstName": "John", "ownedProperties": [{"streetAddress": "123"}]}
    """
    if isinstance(data, dict):
        return {
            to_camel_case(k): convert_keys_to_camel(v)
            for k, v in data.items()
        }
    elif isinstance(data, list):
        return [convert_keys_to_camel(item) for item in data]
    else:
        return data


# =============================================================================
# Field name utilities
# =============================================================================


def normalize_field_name(name: str, convention: str = "snake") -> str:
    """
    Normalize field name to specified convention.

    Args:
        name: Field name to normalize
        convention: Target convention ("snake" or "camel")

    Returns:
        Normalized field name
    """
    if convention == "snake":
        return to_snake_case(name)
    elif convention == "camel":
        return to_camel_case(name)
    else:
        return name


def normalize_relation_names(relations: dict[str, Any], convention: str = "snake") -> dict[str, Any]:
    """
    Normalize relation names in a relations dict.

    Args:
        relations: Dict of relation_name -> relation_selection
        convention: Target convention ("snake" or "camel")

    Returns:
        Dict with normalized relation names
    """
    return {
        normalize_field_name(name, convention): value
        for name, value in relations.items()
    }
