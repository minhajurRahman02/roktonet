"""
RoktoNet Optimization Engine v1 (MVP) -- with distance + fairness

Given a batch of pending requests and the current inventory pool, decides
which specific inventory units get assigned to which request.

Objective (in priority order, enforced via weight magnitude):
  1. Minimize unmet demand, weighted heavily by urgency. This always wins --
     nothing below can trade away a fulfilled critical request.
  2. Prefer sourcing from the SAME DISTRICT as the requesting hospital
     (district-level stand-in for real distance -- swap for real km later).
  3. Reward spreading a single request's units across multiple orgs rather
     than draining one org repeatedly (Section 7 fairness goal).
  4. Prefer using units that expire soonest, to reduce future wastage.

All of 2-4 are small "tie-break" weights -- they only matter when the
solver already has multiple equally-good ways to satisfy urgency.
"""

import pulp
from compatibility import is_compatible

URGENCY_WEIGHT = {
    "critical": 1000,
    "urgent": 100,
    "routine": 10,
    "elective": 1,
    "restock": 0.5,  # lowest priority -- a blood bank topping up its own
                     # stock never outweighs any patient-facing request,
                     # and only ever consumes genuine surplus. See
                     # dashboard_specification.md Section 4 for the full
                     # reasoning -- this single line is the entire change
                     # needed, since the shortfall-weighted objective
                     # below already guarantees the priority ordering.
}

# Cost added per unit sourced from a different district than the requester.
# 0 if same district. This is a placeholder for real distance/km data.
DIFFERENT_DISTRICT_PENALTY = 5

# Tie-break weights -- all far smaller than any urgency weight, so they
# can never cause a request to go unfulfilled just to save a little
# distance/fairness/expiry cost.
DISTANCE_WEIGHT = 0.05
FAIRNESS_REWARD = 0.02
EXPIRY_TIE_BREAK_WEIGHT = 0.01


def allocate(requests: list[dict], inventory: list[dict], organizations: dict) -> dict:
    """
    requests:      list of {request_id, blood_type, component, quantity, urgency_tier, org_id}
    inventory:     list of {unit_id, blood_type, component, days_until_expiry, org_id}
    organizations: {org_id: district}

    Returns: {
        "assignments": [{request_id, unit_id}, ...],
        "shortfalls": {request_id: unfulfilled_quantity},
        "status": solver status string,
    }
    """
    prob = pulp.LpProblem("RoktoNet_Allocation", pulp.LpMinimize)

    # going through every unit, for every unit going through every request, if compatible, assign that unit
    x = {}
    for unit in inventory:
        for req in requests:
            if unit["component"] == req["component"] and is_compatible(
                unit["blood_type"], req["blood_type"], unit["component"]
            ):
                x[(unit["unit_id"], req["request_id"])] = pulp.LpVariable(
                    f"x_{unit['unit_id']}_{req['request_id']}", cat="Binary"
                )

    shortfall = {
        req["request_id"]: pulp.LpVariable(
            f"shortfall_{req['request_id']}", lowBound=0)
        for req in requests
    }

    # --- Fairness variables: one per (org, request) pair that COULD contribute ---
    # used[org, request] = 1 only if that org actually supplies >=1 unit to
    # that request (see the "used <= contribution" constraint below).
    org_ids = set(organizations.keys())
    used = {}
    for req in requests:
        orgs_with_compatible_stock = {
            unit["org_id"] for unit in inventory
            if (unit["unit_id"], req["request_id"]) in x
        }
        for org_id in orgs_with_compatible_stock:
            used[(org_id, req["request_id"])] = pulp.LpVariable(
                f"used_{org_id}_{req['request_id']}", cat="Binary"
            )

    # --- Objective ---
    expiry_cost = {u["unit_id"]: u["days_until_expiry"] for u in inventory}
    unit_org = {u["unit_id"]: u["org_id"] for u in inventory}
    req_district = {r["request_id"]: organizations[r["org_id"]]
                    for r in requests}
    unit_district = {u["unit_id"]: organizations[u["org_id"]]
                     for u in inventory}

    def distance_cost(unit_id, request_id):
        return 0 if unit_district[unit_id] == req_district[request_id] else DIFFERENT_DISTRICT_PENALTY

    prob += (
        pulp.lpSum(URGENCY_WEIGHT[req["urgency_tier"]] *
                   shortfall[req["request_id"]] for req in requests)
        + DISTANCE_WEIGHT *
        pulp.lpSum(distance_cost(uid, rid) *
                   var for (uid, rid), var in x.items())
        - FAIRNESS_REWARD * pulp.lpSum(used.values())
        + EXPIRY_TIE_BREAK_WEIGHT *
        pulp.lpSum(expiry_cost[uid] * var for (uid, rid), var in x.items())
    )

    # constraints:
    # each inventory unit assigned to at most one request
    for unit in inventory:
        vars_for_unit = [x[(unit["unit_id"], req["request_id"])] for req in requests
                         if (unit["unit_id"], req["request_id"]) in x]
        if vars_for_unit:
            prob += pulp.lpSum(vars_for_unit) <= 1

    # assigned unit + shortfall = actual quantity
    for req in requests:
        vars_for_req = [x[(unit["unit_id"], req["request_id"])] for unit in inventory
                        if (unit["unit_id"], req["request_id"]) in x]
        prob += pulp.lpSum(vars_for_req) + \
            shortfall[req["request_id"]] == req["quantity"]

    # Fairness link: an org's "used" flag can only be 1 if it actually
    # contributed >=1 unit to that request. See explanation in chat --
    # this direction (contribution >= used) is what stops the solver from
    # claiming the fairness reward for free.
    for (org_id, request_id), used_var in used.items():
        contribution_vars = [
            x[(unit["unit_id"], request_id)] for unit in inventory
            if unit["org_id"] == org_id and (unit["unit_id"], request_id) in x
        ]
        prob += pulp.lpSum(contribution_vars) >= used_var

    prob.solve(pulp.PULP_CBC_CMD(msg=0))

    assignments = [
        {"request_id": rid, "unit_id": uid}
        for (uid, rid), var in x.items()
        if var.value() == 1
    ]
    shortfalls = {rid: int(var.value())
                  for rid, var in shortfall.items() if var.value() > 0}

    return {"assignments": assignments, "shortfalls": shortfalls, "status": pulp.LpStatus[prob.status]}
