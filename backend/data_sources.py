import os
import re
import time
import uuid
import urllib.parse
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.engine import Engine

import database
from schema_parser import (
    parse_ddl_schema,
    parse_manual_schema,
    parse_json_schema,
    get_demo_ecommerce_schema,
)


class DataSourceManager:
    """
    Manages database connections and imported schemas for QueryAI.
    Ensures safe in-memory credential and engine handling, tenant isolation prototypes,
    schema extraction, and execution segregation between live databases and imported schemas.
    """

    def __init__(self):
        self._connections: dict[str, dict] = {}
        self._schemas: dict[str, dict] = {}
        self._active_source_id: str = "default"
        self._init_default_sources()

    def _init_default_sources(self):
        """
        Registers the preconfigured Supabase student database and the E-Commerce Demo Schema.
        """
        # Parse host & db from DATABASE_URL safely
        parsed_url = urllib.parse.urlparse(database.DATABASE_URL)
        safe_host = parsed_url.hostname or "supabase.co"
        safe_db = parsed_url.path.lstrip("/") or "postgres"
        safe_user = parsed_url.username or "postgres"

        # 1. Default Supabase Live Connection
        self._connections["default"] = {
            "id": "default",
            "name": "Student Database (Default)",
            "database_type": "postgresql",
            "is_live": True,
            "engine": database.default_engine,
            "host": safe_host,
            "port": parsed_url.port or 5432,
            "database": safe_db,
            "username": safe_user,
            "ssl_mode": "require",
            "status": "connected",
            "is_default": True,
            "description": "Pre-configured Supabase PostgreSQL database (students, departments, courses, enrollments).",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_cached_schema_text": None,
            "_cached_tables": None,
        }

        # 2. Default E-Commerce Demo Schema (Schema-only, no live execution)
        try:
            demo_text, demo_tables = get_demo_ecommerce_schema()
            self._schemas["demo-ecommerce"] = {
                "id": "demo-ecommerce",
                "name": "E-Commerce Store (Demo Schema)",
                "database_type": "postgresql",
                "is_live": False,
                "source_type": "demo",
                "description": "Interactive demo schema with customers, products, orders, and order items. No live database required.",
                "schema_text": demo_text,
                "tables": demo_tables,
                "table_count": len(demo_tables),
                "is_demo": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            print(f"Warning: Failed to initialize demo ecommerce schema: {e}")

    # ==========================================
    # DATABASE CONNECTION MANAGEMENT
    # ==========================================

    def test_connection(
        self,
        host: str,
        port: int,
        database_name: str,
        username: str,
        password: str,
        ssl_mode: str = "require",
    ) -> dict:
        """
        Tests database connection without saving it. Never leaks password.
        """
        success, message, table_count = database.test_database_connection(
            host=host,
            port=port,
            database=database_name,
            username=username,
            password=password,
            ssl_mode=ssl_mode,
        )
        return {
            "success": success,
            "message": message,
            "table_count": table_count,
        }

    def register_connection(
        self,
        name: str,
        host: str,
        port: int,
        database_name: str,
        username: str,
        password: str,
        ssl_mode: str = "require",
    ) -> dict:
        """
        Validates, tests, and registers a live PostgreSQL connection.
        Credentials and engine are held in backend memory only.
        Returns safe metadata with NO passwords or secret URLs.
        """
        clean_name = (name or "").strip()
        if not clean_name:
            clean_name = f"{database_name} ({host})"

        # Validate & test first
        test_res = self.test_connection(
            host=host,
            port=port,
            database_name=database_name,
            username=username,
            password=password,
            ssl_mode=ssl_mode,
        )
        if not test_res["success"]:
            raise ValueError(test_res["message"])

        # Create managed custom engine
        custom_engine = database.create_custom_engine(
            host=host,
            port=port,
            database=database_name,
            username=username,
            password=password,
            ssl_mode=ssl_mode,
        )

        conn_id = f"conn_{uuid.uuid4().hex[:8]}"

        # Inspect schema initially
        try:
            schema_text = database.get_schema(custom_engine)
            structured_tables = database.get_structured_schema(custom_engine)
        except Exception as e:
            custom_engine.dispose()
            raise ValueError(f"Connected to database, but failed to inspect schema: {str(e)[:120]}")

        self._connections[conn_id] = {
            "id": conn_id,
            "name": clean_name,
            "database_type": "postgresql",
            "is_live": True,
            "engine": custom_engine,
            "host": host.strip(),
            "port": port,
            "database": database_name.strip(),
            "username": username.strip(),
            "ssl_mode": ssl_mode,
            "status": "connected",
            "is_default": False,
            "description": f"Custom PostgreSQL connection to {database_name} on {host}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_cached_schema_text": schema_text,
            "_cached_tables": structured_tables,
        }

        # Return safe representation
        return self.get_connection_safe(conn_id)

    def get_connection_safe(self, conn_id: str) -> dict:
        """
        Returns connection metadata with all credentials stripped out.
        """
        if conn_id not in self._connections:
            raise KeyError(f"Connection '{conn_id}' not found.")

        conn = self._connections[conn_id]
        tables = self.get_connection_tables(conn_id)

        return {
            "id": conn["id"],
            "name": conn["name"],
            "database_type": conn["database_type"],
            "is_live": True,
            "category": "connection",
            "host": conn["host"],
            "port": conn["port"],
            "database": conn["database"],
            "username": conn["username"],
            "ssl_mode": conn["ssl_mode"],
            "status": conn["status"],
            "is_default": conn.get("is_default", False),
            "table_count": len(tables),
            "description": conn.get("description", ""),
            "created_at": conn["created_at"],
        }

    def list_connections(self) -> list[dict]:
        """
        Lists all registered connections safely.
        """
        return [self.get_connection_safe(cid) for cid in self._connections]

    def get_connection_tables(self, conn_id: str) -> list[dict]:
        """
        Returns structured tables for connection, utilizing cache or lazy-loading.
        """
        if conn_id not in self._connections:
            raise KeyError(f"Connection '{conn_id}' not found.")

        conn = self._connections[conn_id]
        if conn.get("_cached_tables") is None:
            conn["_cached_tables"] = database.get_structured_schema(conn["engine"])
        return conn["_cached_tables"]

    def get_connection_schema_text(self, conn_id: str) -> str:
        """
        Returns formatted schema prompt text for Gemini.
        """
        if conn_id not in self._connections:
            raise KeyError(f"Connection '{conn_id}' not found.")

        conn = self._connections[conn_id]
        if conn.get("_cached_schema_text") is None:
            conn["_cached_schema_text"] = database.get_schema(conn["engine"])
        return conn["_cached_schema_text"]

    def refresh_connection(self, conn_id: str) -> dict:
        """
        Re-queries information schema from the live database and updates cached schema.
        """
        if conn_id not in self._connections:
            raise KeyError(f"Connection '{conn_id}' not found.")

        conn = self._connections[conn_id]
        eng = conn["engine"]

        # Test engine liveness
        with eng.connect() as connection:
            connection.execute(database.text("SELECT 1;"))

        conn["_cached_schema_text"] = database.get_schema(eng)
        conn["_cached_tables"] = database.get_structured_schema(eng)
        conn["status"] = "connected"

        return {
            "success": True,
            "connection_id": conn_id,
            "table_count": len(conn["_cached_tables"]),
            "message": "Schema refreshed successfully.",
        }

    def delete_connection(self, conn_id: str) -> bool:
        """
        Disposes connection engine and cleans up memory resources.
        Default connection cannot be deleted.
        """
        if conn_id == "default":
            raise ValueError("The default Supabase database connection cannot be deleted.")

        if conn_id not in self._connections:
            raise KeyError(f"Connection '{conn_id}' not found.")

        conn = self._connections.pop(conn_id)
        if "engine" in conn and conn["engine"]:
            try:
                conn["engine"].dispose()
            except Exception as e:
                print(f"Warning: engine dispose failed for {conn_id}: {e}")

        if self._active_source_id == conn_id:
            self._active_source_id = "default"

        return True

    # ==========================================
    # IMPORTED SCHEMA MANAGEMENT
    # ==========================================

    def import_schema(
        self,
        name: str,
        source_type: str,
        sql_text: Optional[str] = None,
        tables_data: Optional[list] = None,
        json_text: Optional[str] = None,
    ) -> dict:
        """
        Imports a schema via pasted SQL, manual tables, or JSON file content.
        Parses AST safely WITHOUT executing any SQL statements against any database.
        """
        clean_name = (name or "").strip()
        schema_text = ""
        structured_tables = []

        if source_type in ["pasted", "sql", "upload_sql"]:
            if not sql_text or not sql_text.strip():
                raise ValueError("Schema SQL text is required.")
            schema_text, structured_tables = parse_ddl_schema(sql_text)
            if not clean_name:
                first_table = structured_tables[0]["name"] if structured_tables else "schema"
                clean_name = f"Schema ({first_table} & {len(structured_tables)} tables)"

        elif source_type in ["manual", "builder"]:
            if not tables_data:
                raise ValueError("At least one manual table definition is required.")
            schema_text, structured_tables = parse_manual_schema(tables_data)
            if not clean_name:
                clean_name = f"Manual Schema ({len(structured_tables)} tables)"

        elif source_type in ["json", "upload_json"]:
            if not json_text or not json_text.strip():
                raise ValueError("JSON schema text is required.")
            schema_text, structured_tables = parse_json_schema(json_text)
            if not clean_name:
                clean_name = f"Imported JSON Schema ({len(structured_tables)} tables)"

        elif source_type == "demo":
            schema_text, structured_tables = get_demo_ecommerce_schema()
            clean_name = clean_name or "E-Commerce Store (Demo)"
        else:
            raise ValueError(f"Unsupported schema import source type: '{source_type}'")

        schema_id = f"schema_{uuid.uuid4().hex[:8]}"

        self._schemas[schema_id] = {
            "id": schema_id,
            "name": clean_name,
            "database_type": "postgresql",
            "is_live": False,
            "source_type": source_type,
            "description": f"Imported PostgreSQL schema with {len(structured_tables)} tables.",
            "schema_text": schema_text,
            "tables": structured_tables,
            "table_count": len(structured_tables),
            "is_demo": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        return self.get_schema_detail(schema_id)

    def get_schema_detail(self, schema_id: str) -> dict:
        """
        Returns full schema detail for schema inspector.
        """
        if schema_id not in self._schemas:
            raise KeyError(f"Schema '{schema_id}' not found.")

        s = self._schemas[schema_id]
        return {
            "id": s["id"],
            "name": s["name"],
            "database_type": s["database_type"],
            "is_live": False,
            "category": "schema",
            "source_type": s.get("source_type", "imported"),
            "status": "schema_only",
            "table_count": s["table_count"],
            "description": s.get("description", ""),
            "tables": s["tables"],
            "schema_text": s["schema_text"],
            "is_demo": s.get("is_demo", False),
            "created_at": s["created_at"],
        }

    def list_schemas(self) -> list[dict]:
        """
        Lists all imported schemas.
        """
        return [
            {
                "id": s["id"],
                "name": s["name"],
                "database_type": s["database_type"],
                "is_live": False,
                "category": "schema",
                "source_type": s.get("source_type", "imported"),
                "status": "schema_only",
                "table_count": s["table_count"],
                "description": s.get("description", ""),
                "is_demo": s.get("is_demo", False),
                "created_at": s["created_at"],
            }
            for s in self._schemas.values()
        ]

    def delete_schema(self, schema_id: str) -> bool:
        """
        Removes an imported schema. Demo schema cannot be deleted.
        """
        if schema_id == "demo-ecommerce":
            raise ValueError("The built-in demo schema cannot be deleted.")

        if schema_id not in self._schemas:
            raise KeyError(f"Schema '{schema_id}' not found.")

        self._schemas.pop(schema_id)

        if self._active_source_id == schema_id:
            self._active_source_id = "default"

        return True

    # ==========================================
    # UNIFIED SOURCE RESOLUTION & QUERIES
    # ==========================================

    def list_all_data_sources(self) -> dict:
        """
        Returns all connections and schemas grouped and unified for easy frontend display.
        """
        conns = self.list_connections()
        schemas = self.list_schemas()
        return {
            "active_source_id": self._active_source_id,
            "connections": conns,
            "schemas": schemas,
            "total_count": len(conns) + len(schemas),
        }

    def set_active_source(self, source_id: str) -> dict:
        """
        Sets the default active data source.
        """
        source = self.get_source(source_id)
        self._active_source_id = source_id
        return {
            "success": True,
            "active_source_id": source_id,
            "active_source_name": source["name"],
            "is_live": source["is_live"],
        }

    def get_source(self, source_id: Optional[str]) -> dict:
        """
        Resolves a data source by ID (connection or schema).
        Defaults to 'default' if not supplied.
        """
        sid = (source_id or "").strip()
        if not sid:
            sid = self._active_source_id or "default"

        # Check in connections
        if sid in self._connections:
            c = self._connections[sid]
            tables = self.get_connection_tables(sid)
            return {
                "id": c["id"],
                "name": c["name"],
                "category": "connection",
                "is_live": True,
                "engine": c["engine"],
                "status": c["status"],
                "schema_text": self.get_connection_schema_text(sid),
                "tables": tables,
                "table_count": len(tables),
                "is_default": c.get("is_default", False),
            }

        # Check in schemas
        if sid in self._schemas:
            s = self._schemas[sid]
            return {
                "id": s["id"],
                "name": s["name"],
                "category": "schema",
                "is_live": False,
                "engine": None,
                "status": "schema_only",
                "schema_text": s["schema_text"],
                "tables": s["tables"],
                "table_count": s["table_count"],
                "is_default": False,
            }

        raise KeyError(
            f"Data source '{sid}' not found. Please select or configure a valid data source."
        )


# Singleton instance
data_source_manager = DataSourceManager()
