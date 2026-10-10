import React, { useRef } from "react";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";

export default function QueryInput({
  question,
  setQuestion,
  onSubmit,
  onClearWorkspace,
  hasRunQuery,
  isLoading,
  error,
  onClearError,
}) {
  const textareaRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && question.trim()) {
        onSubmit();
      }
    }
  };

  const canClear = Boolean(question.trim() || hasRunQuery || error);

  return (
    <div className="query-input-card">
      <div className="query-input-header">
        <label htmlFor="sql-question-input" className="query-input-label">
          Your question
        </label>
        <span className="query-input-shortcut-hint">
          Press <strong>Enter</strong> to ask, <strong>Shift + Enter</strong> for new line
        </span>
      </div>

      <div className="query-textarea-container">
        <textarea
          id="sql-question-input"
          ref={textareaRef}
          className="query-textarea"
          rows={3}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            if (error && onClearError) onClearError();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your database..."
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="query-error-banner" role="alert">
          <AlertCircle className="error-icon" size={17} />
          <div className="error-content">
            <span className="error-title">Query Rejected</span>
            <span className="error-message">{error}</span>
          </div>
        </div>
      )}

      <div className="query-input-footer">
        <div className="query-hints">
          <span className="hint-pill">Read-only SELECT queries</span>
          <span className="hint-pill">Automatic LIMIT 100</span>
        </div>

        <div className="query-button-group">
          {onClearWorkspace && (
            <button
              type="button"
              className="btn-clear-workspace"
              onClick={onClearWorkspace}
              disabled={isLoading || !canClear}
              title="Reset workspace (clears question, generated SQL, and results)"
            >
              <RotateCcw size={13} />
              <span>Clear</span>
            </button>
          )}

          <button
            type="button"
            className="btn-ask"
            onClick={onSubmit}
            disabled={isLoading || !question.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="btn-spinner" size={15} />
                <span>Asking...</span>
              </>
            ) : (
              <span>Ask</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
