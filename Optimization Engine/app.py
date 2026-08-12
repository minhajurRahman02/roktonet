"""
RoktoNet Python service -- wraps the optimization engine as a small REST
API so the Node backend can call it (Section 16's internal REST bridge).

This service is stateless: it never touches the database directly. The
Node backend is responsible for fetching current requests/inventory from
Postgres, sending them here, and writing the results back.
"""

from flask import Flask, request, jsonify
from engine import allocate

app = Flask(__name__)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


@app.route('/engine/allocate', methods=['POST'])
def engine_allocate():
    """
    Expects JSON body:
    {
        "requests": [...],       # list of pending requests
        "inventory": [...],      # list of available inventory units
        "organizations": {...}   # {org_id: district}
    }
    Returns the same shape as engine.allocate(): assignments, shortfalls, status.
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    requests_data = data.get("requests", [])
    inventory_data = data.get("inventory", [])
    organizations_data = data.get("organizations", {})

    try:
        result = allocate(requests_data, inventory_data, organizations_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)
