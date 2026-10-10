import React from "react";
import { History, ArrowUpRight } from "lucide-react";

export default function RecentQueriesPanel({
  recentQueries,
  onSelectQuery,
  currentQuestion,
}) {
  return (
    <aside className="recent-queries-card">
      <div className="recent-queries-header">
        <div className="recent-header-left">
          <History size={15} className="recent-header-icon" />
          <h2 className="recent-title">Recent queries</h2>
        </div>
        <span className="recent-badge">Last 10</span>
      </div>

      <div className="recent-queries-list">
        {recentQueries && recentQueries.length > 0 ? (
          recentQueries.slice(0, 10).map((item, index) => {
            const isCurrent = currentQuestion === item.question;
            return (
              <div
                key={item.id || index}
                className={`recent-query-entry ${isCurrent ? "current-selected" : ""}`}
                onClick={() => onSelectQuery(item)}
              >
                <div className="recent-entry-top">
                  <p className="recent-question-text" title={item.question}>
                    {item.question}
                  </p>
                </div>
                <div className="recent-entry-bottom">
                  <span className="recent-details-btn">
                    View details
                    <ArrowUpRight size={11} className="arrow-icon" />
                  </span>
                  {item.rowsCount !== undefined && (
                    <span className="recent-rows-count">{item.rowsCount} rows</span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="recent-empty-state">
            <p className="empty-title">No recent queries yet</p>
            <p className="empty-subtitle">
              Executed queries will appear here for one-click re-running.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
