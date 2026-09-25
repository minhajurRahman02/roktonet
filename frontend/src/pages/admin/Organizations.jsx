import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
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
import Pagination from '../../components/molecules/Pagination';
import { Table, Th, Td } from '../../components/admin/Table';
import { useAsync } from '../../hooks/useAsync';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listOrganizations, updateOrganization } from '../../api/organizations';
import { createOrganization } from '../../api/admin';
import DatalistInput from '../../components/atoms/DatalistInput';
import { getDistricts, getThanas } from '../../api/locations';
import { ORG_TYPES } from '../../constants/blood';

function InviteCode({ code }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!code) return <span className="text-xs text-gray-400">none</span>;
  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => setShown((s) => !s)} className={`font-mono text-xs px-2 py-1 rounded bg-gray-100 dark:bg-white/10 dark:text-textprimary-dark ${shown ? 'font-semibold' : ''}`} title={shown ? 'Hide' : 'Reveal'}>
        {shown ? code : '•••••••• reveal'}
      </button>
      {shown && <button type="button" onClick={copy} className="text-xs text-primary dark:text-textsecondary-dark underline">{copied ? 'copied' : 'copy'}</button>}
    </span>
  );
}

const EMPTY = { name: '', org_type: 'hospital', district: '', thana: '', contact_phone: '', contact_email: '' };

export default function AdminOrganizations() {
  const [filters, setFilters] = useState({ search: '', org_type: '', district: '' });
  const [applied, setApplied] = useState({});
  const orgs = usePaginatedAsync(
    ({ page, per_page }) => listOrganizations({ ...applied, page, per_page }),
    [applied],
    { storageKey: 'admin.organizations' }
  );
  const districts = useAsync(getDistricts, []);
  const [modal, setModal] = useState(null); // null | 'create' | org
  const [form, setForm] = useState(EMPTY);

  // 7.7a: same cascading list RegisterDonor.jsx already uses. Thana names
  // are only unique within a district, so an uncascaded list would be both
  // enormous and ambiguous. Keyed off whatever district the form currently
  // holds, so it repopulates correctly when you open Edit on an existing
  // org rather than staying empty until you re-pick the district.
  const [thanas, setThanas] = useState([]);
  useEffect(() => {
    if (!form.district) { setThanas([]); return undefined; }
    let cancelled = false;
    getThanas(form.district)
      .then((list) => { if (!cancelled) setThanas(list); })
      .catch(() => { if (!cancelled) setThanas([]); });
    return () => { cancelled = true; };
  }, [form.district]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const apply = (e) => { e.preventDefault(); setApplied(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))); };
  const openCreate = () => { setForm(EMPTY); setErr(''); setModal('create'); };
  const openEdit = (o) => { setForm({ name: o.name, org_type: o.org_type, district: o.district || '', thana: o.thana || '', contact_phone: o.contact_phone || '', contact_email: o.contact_email || '' }); setErr(''); setModal(o); };

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      if (modal === 'create') {
        // Thana is mandatory now. It is not cosmetic: donorFallback.js ranks
        // candidate donors same-thana before same-district, and it is half of
        // the uniqueness rule (same name and district is allowed only when
        // the thana differs). An org without one silently never wins a
        // proximity tie-break.
        if (!form.thana.trim()) { setErr('Thana is required.'); return; }
        const created = await createOrganization(form);
        setNotice(`${created.name} created. Invite code: ${created.invite_code}`);
      } else {
        const patch = {};
        ['name', 'district', 'thana', 'contact_phone', 'contact_email'].forEach((k) => { if (form[k] !== (modal[k] || '')) patch[k] = form[k]; });
        if (patch.thana !== undefined && patch.district === undefined) patch.district = form.district; // backend needs district whenever location changes
        if (Object.keys(patch).length) await updateOrganization(modal.org_id, patch);
      }
      setModal(null); orgs.refresh();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="p-6">
      <PageHeader title="Organizations" subtitle="Hospitals, blood banks and NGOs, with their invite codes." action={<Button onClick={openCreate}>+ Create organization</Button>} />
      {notice && <div className="mb-4 text-sm rounded-lg px-4 py-3 bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext flex justify-between"><span className="font-mono">{notice}</span><button onClick={() => setNotice('')} className="text-xs underline">dismiss</button></div>}

      <form onSubmit={apply}>
        <FilterBar cols={5}>
          <Input className="md:col-span-2" placeholder="Search by name…" value={filters.search} onChange={set('search')} />
          <Select value={filters.org_type} onChange={set('org_type')}><option value="">All types</option>{ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Select value={filters.district} onChange={set('district')}><option value="">All districts</option>{(districts.data || []).map((d) => <option key={d} value={d}>{d}</option>)}</Select>
          <Button type="submit" variant="secondary">Apply</Button>
        </FilterBar>
      </form>

      {orgs.status === 'loading' && <LoadingState rows={6} />}
      {orgs.status === 'error' && <ErrorState message={orgs.error} onRetry={orgs.reload} />}
      {orgs.status === 'success' && orgs.data.length === 0 && <EmptyState message="No organizations match." />}
      {orgs.status === 'success' && orgs.data.length > 0 && (
        <Table>
          <thead><tr><Th>Name</Th><Th>Type</Th><Th>District</Th><Th>Invite code</Th><Th>Users</Th><Th>Avail. units</Th><Th>Open req.</Th><Th>Donors</Th><Th>Contact</Th><Th> </Th></tr></thead>
          <tbody>
            {orgs.data.map((o) => (
              <tr key={o.org_id}>
                <Td className="font-medium">{o.name}</Td>
                <Td><StatusBadge value={o.org_type} /></Td>
                <Td muted>{o.district}{o.thana ? ` · ${o.thana}` : ''}</Td>
                <Td><InviteCode code={o.invite_code} /></Td>
                <Td>{o.user_count}</Td>
                <Td>{o.org_type === 'hospital' ? <span className="text-gray-400">—</span> : o.available_units}</Td>
                <Td>{o.open_requests}</Td>
                <Td>{o.org_type === 'ngo' ? o.donor_count : <span className="text-gray-400">—</span>}</Td>
                <Td className="text-xs">{o.contact_phone || o.contact_email ? <>{o.contact_phone}{o.contact_phone && o.contact_email ? ' · ' : ''}{o.contact_email}</> : <span className="text-critical-text">not set</span>}</Td>
                <Td><Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs" onClick={() => openEdit(o)}>Edit</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {orgs.status === 'success' && orgs.data.length > 0 && (
        <>
          <Pagination
            page={orgs.page} pageCount={orgs.pageCount} total={orgs.total} perPage={orgs.perPage}
            onPageChange={orgs.setPage} onPerPageChange={orgs.setPerPage} noun="organization"
          />
          <p className="px-4 pb-3 text-xs text-gray-500 dark:text-textsecondary-dark">Invite codes are hidden until clicked so a screen-share doesn&apos;t leak them.</p>
        </>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Create organization' : 'Edit organization'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" form="org-form" loading={busy}>{modal === 'create' ? 'Create' : 'Save'}</Button></>}>
        <form id="org-form" onSubmit={save} className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="text-xs text-gray-500">Name</label><Input className="mt-1" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500">Type</label><Select className="mt-1" disabled={modal !== 'create'} value={form.org_type} onChange={(e) => setForm({ ...form, org_type: e.target.value })}>{ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
          {/* Changing district clears thana: a thana from the old district
              is not valid in the new one, and silently keeping it would
              send a mismatched pair to resolveThana, which would fail to
              match and store a null thana_id without saying so. */}
          <div><label className="text-xs text-gray-500">District</label><Select className="mt-1" required value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value, thana: '' })}><option value="">Select…</option>{(districts.data || []).map((d) => <option key={d} value={d}>{d}</option>)}</Select></div>
          <div><label className="text-xs text-gray-500">Thana</label><DatalistInput id="org-thana" required className="mt-1" value={form.thana} onChange={(e) => setForm({ ...form, thana: e.target.value })} options={thanas} disabled={!form.district} placeholder={form.district ? 'Start typing…' : 'Pick a district first'} /></div>
          <div><label className="text-xs text-gray-500">Contact phone</label><Input className="mt-1" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          <div className="col-span-2"><label className="text-xs text-gray-500">Contact email</label><Input className="mt-1" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
          {modal !== 'create' && modal && <div className="col-span-2"><label className="text-xs text-gray-500">Invite code</label><div className="mt-1"><InviteCode code={modal.invite_code} /></div></div>}
          {modal === 'create' && <p className="col-span-2 text-xs text-gray-400">An invite code is generated automatically; staff use it to register.</p>}
          {err && <p className="col-span-2 text-sm text-critical-text dark:text-critical-dtext">{err}</p>}
        </form>
      </Modal>
    </div>
  );
}

InviteCode.propTypes = { code: PropTypes.string };