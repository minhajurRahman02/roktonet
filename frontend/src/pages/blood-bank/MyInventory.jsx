import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import Select from '../../components/atoms/Select';
import Button from '../../components/atoms/Button';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listInventory } from '../../api/inventory';

const STATUS_STYLE = {
  available: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
  reserved: 'text-urgent-text bg-urgent-bg dark:text-urgent-dtext dark:bg-urgent-dbg',
  dispatched: 'text-routine-text bg-routine-bg dark:text-routine-dtext dark:bg-routine-dbg',
  delivered: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  expired: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
};

export default function MyInventory() {
  const [bloodTypeFilter, setBloodTypeFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 7.7a: status is sent to the server now.
  //
  // Blood type and component were always query params, but status was
  // fetched-then-filtered in the browser:
  //   setUnits(statusFilter ? data.filter((u) => u.status === statusFilter) : data)
  //
  // GET /api/inventory has accepted a `status` param the whole time; this
  // page simply never used it. That was invisible while the page fetched
  // everything, and becomes a wrong count the moment paging is added --
  // 25 rows fetched, 6 kept, "6 of 210" displayed.
  //
  // No backend change was needed for this one, unlike the resolved/pending
  // filters on My Requests and Restock.
  const filters = useMemo(() => {
    const f = {};
    if (bloodTypeFilter) f.blood_type = bloodTypeFilter;
    if (componentFilter) f.component = componentFilter;
    if (statusFilter) f.status = statusFilter;
    return f;
  }, [bloodTypeFilter, componentFilter, statusFilter]);

  const units = usePaginatedAsync(
    ({ page, per_page }) => listInventory({ ...filters, page, per_page }),
    [filters],
    { storageKey: 'bank.myInventory' }
  );

  return (
    <div className="p-6">
      <PageHeader
        title="My Inventory"
        subtitle="Every unit currently under your organization."
        action={
          <Link to="/blood-bank/inventory/add">
            <Button variant="primary">Add inventory unit</Button>
          </Link>
        }
      />

      <div className="flex gap-2 mb-4">
        <Select value={bloodTypeFilter} onChange={(e) => setBloodTypeFilter(e.target.value)} className="w-36">
          <option value="">All blood types</option>
          {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bt) => (
            <option key={bt} value={bt}>{bt}</option>
          ))}
        </Select>
        <Select value={componentFilter} onChange={(e) => setComponentFilter(e.target.value)} className="w-40">
          <option value="">All components</option>
          <option value="whole_blood">Whole blood</option>
          <option value="platelets">Platelets</option>
          <option value="plasma">Plasma</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="dispatched">Dispatched</option>
          <option value="delivered">Delivered</option>
          <option value="expired">Expired</option>
        </Select>
      </div>

      {units.status === 'loading' && <LoadingState rows={5} />}
      {units.status === 'error' && <ErrorState message={`Couldn't load your inventory: ${units.error}`} onRetry={units.reload} />}
      {units.isEmpty && (
        <EmptyState
          message="No units match these filters."
          actionLabel="Clear filters"
          onAction={() => {
            setBloodTypeFilter('');
            setComponentFilter('');
            setStatusFilter('');
          }}
        />
      )}
      {units.status === 'success' && units.data.length > 0 && (
        <>
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 dark:bg-white/5 text-left text-xs text-gray-500 dark:text-textsecondary-dark">
                <tr>
                  <th className="px-4 py-3 font-medium">Blood type</th>
                  <th className="px-4 py-3 font-medium">Component</th>
                  <th className="px-4 py-3 font-medium">Collected</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {units.data.map((unit) => (
                  <tr key={unit.unit_id}>
                    <td className="px-4 py-3 font-medium dark:text-textprimary-dark">{unit.blood_type}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-textsecondary-dark capitalize">{unit.component.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-textsecondary-dark mono text-xs">
                      {new Date(unit.collection_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-textsecondary-dark mono text-xs">
                      {new Date(unit.expiry_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[unit.status] || STATUS_STYLE.available}`}>
                        {unit.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={units.page} pageCount={units.pageCount} total={units.total} perPage={units.perPage}
            onPageChange={units.setPage} onPerPageChange={units.setPerPage} noun="unit"
          />
        </>
      )}
    </div>
  );
}