// WHO IS ALLOWED TO HOLD BLOOD THAT CAN BE ALLOCATED TO A REQUEST
//
// Blood banks and NGOs supply blood. Hospitals consume it. A hospital that
// also runs a blood bank registers that bank as its own organization, with
// org_type 'blood_bank' and its own contact email, exactly as an
// independent bank would.
//
// This list exists in one file because the rule has to hold in three
// places that are easy to let drift apart:
//
//   1. services/engineClient.js  -- the optimizer never sees hospital stock
//   2. routes/inventory.js       -- nobody can create a unit under a hospital
//   3. routes/organizations.js   -- reported so the UI can hide inventory
//                                   features from hospitals
//
// Note that org_type and user role are different vocabularies. An
// organization's type is 'blood_bank'; the role on its users row is
// 'bank'. Both mappings are below so neither has to be guessed at a call
// site.

// organizations.org_type values that may own inventory_units.
const SUPPLIER_ORG_TYPES = ['blood_bank', 'ngo'];

// users.role values belonging to those organizations. 'admin' is not an
// org type at all; it appears in route guards because an administrator
// acts on behalf of an organization, and it is checked separately.
const SUPPLIER_ROLES = ['bank', 'ngo'];

// Postgres array literal, for embedding in a query as a parameter.
function isSupplierOrgType(orgType) {
  return SUPPLIER_ORG_TYPES.includes(orgType);
}

module.exports = { SUPPLIER_ORG_TYPES, SUPPLIER_ROLES, isSupplierOrgType };
