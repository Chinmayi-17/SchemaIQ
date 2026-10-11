import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileCode2,
  FileUp,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteConnection,
  deleteSchema,
  importSchema,
  fetchTableRows,
  insertTableRow,
  saveConnection,
  testConnection,
} from "../api";

const initialConnection = {
  connection_name: "",
  host: "",
  port: 5432,
  database: "",
  username: "",
  password: "",
  ssl_mode: "require",
};

const exampleSchema = `CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(255)
);

CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id),
    total_amount NUMERIC(10, 2),
    order_date DATE
);`;

const blankTable = () => ({
  name: "",
  columns: [{ name: "", type: "TEXT", primary_key: false, foreign_key: "" }],
});

function errorMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

export default function DataSourcesView({
  schemaTables,
  schemaStatus,
  dataSources,
  initialMode = "connect",
  activeSourceId,
  onSourceChange,
  onDataSourcesChanged,
  onRefreshSchema,
  onQueryTable,
}) {
  const [mode, setMode] = useState(initialMode);
  const [connection, setConnection] = useState(initialConnection);
  const [connectionMessage, setConnectionMessage] = useState(null);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [schemaMode, setSchemaMode] = useState("pasted");
  const [schemaName, setSchemaName] = useState("");
  const [schemaSql, setSchemaSql] = useState(exampleSchema);
  const [schemaFileName, setSchemaFileName] = useState("");
  const [manualTables, setManualTables] = useState([blankTable()]);
  const [schemaMessage, setSchemaMessage] = useState(null);
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [expandedTables, setExpandedTables] = useState({});
  const [tableSearch, setTableSearch] = useState("");
  const [tablePanel, setTablePanel] = useState(null);
  const [tableRows, setTableRows] = useState([]);
  const [tableBusy, setTableBusy] = useState(false);
  const [tableMessage, setTableMessage] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [referenceRows, setReferenceRows] = useState({});
  const [tableOffset, setTableOffset] = useState(0);
  const [tableHasNext, setTableHasNext] = useState(false);

  const activeSource = dataSources.find((source) => source.id === activeSourceId);
  const tables = schemaTables || [];
  const search = tableSearch.toLowerCase();
  const filteredTables = tables.filter((table) => table.name.toLowerCase().includes(search));

  const updateConnection = (field, value) => {
    setConnectionMessage(null);
    setConnection((current) => ({ ...current, [field]: value }));
  };

  const runConnectionTest = async () => {
    setConnectionBusy(true);
    setConnectionMessage(null);
    try {
      const result = await testConnection(connection);
      setConnectionMessage({ type: "success", text: result.message || "Connection successful." });
    } catch (error) {
      setConnectionMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setConnectionBusy(false);
    }
  };

  const registerConnection = async () => {
    setConnectionBusy(true);
    setConnectionMessage(null);
    try {
      const result = await saveConnection(connection);
      setConnectionMessage({ type: "success", text: "Connection registered in backend memory. Credentials are not stored in the browser." });
      setConnection(initialConnection);
      await onDataSourcesChanged(result.connection?.id);
    } catch (error) {
      setConnectionMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setConnectionBusy(false);
    }
  };

  const updateTable = (tableIndex, field, value) => {
    setManualTables((current) => current.map((table, index) => (
      index === tableIndex ? { ...table, [field]: value } : table
    )));
  };

  const updateColumn = (tableIndex, columnIndex, field, value) => {
    setManualTables((current) => current.map((table, index) => (
      index === tableIndex
        ? {
            ...table,
            columns: table.columns.map((column, columnIndexToUpdate) => (
              columnIndexToUpdate === columnIndex ? { ...column, [field]: value } : column
            )),
          }
        : table
    )));
  };

  const readSchemaFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (!["sql", "json"].includes(extension)) {
      setSchemaMessage({ type: "error", text: "Choose a .sql or .json schema file." });
      return;
    }
    if (file.size > 500 * 1024) {
      setSchemaMessage({ type: "error", text: "Schema files must be 500KB or smaller." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSchemaName(file.name.replace(/\.(sql|json)$/i, ""));
      setSchemaFileName(file.name);
      setSchemaMode(extension === "json" ? "json" : "pasted");
      setSchemaSql(String(reader.result || ""));
      setSchemaMessage({ type: "success", text: `${file.name} loaded and ready to validate.` });
    };
    reader.onerror = () => setSchemaMessage({ type: "error", text: "Could not read that file." });
    reader.readAsText(file);
  };

  const submitSchema = async () => {
    setSchemaBusy(true);
    setSchemaMessage(null);
    try {
      const payload = {
        name: schemaName || undefined,
        file_name: schemaFileName || undefined,
        source_type: schemaMode,
        ...(schemaMode === "manual" ? { tables: manualTables } : schemaMode === "json" ? { json_text: schemaSql } : { sql_text: schemaSql }),
      };
      const result = await importSchema(payload);
      setSchemaMessage({ type: "success", text: result.message || "Schema imported successfully." });
      await onDataSourcesChanged(result.schema?.id);
    } catch (error) {
      setSchemaMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setSchemaBusy(false);
    }
  };

  const removeSource = async (source) => {
    if (!window.confirm(`Remove ${source.name}?`)) return;
    try {
      if (source.category === "connection") await deleteConnection(source.id);
      else await deleteSchema(source.id);
      await onDataSourcesChanged();
    } catch (error) {
      setSchemaMessage({ type: "error", text: errorMessage(error) });
    }
  };

  const loadTableRows = async (source, table, offset = 0) => {
    setTableBusy(true);
    setTableMessage(null);
    try {
      const result = await fetchTableRows(source, table.name, 100, offset);
      setTableRows(result.rows || []);
      setTableOffset(offset);
      setTableHasNext((result.rows || []).length === 100);
    } catch (error) {
      setTableMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setTableBusy(false);
    }
  };

  const openTablePanel = async (table, panelMode) => {
    setTablePanel({ table, mode: panelMode });
    setFormValues({});
    setReferenceRows({});
    setTableMessage(null);
    setTableOffset(0);
    try {
      if (panelMode === "data" || panelMode === "insert") {
        await loadTableRows(activeSource, table);
      }
      if (panelMode === "insert") {
        const foreignKeys = table.columns.filter((column) => column.foreign_key_target);
        const references = {};
        for (const column of foreignKeys) {
          const [targetTable] = column.foreign_key_target.split(".");
          const target = tables.find((item) => item.name === targetTable);
          if (target) {
            try {
              const result = await fetchTableRows(activeSource, target.name);
              references[column.name] = result.rows || [];
            } catch {
              references[column.name] = [];
            }
          }
        }
        setReferenceRows(references);
      }
    } finally {
      setTableBusy(false);
    }
  };

  const submitTableRow = async (event) => {
    event.preventDefault();
    if (!activeSource || !tablePanel) return;
    setTableBusy(true);
    setTableMessage(null);
    try {
      const values = Object.fromEntries(Object.entries(formValues).filter(([, value]) => value !== "" && value !== null && value !== undefined));
      const confirmLive = activeSource.category === "connection" && window.confirm("Insert this record into the live database? This change cannot be undone automatically.");
      if (activeSource.category === "connection" && !confirmLive) {
        setTableBusy(false);
        return;
      }
      await insertTableRow(activeSource, tablePanel.table.name, values, confirmLive);
      setTableMessage({ type: "success", text: "Record inserted successfully." });
      setFormValues({});
      await loadTableRows(activeSource, tablePanel.table, 0);
      setTablePanel((current) => ({ ...current, mode: "data" }));
    } catch (error) {
      setTableMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setTableBusy(false);
    }
  };

  const inputTypeFor = (column) => {
    const type = column.type.toUpperCase();
    if (type.includes("BOOL")) return "checkbox";
    if (type.includes("DATE") && !type.includes("TIME")) return "date";
    if (type.includes("TIMESTAMP") || type.includes("TIME")) return "datetime-local";
    if (type.includes("INT") || type.includes("NUMERIC") || type.includes("DECIMAL") || type.includes("REAL") || type.includes("DOUBLE")) return "number";
    return "text";
  };

  const renderTablePanel = () => {
    if (!tablePanel || !activeSource) return null;
    const { table, mode: panelMode } = tablePanel;
    const visibleColumns = table.columns.filter((column) => !(column.primary_key && column.auto_generated));
    return (
      <div className="table-data-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTablePanel(null); }}>
        <section className="table-data-panel" role="dialog" aria-modal="true" aria-labelledby="table-data-title">
          <div className="table-data-panel-header"><div><div className="eyebrow-label">{activeSource.category === "connection" ? "Live database" : "Schema sample data"}</div><h3 id="table-data-title">{table.name}</h3></div><button type="button" className="icon-danger-button" onClick={() => setTablePanel(null)} aria-label="Close table panel">×</button></div>
          <div className="table-panel-tabs"><button type="button" className={panelMode === "structure" ? "active" : ""} onClick={() => setTablePanel({ table, mode: "structure" })}>View Structure</button><button type="button" className={panelMode === "data" ? "active" : ""} onClick={() => openTablePanel(table, "data")}>View Data</button><button type="button" className={panelMode === "insert" ? "active" : ""} onClick={() => openTablePanel(table, "insert")}>Insert Data</button></div>
          {tableMessage && <Feedback message={tableMessage} />}
          {panelMode === "structure" && <div className="table-panel-structure">{table.columns.map((column) => <div className="table-panel-column" key={column.name}><strong>{column.name}</strong><span>{column.type}</span><small>{column.primary_key ? "PRIMARY KEY" : column.foreign_key ? `FK → ${column.foreign_key_target || "reference"}` : column.required ? "REQUIRED" : "NULLABLE"}</small></div>)}{table.relationships?.map((relationship) => <div className="rel-item" key={relationship}>{relationship}</div>)}</div>}
          {panelMode === "data" && <div className="table-panel-data">{tableBusy ? <div className="table-panel-empty">Loading records...</div> : tableRows.length ? <><div className="table-panel-table-wrap"><table className="table-panel-table"><thead><tr>{table.columns.map((column) => <th key={column.name}>{column.name}</th>)}</tr></thead><tbody>{tableRows.map((row, index) => <tr key={row[table.columns.find((column) => column.primary_key)?.name] ?? index}>{table.columns.map((column) => <td key={column.name}>{row[column.name] === null || row[column.name] === undefined ? "—" : String(row[column.name])}</td>)}</tr>)}</tbody></table></div><div className="table-pagination"><button type="button" className="btn-secondary-action" disabled={tableOffset === 0 || tableBusy} onClick={() => loadTableRows(activeSource, table, Math.max(0, tableOffset - 100))}>Previous</button><span>Rows {tableOffset + 1}–{tableOffset + tableRows.length}</span><button type="button" className="btn-secondary-action" disabled={!tableHasNext || tableBusy} onClick={() => loadTableRows(activeSource, table, tableOffset + 100)}>Next</button></div></> : <div className="table-panel-empty">No records yet. Insert the first record.</div>}</div>}
          {panelMode === "insert" && <form className="table-insert-form" onSubmit={submitTableRow}>{visibleColumns.map((column) => { const inputType = inputTypeFor(column); const reference = column.foreign_key_target ? referenceRows[column.name] || [] : []; const [targetTable, targetColumn] = (column.foreign_key_target || "").split("."); return <label className="table-form-field" key={column.name}><span>{column.name}{column.required ? " *" : ""}</span>{reference.length ? <select value={formValues[column.name] || ""} required={column.required} onChange={(event) => setFormValues((current) => ({ ...current, [column.name]: event.target.value }))}><option value="">Select {targetTable}</option>{reference.map((row) => <option key={row[targetColumn]} value={row[targetColumn]}>{row[targetColumn]}{row.name ? ` · ${row.name}` : ""}</option>)}</select> : inputType === "checkbox" ? <input type="checkbox" checked={Boolean(formValues[column.name])} onChange={(event) => setFormValues((current) => ({ ...current, [column.name]: event.target.checked }))} /> : <input type={inputType} step={inputType === "number" ? "any" : undefined} required={column.required} value={formValues[column.name] || ""} onChange={(event) => setFormValues((current) => ({ ...current, [column.name]: event.target.value }))} />}</label>; })}<div className="table-insert-actions"><button type="button" className="btn-secondary-action" onClick={() => setTablePanel(null)}>Cancel</button><button type="submit" className="btn-primary-action" disabled={tableBusy}>{tableBusy ? "Inserting..." : "Insert Record"}</button></div></form>}
        </section>
      </div>
    );
  };

  const addTable = () => setManualTables((current) => [...current, blankTable()]);
  const removeTable = (index) => setManualTables((current) => current.filter((_, tableIndex) => tableIndex !== index));

  return (
    <div className="datasources-view-container">
      <div className="datasources-intro">
        <div>
          <div className="eyebrow-label">Workspace configuration</div>
          <h2>Data Sources</h2>
          <p>Connect a database or provide a schema to start querying your data with AI.</p>
        </div>
        <div className="memory-note"><ShieldCheck size={15} /> Connections live in backend memory and may need to be configured again after a restart.</div>
      </div>

      <div className="datasource-option-grid">
        <button type="button" className={`datasource-option ${mode === "connect" ? "selected" : ""}`} onClick={() => setMode("connect")}>
          <Database size={20} />
          <span><strong>Connect your database</strong><small>Connect a supported PostgreSQL database to query live data.</small></span>
        </button>
        <button type="button" className={`datasource-option ${mode === "schema" ? "selected" : ""}`} onClick={() => setMode("schema")}>
          <FileCode2 size={20} />
          <span><strong>Import your schema</strong><small>Provide your database structure so QueryAI can generate SQL for your tables.</small></span>
        </button>
      </div>

      {mode === "connect" ? (
        <section className="datasource-form-section">
          <div className="ds-section-toolbar"><div className="section-title-wrap"><h3>Connect your database</h3><span className="section-subtitle">PostgreSQL connections are tested before they are registered.</span></div><KeyRound size={18} className="ds-icon" /></div>
          <div className="connection-form-grid">
            {[["connection_name", "Connection name", "e.g. Reporting database"], ["host", "Host", "db.example.com"], ["port", "Port", "5432"], ["database", "Database name", "postgres"], ["username", "Username", "readonly_user"], ["password", "Password", "Database password"]].map(([field, label, placeholder]) => (
              <label key={field} className="form-field"><span>{label}</span><input type={field === "password" ? "password" : "text"} value={connection[field]} placeholder={placeholder} onChange={(event) => updateConnection(field, field === "port" ? Number(event.target.value) : event.target.value)} /></label>
            ))}
            <label className="form-field"><span>SSL mode</span><select value={connection.ssl_mode} onChange={(event) => updateConnection("ssl_mode", event.target.value)}><option value="require">Require (recommended)</option><option value="verify-full">Verify full</option><option value="prefer">Prefer</option><option value="disable">Disable (local only)</option></select></label>
          </div>
          {connectionMessage && <Feedback message={connectionMessage} />}
          <div className="form-actions"><button type="button" className="btn-secondary-action" onClick={() => setConnection(initialConnection)}>Cancel</button><button type="button" className="btn-secondary-action" onClick={runConnectionTest} disabled={connectionBusy}>{connectionBusy ? <Loader2 size={15} className="spin-icon" /> : <ShieldCheck size={15} />} Test Connection</button><button type="button" className="btn-primary-action" onClick={registerConnection} disabled={connectionBusy}>Save Connection</button></div>
        </section>
      ) : (
        <section className="datasource-form-section">
          <div className="ds-section-toolbar"><div className="section-title-wrap"><h3>Import your schema</h3><span className="section-subtitle">Schema definitions are parsed, never executed.</span></div><Upload size={18} className="ds-icon" /></div>
          <label className="form-field schema-name-field"><span>Schema name</span><input value={schemaName} placeholder="Customer orders schema" onChange={(event) => setSchemaName(event.target.value)} /></label>
          <div className="schema-method-tabs"><button type="button" className={schemaMode === "pasted" ? "active" : ""} onClick={() => setSchemaMode("pasted")}>Paste schema SQL</button><button type="button" className={schemaMode === "manual" ? "active" : ""} onClick={() => setSchemaMode("manual")}>Enter manually</button><label className="file-picker"><FileUp size={14} /> Upload .sql / .json<input type="file" accept=".sql,.json,application/json" onChange={readSchemaFile} /></label></div>
          {schemaMode === "manual" ? <div className="manual-schema-builder">{manualTables.map((table, tableIndex) => <div className="manual-table-block" key={tableIndex}><div className="manual-table-header"><input value={table.name} placeholder="table_name" onChange={(event) => updateTable(tableIndex, "name", event.target.value)} /><button type="button" className="icon-danger-button" onClick={() => removeTable(tableIndex)} title="Remove table"><Trash2 size={14} /></button></div>{table.columns.map((column, columnIndex) => <div className="manual-column-row" key={columnIndex}><input value={column.name} placeholder="column_name" onChange={(event) => updateColumn(tableIndex, columnIndex, "name", event.target.value)} /><input value={column.type} placeholder="TEXT" onChange={(event) => updateColumn(tableIndex, columnIndex, "type", event.target.value)} /><label className="check-label"><input type="checkbox" checked={column.primary_key} onChange={(event) => updateColumn(tableIndex, columnIndex, "primary_key", event.target.checked)} /> PK</label><input value={column.foreign_key} placeholder="table.column (optional)" onChange={(event) => updateColumn(tableIndex, columnIndex, "foreign_key", event.target.value)} /><button type="button" className="icon-danger-button" onClick={() => setManualTables((current) => current.map((item, index) => index === tableIndex ? { ...item, columns: item.columns.filter((_, itemIndex) => itemIndex !== columnIndex) } : item))} title="Remove column"><Trash2 size={13} /></button></div>)}<button type="button" className="add-column-button" onClick={() => setManualTables((current) => current.map((item, index) => index === tableIndex ? { ...item, columns: [...item.columns, { name: "", type: "TEXT", primary_key: false, foreign_key: "" }] } : item))}><Plus size={13} /> Add column</button></div>)}<button type="button" className="btn-secondary-action" onClick={addTable}><Plus size={14} /> Add table</button></div> : <textarea className="schema-editor" value={schemaSql} onChange={(event) => setSchemaSql(event.target.value)} placeholder={schemaMode === "json" ? '{"tables": [...]}' : exampleSchema} spellCheck="false" />}
          {schemaMessage && <Feedback message={schemaMessage} />}
          <div className="form-actions"><button type="button" className="btn-secondary-action" onClick={() => { setSchemaSql(""); setSchemaMessage(null); }}>Clear</button><button type="button" className="btn-primary-action" onClick={submitSchema} disabled={schemaBusy}>{schemaBusy ? <Loader2 size={15} className="spin-icon" /> : <Upload size={15} />} Import Schema</button></div>
        </section>
      )}

      <section className="registered-sources-section">
        <div className="ds-section-toolbar"><div className="section-title-wrap"><h3>Configured sources</h3><span className="section-subtitle">Select the source that QueryAI should use for SQL generation.</span></div><span className="source-count">{dataSources.length} sources</span></div>
        <div className="source-list">{dataSources.map((source) => <div className={`source-list-item ${source.id === activeSourceId ? "active" : ""}`} key={source.id}><button type="button" className="source-select-button" onClick={() => onSourceChange(source.id)}><span className={`source-status-dot ${source.is_live ? "live" : "schema"}`} /><span><strong>{source.name}</strong><small>{source.database_type} · {source.is_live ? source.status : "schema only"} · {source.table_count ?? 0} tables</small></span></button><div className="source-item-actions">{source.id === activeSourceId && <span className="active-label">Active</span>}{!source.is_default && <button type="button" className="icon-danger-button" onClick={() => removeSource(source)} title={`Remove ${source.name}`}><Trash2 size={14} /></button>}</div></div>)}</div>
      </section>

      <section className="ds-tables-section">
        <div className="ds-section-toolbar"><div className="section-title-wrap"><h3>Schema inspector</h3><span className="section-subtitle">{activeSource ? `${activeSource.name} · ${tables.length} tables · ${tables.reduce((count, table) => count + table.columns.length, 0)} columns` : "Select a data source to inspect its schema."}</span></div><div className="inspector-actions"><label className="table-search"><Search size={14} /><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="Search tables" /></label>{activeSource?.is_live && <button type="button" className="btn-refresh-schema" onClick={onRefreshSchema}><RefreshCw size={13} /> Refresh</button>}</div></div>
        {filteredTables.length ? <div className="inspector-table-list">{filteredTables.map((table) => { const expanded = expandedTables[table.name] !== false; return <div className="inspector-table" key={table.name}><div className="inspector-table-toggle"><button type="button" className="inspector-table-name" onClick={() => setExpandedTables((current) => ({ ...current, [table.name]: !expanded }))}><span>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Table2 size={15} className="table-title-icon" /><strong>{table.name}</strong><span className="table-column-count">{table.columns.length} columns</span></span></button><div className="table-action-group"><button type="button" className="btn-query-table" onClick={() => onQueryTable(`Show all records from ${table.name} limit 20`)}>Query</button><button type="button" className="table-action-button" onClick={() => openTablePanel(table, "structure")}>View Structure</button><button type="button" className="table-action-button" onClick={() => openTablePanel(table, "data")}>View Data</button><button type="button" className="table-action-button primary" onClick={() => openTablePanel(table, "insert")}>Insert Data</button></div></div>{expanded && <div className="inspector-column-list">{table.columns.map((column) => <div className="inspector-column" key={column.name}><span className="column-spec-name">{column.name}</span><span className="column-spec-type">{column.type}</span><span className="column-constraint">{column.primary_key ? "PRIMARY KEY" : column.foreign_key ? "FOREIGN KEY" : ""}</span></div>)}{table.relationships?.map((relationship) => <div className="rel-item" key={relationship}>{relationship}</div>)}</div>}</div>; })}</div> : <div className="empty-inspector"><Table2 size={20} /><span>{schemaStatus === "checking" ? "Loading schema..." : "No tables match this search."}</span></div>}
      </section>
      {renderTablePanel()}
    </div>
  );
}

function Feedback({ message }) {
  return <div className={`form-feedback ${message.type}`} role="status">{message.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}<span>{message.text}</span></div>;
}
