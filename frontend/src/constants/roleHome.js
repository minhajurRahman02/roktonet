// Where each role's dashboard lives. Single source of truth -- this used
// to be copy-pasted separately into Login.jsx and Unauthorized.jsx, which
// is exactly how a bank's post-login redirect got left pointing at the
// old hospital-shell placeholder after Blood Bank got its own real
// dashboard: one copy was updated, the other wasn't. Both files now
// import from here instead.
export const ROLE_HOME = {
  admin: '/admin',
  hospital: '/hospital',
  bank: '/blood-bank',
  // ngo/donor still land in the shared hospital shell as a placeholder
  // until their own dashboards are built (Phase 7.8) -- update here,
  // once, when that happens.
  ngo: '/hospital',
  donor: '/hospital',
};
