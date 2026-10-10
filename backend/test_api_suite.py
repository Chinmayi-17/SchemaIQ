import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"

def request(method, path, body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    headers = {"Content-Type": "application/json"} if body else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"detail": err_body}

def run_tests():
    print("=== STARTING BACKEND TEST SUITE ===")
    
    # 1. Health
    status, data = request("GET", "/")
    assert status == 200, f"Health check failed: {status}"
    print("[PASS] 1. Health check:", data["status"], data["app"])

    # 2. List Data Sources
    status, data = request("GET", "/api/data-sources")
    assert status == 200
    assert len(data["connections"]) >= 1
    assert any(c["id"] == "default" for c in data["connections"])
    assert any(s["id"] == "demo-ecommerce" for s in data["schemas"])
    print(f"[PASS] 2. Data sources found: {len(data['connections'])} connections, {len(data['schemas'])} schemas")

    # 3. Test Connection with fake credentials (must fail cleanly without leaking secrets)
    status, data = request("POST", "/api/connections/test", {
        "host": "invalid-nonexistent-host-xyz.test",
        "port": 5432,
        "database": "testdb",
        "username": "user",
        "password": "secretpassword123",
        "ssl_mode": "disable"
    })
    assert status == 400
    assert "secretpassword123" not in json.dumps(data)
    print("[PASS] 3. Invalid connection failed safely without leaking passwords:", data.get("detail"))

    # 4. Import Schema (Customers and Orders)
    sample_sql = """
    CREATE TABLE customers (
        customer_id INTEGER PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(255)
    );

    CREATE TABLE orders (
        order_id INTEGER PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(customer_id),
        total_amount NUMERIC(10, 2),
        order_date DATE
    );
    """
    status, data = request("POST", "/api/schemas/import", {
        "name": "Customer Orders Schema",
        "source_type": "pasted",
        "sql_text": sample_sql
    })
    assert status == 200, f"Import schema failed: {data}"
    schema_id = data["schema"]["id"]
    tables = [t["name"] for t in data["schema"]["tables"]]
    assert "customers" in tables and "orders" in tables
    print(f"[PASS] 4. Schema imported successfully as '{schema_id}' with tables: {tables}")

    # 5. Generate SQL against imported schema
    status, data = request("POST", "/api/query", {
        "question": "Show all customers and their total order amounts.",
        "source_id": schema_id
    })
    assert status == 200, f"Query failed: {data}"
    assert data["success"] is True
    assert "customers" in data["sql"].lower()
    assert "orders" in data["sql"].lower()
    assert "students" not in data["sql"].lower()
    assert data["execution_disabled"] is True
    assert data["rows"] == []
    print("[PASS] 5. Schema-aware generation on imported schema (no hallucinated tables, execution disabled):")
    print("       Generated SQL:", data["sql"].strip().replace("\n", " "))

    # 6. Query connected live database (default Supabase students DB)
    status, data = request("POST", "/api/query", {
        "question": "Show all students whose cgpa is greater than 8.0",
        "source_id": "default"
    })
    assert status == 200, f"Default query failed: {data}"
    assert data["success"] is True
    assert "students" in data["sql"].lower()
    assert data["execution_disabled"] is False
    assert len(data["rows"]) > 0
    print(f"[PASS] 6. Live query executed on default Supabase DB: returned {len(data['rows'])} student rows")

    # 7. Security: Destructive operation rejected
    status, data = request("POST", "/api/query", {
        "question": "DROP TABLE students;",
        "source_id": "default"
    })
    assert status == 400
    assert "destructive" in data["detail"].lower()
    print("[PASS] 7. Destructive query rejected by security guardrail:", data["detail"])

    # 8. Deletion safeguards
    status, data = request("DELETE", "/api/connections/default")
    assert status == 400, "Should not allow deleting default connection"
    status, data = request("DELETE", "/api/schemas/demo-ecommerce")
    assert status == 400, "Should not allow deleting demo schema"
    print("[PASS] 8. Deletion safeguards active for default connection and demo schema")

    # 9. Clean up test imported schema
    status, data = request("DELETE", f"/api/schemas/{schema_id}")
    assert status == 200
    print(f"[PASS] 9. Cleaned up temporary imported schema '{schema_id}'")

    print("\nALL 9 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY ON BACKEND!")

if __name__ == "__main__":
    run_tests()
