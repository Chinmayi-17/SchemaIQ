-- Run once in the Supabase SQL editor.
-- These application-managed tables store imported schema metadata and sample rows.
-- Uploaded CREATE TABLE statements are never executed by QueryAI.

CREATE TABLE IF NOT EXISTS queryai_schema_metadata (
    schema_id VARCHAR(120) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    schema_text TEXT NOT NULL,
    tables_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queryai_schema_records (
    schema_id VARCHAR(120) NOT NULL REFERENCES queryai_schema_metadata(schema_id) ON DELETE CASCADE,
    table_name VARCHAR(255) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    "values" JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (schema_id, table_name, record_id)
);

CREATE INDEX IF NOT EXISTS queryai_schema_records_lookup
    ON queryai_schema_records (schema_id, table_name, created_at DESC);
