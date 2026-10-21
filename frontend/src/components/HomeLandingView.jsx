import React from "react";
import {
  Sparkles,
  Database,
  ShieldCheck,
  Download,
  ArrowRight,
  Code2,
  Table as TableIcon,
  History,
  LayoutDashboard,
  ChartColumn,
  Menu,
} from "lucide-react";

export default function HomeLandingView({
  onStartQuerying,
  onConnectDatabase,
  onImportSchema,
  schemaStatus,
  onToggleMobileMenu,
}) {
  const scrollToFeatures = () => {
    const el = document.getElementById("features-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="home-landing-container">
      {/* Mobile Top Bar */}
      <div className="landing-mobile-bar">
        {onToggleMobileMenu && (
          <button
            type="button"
            className="mobile-menu-toggle-landing"
            onClick={onToggleMobileMenu}
            aria-label="Toggle navigation menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="landing-mobile-brand">SchemaIQ</div>
      </div>

      {/* SECTION 1: HERO */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-kicker">SCHEMAIQ / NATURAL-LANGUAGE SQL</div>

          <h1 className="hero-title">
            Your data has answers. Ask better questions.
          </h1>

          <p className="hero-description">
            Explore PostgreSQL in plain language. Review every generated query, compare results, and save useful views without losing sight of the SQL.
          </p>

          <div className="hero-next-step"><span className="hero-next-step-line" />Start with a question. SchemaIQ grounds it in your selected schema, generates a read-only query, and returns results you can inspect.</div>

          <div className="hero-cta-group">
            <button
              type="button"
              className="btn-hero-primary"
              onClick={onStartQuerying}
            >
              <span>Start Querying</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              className="btn-hero-text"
              onClick={scrollToFeatures}
            >
              <span>See how it works</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="hero-setup-links">
            <span>New workspace?</span>
            <button type="button" onClick={onConnectDatabase}><Database size={14} />Connect a database</button>
            <button type="button" onClick={onImportSchema}><Code2 size={14} />Import a schema</button>
          </div>

          {/* Trust Indicator */}
          <div className="hero-trust-row">
            <div className="trust-indicator">
              <span
                className={`status-dot ${schemaStatus === "connected" ? "online" : "checking"}`}
              />
              <span className="trust-text">
                {schemaStatus === "connected"
                  ? "PostgreSQL Connected"
                  : "Backend unavailable"}
              </span>
            </div>

            <div className="trust-divider" />

            <div className="trust-security">
              <ShieldCheck size={14} className="security-icon" />
              <span>Read-Only Guardrails Active</span>
            </div>
          </div>
        </div>

        <div className="hero-product-surface" aria-label="SchemaIQ workflow preview">
          <div className="surface-topline"><span className="surface-label">LIVE QUERY WORKSPACE</span><span className="surface-source"><span className="status-dot online" /> Student Database</span></div>
          <div className="surface-question"><span className="surface-step">01 / ASK</span><p>Show students whose CGPA is greater than 8</p><span className="surface-cursor" /></div>
          <div className="surface-connector"><span /> SchemaIQ generates a read-only query <span /></div>
          <div className="surface-sql"><div className="surface-step">02 / SQL GENERATED</div><pre>{`SELECT name, cgpa
FROM students
WHERE cgpa > 8
LIMIT 100;`}</pre><div className="surface-safe"><ShieldCheck size={13} /> Syntax validated · SELECT only</div></div>
          <div className="surface-result"><div className="surface-result-head"><span className="surface-step">03 / RESULT</span><span>6 rows returned</span></div><div className="surface-result-row surface-result-columns"><span>Name</span><span>CGPA</span><span>Semester</span></div><div className="surface-result-row"><span>Ishaan</span><strong>9.6</strong><span>6</span></div><div className="surface-result-row"><span>Aarav</span><strong>9.2</strong><span>4</span></div></div>
        </div>
      </section>

      {/* SECTION 2: PRODUCT PREVIEW */}
      <section className="preview-section">
        <div className="preview-card">
          <div className="preview-card-header">
            <div className="preview-header-left">
              <span className="preview-kicker">Workflow detail</span>
              <span className="preview-header-title">How SchemaIQ Works</span>
            </div>
            <div className="preview-dots">
              <span className="window-dot red" />
              <span className="window-dot yellow" />
              <span className="window-dot green" />
            </div>
          </div>

          <div className="preview-steps-grid">
            {/* Step 1: ASK */}
            <div className="preview-step-col">
              <div className="step-tag">
                <span className="step-number">01</span>
                <span className="step-label">ASK</span>
              </div>
              <div className="preview-step-box step-ask-box">
                <div className="step-box-title">Natural Language Input</div>
                <div className="sample-question-bubble">
                  "Show students whose CGPA is greater than 8"
                </div>
                <div className="step-box-footnote">Plain English Question</div>
              </div>
            </div>

            <div className="preview-arrow-divider">
              <ArrowRight size={16} className="connector-arrow" />
            </div>

            {/* Step 2: GENERATE SQL */}
            <div className="preview-step-col">
              <div className="step-tag">
                <span className="step-number">02</span>
                <span className="step-label">GENERATE SQL</span>
              </div>
              <div className="preview-step-box step-sql-box">
                <div className="step-box-title">
                  <Code2 size={13} />
                  <span>Gemini PostgreSQL Output</span>
                </div>
                <pre className="sample-sql-code">
                  <code>{`SELECT name, cgpa
FROM students
WHERE cgpa > 8
ORDER BY cgpa DESC
LIMIT 100;`}</code>
                </pre>
                <div className="step-box-footnote">Syntax-Validated SQL</div>
              </div>
            </div>

            <div className="preview-arrow-divider">
              <ArrowRight size={16} className="connector-arrow" />
            </div>

            {/* Step 3: VIEW RESULTS */}
            <div className="preview-step-col">
              <div className="step-tag">
                <span className="step-number">03</span>
                <span className="step-label">VIEW RESULTS</span>
              </div>
              <div className="preview-step-box step-results-box">
                <div className="step-box-title">
                  <TableIcon size={13} />
                  <span>Live Database Records</span>
                </div>
                <table className="sample-results-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>CGPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Ishaan</td>
                      <td>9.6</td>
                    </tr>
                    <tr>
                      <td>Aarav</td>
                      <td>9.2</td>
                    </tr>
                    <tr>
                      <td>Ananya</td>
                      <td>9.1</td>
                    </tr>
                  </tbody>
                </table>
                <div className="step-box-footnote">Sample preview data</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: FEATURES */}
      <section id="features-section" className="features-section">
        <div className="section-header-wrap">
          <h2 className="section-main-heading">
            Everything you need to query smarter
          </h2>
          <p className="section-sub-heading">
            Go from a plain-language question to results you can review, explore, and reuse.
          </p>
        </div>

        <div className="features-grid">
          {/* Card 1 */}
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <Sparkles size={20} className="feature-icon" />
            </div>
            <h3 className="feature-title">Natural Language to SQL</h3>
            <p className="feature-description">
              Ask questions in plain English and let AI generate the corresponding PostgreSQL query.
            </p>
          </div>

          {/* Card 2 */}
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <Database size={20} className="feature-icon" />
            </div>
            <h3 className="feature-title">Live Database Results</h3>
            <p className="feature-description">
              Execute supported read-only queries and inspect results returned by your connected PostgreSQL database.
            </p>
          </div>

          {/* Card 3 */}
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <ShieldCheck size={20} className="feature-icon success-icon" />
            </div>
            <h3 className="feature-title">Built-in Query Safety</h3>
            <p className="feature-description">
              Validate generated SQL and prevent destructive database operations through the existing backend safeguards.
            </p>
          </div>

          {/* Card 4 */}
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <Download size={20} className="feature-icon" />
            </div>
            <h3 className="feature-title">Export Your Results</h3>
            <p className="feature-description">
              Download query results as CSV for further analysis.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <History size={20} className="feature-icon" />
            </div>
            <h3 className="feature-title">Pick Up Where You Left Off</h3>
            <p className="feature-description">
              Reopen recent questions with their generated SQL and results ready to review.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <LayoutDashboard size={20} className="feature-icon" />
            </div>
            <h3 className="feature-title">Save Useful Queries</h3>
            <p className="feature-description">
              Keep important query results in your personal dashboard for quick access.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <ChartColumn size={20} className="feature-icon" />
            </div>
            <h3 className="feature-title">See Results Your Way</h3>
            <p className="feature-description">
              Switch between a detailed table and a quick chart when your results support it.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4: HOW IT WORKS */}
      <section className="workflow-section">
        <div className="section-header-wrap">
          <h2 className="section-main-heading">How It Works</h2>
          <p className="section-sub-heading">
            Three simple steps from natural curiosity to database truth.
          </p>
        </div>

        <div className="workflow-cards-grid">
          <div className="workflow-card">
            <div className="workflow-number">01</div>
            <h3 className="workflow-step-title">Ask a question</h3>
            <p className="workflow-step-desc">
              Describe the information you want from your database.
            </p>
          </div>

          <div className="workflow-card">
            <div className="workflow-number">02</div>
            <h3 className="workflow-step-title">Generate SQL</h3>
            <p className="workflow-step-desc">
              SchemaIQ uses Gemini to generate a PostgreSQL query based on the available database schema.
            </p>
          </div>

          <div className="workflow-card">
            <div className="workflow-number">03</div>
            <h3 className="workflow-step-title">Explore results</h3>
            <p className="workflow-step-desc">
              Review the generated SQL and inspect the actual results returned by your database.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 5: FINAL CALL TO ACTION */}
      <section className="cta-panel-section">
        <div className="cta-card">
          <div className="cta-content">
            <h2 className="cta-heading">Ready to explore your data?</h2>
            <p className="cta-description">
              Turn your questions into SQL and get meaningful answers from your database.
            </p>
          </div>
          <button
            type="button"
            className="btn-cta-action"
            onClick={onStartQuerying}
          >
            <span>Open Query Editor</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* SECTION 6: FOOTER */}
      <footer className="landing-footer">
        <div className="footer-brand-title">SchemaIQ</div>
        <div className="footer-tagline">
          Natural-language querying for PostgreSQL.
        </div>
      </footer>
    </div>
  );
}
