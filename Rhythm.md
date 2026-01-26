# Supergraph Rhythm

Development changelog and feature documentation.

---

## v0.3.0 - Transaction Builder & Type Safety (2025-01-26)

### New Features

#### 1. Automatic Type Coercion in Internal API

The internal API now automatically converts data types to match SQLAlchemy model column types.

**Location:** `src/supergraph/service/internal_api.py`

**Supported conversions:**

| Input Type | Target Column | Result |
|------------|---------------|--------|
| `int` / `float` | `String`, `Text`, `VARCHAR` | Converts to `str` |
| `str` (YYYY-MM-DD) | `Date` | Parses to `date` object |
| `str` (ISO format) | `DateTime`, `Timestamp` | Parses to `datetime` object |
| `str` (numeric) | `Integer`, `BigInteger` | Converts to `int` |

**Why this matters:**
- Variable references like `$person1.id` return integers, but FK fields like `subject_id` may be `VARCHAR`
- Date fields can now accept string input from JSON and be automatically parsed
- Prevents "expected str, got int" errors in transactions

**Example:**
```python
# Before: This would fail if subject_id is VARCHAR
{
    "create": {
        "Relationship": {
            "data": {
                "subject_id": "$person1.id",  # Returns int: 18008
                "valid_from": "2025-01-26"    # String needs to be date
            }
        }
    }
}

# After: Automatic coercion handles the conversion
# subject_id: 18008 -> "18008" (int to str)
# valid_from: "2025-01-26" -> date(2025, 1, 26) (str to date)
```

---

#### 2. Date Picker UI in Playground

Native date/datetime pickers for all date fields in the Transaction Builder and Create mode.

**Location:** `playground/src/components/SchemaExplorer.jsx`

**Components updated:**
- `DataFieldItem` - Used in Create/Update mode
- `TransactionStepCard` - Used in Transaction mode

**Implementation:**
- `date` fields → `<input type="date">` (calendar picker, YYYY-MM-DD format)
- `datetime` fields → `<input type="datetime-local">` (date + time picker, ISO format)

**Benefits:**
- No need to manually type dates
- Browser-native calendar UI
- Automatic format validation

---

#### 3. FK Lookup Modal

Search and select foreign key values with a modal dialog.

**Location:** `playground/src/components/SchemaExplorer.jsx` → `EntityLookupModal`

**Features:**
- Auto-detects FK fields by `_id` suffix
- Infers target entity from field name (e.g., `property_type_id` → `PropertyType`)
- Full-text search across entity records
- Pagination with "Load more" button
- Shows multiple display fields (id, name, title, code, etc.)

**Usage:**
Fields ending with `_id` show a search button (🔍) that opens the lookup modal.

---

#### 4. Required Field Validation

Visual indicators and validation for required (non-nullable) fields.

**Features:**
- Red vertical bar indicator for required fields
- Asterisk (*) marker next to field name
- Red background highlight for empty required fields
- Validation before transaction execution
- Required fields cannot be unchecked in the UI

**Validation rules:**
- `nullable=False` fields are required
- `id` field is never required (auto-generated)
- Empty strings are considered invalid for required fields
- `0` is invalid for FK fields (`_id` suffix)

---

#### 5. Transaction Builder Improvements

Enhanced multi-step transaction editing with visual feedback.

**Features:**
- Entity-colored step cards (different color per entity type)
- Variable reference dropdown for FK fields (`$person1.id`, `$property1.id`)
- Auto-generated step aliases (`$person1`, `$person2`, etc.)
- "test" button to auto-fill fields with realistic test data
- Collapsible response fields section
- Operation type switcher (Create/Update/Delete/Get or Create)

**Saga pattern:**
- Automatic rollback on failure
- Each step can reference results from previous steps
- `on_error: rollback` by default

---

### Technical Details

#### Type Coercion Implementation

```python
def _coerce_data(self, data: dict[str, Any]) -> dict[str, Any]:
    """
    Coerce data values to match model column types.
    """
    mapper = inspect(self.model)
    coerced = {}

    for key, value in data.items():
        if value is None:
            coerced[key] = value
            continue

        column = mapper.columns.get(key)
        if column is None:
            coerced[key] = value
            continue

        col_type = column.type.__class__.__name__.lower()

        # String columns - convert int/float to str
        if col_type in ('string', 'text', 'varchar'):
            if isinstance(value, (int, float)):
                coerced[key] = str(value)
            else:
                coerced[key] = value

        # Date columns - parse string to date
        elif col_type == 'date':
            if isinstance(value, str):
                coerced[key] = datetime.strptime(value[:10], '%Y-%m-%d').date()
            else:
                coerced[key] = value

        # DateTime columns - parse string to datetime
        elif col_type in ('datetime', 'timestamp'):
            if isinstance(value, str):
                coerced[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
            else:
                coerced[key] = value

        # Integer columns - convert str to int
        elif col_type in ('integer', 'biginteger', 'smallinteger'):
            if isinstance(value, str) and value.isdigit():
                coerced[key] = int(value)
            else:
                coerced[key] = value

        else:
            coerced[key] = value

    return coerced
```

---

### Files Changed

| File | Description |
|------|-------------|
| `src/supergraph/service/internal_api.py` | Added `_coerce_data()` method for automatic type conversion |
| `playground/src/components/SchemaExplorer.jsx` | Added date pickers, FK lookup modal, required field validation |

---

## Previous Versions

### v0.2.0 - Playground & Mutations

- Interactive Playground with Monaco editor
- JSON autocomplete based on schema
- Create/Update/Delete/Rewrite operations
- Transaction mode with saga rollback
- Toast notifications for errors

### v0.1.0 - Initial Release

- JSON Query DSL
- Cross-service relations
- ViewSet pattern
- Gateway with auto-discovery
- Internal API for service communication
