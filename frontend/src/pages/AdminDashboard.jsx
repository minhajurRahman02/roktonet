import PageHeader from '../components/molecules/PageHeader';

// TEMPORARY (7.6) -- replaced with the real system-wide overview in Phase 7.7.
export default function AdminDashboard() {
  return (
    <div className="p-6">
      <PageHeader title="Overview" subtitle="System-wide inventory, requests, and analytics." />
      <p className="text-sm text-textsecondary dark:text-textsecondary-dark">Coming in Phase 7.7.</p>
    </div>
  );
}