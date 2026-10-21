# SchemaIQ

### AI-Powered Natural Language to SQL Generator

SchemaIQ is a full-stack web application that converts everyday English questions into SQL queries using Google Gemini. It helps users explore PostgreSQL database structures, understand generated SQL, and view query results when a live database is connected.

## Features

- **Natural language to SQL:** Generate PostgreSQL queries from plain-English prompts.
- **Schema-aware generation:** Use the selected database's tables, columns, and relationships as context.
- **Schema import:** Paste PostgreSQL `CREATE TABLE` statements to import a database structure without executing the SQL.
- **PostgreSQL connectivity:** Work with a live PostgreSQL database, including Supabase-hosted databases.
- **SQL explanations:** Understand the logic behind generated queries.
- **Query results:** Display results in a table for supported queries against live databases.
- **Read-only safeguards:** Validate generated SQL and reject destructive requests.
- **Dashboard interface:** Manage data sources and generate queries from a React-based UI.

> **Note:** An imported schema is *schema-only*. It supports SQL generation but does not create database tables or provide actual records. To retrieve results, connect a live PostgreSQL database with data.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Python, FastAPI |
| AI | Google Gemini API |
| Database | PostgreSQL, Supabase |
| SQL | SQLGlot, SQLAlchemy, psycopg |
| Version control | Git, GitHub |

## How It Works

1. Import a PostgreSQL schema or connect a live database.
2. Select the data source in the Query Editor.
3. Ask a question in natural language.
4. Gemini generates SQL using the selected schema.
5. SchemaIQ validates the SQL and provides an explanation.
6. If a live database is selected, supported read-only queries can return actual results.

## Getting Started

### Prerequisites

- Python 3.11+ (or a version supported by the project's dependencies)
- Node.js and npm
- A Google Gemini API key
- A PostgreSQL connection string if you want live query results

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/<your-repository>.git
cd <your-repository>
```

### 2. Start the backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

**Windows PowerShell:**

```powershell
.\.venv\Scripts\Activate.ps1
```

**macOS/Linux:**

```bash
source .venv/bin/activate
```

Install dependencies (assuming the repository includes `backend/requirements.txt`):

```bash
pip install -r requirements.txt
```

Create a `backend/.env` file and configure the variables used by your backend:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
DATABASE_URL=postgresql+psycopg://user:password@host:5432/database
```

> Check the backend's configuration for the exact required environment variables. Never commit `.env` files or credentials.

Start the API:

```bash
python -m uvicorn main:app --reload
```

Backend: `http://127.0.0.1:8000`  
API documentation: `http://127.0.0.1:8000/docs`

### 3. Start the frontend

Open a **second terminal**:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Run the development server:

```bash
npm run dev
```

Open the URL shown by Vite (typically `http://localhost:5173`).

## Example: Import a Schema

In **Data Sources → Import Schema**, paste:

```sql
CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY,
    department_name TEXT NOT NULL
);

CREATE TABLE students (
    student_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(department_id),
    cgpa NUMERIC(3,2)
);
```

Then select the imported schema and ask:

> Show student names with their department names, ordered by highest CGPA.

SchemaIQ can generate SQL similar to:

```sql
SELECT s.name, d.department_name, s.cgpa
FROM students AS s
JOIN departments AS d
  ON s.department_id = d.department_id
ORDER BY s.cgpa DESC;
```

The generated query is an example; actual AI output may vary.

## API Overview

Some of the application's API routes include:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET | `/api/data-sources` | List available data sources |
| POST | `/api/schemas/import` | Import a database schema |
| GET | `/api/schemas` | List imported schemas |
| GET | `/api/schema` | Retrieve schema information |
| POST | `/api/query` | Generate and process a natural-language query |
| POST | `/api/connections/test` | Test a PostgreSQL connection |

See `/docs` for the current request bodies and complete API reference.

## Security Notes

- Keep Gemini API keys and database credentials on the backend.
- Do not commit `.env` files.
- Generated SQL is validated, and destructive requests are restricted.
- Treat AI-generated queries as untrusted input and retain database-level read-only permissions for query execution.
- Imported schema SQL is used for metadata extraction, not automatically executed against the application database.

## Project Status

SchemaIQ supports schema import, schema-aware SQL generation, explanations, and read-only querying against a configured live PostgreSQL database.

## Author

**Chinmayi**
Github:Chinmayi-17

---

If you find SchemaIQ useful, consider starring the repository.
