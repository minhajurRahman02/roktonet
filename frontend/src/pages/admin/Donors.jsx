import { useState } from 'react';
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
import { Table, Th, Td, TableFooter, fmtDate } from '../../components/admin/Table';
import { useAsync } from '../../hooks/useAsync';
import { listDonors } from '../../api/donors';
import { listOrganizations } from '../../api/organizations';
import { getDistricts } from '../../api/locations';
import { BLOOD_TYPES } from '../../constants/blood';
import { getEarliestEligibility } from '../../utils/eligibility';

export default function AdminDonors() {
  const [filters, setFilters] = useState({ search: '', blood_type: '', org_id: '', eligibility_status: '', district: '', has_login: '' });
  const [applied, setApplied] = useState({});
  const donors = useAsync(() => listDonors(applied), [applied]);
  // Mockup change #3: these three dropdowns were empty. NGOs come from the
  // orgs endpoint filtered to ngo, districts from the canonical list.
  const ngos = useAsync(() => listOrganizations({ org_type: 'ngo' }), []);
  const districts = useAsync(getDistricts, []);
  const [open, setOpen] = useState(null);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const apply = (e) => { e.preventDefault(); setApplied(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))); };

  return (
    <div className="p-6">
      <PageHeader title="Donors" subtitle="Every registered donor across all NGOs, plus self-registered." action={<Link to="/admin/reports"><Button variant="secondary">Export →</Button></Link>} />

      <form onSubmit={apply}>
        <FilterBar cols={7}>
          <Input className="md:col-span-2" placeholder="Search name or email…" value={filters.search} onChange={set('search')} />
          <Select value={filters.blood_type} onChange={set('blood_type')}><option value="">All blood types</option>{BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}</Select>
          <Select value={filters.org_id} onChange={set('org_id')}><option value="">All NGOs</option>{(ngos.data || []).map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}</Select>
          <Select value={filters.eligibility_status} onChange={set('eligibility_status')}><option value="">Any eligibility</option><option value="eligible">eligible</option><option value="ineligible">ineligible</option><option value="pending">pending</option></Select>
          <Select value={filters.district} onChange={set('district')}><option value="">All districts</option>{(districts.data || []).map((d) => <option key={d} value={d}>{d}</option>)}</Select>
          <Select value={filters.has_login} onChange={set('has_login')}><option value="">Login: any</option><option value="true">Has login</option><option value="false">No login</option></Select>
          <Button type="submit" variant="secondary" className="col-span-2 md:col-span-7 md:justify-self-end">Apply</Button>
        </FilterBar>
      </form>

      {donors.status === 'loading' && <LoadingState rows={6} />}
      {donors.status === 'error' && <ErrorState message={donors.error} onRetry={donors.reload} />}
      {donors.status === 'success' && donors.data.length === 0 && <EmptyState message="No donors match these filters." />}
      {donors.status === 'success' && donors.data.length > 0 && (
        <Table>
          <thead><tr><Th>Name</Th><Th>Type</Th><Th>Sex</Th><Th>NGO</Th><Th>District</Th><Th>Eligibility</Th><Th>Last donation</Th><Th>Login</Th><Th> </Th></tr></thead>
          <tbody>
            {donors.data.map((d) => {
              const el = getEarliestEligibility(d);
              return (
                <tr key={d.donor_id}>
                  <Td className="font-medium">{d.full_name || <span className="text-gray-400">—</span>}</Td>
                  <Td>{d.blood_type}</Td>
                  <Td muted>{d.sex ? d.sex[0].toUpperCase() : '—'}</Td>
                  <Td>{d.org_name || <span className="text-gray-400">— (self-registered)</span>}</Td>
                  <Td muted>{d.current_district || '—'}</Td>
                  <Td><StatusBadge value={d.eligibility_status} />{!el.eligible && el.eligibleDate && <span className="text-xs text-gray-400 ml-1">until {fmtDate(el.eligibleDate)}</span>}</Td>
                  <Td muted>{d.last_donation_date ? `${fmtDate(d.last_donation_date)} · ${d.last_donation_component}` : 'never'}</Td>
                  <Td>{d.user_id ? '✓' : <span className="text-xs text-gray-400">assisted, no login</span>}</Td>
                  <Td>{d.user_id ? <Link to={`/admin/users/${d.user_id}`}><Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs">Open account</Button></Link> : <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs" onClick={() => setOpen(d)}>Details</Button>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {donors.status === 'success' && donors.data.length > 0 && <TableFooter><span>{donors.data.length} donor(s)</span></TableFooter>}

      <Modal isOpen={!!open} onClose={() => setOpen(null)} title={open?.full_name || 'Donor'} subtitle="Assisted registration — no login account. Managed by their NGO.">
        {open && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[['Blood type', open.blood_type], ['Sex', open.sex || '—'], ['NGO', open.org_name || '—'], ['Phone', open.phone_number || '—'], ['Email', open.email || '—'], ['District', open.current_district || '—'], ['Thana', open.current_thana || '—'], ['Last donation', open.last_donation_date ? `${fmtDate(open.last_donation_date)} · ${open.last_donation_component}` : 'never'], ['Eligibility', <StatusBadge key="e" value={open.eligibility_status} />], ['Registered', fmtDate(open.created_at)]].map(([k, v]) => (
              <div key={k}><p className="text-xs text-gray-500">{k}</p><p className="mt-0.5 dark:text-textprimary-dark">{v}</p></div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
