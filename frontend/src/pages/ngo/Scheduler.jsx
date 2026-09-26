import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, StickyNote } from 'lucide-react';
import PageHeader from '../../components/molecules/PageHeader';
import ErrorState from '../../components/molecules/ErrorState';
import Button from '../../components/atoms/Button';
import Modal from '../../components/admin/Modal';
import DriveCalendar, { startOfMonth, calendarDate } from '../../components/organisms/DriveCalendar';
import { listDrives } from '../../api/drives';
import { listDriveNotes, saveDriveNote } from '../../api/driveNotes';

// The NGO's scheduler: a month of drives, with each date a way in to
// creating one or jotting something down.
//
// WHY A MODAL AND NOT A PAGE
//
// Clicking a date is a glance, not a destination. Routing to
// /ngo/scheduler/2026-12-05 would push a history entry for every
// mis-click and lose the month you were looking at on the way back.
// The modal keeps the calendar behind it, which is also the context
// that makes the choice meaningful: you pick a date because of what is
// around it.

export default function Scheduler() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [drives, setDrives] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedDate, setSelectedDate] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  // The visible month, widened by a week either side, because the grid
  // shows the tail of the previous month and the head of the next one
  // and a drive sitting in those cells is still a drive.
  const rangeFor = useCallback((m) => {
    const from = new Date(m.getFullYear(), m.getMonth(), 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    to.setDate(to.getDate() + 7);
    return { from: calendarDate(from), to: calendarDate(to) };
  }, []);

  const load = useCallback(() => {
    const { from, to } = rangeFor(month);
    setLoading(true);
    setLoadError('');

    // Drives are fetched unpaginated and filtered in the browser.
    //
    // That is the wrong default everywhere else in RoktoNet, and it is
    // right here: a calendar has to show every drive in the month or
    // it is not a calendar, so "page 1 of the drives that happen to be
    // in December" would be actively misleading. An NGO's drive count
    // is in the dozens.
    Promise.all([listDrives(), listDriveNotes(from, to)])
      .then(([driveRes, noteRows]) => {
        const rows = Array.isArray(driveRes) ? driveRes : (driveRes.data || []);
        setDrives(rows.filter((d) => {
          const key = calendarDate(d.drive_date);
          return key >= from && key <= to;
        }));
        setNotes(Object.fromEntries((noteRows || []).map((n) => [n.note_date, n.body])));
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [month, rangeFor]);

  useEffect(load, [load]);

  const drivesOnSelected = selectedDate
    ? drives.filter((d) => calendarDate(d.drive_date) === selectedDate)
    : [];

  function openDate(dateKey) {
    setSelectedDate(dateKey);
    setNoteDraft(notes[dateKey] || '');
    setEditingNote(false);
    setNoteError('');
  }

  function closeModal() {
    setSelectedDate(null);
    setEditingNote(false);
    setNoteError('');
  }

  async function handleSaveNote() {
    setSavingNote(true);
    setNoteError('');
    try {
      await saveDriveNote(selectedDate, noteDraft);
      // Updated locally as well as reloaded, so the sticky-note marker
      // on the cell changes the instant the modal closes rather than
      // after the round trip.
      setNotes((n) => {
        const next = { ...n };
        if (noteDraft.trim()) next[selectedDate] = noteDraft.trim();
        else delete next[selectedDate];
        return next;
      });
      closeModal();
    } catch (err) {
      setNoteError(err.message);
    } finally {
      setSavingNote(false);
    }
  }

  const prettyDate = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    : '';

  return (
    <div className="p-6 flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      <PageHeader
        title="Scheduler"
        subtitle="Every drive you have on, month by month. Click any date to plan one or leave yourself a note."
      />

      {loadError ? (
        <ErrorState message={`Couldn't load the calendar: ${loadError}`} onRetry={load} />
      ) : (
        <div className="flex-1 min-h-[520px]">
          <DriveCalendar
            month={month}
            onMonthChange={setMonth}
            drives={drives}
            notes={notes}
            onSelectDate={openDate}
            loading={loading}
          />
        </div>
      )}

      <Modal
        isOpen={!!selectedDate}
        onClose={closeModal}
        title={prettyDate}
        subtitle={
          drivesOnSelected.length
            ? `${drivesOnSelected.length} drive${drivesOnSelected.length === 1 ? '' : 's'} on this date`
            : 'Nothing scheduled yet'
        }
        footer={editingNote ? (
          <>
            <Button variant="secondary" onClick={() => setEditingNote(false)} disabled={savingNote}>
              Back
            </Button>
            <Button variant="primary" onClick={handleSaveNote} loading={savingNote}>
              {noteDraft.trim() ? 'Save note' : 'Remove note'}
            </Button>
          </>
        ) : null}
      >
        {/* Existing drives first. Someone clicking a date that already
            has a drive on it usually wants to open it, and offering
            "Create drive" above that would invite a duplicate. */}
        {drivesOnSelected.length > 0 && !editingNote && (
          <div className="space-y-2 mb-4">
            {drivesOnSelected.map((d) => (
              <button
                key={d.drive_id}
                type="button"
                onClick={() => navigate(`/ngo/drives/${d.drive_id}`)}
                className="w-full text-left border border-gray-200 dark:border-white/10 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <p className="text-sm font-medium dark:text-textprimary-dark">{d.title}</p>
                <p className="text-xs text-gray-500 dark:text-textsecondary-dark capitalize">
                  {d.status}
                  {d.location ? ` · ${d.location}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}

        {editingNote ? (
          <div>
            <label htmlFor="note-body" className="text-sm font-medium dark:text-textprimary-dark">
              Note for this date
            </label>
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-0.5 mb-2">
              Everyone in your organization can see this. Clearing the box removes the note.
            </p>
            <textarea
              id="note-body"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              maxLength={2000}
              rows={5}
              autoFocus
              placeholder="Call the school about the hall, confirm 40 chairs"
              className="w-full rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-sm dark:text-textprimary-dark focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {noteError && (
              <p className="text-xs text-critical-text dark:text-critical-dtext mt-2">{noteError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate(`/ngo/drives/new?date=${selectedDate}`)}
              className="w-full flex items-center gap-3 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-left hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <CalendarPlus size={18} className="text-primary dark:text-textprimary-dark shrink-0" />
              <span>
                <span className="block text-sm font-medium dark:text-textprimary-dark">Create drive</span>
                <span className="block text-xs text-gray-500 dark:text-textsecondary-dark">
                  Opens the form with this date already filled in
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="w-full flex items-center gap-3 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-left hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <StickyNote size={18} className="text-urgent-text dark:text-urgent-dtext shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium dark:text-textprimary-dark">
                  {notes[selectedDate] ? 'Edit note' : 'Add note'}
                </span>
                <span className="block text-xs text-gray-500 dark:text-textsecondary-dark truncate">
                  {notes[selectedDate] || 'Anything you need to remember about this date'}
                </span>
              </span>
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
