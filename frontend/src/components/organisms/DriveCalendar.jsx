import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { ChevronLeft, ChevronRight, StickyNote } from 'lucide-react';

// A month grid of blood drives, shared by the NGO scheduler and the
// donor's view.
//
// ONE COMPONENT FOR BOTH ROLES
//
// The donor's calendar is the NGO's with the interactions removed, not a
// second calendar that happens to look similar. Passing onSelectDate is
// what makes a cell clickable; leaving it out gives you the read-only
// version, and there is no other difference. Two copies would drift the
// moment either one got a fix.
//
// WHY A HAND-ROLLED GRID
//
// A calendar library would be several hundred kilobytes for one screen,
// and the hard parts of a calendar (recurrence, drag to reschedule,
// time zones across a week view) are not in play here. This is a month
// of dates with chips on them.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_CHIP = {
  planned: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  active: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  completed: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-textsecondary-dark',
};

/**
 * Turns whatever the API gave us for a date into YYYY-MM-DD.
 *
 * drive_date is a Postgres DATE, which arrives as an ISO timestamp
 * because JSON has no date type. Reading the LOCAL components rather
 * than calling toISOString() is what keeps a drive on the 5th from
 * being drawn on the 4th, and it matches how every other page in
 * RoktoNet already renders this field.
 */
export function calendarDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** First day of the month containing `date`, as a Date. */
export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

// Defaults live in the parameter list, NOT in defaultProps. React 19
// dropped defaultProps for function components entirely: it is ignored
// at runtime, so `notes` arrived as undefined on the donor calendar
// (which passes no notes) and every cell threw on notes[cell.key].
export default function DriveCalendar({
  month,
  onMonthChange,
  drives = [],
  notes = {},
  onSelectDate = undefined,
  loading = false,
}) {
  const today = calendarDate(new Date());

  // The grid always starts on the Sunday on or before the 1st and runs
  // in whole weeks, so every month renders as complete rows and the
  // layout does not jump between a 5-row and 6-row month.
  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());

    const out = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push({
        key: calendarDate(d),
        dayNumber: d.getDate(),
        inMonth: d.getMonth() === month.getMonth(),
      });
    }
    // Drop a trailing week that belongs entirely to the next month.
    // Six rows are only needed when the month actually spills into one.
    return out.slice(0, out.slice(35).every((c) => !c.inMonth) ? 35 : 42);
  }, [month]);

  // Grouped once per render rather than filtering the whole drive list
  // inside all 42 cells, which is 42 passes over the same array.
  const drivesByDate = useMemo(() => {
    const map = {};
    for (const d of drives) {
      const key = calendarDate(d.drive_date);
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    return map;
  }, [drives]);

  const monthLabel = month.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const interactive = typeof onSelectDate === 'function';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, -1))}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-textsecondary-dark dark:hover:bg-white/5"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-textsecondary-dark dark:hover:bg-white/5"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
          <p className="font-display font-semibold text-lg ml-2 dark:text-textprimary-dark">{monthLabel}</p>
          {loading && <span className="text-xs text-gray-400 ml-2">Loading…</span>}
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(startOfMonth(new Date()))}
          className="text-sm font-medium text-primary dark:text-textprimary-dark hover:underline"
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px mb-px">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-xs font-medium text-gray-500 dark:text-textsecondary-dark text-center py-2">
            {w}
          </div>
        ))}
      </div>

      {/* gap-px over a border-coloured background draws the grid lines
          with no double borders between neighbouring cells. */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden flex-1">
        {cells.map((cell) => {
          const dayDrives = drivesByDate[cell.key] || [];
          const note = notes[cell.key];
          const isToday = cell.key === today;

          const content = (
            <>
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-medium ${isToday
                    ? 'bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center'
                    : cell.inMonth ? 'text-textprimary dark:text-textprimary-dark' : 'text-gray-300 dark:text-white/20'}`}
                >
                  {cell.dayNumber}
                </span>
                {note && (
                  <StickyNote
                    size={12}
                    className="text-urgent-text dark:text-urgent-dtext shrink-0"
                    aria-label="Has a note"
                  />
                )}
              </div>
              <div className="mt-1 space-y-1 overflow-hidden">
                {dayDrives.slice(0, 2).map((d) => (
                  <p
                    key={d.drive_id}
                    className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${STATUS_CHIP[d.status] || STATUS_CHIP.planned}`}
                    title={`${d.title}${d.org_name ? ` · ${d.org_name}` : ''}`}
                  >
                    {d.title}
                  </p>
                ))}
                {dayDrives.length > 2 && (
                  <p className="text-[10px] text-gray-400 px-1">{dayDrives.length - 2} more</p>
                )}
              </div>
            </>
          );

          const base = `min-h-[92px] p-1.5 text-left flex flex-col ${cell.inMonth
            ? 'bg-white dark:bg-surface-dark'
            : 'bg-gray-50 dark:bg-white/[0.02]'}`;

          // A plain div when there is nothing to click. Rendering a
          // button that does nothing would announce every cell as
          // actionable to a screen reader and show a pointer cursor
          // over a dead surface.
          return interactive ? (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDate(cell.key)}
              className={`${base} hover:bg-gray-50 dark:hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary transition-colors`}
              aria-label={`${cell.key}${dayDrives.length ? `, ${dayDrives.length} drive(s)` : ''}${note ? ', has a note' : ''}`}
            >
              {content}
            </button>
          ) : (
            <div key={cell.key} className={base}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

DriveCalendar.propTypes = {
  month: PropTypes.instanceOf(Date).isRequired,
  onMonthChange: PropTypes.func.isRequired,
  drives: PropTypes.array,
  // Map of YYYY-MM-DD to note body. Always an object, never null, so
  // cells can index it without guarding.
  notes: PropTypes.object,
  // Omit entirely for a read-only calendar.
  onSelectDate: PropTypes.func,
  loading: PropTypes.bool,
};
