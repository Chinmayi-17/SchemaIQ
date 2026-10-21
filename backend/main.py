import re
import traceback
from typing import Optional, List, Dict, Any, Literal

from fastapi import FastAPI, HTTPException, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from database import get_schema, execute_readonly
from data_sources import data_source_manager
from sql_generator import generate_sql
from sql_validator import validate_sql, validate_sql_references
import database as database_module
import sample_records

app = FastAPI(title="SchemaIQ API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PUT", "OPTIONS"],
    allow_headers=["*"],
)


# ==========================================
# REQUEST / RESPONSE MODELS
# ==========================================

class ConnectionTestRequest(BaseModel):
    connection_name: Optional[str] = None
    host: str = Field(..., min_length=1, description="Database host name or IP")
    port: int = Field(5432, ge=1, le=65535, description="Port number (default 5432)")
    database: str = Field(..., min_length=1, description="PostgreSQL database name")
    username: str = Field(..., min_length=1, description="Database user")
    password: str = Field(..., description="Database user password")
    ssl_mode: Literal["require", "verify-full", "prefer", "disable"] = Field("require", description="PostgreSQL SSL connection mode")


class ConnectionRegisterRequest(BaseModel):
    connection_name: str = Field(..., min_length=1, max_length=120)
    host: str = Field(..., min_length=1)
    port: int = Field(5432, ge=1, le=65535)
    database: str = Field(..., min_length=1)
    username: str = Field(..., min_length=1)
    password: str = Field(...)
    ssl_mode: Literal["require", "verify-full", "prefer", "disable"] = Field("require")


class SchemaImportRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    source_type: str = Field("pasted", description="pasted | manual | json | demo")
    sql_text: Optional[str] = None
    tables: Optional[List[Dict[str, Any]]] = None
    json_text: Optional[str] = None
    file_name: Optional[str] = Field(None, max_length=255)


class ActiveSourceRequest(BaseModel):
    source_id: str


class QueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    source_id: Optional[str] = None
    connection_id: Optional[str] = None
    schema_id: Optional[str] = None


class RowInsertRequest(BaseModel):
    values: Dict[str, Any] = Field(default_factory=dict)
    confirm_live_insert: bool = False


# ==========================================
# HEALTH & DATA SOURCE UNIFIED ENDPOINTS
# ==========================================

@app.get("/")
def health():
    return {
        "status": "ok",
        "app": "SchemaIQ",
        "version": "2.0.0",
        "active_source": data_source_manager._active_source_id,
    }


@app.get("/api/data-sources")
def list_data_sources():
    """
    Returns all registered connections and imported schemas.
    """
    try:
        return data_source_manager.list_all_data_sources()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list data sources: {str(e)}")


@app.post("/api/data-sources/active")
def set_active_data_source(req: ActiveSourceRequest):
    """
    Sets the active data source for query workspace.
    """
    try:
        return data_source_manager.set_active_source(req.source_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# DATABASE CONNECTIONS ENDPOINTS
# ==========================================

@app.post("/api/connections/test")
def test_connection(req: ConnectionTestRequest):
    """
    Tests a database connection without saving it.
    Never leaks passwords in error messages or response.
    """
    try:
        result = data_source_manager.test_connection(
            host=req.host,
            port=req.port,
            database_name=req.database,
            username=req.username,
            password=req.password,
            ssl_mode=req.ssl_mode,
        )
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["message"])

        return {
            "success": True,
            "message": result["message"],
            "table_count": result.get("table_count", 0),
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection test failed: {str(e)[:120]}")


@app.post("/api/connections")
def register_connection(req: ConnectionRegisterRequest):
    """
    Validates, tests, and registers a database connection in backend memory.
    Returns safe metadata only. Never exposes passwords.
    """
    try:
        conn = data_source_manager.register_connection(
            name=req.connection_name,
            host=req.host,
            port=req.port,
            database_name=req.database,
            username=req.username,
            password=req.password,
            ssl_mode=req.ssl_mode,
        )
        return {
            "success": True,
            "message": "Database connection registered successfully.",
            "connection": conn,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register connection: {str(e)[:120]}")


@app.get("/api/connections")
def get_connections():
    """
    Lists registered database connections for the current workspace.
    Never returns passwords or connection strings.
    """
    return {
        "connections": data_source_manager.list_connections(),
    }


@app.get("/api/connections/{connection_id}/schema")
def get_connection_schema(connection_id: str = Path(...)):
    """
    Retrieves the structured schema and prompt text for a selected connection.
    """
    try:
        conn = data_source_manager.get_connection_safe(connection_id)
        tables = data_source_manager.get_connection_tables(connection_id)
        schema_text = data_source_manager.get_connection_schema_text(connection_id)
        return {
            "connection_id": connection_id,
            "connection_name": conn["name"],
            "tables": tables,
            "schema_text": schema_text,
            "table_count": len(tables),
        }
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read connection schema: {str(e)[:120]}")


@app.post("/api/connections/{connection_id}/refresh")
def refresh_connection_schema(connection_id: str = Path(...)):
    """
    Refreshes schema metadata from the live database.
    """
    try:
        return data_source_manager.refresh_connection(connection_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not refresh schema: {str(e)[:120]}")


@app.delete("/api/connections/{connection_id}")
def delete_connection(connection_id: str = Path(...)):
    """
    Removes a registered connection and disposes its SQLAlchemy engine.
    """
    try:
        data_source_manager.delete_connection(connection_id)
        return {
            "success": True,
            "message": f"Connection '{connection_id}' removed and resources disposed.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete connection: {str(e)}")


# ==========================================
# SCHEMAS IMPORT ENDPOINTS
# ==========================================

@app.post("/api/schemas/import")
def import_schema(req: SchemaImportRequest):
    """
    Accepts pasted SQL, manual tables, uploaded SQL/JSON, or demo schema.
    Validates and parses the schema safely WITHOUT executing any SQL statements.
    """
    try:
        if req.file_name and req.file_name.lower().rsplit(".", 1)[-1] not in {"sql", "json"}:
            raise ValueError("Only .sql and .json schema files are supported.")
        content = req.sql_text or req.json_text or ""
        if len(content.encode("utf-8")) > 500_000:
            raise ValueError("Schema file exceeds maximum allowed size (500KB).")
        schema_detail = data_source_manager.import_schema(
            name=req.name or "",
            source_type=req.source_type,
            sql_text=req.sql_text,
            tables_data=req.tables,
            json_text=req.json_text,
        )
        return {
            "success": True,
            "message": f"Schema imported successfully with {schema_detail['table_count']} tables.",
            "schema": schema_detail,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import schema: {str(e)[:120]}")


@app.get("/api/schemas")
def list_schemas():
    """
    Lists the schemas available in the current session (including demo schema).
    """
    return {
        "schemas": data_source_manager.list_schemas(),
    }


@app.get("/api/schemas/{schema_id}")
def get_schema_detail(schema_id: str = Path(...)):
    """
    Retrieves full details and table structures for an imported schema.
    """
    try:
        return data_source_manager.get_schema_detail(schema_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve schema: {str(e)}")


@app.delete("/api/schemas/{schema_id}")
def delete_schema(schema_id: str = Path(...)):
    """
    Removes an imported schema.
    """
    try:
        data_source_manager.delete_schema(schema_id)
        return {
            "success": True,
            "message": f"Schema '{schema_id}' removed successfully.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete schema: {str(e)}")


# ==========================================
# TABLE DATA MANAGEMENT
# ==========================================

@app.post("/api/schemas/{schema_id}/tables/{table_name}/rows")
def insert_schema_row(schema_id: str, table_name: str, request: RowInsertRequest):
    try:
        source, table = data_source_manager.get_table(schema_id, table_name)
        if source["is_live"]:
            raise HTTPException(status_code=400, detail="This endpoint is only for schema-only data sources.")
        record = sample_records.insert_schema_record(schema_id, table, request.values)
        return {"success": True, "message": "Record inserted successfully.", "record": record}
    except HTTPException:
        raise
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Sample record storage is unavailable.")


@app.get("/api/schemas/{schema_id}/tables/{table_name}/rows")
def get_schema_rows(schema_id: str, table_name: str, limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0)):
    try:
        source, table = data_source_manager.get_table(schema_id, table_name)
        if source["is_live"]:
            raise HTTPException(status_code=400, detail="This endpoint is only for schema-only data sources.")
        rows = sample_records.list_schema_records(schema_id, table, limit, offset)
        return {"success": True, "source_type": "schema", "table": table_name, "rows": rows, "limit": limit, "offset": offset}
    except HTTPException:
        raise
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Sample record storage is unavailable.")


@app.post("/api/connections/{connection_id}/tables/{table_name}/rows")
def insert_connection_row(connection_id: str, table_name: str, request: RowInsertRequest):
    if not request.confirm_live_insert:
        raise HTTPException(status_code=400, detail="Live database insertion requires explicit confirmation.")
    try:
        source, _ = data_source_manager.get_table(connection_id, table_name)
        if not source["is_live"]:
            raise HTTPException(status_code=400, detail="This endpoint is only for connected databases.")
        record = database_module.insert_live_row(source["engine"], table_name, request.values)
        return {"success": True, "message": "Record inserted successfully.", "record": record}
    except HTTPException:
        raise
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except SQLAlchemyError:
        raise HTTPException(status_code=400, detail="The database rejected this record.")


@app.get("/api/connections/{connection_id}/tables/{table_name}/rows")
def get_connection_rows(connection_id: str, table_name: str, limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0)):
    try:
        source, _ = data_source_manager.get_table(connection_id, table_name)
        if not source["is_live"]:
            raise HTTPException(status_code=400, detail="This endpoint is only for connected databases.")
        rows = database_module.list_live_rows(source["engine"], table_name, limit, offset)
        return {"success": True, "source_type": "connection", "table": table_name, "rows": rows, "limit": limit, "offset": offset}
    except HTTPException:
        raise
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="The connected database is unavailable.")


# ==========================================
# SCHEMA INSPECTION (BACKWARD COMPATIBLE)
# ==========================================

@app.get("/api/schema")
def get_current_schema(
    source_id: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
):
    """
    Returns schema text and structured tables for the active or requested data source.
    Fully backwards compatible with original /api/schema.
    """
    target_id = source_id or connection_id
    try:
        source = data_source_manager.get_source(target_id)
        return {
            "schema": source["schema_text"],
            "tables": source["tables"],
            "source_id": source["id"],
            "source_name": source["name"],
            "is_live": source["is_live"],
            "category": source["category"],
        }
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except Exception:
        # Keep the legacy no-argument endpoint available when the default source is unavailable.
        try:
            return {"schema": get_schema()}
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Could not read the database schema.",
            )


# ==========================================
# SCHEMA-AWARE NATURAL LANGUAGE QUERY
# ==========================================

@app.post("/api/query")
def query(request: QueryRequest):
    """
    Generates and executes SQL based on the selected database or imported schema.
    - If a live connection is selected: generates SQL for its schema and executes query.
    - If an imported schema is selected: generates SQL for its schema, disables execution,
      explains why, and does not fabricate results.
    """
    try:
        # SECURITY CHECK 1: Reject destructive requests before calling Gemini
        destructive_pattern = re.compile(
            r"\b(delete|drop|truncate|update|insert|alter|"
            r"create|replace|upsert|grant|revoke)\b",
            re.IGNORECASE,
        )

        if destructive_pattern.search(request.question):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Destructive database operations are not allowed. "
                    "SchemaIQ supports read-only queries only."
                ),
            )

        # 1. Resolve selected data source
        target_source_id = request.source_id or request.connection_id or request.schema_id
        source = data_source_manager.get_source(target_source_id)

        # 2. Get active schema text for this specific source
        active_schema = source["schema_text"]
        if not active_schema or not active_schema.strip():
            raise HTTPException(
                status_code=400,
                detail=f"The selected data source '{source['name']}' has an empty schema.",
            )

        # 3. Generate SQL using Gemini with ONLY the selected source's schema
        generated = generate_sql(request.question, schema=active_schema)

        if not generated["sql"].strip():
            return {
                "success": False,
                "question": request.question,
                "explanation": generated["explanation"],
                "sql": "",
                "columns": [],
                "rows": [],
                "source_id": source["id"],
                "source_name": source["name"],
                "execution_disabled": not source["is_live"],
            }

        # 4. Validate generated SQL using SQLGlot AST
        safe_sql = validate_sql(generated["sql"])
        validate_sql_references(safe_sql, source["tables"])

        # 5. Handle Live Database vs Imported Schema
        if source["is_live"]:
            # Live database connection: execute safely with read-only transaction & timeout
            result = execute_readonly(safe_sql, target_engine=source["engine"])
            return {
                "success": True,
                "question": request.question,
                "sql": safe_sql,
                "explanation": generated["explanation"],
                "columns": result["columns"],
                "rows": result["rows"],
                "truncated": result.get("truncated", False),
                "execution_disabled": False,
                "source_id": source["id"],
                "source_name": source["name"],
                "source_type": "connection",
            }
        else:
            result = sample_records.execute_schema_query(safe_sql, source["id"], source["tables"])
            return {
                "success": True,
                "question": request.question,
                "sql": safe_sql,
                "explanation": (
                    f"{generated['explanation']} "
                    "(Query executed against persisted sample records for the imported schema.)"
                ),
                "columns": result["columns"],
                "rows": result["rows"],
                "truncated": result["truncated"],
                "execution_disabled": False,
                "execution_message": (
                    f"Query executed against stored sample records for '{source['name']}'."
                ),
                "source_id": source["id"],
                "source_name": source["name"],
                "source_type": "schema",
            }

    except HTTPException:
        raise

    except KeyError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        )

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except SQLAlchemyError as error:
        # Don't leak raw credentials in SQLAlchemy exceptions
        clean_err = re.sub(r":[^:@]+@", ":***@", str(error))
        raise HTTPException(
            status_code=400,
            detail=f"Query execution failed: {clean_err[:150]}",
        )

    except Exception as error:
        traceback.print_exc()
        print(f"ERROR TYPE: {type(error).__name__}")
        print(f"ERROR MESSAGE: {error}")

        raise HTTPException(
            status_code=500,
            detail="An unexpected server error occurred.",
        )