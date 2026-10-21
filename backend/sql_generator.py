import json
import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

from database import get_schema

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is missing from .env")

client = genai.Client(api_key=api_key)
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")


def generate_sql(question: str, schema: str = None) -> dict:
    active_schema = schema if schema and schema.strip() else get_schema()

    prompt = f"""
You are SchemaIQ, a PostgreSQL query-generation assistant.

DATABASE SCHEMA:
{active_schema}

USER QUESTION:
{question}

RULES:
- Generate exactly one read-only SELECT query.
- Use only tables and columns present in the provided schema.
- Use explicit JOIN conditions where needed.
- Never generate INSERT, UPDATE, DELETE, DROP, ALTER,
  CREATE, GRANT, REVOKE, or other modifying statements.
- Never invent data, tables, or columns not in the schema.
- If the question is ambiguous or cannot be answered from
  the schema, return an empty sql string and explain why.
- Keep results bounded to 100 rows.
- Return valid JSON with exactly these keys:
  sql, explanation

The explanation must describe what the query retrieves.
"""

    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "sql": {"type": "STRING"},
                    "explanation": {"type": "STRING"},
                },
                "required": ["sql", "explanation"],
            },
        ),
    )

    if not response.text:
        raise RuntimeError("Gemini returned an empty response.")

    data = json.loads(response.text)

    if not isinstance(data.get("sql"), str):
        raise RuntimeError("Gemini returned an invalid SQL field.")

    return {
        "sql": data["sql"],
        "explanation": data.get("explanation", ""),
    }