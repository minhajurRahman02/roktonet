"""
Blood type compatibility rules.

For whole blood (red cells), donor -> recipient compatibility follows the
standard ABO+Rh chart: O- is the universal donor, AB+ is the universal
recipient.

For platelets and plasma, this v1 simplifies to an EXACT blood type match
only. Real-world platelet/plasma compatibility is more permissive than
whole blood but less standardized -- deferred to a later version.
"""

# donor_blood_type -> set of recipient blood types that donor can give to
WHOLE_BLOOD_COMPATIBILITY = {
    "O-":  {"O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"},  # universal donor
    "O+":  {"O+", "A+", "B+", "AB+"},
    "A-":  {"A-", "A+", "AB-", "AB+"},
    "A+":  {"A+", "AB+"},
    "B-":  {"B-", "B+", "AB-", "AB+"},
    "B+":  {"B+", "AB+"},
    "AB-": {"AB-", "AB+"},
    "AB+": {"AB+"},  # can only give to AB+
}


def is_compatible(donor_blood_type: str, recipient_blood_type: str, component: str) -> bool:
    """Returns True if a unit of `donor_blood_type`/`component` can fulfill
    a request needing `recipient_blood_type`/`component`."""
    if component == "whole_blood":
        return recipient_blood_type in WHOLE_BLOOD_COMPATIBILITY.get(donor_blood_type, set())
    # platelets, plasma: exact match only (v1 simplification)
    return donor_blood_type == recipient_blood_type
