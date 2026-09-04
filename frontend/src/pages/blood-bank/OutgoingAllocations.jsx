import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import { listOutgoingAllocations } from '../../api/allocations';
import { dispatchUnit } from '../../api/inventory';

// One bank's units can go to several different requests, and a single
// request can pull more than one unit from this same bank -- grouping by
// request_id is what lets "Dispatch" act on all of this bank's units for
// that request in one click, rather than one button per individual unit.
function groupByRequest(allocations) {
  const groups = new Map();
  for (const row of allocations) {
    if (!groups.has(row.request_id)) {
      groups.set(row.request_id, {
        request_id: row.request_id,
        hospital_name: row.hospital_name,
        hospital_district: row.hospital_district,
        units: [],
      });
    }
    groups.get(row.request_id).units.push(row);
  }
  return Array.from(groups.values());
}

export default function OutgoingAllocations() {
  const [status, setStatus] = useState('loading');
  const [allocations, setAllocations] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [dispatchingRequestId, setDispatchingRequestId] = useState(null);
  const [dispatchError, setDispatchError] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    listOutgoingAllocations()
      .then((data) => {
        setAllocations(data);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDispatch(group) {
    setDispatchingRequestId(group.request_id);
    setDispatchError('');
    try {
      const reservedUnits = group.units.filter((u) => u.status === 'reserved');
      await Promise.all(reservedUnits.map((u) => dispatchUnit(u.unit_id)));
      const updated = await listOutgoingAllocations();
      setAllocations(updated);
    } catch (err) {
      setDispatchError(err.message);
    } finally {
      setDispatchingRequestId(null);
    }
  }

  if (status === 'loading') {
    return (
      <div className="p-6">
        <LoadingState rows={4} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-6">
        <ErrorState message={`Couldn't load your outgoing allocations: ${errorMessage}`} onRetry={load} />
      </div>
    );
  }

  const groups = groupByRequest(allocations);

  return (
    <div className="p-6">
      <PageHeader title="Outgoing Allocations" subtitle="Units from your inventory that have been matched to a hospital's request." />

      {dispatchError && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2 mb-4">{dispatchError}</p>
      )}

      {groups.length === 0 ? (
        <EmptyState message="No units of yours have been allocated to a request yet." />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const allDelivered = group.units.every((u) => u.status === 'delivered');
            const anyDispatched = group.units.some((u) => u.status === 'dispatched');
            const anyReserved = group.units.some((u) => u.status === 'reserved');
            const summary = group.units
              .map((u) => `${u.blood_type} ${u.component.replace('_', ' ')}`)
              .join(', ');

            return (
              <div
                key={group.request_id}
                className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium dark:text-textprimary-dark">
                    {group.hospital_name}, {group.hospital_district}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {summary}, {group.units.length} unit{group.units.length === 1 ? '' : 's'} · req_{group.request_id.slice(0, 8)}
                  </p>
                </div>

                {allDelivered ? (
                  <span className="text-xs font-medium text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg px-2.5 py-1 rounded-full self-start sm:self-auto shrink-0">
                    Delivered
                  </span>
                ) : anyDispatched && !anyReserved ? (
                  <span className="text-xs font-medium text-urgent-text bg-urgent-bg dark:text-urgent-dtext dark:bg-urgent-dbg px-2.5 py-1 rounded-full self-start sm:self-auto shrink-0">
                    On its way
                  </span>
                ) : (
                  <Button
                    variant="primary"
                    loading={dispatchingRequestId === group.request_id}
                    onClick={() => handleDispatch(group)}
                    className="self-start sm:self-auto shrink-0"
                  >
                    Dispatch
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
