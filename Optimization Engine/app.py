from flask import Flask, request, jsonify
from engine import allocate

app = Flask(__name__)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


@app.after_request
def allow_cors_on_health_only(response):
    """
    Lets the browser read /health, and ONLY /health, cross-origin.

    Why this exists: on Render's free tier this service sleeps after 15
    minutes idle and takes ~30-60s to wake. The frontend pings /health on
    page load so the wake-up happens while the user is reading the landing
    page, instead of during the allocation request itself.

    Why it's scoped to /health instead of installing flask-cors: flask-cors
    would enable CORS across every route, including /engine/allocate.
    That endpoint should never be reachable from a browser -- only the Node
    backend is supposed to call it. Restricting the header to this one path
    keeps that true.

    Why '*' is safe HERE specifically: /health returns a fixed two-word
    status, reads nothing, writes nothing, and requires no credentials. It
    also can't leak a session even by accident -- the CORS spec forbids
    combining '*' with credentialed requests, so a browser will reject any
    cookie-bearing call to it outright. Using '*' also avoids having to
    redeploy this service every time the frontend's URL changes.
    """
    if request.path == '/health':
        response.headers['Access-Control-Allow-Origin'] = '*'
    return response


@app.route('/engine/allocate', methods=['POST'])
def engine_allocate():
    """
    {
        "requests": [...],       # list of pending requests
        "inventory": [...],      # list of available inventory units
        "organizations": {...}   # {org_id: district}
    }
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
