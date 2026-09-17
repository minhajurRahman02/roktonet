import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import Input from '../../components/atoms/Input';
import Select from '../../components/atoms/Select';
import FilterBar from '../../components/admin/FilterBar';
import StatusBadge from '../../components/admin/StatusBadge';
import Modal from '../../components/admin/Modal';
import { Table, Th, Td, TableFooter, shortId, fmtDate } from '../../components/admin/Table';
import { useAsync } from '../../hooks/useAsync';
import { listInventory } from '../../api/inventory';
import { updateInventoryUnit } from '../../api/admin';
import { listOrganizations } from '../../api/organizations';
import { getDistricts } from '../../api/locations';
import { BLOOD_TYPES, COMPONENTS, UNIT_STATUSES } from '../../constants/blood';

const STATUS_ORDER = UNIT_STATUSES;
const TERMINAL = ['dispatched', 'delivered'];

function ExpiryBadge({ days }) {
  if (days === null || days === undefined) return null;
  if (days < 0) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext">expired</span>;
  if (days <= 3) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext">{days}d</span>;
  if (days <= 7) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-urgent-bg text-urgent-text dark:bg-urgent-dbg dark:text-urgent-dtext">{days}d</span>;
  return <span className="text-xs text-gray-400">{days}d</span>;
}

export default function AdminInventory() {
  const [filters, setFilters] = useState({ org_id: '', status: '', blood_type: '', component: '', district: '', expiring_within_days: '' });
  const [applied, setApplied] = useState({});
  const units = useAsync(() => listInventory(applied), [applied]);
  const orgs = useAsync(() => listOrganizations(), []);
  const districts = useAsync(getDistricts, []);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const apply = (e) => { e.preventDefault(); setApplied(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))); };

  const openEdit = (u) => { setEditing(u); setForm({ blood_type: u.blood_type, component: u.component, expiry_date: fmtDate(u.expiry_date), status: u.status }); setErr(''); };
  const locked = editing && editing.status !== 'available';
  const allowedStatuses = editing ? STATUS_ORDER.filter((s) => !TERMINAL.includes(editing.status) || STATUS_ORDER.indexOf(s) >= STATUS_ORDER.indexOf(editing.status)) : [];

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const patch = {};
    if (form.expiry_date !== fmtDate(editing.expiry_date)) patch.expiry_date = form.expiry_date;
    if (form.status !== editing.status) patch.status = form.status;
    if (!locked) {
      if (form.blood_type !== editing.blood_type) patch.blood_type = form.blood_type;
      if (form.component !== editing.component) patch.component = form.component;
    }
    try {
      if (Object.keys(patch).length) await updateInventoryUnit(editing.unit_id, patch);
      setEditing(null); units.refresh();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  const sourceOrgs = (orgs.data || []).filter((o) => o.org_type !== 'hospital');

  return (
    <div className="p-6">
      <PageHeader title="Inventory" subtitle="Every unit in every bank and NGO." action={<Link to="/admin/reports"><Button variant="secondary">Export →</Button></Link>} />

      <form onSubmit={apply}>
        <FilterBar cols={7}>
          <Select value={filters.org_id} onChange={set('org_id')}><option value="">All source orgs</option>{sourceOrgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}</Select>
          <Select value={filters.status} onChange={set('status')}><option value="">All statuses</option>{UNIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <Select value={filters.blood_type} onChange={set('blood_type')}><option value="">All blood types</option>{BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}</Select>
          <Select value={filters.component} onChange={set('component')}><option value="">All components</option>{COMPONENTS.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <Select value={filters.district} onChange={set('district')}><option value="">All districts</option>{(districts.data || []).map((d) => <option key={d} value={d}>{d}</option>)}</Select>
          <Select value={filters.expiring_within_days} onChange={set('expiring_within_days')}><option value="">Any expiry</option><option value="3">Expiring ≤ 3 days</option><option value="7">Expiring ≤ 7 days</option><option value="14">Expiring ≤ 14 days</option><option value="30">Expiring ≤ 30 days</option></Select>
          <Button type="submit" variant="secondary">Apply</Button>
        </FilterBar>
      </form>

      {units.status === 'loading' && <LoadingState rows={6} />}
      {units.status === 'error' && <ErrorState message={units.error} onRetry={units.reload} />}
      {units.status === 'success' && units.data.length === 0 && <EmptyState message="No units match these filters." />}
      {units.status === 'success' && units.data.length > 0 && (
        <Table>
          <thead><tr><Th>Unit</Th><Th>Source org</Th><Th>District</Th><Th>Type</Th><Th>Component</Th><Th>Status</Th><Th>Expires</Th><Th>From drive</Th><Th> </Th></tr></thead>
          <tbody>
            {units.data.map((u) => (
              <tr key={u.unit_id} className={u.status === 'expired' ? 'opacity-60' : ''}>
                <Td mono>{shortId(u.unit_id)}</Td>
                <Td>{u.org_name}</Td>
                <Td muted>{u.org_district}</Td>
                <Td>{u.blood_type}</Td>
                <Td>{u.component}</Td>
                <Td><StatusBadge value={u.status} /></Td>
                <Td><span className="mr-2">{fmtDate(u.expiry_date)}</span>{u.status === 'available' && <ExpiryBadge days={u.days_to_expiry} />}</Td>
                <Td muted>{u.drive_id ? shortId(u.drive_id) : '—'}</Td>
                <Td><Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs" onClick={() => openEdit(u)}>Edit</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {units.status === 'success' && units.data.length > 0 && <TableFooter><span>{units.data.length} unit(s)</span></TableFooter>}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit inventory unit"
        subtitle={editing && <>{editing.org_name} · <span className="font-mono text-xs">{shortId(editing.unit_id)}</span> · currently <StatusBadge value={editing.status} /></>}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="edit-unit-form" loading={busy}>Save changes</Button></>}>
        {editing && form && (
          <form id="edit-unit-form" onSubmit={save}>
            <div className={`grid grid-cols-2 gap-3 mb-3 ${locked ? 'opacity-50' : ''}`}>
              <div><label className="text-xs text-gray-500">Blood type</label><Select className="mt-1" disabled={locked} value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })}>{BLOOD_TYPES.map((b) => <option key={b}>{b}</option>)}</Select></div>
              <div><label className="text-xs text-gray-500">Component</label><Select className="mt-1" disabled={locked} value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })}>{COMPONENTS.map((c) => <option key={c}>{c}</option>)}</Select></div>
            </div>
            {locked && <div className="text-xs rounded-lg px-3 py-2 mb-3 border border-dashed border-urgent-border/50 bg-urgent-bg/40 dark:bg-urgent-dbg/40 text-urgent-text dark:text-urgent-dtext">Locked: type and component can only change while a unit is <b>available</b>. Once allocated, they were inputs to the engine&apos;s decision.</div>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-500">Expiry date</label><Input type="date" className="mt-1" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
              <div><label className="text-xs text-gray-500">Status</label><Select className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{allowedStatuses.map((s) => <option key={s}>{s}</option>)}</Select></div>
            </div>
            {TERMINAL.includes(editing.status) && <p className="text-xs text-gray-400 mt-2">A {editing.status} unit can&apos;t be moved backwards — it has physically left the building.</p>}
            {err && <p className="text-sm text-critical-text dark:text-critical-dtext mt-3">{err}</p>}
          </form>
        )}
      </Modal>
    </div>
  );
}

ExpiryBadge.propTypes = { days: PropTypes.number };
