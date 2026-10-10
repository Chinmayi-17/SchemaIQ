import os
import re
import urllib.parse
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing from .env")

# Default Supabase Database Engine
default_engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=2,
    max_overflow=0,
    connect_args={"connect_timeout": 10},
)

# For backward compatibility
engine = default_engine


def validate_host(host: str) -> None:
    """
    Validates host to prevent basic SSRF against cloud metadata endpoints.
    """
    if not host or not host.strip():
        raise ValueError("Host is required.")

    h = host.strip().lower()
    # Block cloud instance metadata services
    if h in ["169.254.169.254", "metadata.google.internal", "instance-data"]:
        raise ValueError("Connecting to cloud metadata services is prohibited.")

    # Disallow protocols in host
    if "://" in h:
        raise ValueError("Host must not include protocol (e.g. postgresql://).")


def build_postgres_url(
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    ssl_mode: str = "require",
) -> str:
    """
    Builds a secure psycopg2 connection URL with properly escaped credentials.
    """
    validate_host(host)

    enc_user = urllib.parse.quote_plus(username or "")
    enc_pass = urllib.parse.quote_plus(password or "")
    clean_db = urllib.parse.quote(database or "")

    ssl_param = ""
    if ssl_mode and ssl_mode != "disable":
        ssl_param = f"?sslmode={ssl_mode}"

    return f"postgresql+psycopg2://{enc_user}:{enc_pass}@{host.strip()}:{port}/{clean_db}{ssl_param}"


def test_database_connection(
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    ssl_mode: str = "require",
) -> tuple[bool, str, int]:
    """
    Tests connecting to a remote PostgreSQL database.
    Never leaks passwords in error messages.
    Returns: (success: bool, message: str, table_count: int)
    """
    try:
        url = build_postgres_url(host, port, database, username, password, ssl_mode)
        test_eng = create_engine(
            url,
            pool_pre_ping=False,
            connect_args={"connect_timeout": 6},
        )
        try:
            with test_eng.connect() as conn:
                conn.execute(text("SELECT 1;"))
                res = conn.execute(text(
                    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
                ))
                count = int(res.scalar() or 0)
            return True, f"Connection successful ({count} tables discovered).", count
        finally:
            test_eng.dispose()
    except Exception as e:
        raw_msg = str(e)
        # Strip credentials if any leaked in driver message
        safe_msg = re.sub(r":[^:@]+@", ":***@", raw_msg)
        # Keep only the primary reason
        if "could not translate host name" in safe_msg.lower():
            return False, "Host could not be resolved. Please verify the hostname.", 0
        if "password authentication failed" in safe_msg.lower():
            return False, "Authentication failed. Check your username and password.", 0
        if "connection refused" in safe_msg.lower():
            return False, f"Connection refused on {host}:{port}. Ensure the database is running.", 0
        if "timeout" in safe_msg.lower():
            return False, "Connection timed out after 6 seconds. Check firewall and host accessibility.", 0
        return False, f"Connection failed: {safe_msg[:160]}", 0


def create_custom_engine(
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    ssl_mode: str = "require",
) -> Engine:
    """
    Creates a managed SQLAlchemy engine for a user-registered connection.
    """
    url = build_postgres_url(host, port, database, username, password, ssl_mode)
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=0,
        connect_args={"connect_timeout": 10},
    )


def get_schema(target_engine: Engine = None) -> str:
    """
    Extracts human-readable schema text formatted for Gemini prompt.
    """
    eng = target_engine or default_engine
    inspector = inspect(eng)
    tables = inspector.get_table_names(schema="public")
    lines = []

    for table in tables:
        columns = inspector.get_columns(table, schema="public")
        column_text = ", ".join(
            f"{column['name']} ({column['type']})"
            for column in columns
        )
        lines.append(f"Table {table}: {column_text}")

        foreign_keys = inspector.get_foreign_keys(table, schema="public")
        for fk in foreign_keys:
            lines.append(
                f"Relationship: {table}.{fk['constrained_columns']} "
                f"-> {fk['referred_table']}.{fk['referred_columns']}"
            )

    return "\n".join(lines)


def get_structured_schema(target_engine: Engine = None) -> list:
    """
    Extracts structured schema with tables, columns, types, pk, fk for UI inspector.
    """
    eng = target_engine or default_engine
    inspector = inspect(eng)
    tables = inspector.get_table_names(schema="public")
    structured = []

    for table in tables:
        columns = inspector.get_columns(table, schema="public")
        pk_constraint = inspector.get_pk_constraint(table, schema="public") or {}
        pks = set(pk_constraint.get("constrained_columns", []))

        foreign_keys = inspector.get_foreign_keys(table, schema="public")
        fk_columns = set()
        relationships = []
        for fk in foreign_keys:
            fk_columns.update(fk.get("constrained_columns", []))
            relationships.append(
                f"Relationship: {table}.{fk['constrained_columns']} -> {fk['referred_table']}.{fk['referred_columns']}"
            )

        cols = [
            {
                "name": col["name"],
                "type": str(col["type"]),
                "primary_key": col["name"] in pks,
                "foreign_key": col["name"] in fk_columns,
            }
            for col in columns
        ]

        structured.append({
            "name": table,
            "columns": cols,
            "relationships": relationships,
        })

    return structured


def execute_readonly(sql: str, target_engine: Engine = None) -> dict:
    """
    Executes a read-only query on the specified database engine.
    Applies SET TRANSACTION READ ONLY and 5000ms statement timeout.
    """
    eng = target_engine or default_engine
    with eng.connect() as connection:
        with connection.begin():
            connection.execute(text("SET TRANSACTION READ ONLY"))
            connection.execute(text("SET LOCAL statement_timeout = '5000ms'"))

            result = connection.execute(text(sql))
            columns = list(result.keys())
            rows = [dict(row._mapping) for row in result.fetchmany(101)]

            truncated = len(rows) > 100
            rows = rows[:100]

            return {
                "columns": columns,
                "rows": rows,
                "truncated": truncated,
            }