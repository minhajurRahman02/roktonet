from engine import allocate

print("=== Test 1: Urgency priority under scarcity ===")
organizations = {"OrgA": "Dhaka", "OrgReq": "Dhaka"}
inventory = [{"unit_id": "U1", "blood_type": "O-",
              "component": "whole_blood", "days_until_expiry": 5, "org_id": "OrgA"}]
requests = [
    {"request_id": "R_routine", "blood_type": "O-", "component": "whole_blood",
        "quantity": 1, "urgency_tier": "routine", "org_id": "OrgReq"},
    {"request_id": "R_critical", "blood_type": "O-", "component": "whole_blood",
        "quantity": 1, "urgency_tier": "critical", "org_id": "OrgReq"},
]
result = allocate(requests, inventory, organizations)
print("Assignments:", result["assignments"])
print("Shortfalls:", result["shortfalls"])
print("Expect: the unit goes to R_critical, R_routine is short by 1.\n")

print("=== Test 2: Fairness spread under tied conditions ===")
organizations = {"OrgA": "Dhaka", "OrgB": "Dhaka", "OrgReq": "Dhaka"}
inventory = [
    {"unit_id": "U1", "blood_type": "O-", "component": "whole_blood",
        "days_until_expiry": 10, "org_id": "OrgA"},
    {"unit_id": "U2", "blood_type": "O-", "component": "whole_blood",
        "days_until_expiry": 10, "org_id": "OrgA"},
    {"unit_id": "U3", "blood_type": "O-", "component": "whole_blood",
        "days_until_expiry": 10, "org_id": "OrgB"},
]
requests = [{"request_id": "R1", "blood_type": "O-", "component": "whole_blood",
             "quantity": 2, "urgency_tier": "routine", "org_id": "OrgReq"}]
result = allocate(requests, inventory, organizations)
print("Assignments:", result["assignments"])
print("Expect: one unit from OrgA + one from OrgB, not both from OrgA.")
