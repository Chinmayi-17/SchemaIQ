import React from "react";

export default function ResultsChart({ columns, rows }) {
  if (!rows || rows.length === 0 || !columns || columns.length === 0) {
    return (
      <div className="results-table-panel empty-container">
        <p className="state-placeholder">No data available for visualization.</p>
      </div>
    );
  }

  // Detect numeric and label columns
  const numericCols = columns.filter((col) => {
    return rows.some((r) => {
      const v = r[col];
      return v !== null && v !== undefined && !isNaN(Number(v));
    });
  });

  const labelCols = columns.filter((col) => !numericCols.includes(col));

  if (numericCols.length === 0) {
    return (
      <div className="results-table-panel empty-container">
        <p className="state-placeholder">
          Bar chart requires at least one numeric column. None was found in this result set.
        </p>
      </div>
    );
  }

  const metricCol = numericCols[0];
  const labelCol = labelCols.length > 0 ? labelCols[0] : columns[0];

  // Limit chart to first 25 items for visual clarity
  const chartItems = rows.slice(0, 25).map((row) => {
    const rawVal = row[metricCol];
    const numVal = rawVal !== null && rawVal !== undefined ? Number(rawVal) : 0;
    return {
      label: String(row[labelCol] || "(empty)"),
      value: numVal,
    };
  });

  const maxValue = Math.max(...chartItems.map((d) => d.value), 1);

  return (
    <div className="results-chart-panel">
      <div className="chart-header">
        <div className="chart-title">
          <span>Comparing:</span>
          <strong>{labelCol}</strong>
          <span>by</span>
          <span className="metric-tag">{metricCol}</span>
        </div>
        <div className="chart-subtitle">
          Showing top {chartItems.length} records
        </div>
      </div>

      <div className="chart-bars-list">
        {chartItems.map((item, idx) => {
          const percentage = Math.max(2, Math.min(100, (item.value / maxValue) * 100));

          return (
            <div key={idx} className="chart-row">
              <div className="chart-row-label" title={item.label}>
                {item.label}
              </div>
              <div className="chart-row-bar-track">
                <div
                  className="chart-row-bar-fill"
                  style={{ width: `${percentage}%` }}
                >
                  <span className="chart-bar-tooltip">{item.value}</span>
                </div>
              </div>
              <div className="chart-row-value">{item.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
