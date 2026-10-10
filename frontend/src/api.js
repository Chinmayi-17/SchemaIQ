const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Fetches the database schema from the backend.
 */
export async function fetchSchema() {
  const response = await fetch(`${API_BASE_URL}/api/schema`, {
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
export async function executeQuery(question) {
  const startTime = performance.now();

  try {
    const response = await fetch(`${API_BASE_URL}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question }),
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
