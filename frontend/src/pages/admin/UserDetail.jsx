import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useParams } from 'react-router-dom';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import Input from '../../components/atoms/Input';
import Select from '../../components/atoms/Select';
import UrgencyBadge from '../../components/atoms/UrgencyBadge';
import StatCard from '../../components/admin/StatCard';
import StatusBadge from '../../components/admin/StatusBadge';
import Modal from '../../components/admin/Modal';
import { Table, Th, Td, shortId, fmtDate } from '../../components/admin/Table';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { getUser, updateUser, requestViewToken } from '../../api/admin';
import { listOrganizations } from '../../api/organizations';
import { ROLE_HOME } from '../../constants/roleHome';
import { getEligibilityBreakdown, formatEligibilityShort } from '../../utils/eligibility';
import { relativeTime } from '../../utils/relativeTime';

const ORG_ROLES = ['hospital', 'bank', 'ngo'];

// 7.7a: which tabs are capped server-side, and where the full list lives.
//
// GET /api/admin/users/:id caps these (200 inventory, 100 allocations, 50
// restock, 50 actions, 20 notifications) and returns the whole bundle as
// ONE response, so the tabs cannot each take a ?page= of their own.
// Rather than split into five sub-endpoints, the backend now reports the
// real totals and this map lets the UI say so out loud.
//
// Tabs absent from this map are genuinely uncapped (drives, donation
// history, invites) and need no note.
const TAB_TOTALS = {
  requests: { key: 'requests_total', noun: 'requests', href: '/admin/requests' },
  inventory: { key: 'inventory_total', noun: 'units', href: '/admin/inventory' },
  outgoing_allocations: { key: 'outgoing_allocations_total', noun: 'allocations' },
  restock_requests: { key: 'restock_requests_total', noun: 'restock requests', href: '/admin/requests' },
  recent_actions: { key: 'recent_actions_total', noun: 'actions', href: '/admin/audit' },
  notifications: { key: 'notifications_total', noun: 'notifications' },
};

/** Renders nothing while everything fits, which is the normal case. */
function TruncationNote({ tab, d }) {
  const meta = TAB_TOTALS[tab];
  if (!meta) return null;
  const shown = d[tab]?.length || 0;
  const total = d[meta.key];
  if (!total || total <= shown) return null;
  return (
    <p className="px-4 py-2 text-xs text-urgent-text dark:text-urgent-dtext">
      Showing the most recent {shown} of {total} {meta.noun}.
      {meta.href && <> <Link to={meta.href} className="underline">Open the full list</Link> for the rest.</>}
    </p>
  );
}
TruncationNote.propTypes = { tab: PropTypes.string.isRequired, d: PropTypes.object.isRequired };

function initials(name, email) {
  const src = name || email || '?';
  return src.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Which tabs a role's bundle has, and the KPI cards above them. Mirrors
// the role-specific bundle GET /api/admin/users/:id assembles.
function roleTabs(role, d) {
  switch (role) {
    case 'hospital':
      return {
        cards: [[d.requests?.length || 0, 'Requests'], [d.requests?.filter((r) => !r.fulfillment_path && !r.cancelled_at).length || 0, 'Pending'], [d.requests?.filter((r) => r.cancelled_at).length || 0, 'Cancelled'], [d.notifications?.filter((n) => !n.is_read).length || 0, 'Unread notifications']],
        tabs: [['requests', `Requests (${d.requests?.length || 0})`], ['notifications', `Notifications (${d.notifications?.length || 0})`]],
      };
    case 'bank':
    case 'ngo':
      return {
        cards: [[d.inventory?.length || 0, 'Inventory units'], [d.outgoing_allocations?.length || 0, 'Outgoing allocations'], [role === 'ngo' ? d.drives?.length || 0 : d.restock_requests?.filter((r) => !r.fulfillment_path && !r.cancelled_at).length || 0, role === 'ngo' ? 'Blood drives' : 'Open restock requests'], [d.notifications?.filter((n) => !n.is_read).length || 0, 'Unread notifications']],
        tabs: [['inventory', `Inventory (${d.inventory?.length || 0})`], ['outgoing_allocations', `Outgoing allocations (${d.outgoing_allocations?.length || 0})`], ['drives', `Drives (${d.drives?.length || 0})`], ['restock_requests', `Restock (${d.restock_requests?.length || 0})`], ['notifications', `Notifications (${d.notifications?.length || 0})`]],
      };
    case 'donor':
      return {
        cards: [[d.donor?.blood_type || '—', 'Blood type'], [d.donation_history?.length || 0, 'Donations'], [d.invites?.length || 0, 'Invites received'], [d.donor ? (getEligibilityBreakdown(d.donor).eligible ? 'Eligible' : 'In cooldown') : 'unlinked', 'Eligibility']],
        tabs: [['donor', 'Donor record'], ['donation_history', `Donation history (${d.donation_history?.length || 0})`], ['invites', `Invites (${d.invites?.length || 0})`], ['notifications', `Notifications (${d.notifications?.length || 0})`]],
      };
    case 'admin':
      return {
        cards: [[d.recent_actions?.length || 0, 'Recent actions'], [d.notifications?.length || 0, 'Notifications'], ['—', ''], ['—', '']],
        tabs: [['recent_actions', `Recent actions (${d.recent_actions?.length || 0})`], ['notifications', `Notifications (${d.notifications?.length || 0})`]],
      };
    default:
      return { cards: [], tabs: [] };
  }
}

function TabContent({ tab, d }) {
  const rows = d[tab];
  if (tab === 'donor') {
    if (!d.donor) return <EmptyState message="This account has no linked donor record." />;
    const x = d.donor;
    return (
      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {[['Blood type', x.blood_type], ['Sex', x.sex || '—'], ['NGO', x.org_name || 'self-registered'], ['Phone', x.phone_number || '—'], ['District', x.current_district || '—'], ['Thana', x.current_thana || '—'], ['Last donation', x.last_donation_date ? `${fmtDate(x.last_donation_date)} · ${x.last_donation_component}` : 'never'], ['Eligibility', <span key="e" className="mono text-xs">{formatEligibilityShort(x)}</span>]].map(([k, v]) => (
          <div key={k}><p className="text-xs text-gray-500">{k}</p><p className="mt-0.5 dark:text-textprimary-dark">{v}</p></div>
        ))}
      </div>
    );
  }
  if (!rows || rows.length === 0) return <EmptyState message="Nothing here." />;
  const t = { tab };
  return (
    <>
    <Table>
      {t.tab === 'requests' || t.tab === 'restock_requests' ? (
        <>
          <thead><tr><Th>Request</Th><Th>Need</Th><Th>Urgency</Th><Th>Path</Th><Th>Created</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.request_id}><Td mono>{shortId(r.request_id)}</Td><Td>{r.blood_type} · {r.component} · {r.quantity}</Td><Td>{r.urgency_tier && <UrgencyBadge urgencyTier={r.urgency_tier} />}</Td><Td><StatusBadge value={r.cancelled_at ? 'cancelled' : r.fulfillment_path || 'pending'} /></Td><Td muted>{fmtDate(r.created_at)}</Td></tr>)}</tbody>
        </>
      ) : t.tab === 'inventory' ? (
        <>
          <thead><tr><Th>Unit</Th><Th>Type</Th><Th>Component</Th><Th>Status</Th><Th>Expires</Th><Th>From drive</Th></tr></thead>
          <tbody>{rows.map((u) => <tr key={u.unit_id}><Td mono>{shortId(u.unit_id)}</Td><Td>{u.blood_type}</Td><Td>{u.component}</Td><Td><StatusBadge value={u.status} /></Td><Td>{fmtDate(u.expiry_date)}</Td><Td muted>{u.drive_id ? shortId(u.drive_id) : '—'}</Td></tr>)}</tbody>
        </>
      ) : t.tab === 'outgoing_allocations' ? (
        <>
          <thead><tr><Th>Unit</Th><Th>Type</Th><Th>To hospital</Th><Th>Urgency</Th><Th>Unit status</Th><Th>Allocated</Th></tr></thead>
          <tbody>{rows.map((a) => <tr key={`${a.request_id}-${a.unit_id}`}><Td mono>{shortId(a.unit_id)}</Td><Td>{a.blood_type}</Td><Td>{a.hospital_name}</Td><Td><UrgencyBadge urgencyTier={a.urgency_tier} /></Td><Td><StatusBadge value={a.status} /></Td><Td muted>{fmtDate(a.allocated_at)}</Td></tr>)}</tbody>
        </>
      ) : t.tab === 'drives' ? (
        <>
          <thead><tr><Th>Title</Th><Th>Location</Th><Th>Date</Th><Th>Target</Th><Th>Status</Th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.drive_id}><Td className="font-medium">{x.title}</Td><Td muted>{x.location}</Td><Td>{fmtDate(x.drive_date)}</Td><Td>{x.target_units ?? '—'}</Td><Td><StatusBadge value={x.status} /></Td></tr>)}</tbody>
        </>
      ) : t.tab === 'donation_history' ? (
        <>
          <thead><tr><Th>Unit</Th><Th>Type</Th><Th>Component</Th><Th>Collected</Th><Th>At</Th><Th>Drive</Th><Th>Status</Th></tr></thead>
          <tbody>{rows.map((u) => <tr key={u.unit_id}><Td mono>{shortId(u.unit_id)}</Td><Td>{u.blood_type}</Td><Td>{u.component}</Td><Td>{fmtDate(u.collection_date)}</Td><Td>{u.org_name || '—'}</Td><Td muted>{u.drive_title || '—'}</Td><Td><StatusBadge value={u.status} /></Td></tr>)}</tbody>
        </>
      ) : t.tab === 'invites' ? (
        <>
          <thead><tr><Th>Request</Th><Th>From</Th><Th>Need</Th><Th>Urgency</Th><Th>Response</Th><Th>Slot</Th></tr></thead>
          <tbody>{rows.map((m) => <tr key={m.mobilization_id}><Td mono>{shortId(m.request_id)}</Td><Td>{m.requesting_org_name}</Td><Td>{m.blood_type}</Td><Td><UrgencyBadge urgencyTier={m.urgency_tier} /></Td><Td><StatusBadge value={m.invite_status} /></Td><Td muted>{fmtDate(m.slot_date)}</Td></tr>)}</tbody>
        </>
      ) : t.tab === 'recent_actions' ? (
        <>
          <thead><tr><Th>When</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th></tr></thead>
          <tbody>{rows.map((a) => <tr key={a.action_id}><Td muted>{relativeTime(a.created_at)}</Td><Td><StatusBadge value="pending" label={a.action_type} /></Td><Td mono>{a.target_type ? `${a.target_type} ${shortId(a.target_id)}` : '—'}</Td><Td mono muted>{a.details ? JSON.stringify(a.details).slice(0, 90) : '—'}</Td></tr>)}</tbody>
        </>
      ) : (
        <>
          <thead><tr><Th>When</Th><Th>Type</Th><Th>Message</Th><Th>Read</Th></tr></thead>
          <tbody>{rows.map((n) => <tr key={n.notification_id}><Td muted>{relativeTime(n.created_at)}</Td><Td><StatusBadge value="pending" label={n.type} /></Td><Td>{n.message}</Td><Td>{n.is_read ? '✓' : <span className="text-gray-400">—</span>}</Td></tr>)}</tbody>
        </>
      )}
    </Table>
    <TruncationNote tab={tab} d={d} />
    </>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me, startViewAs } = useAuth();
  const detail = useAsync(() => getUser(id), [id]);
  const orgs = useAsync(() => listOrganizations(), []);
  const [tab, setTab] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deactOpen, setDeactOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [viewAsBusy, setViewAsBusy] = useState(false);

  if (detail.status === 'loading') return <div className="p-6"><LoadingState rows={6} /></div>;
  if (detail.status === 'error') return <div className="p-6"><ErrorState message={detail.error} onRetry={detail.reload} /></div>;
  const d = detail.data;
  const u = d.user;
  const { cards, tabs } = roleTabs(u.role, d);
  const activeTab = tab || tabs[0]?.[0];
  const isSelf = me?.user_id === u.user_id;
  const isOtherAdmin = u.role === 'admin' && !isSelf;

  const openEdit = () => { setForm({ full_name: u.full_name || '', email: u.email, org_id: u.org_id || '' }); setActionError(''); setEditOpen(true); };

  const saveEdit = async (e) => {
    e.preventDefault();
    setBusy(true); setActionError('');
    const patch = {};
    if (form.full_name !== (u.full_name || '')) patch.full_name = form.full_name;
    if (form.email !== u.email) patch.email = form.email;
    if (ORG_ROLES.includes(u.role) && form.org_id !== (u.org_id || '')) patch.org_id = form.org_id || null;
    try {
      if (Object.keys(patch).length) await updateUser(u.user_id, patch);
      setEditOpen(false); detail.refresh();
    } catch (err) { setActionError(err.message); } finally { setBusy(false); }
  };

  const setActive = async (is_active) => {
    setBusy(true); setActionError('');
    try { await updateUser(u.user_id, { is_active }); setDeactOpen(false); detail.refresh(); }
    catch (err) { setActionError(err.message); } finally { setBusy(false); }
  };

  const viewAs = async () => {
    setViewAsBusy(true); setActionError('');
    try {
      const res = await requestViewToken(u.user_id);
      // 7.7a: the navigation is passed INTO startViewAs rather than run
      // after it. Awaiting first flipped user.role to the viewed role
      // while the router was still on /admin/users/:id, so
      // RoleRoute(['admin']) redirected to /unauthorized and unmounted
      // this component -- and the navigate on the next line then ran from
      // a dead component and did nothing.
      await startViewAs(
        res.token,
        res.viewing,
        res.expires_in,
        () => navigate(ROLE_HOME[res.viewing.role] || '/')
      );
    } catch (err) { setActionError(err.message); setViewAsBusy(false); }
  };

  return (
    <div className="p-6">
      <Link to="/admin/users" className="text-xs text-gray-500 hover:text-primary dark:text-textsecondary-dark">← Back to users</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mt-2 mb-6">
        <div className="flex items-center gap-4">
          {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" /> : <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-lg font-semibold">{initials(u.full_name, u.email)}</div>}
          <div>
            <h1 className="font-display font-bold text-2xl dark:text-textprimary-dark flex items-center gap-2 flex-wrap">
              {u.full_name || u.email}
              <StatusBadge value={u.role} />
              <StatusBadge value={u.is_active ? 'active' : 'deactivated'} label={u.is_active ? 'Active' : 'Deactivated'} />
              {u.is_primary_admin && <span className="text-xs text-gray-400 font-body font-normal">primary admin</span>}
            </h1>
            <p className="text-sm text-gray-500 dark:text-textsecondary-dark">
              {u.email}{u.org_name ? ` · ${u.org_name}${u.org_district ? `, ${u.org_district}` : ''}` : ''} · joined {fmtDate(u.created_at)} · {u.is_verified ? 'verified' : 'not verified'}
            </p>
          </div>
        </div>
        {!isOtherAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={openEdit}>Edit</Button>
            {u.role !== 'admin' && u.is_active && <Button variant="secondary" onClick={viewAs} loading={viewAsBusy}>View as user</Button>}
            {!isSelf && !u.is_primary_admin && (u.is_active
              ? <Button variant="critical" onClick={() => setDeactOpen(true)}>Deactivate</Button>
              : <Button onClick={() => setActive(true)} loading={busy}>Reactivate</Button>)}
          </div>
        )}
      </div>
      {isOtherAdmin && <p className="text-xs text-gray-400 mb-4">Admin accounts can only be edited by their owner.</p>}
      {actionError && !editOpen && !deactOpen && <div className="mb-4"><ErrorState message={actionError} /></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {cards.filter(([, l]) => l).map(([v, l]) => <StatCard key={l} value={v} label={l} />)}
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-white/10 mb-4 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`text-sm px-3 py-2 border-b-2 whitespace-nowrap ${activeTab === k ? 'border-primary text-primary dark:text-textprimary-dark font-medium' : 'border-transparent text-gray-500 dark:text-textsecondary-dark hover:text-primary'}`}>{label}</button>
        ))}
      </div>
      {activeTab && <TabContent tab={activeTab} d={d} />}

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit user"
        footer={<><Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button><Button type="submit" form="edit-user-form" loading={busy}>Save</Button></>}>
        {form && (
          <form id="edit-user-form" onSubmit={saveEdit} className="space-y-3">
            <div><label className="text-xs text-gray-500">Full name</label><Input className="mt-1" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label className="text-xs text-gray-500">Email</label><Input className="mt-1" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            {ORG_ROLES.includes(u.role) && (
              <div><label className="text-xs text-gray-500">Organization</label>
                <Select className="mt-1" value={form.org_id} onChange={(e) => setForm({ ...form, org_id: e.target.value })}>
                  <option value="">— none —</option>
                  {(orgs.data || []).map((o) => <option key={o.org_id} value={o.org_id}>{o.name} ({o.org_type})</option>)}
                </Select>
              </div>
            )}
            <div className="opacity-50"><label className="text-xs text-gray-500">Role</label><Input className="mt-1" value={u.role} disabled /></div>
            <p className="text-xs text-gray-400">Role can&apos;t be changed — a bank account owns inventory; a donor account has a linked donor record. Deactivate and create a new account instead.</p>
            {actionError && <p className="text-sm text-critical-text dark:text-critical-dtext">{actionError}</p>}
          </form>
        )}
      </Modal>

      <Modal isOpen={deactOpen} onClose={() => setDeactOpen(false)} title={`Deactivate ${u.full_name || u.email}?`}
        footer={<><Button variant="ghost" onClick={() => setDeactOpen(false)}>Keep active</Button><Button variant="critical" onClick={() => setActive(false)} loading={busy}>Deactivate</Button></>}>
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark">They will be blocked on their very next request and unable to log in. Their records, allocations and history stay intact. You can reactivate at any time.</p>
        {actionError && <p className="text-sm text-critical-text dark:text-critical-dtext mt-3">{actionError}</p>}
      </Modal>
    </div>
  );
}

TabContent.propTypes = { tab: PropTypes.string.isRequired, d: PropTypes.object.isRequired };