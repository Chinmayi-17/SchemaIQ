import React from "react";
import { AlertCircle } from "lucide-react";

export default function ResultsTable({
  columns,
  rows,
  hasRunQuery,
  truncated,
}) {
  if (!hasRunQuery) {
    return (
      <div className="results-table-panel empty-container">
        <div className="table-state-message">
          <p className="state-placeholder">Results will appear here after you run a query.</p>
        </div>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="results-table-panel empty-container">
        <div className="table-state-message">
          <p className="state-placeholder">No matching records found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="results-table-panel">
      <div className="table-scroll-wrapper">
        <table className="results-data-table">
          <thead>
            <tr>
              <th className="th-row-num">#</th>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="td-row-num">{rowIndex + 1}</td>
                {columns.map((col) => {
                  const val = row[col];
                  const isNull = val === null || val === undefined;

                  return (
                    <td key={col}>
                      {isNull ? (
                        <span className="null-indicator">null</span>
                      ) : (
                        String(val)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {truncated && (
        <div className="table-truncated-footer">
          <AlertCircle size={13} />
          <span>Display limited to the first 100 rows to maintain optimal browser performance.</span>
        </div>
      )}
    </div>
  );
}
