import React from "react";
import { LayoutDashboard, Play, Trash2, ArrowRight } from "lucide-react";

export default function DashboardsView({
  savedDashboards,
  onRunDashboardItem,
  onDeleteDashboardItem,
  onGoToEditor,
}) {
  return (
    <div className="dashboards-view-container">
      <div className="view-intro-strip">
        <div className="intro-text">
          <h2>Saved Query Cards</h2>
          <p>Pinned queries and datasets saved from your query workspace</p>
        </div>
        <button
          type="button"
          className="btn-create-query"
          onClick={onGoToEditor}
        >
          <span>Ask new question</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {savedDashboards && savedDashboards.length > 0 ? (
        <div className="dashboard-cards-grid">
          {savedDashboards.map((card) => (
            <div key={card.id} className="dashboard-card">
              <div className="card-top">
                <h3 className="card-question-title">{card.question}</h3>
                <button
                  type="button"
                  className="btn-delete-card"
                  onClick={() => onDeleteDashboardItem(card.id)}
                  title="Remove from dashboard"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="card-sql-preview">
                <code>{card.sql}</code>
              </div>

              <div className="card-meta-footer">
                <div className="card-stats">
                  <span className="card-stat-pill">{card.rowsCount ?? (card.rows?.length || 0)} rows</span>
                  <span className="card-date">{new Date(card.savedAt || Date.now()).toLocaleDateString()}</span>
                </div>

                <button
                  type="button"
                  className="btn-card-run"
                  onClick={() => onRunDashboardItem(card)}
                >
                  <Play size={12} />
                  <span>Open in Editor</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty-state">
          <LayoutDashboard size={40} className="empty-icon" />
          <h3>No saved dashboards yet</h3>
          <p>
            When you run a query in the Query Editor, click the <strong>Add to dashboard</strong> button in the results toolbar to pin it here.
          </p>
          <button
            type="button"
            className="btn-primary-action"
            onClick={onGoToEditor}
          >
            Go to Query Editor
          </button>
        </div>
      )}
    </div>
  );
}
