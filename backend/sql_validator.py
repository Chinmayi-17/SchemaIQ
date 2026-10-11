
# pyrefly: ignore [missing-import]
import sqlglot
# pyrefly: ignore [missing-import]
from sqlglot import exp

def validate_sql(sql: str) -> str:
    if not sql or not sql.strip():
        raise ValueError("The AI returned an empty SQL query.")

    statements = sqlglot.parse(sql, read="postgres")

    if len(statements) != 1 or statements[0] is None:
        raise ValueError("Only one SQL statement is allowed.")

    tree = statements[0]

    # Only SELECT queries and SELECT-based UNION queries.
    if not isinstance(tree, (exp.Select, exp.Union)):
        raise ValueError("Only SELECT queries are allowed.")

    if tree.find(exp.Into):
        raise ValueError("SELECT INTO is not allowed.")

    # Do not execute queries without an explicit row limit.
    if not tree.args.get("limit"):
        tree = tree.limit(100)

    return tree.sql(dialect="postgres")


def validate_sql_references(sql: str, tables: list[dict]) -> None:
    """Reject table and column references outside the selected schema."""
    statements = sqlglot.parse(sql, read="postgres")
    if len(statements) != 1 or statements[0] is None:
        raise ValueError("Only one SQL statement is allowed.")

    known_tables = {table["name"].lower() for table in tables}
    known_columns = {
        column["name"].lower()
        for table in tables
        for column in table.get("columns", [])
    }
    aliases = {
        alias.alias.lower()
        for alias in statements[0].find_all(exp.Alias)
        if alias.alias
    }
    aliases.update(
        c.alias_or_name.lower()
        for c in statements[0].find_all(exp.CTE)
        if c.alias_or_name
    )

    for table in statements[0].find_all(exp.Table):
        table_name = table.name.lower()
        if table_name not in known_tables and table_name not in aliases:
            raise ValueError(f"Generated SQL references table '{table.name}', which is not in the selected schema.")

    for column in statements[0].find_all(exp.Column):
        column_name = column.name.lower()
        if column_name != "*" and column_name not in known_columns and column_name not in aliases:
            raise ValueError(f"Generated SQL references column '{column.name}', which is not in the selected schema.")