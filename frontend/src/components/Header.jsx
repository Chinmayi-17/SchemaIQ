import React from "react";
import { Menu, ShieldCheck, Database } from "lucide-react";

export default function Header({
  activeNav,
  schemaStatus,
  onToggleMobileMenu,
}) {
  const getTitles = () => {
    switch (activeNav) {
      case "dashboards":
        return {
          title: "Dashboards",
          subtitle: "QueryAI — Saved analytics views & cards",
        };
      case "data-sources":
        return {
          title: "Data Sources",
          subtitle: "QueryAI — PostgreSQL schema & relationships",
        };
      default:
        return {
          title: "Ask a question",
          subtitle: "QueryAI — PostgreSQL",
        };
    }
  };

  const { title, subtitle } = getTitles();

  return (
    <header className="main-header-panel">
      <div className="header-left">
        {onToggleMobileMenu && (
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={onToggleMobileMenu}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="header-titles">
          <h1 className="header-title">{title}</h1>
          <p className="header-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="header-right">
        <div className="header-badge read-only-badge">
          <ShieldCheck size={14} className="badge-icon success-icon" />
          <span>Read-only mode</span>
        </div>

        <div className="header-badge db-status-badge">
          <span className={`status-dot ${schemaStatus === "connected" ? "online" : "checking"}`} />
          <span>{schemaStatus === "connected" ? "PostgreSQL Connected" : "Connecting..."}</span>
        </div>
      </div>
    </header>
  );
}
