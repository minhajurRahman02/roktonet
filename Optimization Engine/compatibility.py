WHOLE_BLOOD_COMPATIBILITY = {
    "O-":  {"O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"},
    "O+":  {"O+", "A+", "B+", "AB+"},
    "A-":  {"A-", "A+", "AB-", "AB+"},
    "A+":  {"A+", "AB+"},
    "B-":  {"B-", "B+", "AB-", "AB+"},
    "B+":  {"B+", "AB+"},
    "AB-": {"AB-", "AB+"},
    "AB+": {"AB+"},
}


def is_compatible(donor_blood_type: str, recipient_blood_type: str, component: str) -> bool:
    if component == "whole_blood":
        return recipient_blood_type in WHOLE_BLOOD_COMPATIBILITY.get(donor_blood_type, set())
    return donor_blood_type == recipient_blood_type
