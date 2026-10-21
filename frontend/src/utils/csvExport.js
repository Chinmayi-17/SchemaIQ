/**
 * Properly escapes a single cell for RFC-4180 CSV format.
 * @param {any} value
 * @returns {string}
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const str = String(value);

  // If value contains quotes, commas, or line breaks, enclose in quotes and double internal quotes
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Exports data to CSV and triggers browser download.
 * @param {string[]} columns - Array of column names
 * @param {Array<Record<string, any>>} rows - Array of row objects
 * @param {string} [filename="schemaiq-results.csv"] - Target filename
 */
export function exportToCsv(columns, rows, filename = "schemaiq-results.csv") {
  if (!columns || columns.length === 0) {
    return;
  }

  const headerLine = columns.map(escapeCsvValue).join(",");
  const dataLines = (rows || []).map((row) => {
    return columns.map((col) => escapeCsvValue(row[col])).join(",");
  });

  const csvContent = [headerLine, ...dataLines].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
