export default function DashboardFooter() {
  return (
    <footer className="shrink-0 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-surface-dark px-6 py-2.5 flex items-center justify-between text-xs text-gray-400 dark:text-textsecondary-dark">
      <span>RoktoNet v1.0</span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        All systems operational
      </span>
    </footer>
  );
}
