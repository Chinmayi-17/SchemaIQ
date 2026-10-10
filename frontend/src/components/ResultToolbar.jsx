import React from "react";
import {
  Download,
  Table as TableIcon,
  BarChart2,
  BookmarkPlus,
  Clock,
  Check,
  RotateCcw,
} from "lucide-react";
import { exportToCsv } from "../utils/csvExport";

export default function ResultToolbar({
  rowsCount,
  columns,
  rows,
  durationMs,
  truncated,
  viewMode,
  setViewMode,
  hasChartableData,
  onAddToDashboard,
  isSavedToDashboard,
  onClearWorkspace,
}) {
  const handleDownloadCsv = () => {
    if (!columns || columns.length === 0 || !rows) return;
    exportToCsv(columns, rows, "queryai-results.csv");
  };

  return (
    <div className="query-result-toolbar">
      {/* Left side: Stats */}
      <div className="toolbar-left">
        <div className="toolbar-stat">
          <span className="stat-value">{rowsCount ?? 0}</span>
          <span className="stat-label">rows</span>
        </div>

        {truncated && (
          <span className="toolbar-badge truncated-badge" title="Query returned more than 100 rows; limited to 100">
            Truncated (100 max)
          </span>
        )}

        {durationMs !== undefined && durationMs !== null && (
          <div className="toolbar-stat duration-stat">
            <Clock size={12} className="stat-icon" />
            <span className="stat-label">Request time:</span>
            <span className="stat-value">{durationMs}ms</span>
          </div>
        )}
      </div>

      {/* Right side: Actions & Views */}
      <div className="toolbar-right">
        {/* Visualization Switcher */}
        {hasChartableData && (
          <div className="view-mode-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table View"
            >
              <TableIcon size={13} />
              <span>Table</span>
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "chart" ? "active" : ""}`}
              onClick={() => setViewMode("chart")}
              title="Bar Chart View"
            >
              <BarChart2 size={13} />
              <span>Bar chart</span>
            </button>
          </div>
        )}

        {/* Download CSV */}
        <button
          type="button"
          className="btn-toolbar-action"
          onClick={handleDownloadCsv}
          disabled={!rows || rows.length === 0}
          title="Export query results to CSV"
        >
          <Download size={13} />
          <span>Download CSV</span>
        </button>

        {/* Add to Dashboard */}
        {onAddToDashboard && (
          <button
            type="button"
            className={`btn-toolbar-action ${isSavedToDashboard ? "btn-saved" : ""}`}
            onClick={onAddToDashboard}
            title="Save query card to Dashboards"
          >
            {isSavedToDashboard ? (
              <>
                <Check size={13} className="success-icon" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <BookmarkPlus size={13} />
                <span>Add to dashboard</span>
              </>
            )}
          </button>
        )}

        {/* Clear Workspace */}
        {onClearWorkspace && (
          <button
            type="button"
            className="btn-toolbar-action btn-toolbar-clear"
            onClick={onClearWorkspace}
            title="Clear current query results"
          >
            <RotateCcw size={13} />
            <span>Clear</span>
          </button>
        )}
      </div>
    </div>
  );
}
