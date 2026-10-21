import React from "react";
import {
  Home,
  Code2,
  LayoutDashboard,
  Database,
  ChevronDown,
} from "lucide-react";

export default function Sidebar({
  activeNav,
  setActiveNav,
  recentQueries,
  onSelectQuery,
  mobileOpen,
  setMobileOpen,
}) {
  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "query-editor", label: "Query Editor", icon: Code2 },
    { id: "dashboards", label: "Dashboards", icon: LayoutDashboard },
    { id: "data-sources", label: "Data Sources", icon: Database },
  ];

  return (
    <aside className={`app-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      {/* Top Brand */}
      <div className="sidebar-brand">
        <div className="brand-logo-mark">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 8.5L7 4.5L11 8.5"
              stroke="#171717"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="brand-text-wrap">
          <span className="brand-name">SchemaIQ</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-scrollable-area">
        <div className="sidebar-section">
          <div className="sidebar-section-title">Platform</div>
          <nav className="sidebar-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${isActive ? "active" : ""}`}
                  onClick={() => {
                    setActiveNav(item.id);
                    if (setMobileOpen) setMobileOpen(false);
                  }}
                >
                  <Icon className="nav-icon" size={17} />
                  <span className="nav-label">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Recent Queries Section */}
        <div className="sidebar-section sidebar-recent-section">
          <div className="sidebar-section-header">
            <div className="sidebar-section-title">Recent queries</div>
          </div>

          <div className="sidebar-recent-list">
            {recentQueries && recentQueries.length > 0 ? (
              recentQueries.slice(0, 10).map((item, index) => (
                <div
                  key={item.id || index}
                  className="sidebar-recent-item"
                  onClick={() => {
                    onSelectQuery(item);
                    if (setMobileOpen) setMobileOpen(false);
                  }}
                >
                  <div className="sidebar-recent-text" title={item.question}>
                    {item.question}
                  </div>
                  <div className="sidebar-recent-meta">
                    <span className="view-details-link">View details</span>
                    {item.rowsCount !== undefined && (
                      <span className="recent-rows-tag">{item.rowsCount} rows</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="sidebar-recent-empty">No recent queries yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom User Area */}
      <div className="sidebar-footer">
        <div className="user-profile-wrap">
          <div className="user-avatar">QA</div>
          <div className="user-info">
            <div className="user-name">SchemaIQ Workspace</div>
            <div className="user-role">Developer environment</div>
          </div>
          <ChevronDown className="user-more-icon" size={15} />
        </div>
      </div>
    </aside>
  );
}
