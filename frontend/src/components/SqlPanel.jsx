import React, { useState } from "react";
import { Copy, Check, Terminal, Info } from "lucide-react";

export default function SqlPanel({ sql, explanation }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = sql;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="generated-sql-panel">
      <div className="sql-panel-header">
        <div className="sql-panel-title-wrap">
          <Terminal size={14} className="sql-icon" />
          <span className="sql-panel-title">Generated SQL</span>
        </div>

        {sql && (
          <button
            type="button"
            className="btn-copy-sql"
            onClick={handleCopy}
            title="Copy SQL to clipboard"
          >
            {copied ? (
              <>
                <Check size={13} className="copy-icon-copied" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy SQL</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="sql-code-container">
        {sql ? (
          <pre className="sql-code-block">
            <code>{sql}</code>
          </pre>
        ) : (
          <div className="sql-placeholder">
            Your generated SQL will appear here.
          </div>
        )}
      </div>

      {explanation && (
        <div className="sql-explanation-bar">
          <Info size={13} className="info-icon" />
          <span className="explanation-text">{explanation}</span>
        </div>
      )}
    </div>
  );
}
