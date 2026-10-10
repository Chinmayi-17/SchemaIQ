import React, { useState } from "react";
import { Database, ShieldCheck, RefreshCw, KeyRound, ArrowRight, Table2 } from "lucide-react";

export default function DataSourcesView({
  schemaRaw,
  schemaStatus,
  onRefreshSchema,
  onQueryTable,
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshSchema();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Parse schema lines into structured tables
  const parsedTables = [];
  if (schemaRaw) {
    const lines = schemaRaw.split("\n");
    let currentTable = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("Table ")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const tableName = line.slice(6, colonIdx).trim();
          const colDefs = line.slice(colonIdx + 1).split(",");
          const columns = colDefs.map((colStr) => {
            const trimmed = colStr.trim();
            const parenStart = trimmed.indexOf("(");
            const parenEnd = trimmed.lastIndexOf(")");
            if (parenStart !== -1 && parenEnd !== -1) {
              return {
                name: trimmed.slice(0, parenStart).trim(),
                type: trimmed.slice(parenStart + 1, parenEnd).trim(),
              };
            }
            return { name: trimmed, type: "TEXT" };
          });

          currentTable = {
            name: tableName,
            columns,
            relationships: [],
          };
          parsedTables.push(currentTable);
        }
      } else if (line.startsWith("Relationship:") && currentTable) {
        currentTable.relationships.push(line.replace("Relationship:", "").trim());
      }
    }
  }

  return (
    <div className="datasources-view-container">
      {/* Overview Cards */}
      <div className="datasources-overview-grid">
        <div className="ds-status-card">
          <div className="ds-card-header">
            <Database size={16} className="ds-icon" />
            <span className="ds-card-title">Database Engine</span>
          </div>
          <div className="ds-engine-name">PostgreSQL 15 (Supabase)</div>
          <div className="ds-status-indicator">
            <span className={`status-dot ${schemaStatus === "connected" ? "online" : "checking"}`} />
            <span>{schemaStatus === "connected" ? "Connected & Healthy" : "Checking status..."}</span>
          </div>
        </div>

        <div className="ds-status-card">
          <div className="ds-card-header">
            <ShieldCheck size={16} className="ds-icon success-icon" />
            <span className="ds-card-title">Security & Permissions</span>
          </div>
          <div className="ds-engine-name">Read-Only Safe Mode</div>
          <div className="ds-card-desc">
            SELECT only. DDL & DML operations (INSERT, UPDATE, DELETE, DROP) are strictly blocked.
          </div>
        </div>

        <div className="ds-status-card">
          <div className="ds-card-header">
            <Table2 size={16} className="ds-icon" />
            <span className="ds-card-title">Discovered Tables</span>
          </div>
          <div className="ds-engine-name">{parsedTables.length} Active Tables</div>
          <div className="ds-card-desc">
            Schema parsed live from information_schema.
          </div>
        </div>
      </div>

      {/* Tables Explorer */}
      <div className="ds-tables-section">
        <div className="ds-section-toolbar">
          <div className="section-title-wrap">
            <h3>Discovered Schema & Tables</h3>
            <span className="section-subtitle">Real PostgreSQL tables available for natural-language queries</span>
          </div>

          <button
            type="button"
            className="btn-refresh-schema"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={13} className={isRefreshing ? "spin-icon" : ""} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh Schema"}</span>
          </button>
        </div>

        {parsedTables.length > 0 ? (
          <div className="tables-cards-grid">
            {parsedTables.map((table) => (
              <div key={table.name} className="table-spec-card">
                <div className="table-card-top">
                  <div className="table-card-title-wrap">
                    <Table2 size={16} className="table-title-icon" />
                    <h4 className="table-spec-name">{table.name}</h4>
                  </div>
                  <button
                    type="button"
                    className="btn-query-table"
                    onClick={() => onQueryTable(`Show all records from ${table.name} limit 20`)}
                    title={`Query ${table.name} in editor`}
                  >
                    <span>Query table</span>
                    <ArrowRight size={12} />
                  </button>
                </div>

                <div className="table-columns-list">
                  {table.columns.map((col) => (
                    <div key={col.name} className="column-spec-row">
                      <span className="column-spec-name">{col.name}</span>
                      <span className="column-spec-type">{col.type}</span>
                    </div>
                  ))}
                </div>

                {table.relationships.length > 0 && (
                  <div className="table-relationships-block">
                    <span className="rel-heading">Foreign Key Relationships:</span>
                    {table.relationships.map((rel, rIdx) => (
                      <div key={rIdx} className="rel-item">
                        {rel}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="raw-schema-fallback">
            <pre>{schemaRaw || "Loading database schema..."}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
