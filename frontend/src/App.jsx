import React, { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import HomeLandingView from "./components/HomeLandingView";
import QueryInput from "./components/QueryInput";
import SqlPanel from "./components/SqlPanel";
import ResultToolbar from "./components/ResultToolbar";
import ResultsTable from "./components/ResultsTable";
import ResultsChart from "./components/ResultsChart";
import RecentQueriesPanel from "./components/RecentQueriesPanel";
import DashboardsView from "./components/DashboardsView";
import DataSourcesView from "./components/DataSourcesView";
import { executeQuery, fetchSchema } from "./api";

const RECENT_QUERIES_KEY = "queryai_recent_queries";
const SAVED_DASHBOARDS_KEY = "queryai_saved_dashboards";

export default function App() {
  // Navigation: "home" is the dedicated landing page by default
  const [activeNav, setActiveNav] = useState("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Query state (preserved on Query Editor)
  const [question, setQuestion] = useState("");
  const [sql, setSql] = useState("");
  const [explanation, setExplanation] = useState("");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [durationMs, setDurationMs] = useState(null);
  const [hasRunQuery, setHasRunQuery] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Visualization mode
  const [viewMode, setViewMode] = useState("table");

  // Schema state
  const [schemaRaw, setSchemaRaw] = useState("");
  const [schemaStatus, setSchemaStatus] = useState("checking");

  // Local storage state: Recent queries with fallback to prior key
  const [recentQueries, setRecentQueries] = useState(() => {
    try {
      const stored =
        localStorage.getItem(RECENT_QUERIES_KEY) ||
        localStorage.getItem("querymind_recent_queries");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Local storage state: Dashboards with fallback to prior key
  const [savedDashboards, setSavedDashboards] = useState(() => {
    try {
      const stored =
        localStorage.getItem(SAVED_DASHBOARDS_KEY) ||
        localStorage.getItem("querymind_saved_dashboards");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Check database connectivity and fetch schema on mount without executing queries
  const loadSchema = useCallback(async () => {
    try {
      setSchemaStatus("checking");
      const data = await fetchSchema();
      setSchemaRaw(data.schema || "");
      setSchemaStatus("connected");
    } catch {
      setSchemaStatus("error");
    }
  }, []);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  // Save recent queries to localStorage
  const persistRecentQueries = (newList) => {
    setRecentQueries(newList);
    try {
      localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(newList));
    } catch (e) {
      console.error("Failed to save recent queries:", e);
    }
  };

  // Save dashboard cards to localStorage
  const persistDashboards = (newList) => {
    setSavedDashboards(newList);
    try {
      localStorage.setItem(SAVED_DASHBOARDS_KEY, JSON.stringify(newList));
    } catch (e) {
      console.error("Failed to save dashboards:", e);
    }
  };

  // Reset/Clear current workspace
  const handleClearWorkspace = () => {
    setQuestion("");
    setSql("");
    setExplanation("");
    setColumns([]);
    setRows([]);
    setTruncated(false);
    setDurationMs(null);
    setHasRunQuery(false);
    setError(null);
    setViewMode("table");
  };

  // Submit query
  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await executeQuery(trimmed);

      const returnedSql = data.sql || "";
      const returnedExplanation = data.explanation || "";
      const returnedColumns = data.columns || [];
      const returnedRows = data.rows || [];
      const returnedTruncated = !!data.truncated;
      const returnedDuration = data.durationMs;

      setSql(returnedSql);
      setExplanation(returnedExplanation);
      setColumns(returnedColumns);
      setRows(returnedRows);
      setTruncated(returnedTruncated);
      setDurationMs(returnedDuration);
      setHasRunQuery(true);
      setViewMode("table");

      // Update recent queries list (deduplicating recent same question, keeping up to 10)
      const newEntry = {
        id: Date.now(),
        question: trimmed,
        sql: returnedSql,
        explanation: returnedExplanation,
        columns: returnedColumns,
        rows: returnedRows,
        rowsCount: returnedRows.length,
        durationMs: returnedDuration,
        timestamp: Date.now(),
      };

      const filtered = recentQueries.filter(
        (q) => q.question.toLowerCase() !== trimmed.toLowerCase()
      );
      const updated = [newEntry, ...filtered].slice(0, 10);
      persistRecentQueries(updated);
    } catch (err) {
      setError(err.message || "Failed to execute query");
    } finally {
      setIsLoading(false);
    }
  };

  // Select a recent query from history
  const handleSelectRecentQuery = (item) => {
    setQuestion(item.question);
    setError(null);

    if (item.sql !== undefined) {
      setSql(item.sql || "");
      setExplanation(item.explanation || "");
      setColumns(item.columns || []);
      setRows(item.rows || []);
      setTruncated(false);
      setDurationMs(item.durationMs || null);
      setHasRunQuery(true);
      setViewMode("table");
    }

    // Always navigate to query-editor when selecting a query
    setActiveNav("query-editor");
  };

  // Add current query to dashboard
  const handleAddToDashboard = () => {
    if (!hasRunQuery || !sql) return;

    const exists = savedDashboards.some((d) => d.question === question && d.sql === sql);
    if (exists) return;

    const newCard = {
      id: Date.now(),
      question,
      sql,
      explanation,
      columns,
      rows,
      rowsCount: rows.length,
      savedAt: Date.now(),
    };

    const updated = [newCard, ...savedDashboards];
    persistDashboards(updated);
  };

  // Check if current query is already saved to dashboard
  const isSavedToDashboard = savedDashboards.some(
    (d) => d.question === question && d.sql === sql && sql !== ""
  );

  // Delete dashboard item
  const handleDeleteDashboardItem = (id) => {
    const updated = savedDashboards.filter((d) => d.id !== id);
    persistDashboards(updated);
  };

  // Run dashboard item in editor
  const handleRunDashboardItem = (card) => {
    setQuestion(card.question);
    setSql(card.sql || "");
    setExplanation(card.explanation || "");
    setColumns(card.columns || []);
    setRows(card.rows || []);
    setTruncated(false);
    setDurationMs(null);
    setHasRunQuery(true);
    setActiveNav("query-editor");
  };

  // Quick query table helper from DataSourcesView
  const handleQueryTable = (starterQuestion) => {
    setQuestion(starterQuestion);
    setActiveNav("query-editor");
  };

  // Check if current results support chart
  const hasChartableData =
    rows &&
    rows.length > 0 &&
    columns &&
    columns.some((col) => {
      return rows.some((r) => {
        const v = r[col];
        return v !== null && v !== undefined && !isNaN(Number(v));
      });
    });

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        recentQueries={recentQueries}
        onSelectQuery={handleSelectRecentQuery}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
      />

      {/* Main Content Area */}
      <main className="app-main-content">
        {/* Render View Based on activeNav */}
        {activeNav === "home" ? (
          /* SECTION 1: DEDICATED INTRODUCTORY LANDING PAGE */
          <HomeLandingView
            onStartQuerying={() => setActiveNav("query-editor")}
            schemaStatus={schemaStatus}
            onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          />
        ) : (
          /* OTHER APP VIEWS (WITH STANDARD HEADER) */
          <>
            <Header
              activeNav={activeNav}
              schemaStatus={schemaStatus}
              onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
            />

            {activeNav === "dashboards" ? (
              <DashboardsView
                savedDashboards={savedDashboards}
                onRunDashboardItem={handleRunDashboardItem}
                onDeleteDashboardItem={handleDeleteDashboardItem}
                onGoToEditor={() => setActiveNav("query-editor")}
              />
            ) : activeNav === "data-sources" ? (
              <DataSourcesView
                schemaRaw={schemaRaw}
                schemaStatus={schemaStatus}
                onRefreshSchema={loadSchema}
                onQueryTable={handleQueryTable}
              />
            ) : (
              /* QUERY EDITOR: THE FULL SQL QUERY WORKSPACE */
              <div className="query-workspace-layout">
                {/* Left Column: Main Query Workspace */}
                <div className="workspace-main-column">
                  {/* Question Input Card */}
                  <QueryInput
                    question={question}
                    setQuestion={setQuestion}
                    onSubmit={handleAsk}
                    onClearWorkspace={handleClearWorkspace}
                    hasRunQuery={hasRunQuery}
                    isLoading={isLoading}
                    error={error}
                    onClearError={() => setError(null)}
                  />

                  {/* Generated SQL Panel */}
                  <SqlPanel sql={sql} explanation={explanation} />

                  {/* Results Toolbar */}
                  {hasRunQuery && (
                    <ResultToolbar
                      rowsCount={rows.length}
                      columns={columns}
                      rows={rows}
                      durationMs={durationMs}
                      truncated={truncated}
                      viewMode={viewMode}
                      setViewMode={setViewMode}
                      hasChartableData={hasChartableData}
                      onAddToDashboard={handleAddToDashboard}
                      isSavedToDashboard={isSavedToDashboard}
                      onClearWorkspace={handleClearWorkspace}
                    />
                  )}

                  {/* Results Display */}
                  {viewMode === "chart" && hasChartableData ? (
                    <ResultsChart columns={columns} rows={rows} />
                  ) : (
                    <ResultsTable
                      columns={columns}
                      rows={rows}
                      hasRunQuery={hasRunQuery}
                      truncated={truncated}
                    />
                  )}
                </div>

                {/* Right Column: Recent Queries Card */}
                <div className="workspace-recent-column">
                  <RecentQueriesPanel
                    recentQueries={recentQueries}
                    onSelectQuery={handleSelectRecentQuery}
                    currentQuestion={question}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
