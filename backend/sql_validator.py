
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