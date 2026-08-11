"""
Small hand-built sample -- NOT the real Phase 3 simulated dataset.
Now includes organizations/districts so distance and fairness can be tested.
"""

# org_id -> district
ORGANIZATIONS = {
    "Org1": "Dhaka",       # blood bank
    "Org2": "Chittagong",  # blood bank
    "Org3": "Dhaka",       # requesting hospital
    "Org4": "Sylhet",      # NGO
}

# Each inventory unit: id, blood_type, component, days_until_expiry, org_id (who holds it)
INVENTORY = [
    {"unit_id": "U1", "blood_type": "O-",  "component": "whole_blood", "days_until_expiry": 3,  "org_id": "Org1"},
    {"unit_id": "U2", "blood_type": "O-",  "component": "whole_blood", "days_until_expiry": 20, "org_id": "Org1"},
    {"unit_id": "U3", "blood_type": "O+",  "component": "whole_blood", "days_until_expiry": 10, "org_id": "Org2"},
    {"unit_id": "U4", "blood_type": "A+",  "component": "whole_blood", "days_until_expiry": 15, "org_id": "Org1"},
    {"unit_id": "U5", "blood_type": "A+",  "component": "platelets",   "days_until_expiry": 4,  "org_id": "Org2"},
    {"unit_id": "U6", "blood_type": "A+",  "component": "platelets",   "days_until_expiry": 2,  "org_id": "Org4"},
    {"unit_id": "U7", "blood_type": "AB+", "component": "plasma",      "days_until_expiry": 60, "org_id": "Org2"},
    {"unit_id": "U8", "blood_type": "O-",  "component": "whole_blood", "days_until_expiry": 12, "org_id": "Org4"},
    {"unit_id": "U9", "blood_type": "O-",  "component": "whole_blood", "days_until_expiry": 8,  "org_id": "Org2"},
]

# Each request: id, blood_type, component, quantity, urgency_tier, org_id (requesting hospital)
REQUESTS = [
    {"request_id": "R1", "blood_type": "O-", "component": "whole_blood", "quantity": 2, "urgency_tier": "critical", "org_id": "Org3"},
    {"request_id": "R2", "blood_type": "A+", "component": "platelets",   "quantity": 1, "urgency_tier": "routine",  "org_id": "Org3"},
    {"request_id": "R3", "blood_type": "O-", "component": "whole_blood", "quantity": 1, "urgency_tier": "urgent",   "org_id": "Org3"},
]
