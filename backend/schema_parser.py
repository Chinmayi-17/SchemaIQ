import json
import re
import sqlglot
from sqlglot import exp

DEMO_ECOMMERCE_SQL = """
CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    city VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    product_name VARCHAR(150) NOT NULL,
    category VARCHAR(100),
    price NUMERIC(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0
);

CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id),
    total_amount NUMERIC(10, 2) NOT NULL,
    order_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'completed'
);

CREATE TABLE order_items (
    item_id INTEGER PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id),
    product_id INTEGER REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL
);
"""


def parse_ddl_schema(sql_text: str) -> tuple[str, list]:
    """
    Parses PostgreSQL DDL SQL (CREATE TABLE statements) safely using SQLGlot AST
    WITHOUT executing any SQL statements against any database.
    Returns: (schema_prompt_string, structured_tables_list)
    """
    if not sql_text or not sql_text.strip():
        raise ValueError("Schema SQL text is empty.")

    # Limit schema input size to 500KB to prevent abuse
    if len(sql_text) > 500_000:
        raise ValueError("Schema text exceeds maximum allowed size (500KB).")

    try:
        statements = sqlglot.parse(sql_text, read="postgres")
    except Exception as e:
        raise ValueError(f"Could not parse SQL syntax: {str(e)}")

    tables = []
    schema_lines = []

    for ast in statements:
        if not ast:
            continue

        # Look for CREATE TABLE statements
        tbl_node = ast.find(exp.Table)
        if not tbl_node:
            continue

        table_name = tbl_node.name.strip('"\'')
        if not table_name:
            continue

        columns = []
        relationships = []
        col_strs = []
        table_definition = str(ast)
        table_checks = [match.strip() for match in re.findall(r"CHECK\s*\(([^()]*(?:\([^)]*\)[^()]*)*)\)", table_definition, re.IGNORECASE)]
        table_pk_match = re.search(r"PRIMARY\s+KEY\s*\(([^)]+)\)", table_definition, re.IGNORECASE)
        table_unique_match = re.findall(r"UNIQUE\s*\(([^)]+)\)", table_definition, re.IGNORECASE)

        # Find column definitions
        for col_def in ast.find_all(exp.ColumnDef):
            col_name = col_def.name.strip('"\'')
            if not col_name:
                continue

            raw_definition = str(col_def)
            upper_definition = raw_definition.upper()
            col_type = str(col_def.kind) if col_def.kind else "TEXT"
            is_pk = (
                bool(col_def.find(exp.PrimaryKeyColumnConstraint))
                or "PRIMARY KEY" in upper_definition
            )
            auto_generated = (
                col_type.upper().startswith("SERIAL")
                or "IDENTITY" in upper_definition
            )
            check_match = re.search(r"CHECK\s*\((.+)\)", raw_definition, re.IGNORECASE)

            # Check column-level foreign key references
            fk_ref = col_def.find(exp.Reference)
            foreign_key_target = None
            if fk_ref:
                target_tbl_node = fk_ref.find(exp.Table)
                target_tbl = target_tbl_node.name if target_tbl_node else ""
                target_col_nodes = [
                    i.name for i in fk_ref.find_all(exp.Identifier) if i.name != target_tbl
                ]
                target_col = target_col_nodes[0] if target_col_nodes else col_name
                if target_tbl:
                    foreign_key_target = f"{target_tbl}.{target_col}"
                    relationships.append(
                        f"Relationship: {table_name}.['{col_name}'] -> {target_tbl}.['{target_col}']"
                    )

            columns.append({
                "name": col_name,
                "type": col_type,
                "primary_key": is_pk,
                "required": is_pk or "NOT NULL" in upper_definition,
                "nullable": not (is_pk or "NOT NULL" in upper_definition),
                "auto_generated": auto_generated,
                "unique": "UNIQUE" in upper_definition,
                "foreign_key_target": foreign_key_target,
                "check": check_match.group(1).strip() if check_match else None,
            })
            col_strs.append(f"{col_name} ({col_type})")

        # Find table-level foreign key constraints (e.g. FOREIGN KEY (a) REFERENCES b(c))
        for fk_constraint in ast.find_all(exp.ForeignKey):
            try:
                raw_fk_str = str(fk_constraint)
                m = re.search(
                    r"FOREIGN\s+KEY\s*\((.*?)\)\s*REFERENCES\s*([a-zA-Z0-9_]+)\s*\((.*?)\)",
                    raw_fk_str,
                    re.IGNORECASE,
                )
                if m:
                    src_col = m.group(1).strip().strip('"\'')
                    tgt_tbl = m.group(2).strip().strip('"\'')
                    tgt_col = m.group(3).strip().strip('"\'')
                    rel_line = f"Relationship: {table_name}.['{src_col}'] -> {tgt_tbl}.['{tgt_col}']"
                    if rel_line not in relationships:
                        relationships.append(rel_line)
                    for column in columns:
                        if column["name"] == src_col:
                            column["foreign_key_target"] = f"{tgt_tbl}.{tgt_col}"
            except Exception:
                pass

        if not columns:
            continue

        # Annotate columns with foreign_key flag based on detected relationships
        for col in columns:
            c_name = col["name"]
            if table_pk_match and c_name in {item.strip().strip('"') for item in table_pk_match.group(1).split(',')}:
                col["primary_key"] = True
                col["required"] = True
                col["nullable"] = False
            if any(c_name in {item.strip().strip('"') for item in group.split(',')} for group in table_unique_match):
                col["unique"] = True
            is_fk = any(f"['{c_name}']" in rel or f".{c_name} " in rel for rel in relationships)
            col["foreign_key"] = is_fk

        schema_lines.append(f"Table {table_name}: " + ", ".join(col_strs))
        for rel in relationships:
            schema_lines.append(rel)

        tables.append({
            "name": table_name,
            "columns": columns,
            "relationships": relationships,
            "checks": table_checks,
        })

    if not tables:
        raise ValueError(
            "No valid CREATE TABLE statements found in the provided schema. "
            "Please provide valid PostgreSQL table definitions."
        )

    schema_str = "\n".join(schema_lines)
    return schema_str, tables


def parse_manual_schema(tables_data: list) -> tuple[str, list]:
    """
    Parses manually entered table structure into schema string and structured list.
    """
    if not tables_data or not isinstance(tables_data, list):
        raise ValueError("Please provide at least one table definition.")

    tables = []
    schema_lines = []

    for t in tables_data:
        name = str(t.get("name", "")).strip().lower()
        if not name:
            continue

        columns = []
        col_strs = []
        relationships = []

        raw_cols = t.get("columns", [])
        for c in raw_cols:
            col_name = str(c.get("name", "")).strip().lower()
            if not col_name:
                continue

            col_type = str(c.get("type", "TEXT")).strip().upper()
            is_pk = bool(c.get("primary_key", False))
            fk_target = str(c.get("foreign_key", "")).strip()

            columns.append({
                "name": col_name,
                "type": col_type,
                "primary_key": is_pk,
                "required": is_pk or bool(c.get("required", False)),
                "nullable": not (is_pk or bool(c.get("required", False))),
                "auto_generated": bool(c.get("auto_generated", False)),
                "unique": bool(c.get("unique", False)),
                "foreign_key": bool(fk_target and fk_target != "false"),
                "foreign_key_target": fk_target if fk_target and fk_target != "false" else None,
                "check": c.get("check"),
            })
            col_strs.append(f"{col_name} ({col_type})")

            if fk_target and "." in fk_target:
                tgt_tbl, tgt_col = fk_target.split(".", 1)
                relationships.append(
                    f"Relationship: {name}.['{col_name}'] -> {tgt_tbl.strip()}.['{tgt_col.strip()}']"
                )

        if not columns:
            continue

        schema_lines.append(f"Table {name}: " + ", ".join(col_strs))
        for rel in relationships:
            schema_lines.append(rel)

        tables.append({
            "name": name,
            "columns": columns,
            "relationships": relationships,
            "checks": [],
        })

    if not tables:
        raise ValueError("At least one table with columns is required.")

    schema_str = "\n".join(schema_lines)
    return schema_str, tables


def parse_json_schema(json_text: str) -> tuple[str, list]:
    """
    Parses uploaded JSON schema files safely into schema string and structured list.
    Supports formats:
    1. {"tables": [{"name": "...", "columns": [...]}]}
    2. [{"name": "...", "columns": [...]}]
    3. {"table_name": [{"name": "col", "type": "int"}, ...]}
    4. {"table_name": {"col1": "int", "col2": "varchar"}}
    """
    if not json_text or not json_text.strip():
        raise ValueError("JSON schema content is empty.")

    if len(json_text) > 500_000:
        raise ValueError("JSON schema exceeds maximum allowed size (500KB).")

    try:
        data = json.loads(json_text)
    except Exception as e:
        raise ValueError(f"Invalid JSON format: {str(e)}")

    tables_list = []

    if isinstance(data, dict):
        if "tables" in data and isinstance(data["tables"], list):
            tables_list = data["tables"]
        else:
            # Format: {"users": [{"name": "id", ...}]} or {"users": {"id": "int"}}
            for t_name, t_val in data.items():
                if isinstance(t_val, list):
                    tables_list.append({"name": t_name, "columns": t_val})
                elif isinstance(t_val, dict):
                    cols = [
                        {"name": c_name, "type": str(c_type), "primary_key": c_name.lower().endswith("_id") or c_name.lower() == "id"}
                        for c_name, c_type in t_val.items()
                    ]
                    tables_list.append({"name": t_name, "columns": cols})
    elif isinstance(data, list):
        tables_list = data
    else:
        raise ValueError("JSON root must be an object or an array of tables.")

    return parse_manual_schema(tables_list)


def get_demo_ecommerce_schema() -> tuple[str, list]:
    """
    Returns the ready-to-use E-Commerce demo schema.
    """
    return parse_ddl_schema(DEMO_ECOMMERCE_SQL)
