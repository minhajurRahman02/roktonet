from sample_data import INVENTORY, REQUESTS, ORGANIZATIONS
from engine import allocate

result = allocate(REQUESTS, INVENTORY, ORGANIZATIONS)

print(f"Solver status: {result['status']}\n")

print("Assignments:")
for a in result["assignments"]:
    unit = next(u for u in INVENTORY if u["unit_id"] == a["unit_id"])
    print(f"  {a['unit_id']} (org={unit['org_id']}, expiry_in={unit['days_until_expiry']}d) -> {a['request_id']}")

print("\nShortfalls (unmet quantity):")
if result["shortfalls"]:
    for rid, qty in result["shortfalls"].items():
        print(f"  {rid}: short by {qty}")
else:
    print("  None -- every request fully covered.")
