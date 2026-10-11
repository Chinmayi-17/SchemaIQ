import json
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

import database

IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


CREATE_SCHEMA_METADATA_SQL = """
CREATE TABLE IF NOT EXISTS queryai_schema_metadata (
    schema_id VARCHAR(120) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    schema_text TEXT NOT NULL,
    tables_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""

CREATE_SCHEMA_RECORDS_SQL = """
CREATE TABLE IF NOT EXISTS queryai_schema_records (
    schema_id VARCHAR(120) NOT NULL REFERENCES queryai_schema_metadata(schema_id) ON DELETE CASCADE,
    table_name VARCHAR(255) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    "values" JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (schema_id, table_name, record_id)
)
"""


def _quote_identifier(value: str) -> str:
    if not IDENTIFIER_RE.fullmatch(value or ""):
        raise ValueError("Only simple SQL identifiers are supported for sample queries.")
    return f'"{value}"'


def ensure_storage(engine: Engine | None = None) -> None:
    with (engine or database.default_engine).begin() as connection:
        connection.execute(text(CREATE_SCHEMA_METADATA_SQL))
        connection.execute(text(CREATE_SCHEMA_RECORDS_SQL))


def save_schema_metadata(schema: dict, engine: Engine | None = None) -> None:
    ensure_storage(engine)
    payload = json.dumps(schema["tables"])
    with (engine or database.default_engine).begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO queryai_schema_metadata (schema_id, name, schema_text, tables_json)
                VALUES (:schema_id, :name, :schema_text, CAST(:tables_json AS JSONB))
                ON CONFLICT (schema_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    schema_text = EXCLUDED.schema_text,
                    tables_json = EXCLUDED.tables_json
                """
            ),
            {
                "schema_id": schema["id"],
                "name": schema["name"],
                "schema_text": schema["schema_text"],
                "tables_json": payload,
            },
        )


def load_schema_metadata(engine: Engine | None = None) -> list[dict]:
    ensure_storage(engine)
    with (engine or database.default_engine).connect() as connection:
        rows = connection.execute(
            text(
                "SELECT schema_id, name, schema_text, tables_json, created_at "
                "FROM queryai_schema_metadata ORDER BY created_at"
            )
        ).mappings()
        return [
            {
                "id": row["schema_id"],
                "name": row["name"],
                "database_type": "postgresql",
                "is_live": False,
                "source_type": "imported",
                "description": f"Imported PostgreSQL schema with {len(row['tables_json'])} tables.",
                "schema_text": row["schema_text"],
                "tables": row["tables_json"],
                "table_count": len(row["tables_json"]),
                "is_demo": False,
                "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            }
            for row in rows
        ]


def delete_schema_metadata(schema_id: str, engine: Engine | None = None) -> None:
    ensure_storage(engine)
    with (engine or database.default_engine).begin() as connection:
        connection.execute(
            text("DELETE FROM queryai_schema_metadata WHERE schema_id = :schema_id"),
            {"schema_id": schema_id},
        )


def _get_table_metadata(tables: list[dict], table_name: str) -> dict:
    table = next((item for item in tables if item["name"] == table_name), None)
    if table is None:
        raise ValueError(f"Table '{table_name}' is not part of the selected schema.")
    if not IDENTIFIER_RE.fullmatch(table_name):
        raise ValueError("Table identifiers must contain only letters, numbers, and underscores.")
    return table


def _coerce_value(column: dict, value: Any) -> Any:
    if value is None:
        return None
    data_type = column.get("type", "TEXT").upper()
    try:
        if any(token in data_type for token in ("INT", "SERIAL")):
            return int(value)
        if any(token in data_type for token in ("NUMERIC", "DECIMAL", "REAL", "DOUBLE", "FLOAT")):
            return float(value)
        if data_type.startswith("BOOL"):
            if isinstance(value, bool):
                return value
            if str(value).lower() in {"true", "1", "yes"}:
                return True
            if str(value).lower() in {"false", "0", "no"}:
                return False
            raise ValueError("must be a boolean")
        if data_type.startswith("DATE") or data_type.startswith("TIMESTAMP"):
            datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return str(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"Column '{column['name']}' has an invalid {column.get('type', 'value')}: {error}") from error
    return value


def _validate_record(schema_id: str, table: dict, values: dict, engine: Engine | None = None) -> dict:
    ensure_storage(engine)
    columns = {column["name"]: column for column in table.get("columns", [])}
    unknown = set(values) - set(columns)
    if unknown:
        raise ValueError(f"Unknown column(s): {', '.join(sorted(unknown))}")

    clean = {}
    for name, column in columns.items():
        if name in values:
            clean[name] = _coerce_value(column, values[name])
        elif column.get("required") and not column.get("auto_generated"):
            raise ValueError(f"Column '{name}' is required.")

    primary_key = next((column for column in table.get("columns", []) if column.get("primary_key")), None)
    if primary_key and primary_key["name"] not in clean and primary_key.get("auto_generated"):
        with (engine or database.default_engine).connect() as connection:
            current_ids = connection.execute(
                text(
                    "SELECT record_id FROM queryai_schema_records "
                    "WHERE schema_id = :schema_id AND table_name = :table_name"
                ),
                {"schema_id": schema_id, "table_name": table["name"]},
            ).scalars()
            used = {int(value) for value in current_ids if str(value).isdigit()}
        next_id = 1
        while next_id in used:
            next_id += 1
        clean[primary_key["name"]] = next_id

    for column in table.get("columns", []):
        name = column["name"]
        if column.get("required") and (name not in clean or clean[name] is None):
            raise ValueError(f"Column '{name}' cannot be null.")

        target = column.get("foreign_key_target")
        if target and clean.get(name) is not None:
            target_table, target_column = target.split(".", 1)
            exists = connection_exists(schema_id, target_table, target_column, clean[name], engine)
            if not exists:
                raise ValueError(f"Column '{name}' references a missing {target_table}.{target_column} record.")

    primary_key = next((column for column in table.get("columns", []) if column.get("primary_key")), None)
    if primary_key and clean.get(primary_key["name"]) is not None:
        if connection_exists(schema_id, table["name"], primary_key["name"], clean[primary_key["name"]], engine):
            raise ValueError(f"Duplicate primary key for '{table['name']}.{primary_key['name']}'.")

    for column in table.get("columns", []):
        if column.get("unique") and clean.get(column["name"]) is not None:
            if connection_exists(schema_id, table["name"], column["name"], clean[column["name"]], engine):
                raise ValueError(f"Duplicate unique value for '{table['name']}.{column['name']}'.")

    for expression in table.get("checks", []):
        _validate_check_expression(expression, clean)
    for column in table.get("columns", []):
        if column.get("check"):
            _validate_check_expression(column["check"], clean)
    return clean


def connection_exists(schema_id: str, table_name: str, column_name: str, value: Any, engine: Engine | None = None) -> bool:
    ensure_storage(engine)
    with (engine or database.default_engine).connect() as connection:
        row = connection.execute(
            text(
                "SELECT 1 FROM queryai_schema_records "
                "WHERE schema_id = :schema_id AND table_name = :table_name "
                "AND values ->> :column_name = :value LIMIT 1"
            ),
            {"schema_id": schema_id, "table_name": table_name, "column_name": column_name, "value": str(value)},
        ).first()
        return row is not None


def insert_schema_record(schema_id: str, table: dict, values: dict, engine: Engine | None = None) -> dict:
    clean = _validate_record(schema_id, table, values, engine)
    primary_key = next((column for column in table.get("columns", []) if column.get("primary_key")), None)
    if not primary_key or clean.get(primary_key["name"]) is None:
        raise ValueError(f"Table '{table['name']}' needs a primary key or generated primary key.")
    record_id = str(clean[primary_key["name"]])
    ensure_storage(engine)
    now = datetime.now(timezone.utc).isoformat()
    try:
        with (engine or database.default_engine).begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO queryai_schema_records "
                    "(schema_id, table_name, record_id, \"values\", created_at) "
                    "VALUES (:schema_id, :table_name, :record_id, CAST(:values AS JSONB), :created_at)"
                ),
                {"schema_id": schema_id, "table_name": table["name"], "record_id": record_id, "values": json.dumps(clean), "created_at": now},
            )
    except Exception as error:
        if "duplicate key" in str(error).lower():
            raise ValueError(f"Duplicate primary key for '{table['name']}'.") from error
        raise
    return clean


def list_schema_records(schema_id: str, table: dict, limit: int = 100, offset: int = 0, engine: Engine | None = None) -> list[dict]:
    _get_table_metadata([table], table["name"])
    ensure_storage(engine)
    with (engine or database.default_engine).connect() as connection:
        rows = connection.execute(
            text(
                "SELECT \"values\" FROM queryai_schema_records WHERE schema_id = :schema_id "
                "AND table_name = :table_name ORDER BY created_at LIMIT :limit OFFSET :offset"
            ),
            {"schema_id": schema_id, "table_name": table["name"], "limit": min(limit, 100), "offset": max(offset, 0)},
        ).scalars()
        return list(rows)


def execute_schema_query(sql: str, schema_id: str, tables: list[dict], engine: Engine | None = None) -> dict:
    """Execute validated SELECT SQL against an isolated in-memory SQLite snapshot."""
    ensure_storage(engine)
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    try:
        for table in tables:
            table_name = _quote_identifier(table["name"])
            definitions = []
            for column in table.get("columns", []):
                definitions.append(f'{_quote_identifier(column["name"])} {_sqlite_type(column.get("type", "TEXT"))}')
            connection.execute(f"CREATE TABLE {table_name} ({', '.join(definitions)})")
            rows = list_schema_records(schema_id, table, limit=10000, engine=engine)
            if rows:
                names = [column["name"] for column in table.get("columns", [])]
                placeholders = ",".join("?" for _ in names)
                connection.executemany(
                    f"INSERT INTO {table_name} ({','.join(_quote_identifier(name) for name in names)}) VALUES ({placeholders})",
                    [[row.get(name) for name in names] for row in rows],
                )
        result = connection.execute(sql)
        rows = [dict(row) for row in result.fetchmany(101)]
        return {"columns": [description[0] for description in result.description or []], "rows": rows[:100], "truncated": len(rows) > 100}
    except sqlite3.Error as error:
        raise ValueError(f"This SELECT is not supported for schema sample data: {error}") from error
    finally:
        connection.close()


def _sqlite_type(data_type: str) -> str:
    data_type = data_type.upper()
    if "INT" in data_type or "SERIAL" in data_type:
        return "INTEGER"
    if any(token in data_type for token in ("NUMERIC", "DECIMAL", "REAL", "DOUBLE", "FLOAT")):
        return "REAL"
    if "BOOL" in data_type:
        return "INTEGER"
    return "TEXT"


def _validate_check_expression(expression: str, values: dict) -> None:
    parts = re.split(r"\s+AND\s+", expression, flags=re.IGNORECASE)
    for part in parts:
        match = re.fullmatch(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|>|<|=)\s*('.*?'|\".*?\"|[-+]?\d+(?:\.\d+)?)\s*", part)
        if not match:
            raise ValueError(f"Unsupported CHECK constraint: {expression}")
        column_name, operator, raw_expected = match.groups()
        if column_name not in values:
            raise ValueError(f"CHECK constraint references missing column '{column_name}'.")
        expected = raw_expected.strip("'\"")
        actual = values[column_name]
        try:
            expected = float(expected) if isinstance(actual, (int, float)) else expected
        except ValueError as error:
            raise ValueError(f"Invalid CHECK constraint value for '{column_name}'.") from error
        valid = {">=": actual >= expected, "<=": actual <= expected, ">": actual > expected, "<": actual < expected, "=": actual == expected}[operator]
        if not valid:
            raise ValueError(f"CHECK constraint failed for '{column_name}'.")
