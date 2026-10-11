const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Fetches the database schema from the backend.
 */
export async function fetchSchema(sourceId) {
  const query = sourceId ? `?source_id=${encodeURIComponent(sourceId)}` : "";
  const response = await fetch(`${API_BASE_URL}/api/schema${query}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    let errorDetail = "Could not fetch database schema.";
    try {
      const data = await response.json();
      if (data.detail) errorDetail = data.detail;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const data = await response.json();
      if (data.detail) message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      // Keep the status-based message when the server does not return JSON.
    }
    throw new Error(message);
  }

  return response.json();
}

export function fetchDataSources() {
  return requestJson("/api/data-sources");
}

export function setActiveDataSource(sourceId) {
  return requestJson("/api/data-sources/active", {
    method: "POST",
    body: JSON.stringify({ source_id: sourceId }),
  });
}

export function testConnection(connection) {
  return requestJson("/api/connections/test", {
    method: "POST",
    body: JSON.stringify(connection),
  });
}

export function saveConnection(connection) {
  return requestJson("/api/connections", {
    method: "POST",
    body: JSON.stringify(connection),
  });
}

export function refreshConnection(connectionId) {
  return requestJson(`/api/connections/${encodeURIComponent(connectionId)}/refresh`, {
    method: "POST",
  });
}

export function deleteConnection(connectionId) {
  return requestJson(`/api/connections/${encodeURIComponent(connectionId)}`, {
    method: "DELETE",
  });
}

export function importSchema(payload) {
  return requestJson("/api/schemas/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteSchema(schemaId) {
  return requestJson(`/api/schemas/${encodeURIComponent(schemaId)}`, {
    method: "DELETE",
  });
}

export function fetchTableRows(source, tableName, limit = 100, offset = 0) {
  const category = source.category === "connection" ? "connections" : "schemas";
  return requestJson(`/api/${category}/${encodeURIComponent(source.id)}/tables/${encodeURIComponent(tableName)}/rows?limit=${limit}&offset=${offset}`);
}

export function insertTableRow(source, tableName, values, confirmLiveInsert = false) {
  const category = source.category === "connection" ? "connections" : "schemas";
  return requestJson(`/api/${category}/${encodeURIComponent(source.id)}/tables/${encodeURIComponent(tableName)}/rows`, {
    method: "POST",
    body: JSON.stringify({ values, confirm_live_insert: confirmLiveInsert }),
  });
}

/**
 * Checks backend health status.
 */
export async function checkHealth() {
  const response = await fetch(`${API_BASE_URL}/`, {
    method: "GET",
  });
  if (!response.ok) throw new Error("Backend unavailable");
  return response.json();
}

/**
 * Sends a natural language question to generate and execute SQL.
 * @param {string} question
 * @returns {Promise<{
 *   success: boolean,
 *   question: string,
 *   sql: string,
 *   explanation: string,
 *   columns: string[],
 *   rows: any[],
 *   truncated?: boolean
 * }>}
 */
export async function executeQuery(question, sourceId) {
  const startTime = performance.now();

  try {
    const response = await fetch(`${API_BASE_URL}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, source_id: sourceId || undefined }),
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      let errorMessage = `Query request failed with status ${response.status}.`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = typeof errorData.detail === "string" 
            ? errorData.detail 
            : JSON.stringify(errorData.detail);
        }
      } catch {
        // fallback to default error message
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.durationMs = durationMs;
      throw error;
    }

    const data = await response.json();
    return {
      ...data,
      durationMs,
    };
  } catch (err) {
    if (!err.durationMs) {
      err.durationMs = Math.round(performance.now() - startTime);
    }
    throw err;
  }
}
