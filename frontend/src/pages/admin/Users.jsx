import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '../../context/AuthContext';
import { listUsers, createAdmin } from '../../api/admin';
import { listOrganizations } from '../../api/organizations';

const ROLES = ['hospital', 'bank', 'ngo', 'donor', 'admin'];

export default function AdminUsers() {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [filters, setFilters] = useState({ search: '', role: '', org_id: '', is_active: '', is_verified: '' });
  const [applied, setApplied] = useState(filters);
  const users = useAsync(() => listUsers(applied), [applied]);
  const orgs = useAsync(() => listOrganizations(), []);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '' });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState({ ok: '', err: '' });

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg({ ok: '', err: '' });
    try {
      const res = await createAdmin(form);
      setCreateMsg({ ok: res.message, err: '' });
      setForm({ email: '', full_name: '' });
      users.refresh();
    } catch (err) {
      setCreateMsg({ ok: '', err: err.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Users"
        subtitle="Every account across all five roles."
        action={me?.is_primary_admin ? <Button onClick={() => setCreateOpen(true)}>+ Create admin</Button> : null}
      />

      <form onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}>
        <FilterBar cols={7}>
          <Input className="md:col-span-2" placeholder="Search name or email…" value={filters.search} onChange={set('search')} />
          <Select value={filters.role} onChange={set('role')}><option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
          <Select value={filters.org_id} onChange={set('org_id')}>
            <option value="">Any organization</option>
            {(orgs.data || []).map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </Select>
          <Select value={filters.is_active} onChange={set('is_active')}><option value="">Active + inactive</option><option value="true">Active only</option><option value="false">Deactivated only</option></Select>
          <Select value={filters.is_verified} onChange={set('is_verified')}><option value="">Verified + unverified</option><option value="true">Verified</option><option value="false">Unverified</option></Select>
          <Button type="submit" variant="secondary">Apply</Button>
        </FilterBar>
      </form>

      {users.status === 'loading' && <LoadingState rows={6} />}
      {users.status === 'error' && <ErrorState message={users.error} onRetry={users.reload} />}
      {users.status === 'success' && users.data.length === 0 && <EmptyState message="No accounts match these filters." />}
      {users.status === 'success' && users.data.length > 0 && (
        <Table>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Organization</Th><Th>Verified</Th><Th>Status</Th><Th>Created</Th><Th> </Th></tr></thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.user_id} className={`hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer ${u.is_active ? '' : 'opacity-60'}`} onClick={() => navigate(`/admin/users/${u.user_id}`)}>
                <Td className="font-medium">{u.full_name || <span className="text-gray-400">—</span>}</Td>
                <Td muted>{u.email}</Td>
                <Td><StatusBadge value={u.role} />{u.is_primary_admin && <span className="text-[10px] text-gray-400 ml-1">primary</span>}</Td>
                <Td>{u.org_name || <span className="text-gray-400">—</span>}</Td>
                <Td>{u.is_verified ? '✓' : <span className="text-gray-400">✗</span>}</Td>
                <Td><StatusBadge value={u.is_active ? 'active' : 'deactivated'} label={u.is_active ? 'Active' : 'Deactivated'} /></Td>
                <Td muted>{fmtDate(u.created_at)}</Td>
                <Td className="text-primary text-xs">Open →</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {users.status === 'success' && users.data.length > 0 && <TableFooter><span>{users.data.length} account(s)</span></TableFooter>}

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create another admin"
        subtitle="They'll receive an email with a link to set their own password. No password is ever sent."
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Close</Button><Button type="submit" form="create-admin-form" loading={creating}>Create &amp; send invite</Button></>}
      >
        <form id="create-admin-form" onSubmit={handleCreate} className="space-y-3">
          <div><label className="text-xs text-gray-500">Full name</label><Input className="mt-1" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Second Admin" /></div>
          <div><label className="text-xs text-gray-500">Email</label><Input className="mt-1" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin2@roktonet.org" /></div>
          <p className="text-xs text-gray-400">Only the primary admin can do this. New admins can do everything except create more admins.</p>
          {createMsg.ok && <p className="text-sm text-elective-text dark:text-elective-dtext">{createMsg.ok}</p>}
          {createMsg.err && <p className="text-sm text-critical-text dark:text-critical-dtext">{createMsg.err}</p>}
        </form>
      </Modal>
    </div>
  );
}
