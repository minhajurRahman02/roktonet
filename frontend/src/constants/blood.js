// Shared enumerations. Mirrors the CHECK constraints in roktonetSchema.sql.
export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
export const COMPONENTS = ['whole_blood', 'platelets', 'plasma'];
export const URGENCY_TIERS = ['critical', 'urgent', 'routine', 'elective', 'restock'];
export const FULFILLMENT_PATHS = ['inventory', 'donor_fallback', 'parallel_critical', 'scheduled_reservation', 'scheduled_donor_mobilization'];
export const UNIT_STATUSES = ['available', 'reserved', 'dispatched', 'delivered', 'expired'];
export const ORG_TYPES = ['hospital', 'blood_bank', 'ngo'];
