"""
RoktoNet Phase 3 -- Seed Dataset Generator

Generates a realistic snapshot dataset (NOT a time series -- that's a
separate future task for Phase 6's AI forecasting model) and writes it
out as a single SQL file of INSERT statements, ready to run in pgAdmin's
Query Tool exactly like schema.sql was.

Blood type distribution calibrated to a published Bangladeshi study:
Karim S, Hoque MM et al., "The Distribution of ABO and Rhesus Blood
Groups Among Blood Donors Attending [Dhaka Medical College]", J Dhaka
Med Coll. 2015;24(1):53-56 -- n=39,512 donors.
ABO: B 35.2%, O 34.0%, A 22.4%, AB 8.4%. Rh: 96.8% positive, 3.2% negative.
Combined (assuming independence) gives the 8-type split below.

All UUIDs are generated in Python and tracked in sets/lists so every
foreign key reference written to SQL is guaranteed to point at a row
that actually exists elsewhere in this same file -- referential
integrity is enforced by construction, not hoped for after the fact.

Re-run this script anytime to regenerate a fresh dataset -- dates are
computed relative to "today" at run time, not hardcoded.
"""

import random
import uuid
from datetime import date, timedelta

random.seed(42)  # reproducible dataset -- same seed, same output, every run

TODAY = date.today()

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

DISTRICTS_WEIGHTED = [
    ("Dhaka", 30), ("Chittagong", 18), ("Sylhet", 10), ("Rajshahi", 10),
    ("Khulna", 10), ("Barisal", 8), ("Rangpur", 7), ("Mymensingh", 7),
]

BLOOD_TYPE_WEIGHTS = {
    "B+": 34.07, "O+": 32.90, "A+": 21.72, "AB+": 8.12,
    "B-": 1.13,  "O-": 1.09,  "A-": 0.72,  "AB-": 0.27,
}

# Reversed donor->recipient compatibility (same logic as backend/services/donorFallback.js)
COMPATIBLE_DONORS_FOR_WHOLE_BLOOD = {
    "O-":  ["O-"],
    "O+":  ["O-", "O+"],
    "A-":  ["O-", "A-"],
    "A+":  ["O-", "O+", "A-", "A+"],
    "B-":  ["O-", "B-"],
    "B+":  ["O-", "O+", "B-", "B+"],
    "AB-": ["O-", "A-", "B-", "AB-"],
    "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
}

SHELF_LIFE_DAYS = {"platelets": 5, "whole_blood": 40, "plasma": 365}

ORG_NAME_TEMPLATES = {
    "hospital": ["{d} Medical College Hospital", "{d} General Hospital", "{d} District Hospital"],
    "blood_bank": ["{d} Central Blood Bank", "{d} Red Crescent Blood Center", "{d} Community Blood Bank"],
    "ngo": ["{d} Voluntary Blood Donors Society", "{d} Blood Donation NGO", "{d} Welfare Blood Trust"],
}


def weighted_choice(weighted_list):
    items, weights = zip(*weighted_list)
    return random.choices(items, weights=weights, k=1)[0]


def weighted_blood_type():
    types, weights = zip(*BLOOD_TYPE_WEIGHTS.items())
    return random.choices(types, weights=weights, k=1)[0]


def compatible_donor_types(blood_type, component):
    if component == "whole_blood":
        return COMPATIBLE_DONORS_FOR_WHOLE_BLOOD.get(blood_type, [blood_type])
    return [blood_type]


def sql_str(value):
    """Escape a string for safe SQL literal embedding."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_val(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, date):
        return f"'{value.isoformat()}'"
    return sql_str(value)


# ---------------------------------------------------------------------------
# 1. Organizations
# ---------------------------------------------------------------------------

ORG_COUNT = 20
ORG_TYPE_PLAN = ["hospital"] * 8 + ["blood_bank"] * 8 + ["ngo"] * 4

organizations = []  # list of dicts
for i in range(ORG_COUNT):
    org_type = ORG_TYPE_PLAN[i]
    district = weighted_choice(DISTRICTS_WEIGHTED)
    name_template = random.choice(ORG_NAME_TEMPLATES[org_type])
    name = name_template.format(d=district)
    organizations.append({
        "org_id": str(uuid.uuid4()),
        "name": name,
        "org_type": org_type,
        "district": district,
    })

org_ids_by_type = {
    "hospital": [o["org_id"] for o in organizations if o["org_type"] == "hospital"],
    "blood_bank": [o["org_id"] for o in organizations if o["org_type"] == "blood_bank"],
    "ngo": [o["org_id"] for o in organizations if o["org_type"] == "ngo"],
}
org_district_by_id = {o["org_id"]: o["district"] for o in organizations}
# orgs that can physically hold inventory: blood banks + hospitals (Section 5: "blood banks (hospital-based)")
stock_holding_org_ids = org_ids_by_type["blood_bank"] + org_ids_by_type["hospital"]

# ---------------------------------------------------------------------------
# 2. Donors
# ---------------------------------------------------------------------------

DONOR_COUNT = 200
donor_org_pool = org_ids_by_type["blood_bank"] + org_ids_by_type["ngo"]

donors = []
for i in range(DONOR_COUNT):
    blood_type = weighted_blood_type()
    org_id = random.choice(donor_org_pool) if random.random() < 0.6 else None

    if random.random() < 0.7:
        days_ago = random.randint(20, 150)
        last_donation_date = TODAY - timedelta(days=days_ago)
    else:
        last_donation_date = None  # first-time / never-recorded donor

    if last_donation_date and (TODAY - last_donation_date).days < 90:
        eligibility_status = "ineligible"  # within the 90-day gap rule, Section 5
    elif random.random() < 0.05:
        eligibility_status = "pending"
    else:
        eligibility_status = "eligible"

    donors.append({
        "donor_id": str(uuid.uuid4()),
        "org_id": org_id,
        "blood_type": blood_type,
        "last_donation_date": last_donation_date,
        "eligibility_status": eligibility_status,
    })

eligible_donors_by_type = {}
for d in donors:
    if d["eligibility_status"] == "eligible":
        eligible_donors_by_type.setdefault(d["blood_type"], []).append(d["donor_id"])

# ---------------------------------------------------------------------------
# 3. Inventory units
# ---------------------------------------------------------------------------

INVENTORY_COUNT = 400
COMPONENT_WEIGHTS = [("whole_blood", 70), ("platelets", 20), ("plasma", 10)]

inventory_units = []
for i in range(INVENTORY_COUNT):
    org_id = random.choice(stock_holding_org_ids)
    component = weighted_choice(COMPONENT_WEIGHTS)

    # 70% of units trace back to an actual donor (and inherit that donor's
    # blood type -- a unit can't have a different type than who gave it).
    donor_id = None
    if random.random() < 0.7 and donors:
        donor = random.choice(donors)
        donor_id = donor["donor_id"]
        blood_type = donor["blood_type"]
    else:
        blood_type = weighted_blood_type()

    collection_days_ago = random.randint(0, 30)
    collection_date = TODAY - timedelta(days=collection_days_ago)
    expiry_date = collection_date + timedelta(days=SHELF_LIFE_DAYS[component])

    if expiry_date < TODAY:
        status = "expired"  # logical consistency: past-expiry units MUST be expired
    else:
        status = weighted_choice([("available", 70), ("reserved", 20), ("dispatched", 10)])

    inventory_units.append({
        "unit_id": str(uuid.uuid4()),
        "org_id": org_id,
        "donor_id": donor_id,
        "blood_type": blood_type,
        "component": component,
        "collection_date": collection_date,
        "expiry_date": expiry_date,
        "status": status,
    })

# Track which reserved/dispatched units are still free to be "claimed" by
# an allocation_record below, keyed by (blood_type, component).
claimable_units = {}
for u in inventory_units:
    if u["status"] in ("reserved", "dispatched"):
        claimable_units.setdefault((u["blood_type"], u["component"]), []).append(u["unit_id"])

# ---------------------------------------------------------------------------
# 4. Requests (+ allocation_records + donor_mobilizations, generated together
#    so fulfillment_path stays logically consistent with what actually
#    got linked to each request)
# ---------------------------------------------------------------------------

REQUEST_COUNT = 100
URGENCY_WEIGHTS = [("routine", 45), ("urgent", 25), ("critical", 15), ("elective", 15)]
REQ_COMPONENT_WEIGHTS = [("whole_blood", 60), ("platelets", 25), ("plasma", 15)]

requests = []
allocation_records = []
donor_mobilizations = []
used_donor_for_request = set()  # (request_id, donor_id) pairs, avoid duplicate invites

for i in range(REQUEST_COUNT):
    org_id = random.choice(org_ids_by_type["hospital"])
    blood_type = weighted_blood_type()
    component = weighted_choice(REQ_COMPONENT_WEIGHTS)
    quantity = weighted_choice([(1, 40), (2, 35), (3, 15), (4, 10)])
    urgency_tier = weighted_choice(URGENCY_WEIGHTS)

    created_days_ago = random.randint(0, 30)
    created_at = TODAY - timedelta(days=created_days_ago)

    needed_by_date = None
    if urgency_tier == "elective":
        needed_by_date = TODAY + timedelta(days=random.randint(2, 14))

    request_id = str(uuid.uuid4())

    # Decide a plausible outcome per Section 7A/7B, without literally
    # re-running the optimization engine here.
    if urgency_tier == "elective":
        outcome = weighted_choice([("scheduled_reservation", 50), ("scheduled_donor_mobilization", 30), (None, 20)])
    elif urgency_tier == "critical":
        outcome = weighted_choice([("inventory", 50), ("parallel_critical", 30), (None, 20)])
    else:  # urgent, routine
        outcome = weighted_choice([("inventory", 55), ("donor_fallback", 20), (None, 25)])

    fulfillment_path = outcome

    requests.append({
        "request_id": request_id,
        "org_id": org_id,
        "blood_type": blood_type,
        "component": component,
        "quantity": quantity,
        "urgency_tier": urgency_tier,
        "needed_by_date": needed_by_date,
        "fulfillment_path": fulfillment_path,
        "created_at": created_at,
    })

    # -- inventory outcome: link real reserved/dispatched units --
    if fulfillment_path in ("inventory", "scheduled_reservation"):
        key = (blood_type, component)
        pool = claimable_units.get(key, [])
        take = min(quantity, len(pool))
        for _ in range(take):
            unit_id = pool.pop()
            req_district = org_district_by_id[org_id]
            unit_org = next(u["org_id"] for u in inventory_units if u["unit_id"] == unit_id)
            unit_district = org_district_by_id[unit_org]
            distance_km = 0 if unit_district == req_district else round(random.uniform(30, 300), 1)
            allocated_days_after = random.randint(0, 2)
            allocation_records.append({
                "allocation_id": str(uuid.uuid4()),
                "request_id": request_id,
                "unit_id": unit_id,
                "allocated_at": created_at + timedelta(days=allocated_days_after),
                "distance_km": distance_km,
            })

    # -- donor outcome: invite compatible eligible donors --
    if fulfillment_path in ("donor_fallback", "parallel_critical", "scheduled_donor_mobilization"):
        compatible_types = compatible_donor_types(blood_type, component)
        candidates = []
        for bt in compatible_types:
            candidates.extend(eligible_donors_by_type.get(bt, []))
        random.shuffle(candidates)
        invite_count = min(random.randint(1, 5), len(candidates))
        for donor_id in candidates[:invite_count]:
            if (request_id, donor_id) in used_donor_for_request:
                continue
            used_donor_for_request.add((request_id, donor_id))
            invite_status = weighted_choice([("invited", 60), ("confirmed", 25), ("declined", 15)])
            slot_date = None
            if invite_status == "confirmed":
                slot_date = TODAY + timedelta(days=random.randint(1, 10))
            donor_mobilizations.append({
                "mobilization_id": str(uuid.uuid4()),
                "request_id": request_id,
                "donor_id": donor_id,
                "invite_status": invite_status,
                "slot_date": slot_date,
            })

# ---------------------------------------------------------------------------
# Sanity checks -- fail loudly here rather than writing broken SQL
# ---------------------------------------------------------------------------

all_org_ids = {o["org_id"] for o in organizations}
all_donor_ids = {d["donor_id"] for d in donors}
all_unit_ids = {u["unit_id"] for u in inventory_units}
all_request_ids = {r["request_id"] for r in requests}

for d in donors:
    assert d["org_id"] is None or d["org_id"] in all_org_ids
for u in inventory_units:
    assert u["org_id"] in all_org_ids
    assert u["donor_id"] is None or u["donor_id"] in all_donor_ids
for r in requests:
    assert r["org_id"] in all_org_ids
for a in allocation_records:
    assert a["request_id"] in all_request_ids
    assert a["unit_id"] in all_unit_ids
for m in donor_mobilizations:
    assert m["request_id"] in all_request_ids
    assert m["donor_id"] in all_donor_ids

# no unit double-claimed across allocation_records
claimed = [a["unit_id"] for a in allocation_records]
assert len(claimed) == len(set(claimed)), "a unit was allocated to more than one request!"

print("Sanity checks passed.")
print(f"Organizations: {len(organizations)}")
print(f"Donors: {len(donors)} (eligible: {sum(1 for d in donors if d['eligibility_status']=='eligible')})")
print(f"Inventory units: {len(inventory_units)} "
      f"(available: {sum(1 for u in inventory_units if u['status']=='available')}, "
      f"reserved: {sum(1 for u in inventory_units if u['status']=='reserved')}, "
      f"dispatched: {sum(1 for u in inventory_units if u['status']=='dispatched')}, "
      f"expired: {sum(1 for u in inventory_units if u['status']=='expired')})")
print(f"Requests: {len(requests)}")
print(f"Allocation records: {len(allocation_records)}")
print(f"Donor mobilizations: {len(donor_mobilizations)}")

# ---------------------------------------------------------------------------
# Write SQL
# ---------------------------------------------------------------------------

lines = []
lines.append("-- RoktoNet Phase 3 Seed Dataset")
lines.append(f"-- Generated {TODAY.isoformat()} -- a snapshot, not a time series")
lines.append("-- Blood type distribution calibrated to: Karim S, Hoque MM et al.,")
lines.append("-- J Dhaka Med Coll. 2015;24(1):53-56 (n=39,512 Bangladeshi donors)")
lines.append("-- Run this in pgAdmin's Query Tool against the 'roktonet' database.")
lines.append("-- Recommended: TRUNCATE all 7 tables first for a clean load.")
lines.append("")

lines.append("-- 1. Organizations")
for o in organizations:
    lines.append(
        f"INSERT INTO organizations (org_id, name, org_type, district) VALUES "
        f"({sql_val(o['org_id'])}, {sql_val(o['name'])}, {sql_val(o['org_type'])}, {sql_val(o['district'])});"
    )

lines.append("")
lines.append("-- 2. Donors")
for d in donors:
    lines.append(
        f"INSERT INTO donors (donor_id, org_id, blood_type, last_donation_date, eligibility_status) VALUES "
        f"({sql_val(d['donor_id'])}, {sql_val(d['org_id'])}, {sql_val(d['blood_type'])}, "
        f"{sql_val(d['last_donation_date'])}, {sql_val(d['eligibility_status'])});"
    )

lines.append("")
lines.append("-- 3. Inventory units")
for u in inventory_units:
    lines.append(
        f"INSERT INTO inventory_units (unit_id, org_id, donor_id, blood_type, component, "
        f"collection_date, expiry_date, status) VALUES "
        f"({sql_val(u['unit_id'])}, {sql_val(u['org_id'])}, {sql_val(u['donor_id'])}, "
        f"{sql_val(u['blood_type'])}, {sql_val(u['component'])}, {sql_val(u['collection_date'])}, "
        f"{sql_val(u['expiry_date'])}, {sql_val(u['status'])});"
    )

lines.append("")
lines.append("-- 4. Requests")
for r in requests:
    lines.append(
        f"INSERT INTO requests (request_id, org_id, blood_type, component, quantity, urgency_tier, "
        f"needed_by_date, fulfillment_path, created_at) VALUES "
        f"({sql_val(r['request_id'])}, {sql_val(r['org_id'])}, {sql_val(r['blood_type'])}, "
        f"{sql_val(r['component'])}, {sql_val(r['quantity'])}, {sql_val(r['urgency_tier'])}, "
        f"{sql_val(r['needed_by_date'])}, {sql_val(r['fulfillment_path'])}, {sql_val(r['created_at'])});"
    )

lines.append("")
lines.append("-- 5. Allocation records")
for a in allocation_records:
    lines.append(
        f"INSERT INTO allocation_records (allocation_id, request_id, unit_id, allocated_at, distance_km) VALUES "
        f"({sql_val(a['allocation_id'])}, {sql_val(a['request_id'])}, {sql_val(a['unit_id'])}, "
        f"{sql_val(a['allocated_at'])}, {sql_val(a['distance_km'])});"
    )

lines.append("")
lines.append("-- 6. Donor mobilizations")
for m in donor_mobilizations:
    lines.append(
        f"INSERT INTO donor_mobilizations (mobilization_id, request_id, donor_id, invite_status, slot_date) VALUES "
        f"({sql_val(m['mobilization_id'])}, {sql_val(m['request_id'])}, {sql_val(m['donor_id'])}, "
        f"{sql_val(m['invite_status'])}, {sql_val(m['slot_date'])});"
    )

with open("seed_data.sql", "w") as f:
    f.write("\n".join(lines) + "\n")

print("\nWrote seed_data.sql")
