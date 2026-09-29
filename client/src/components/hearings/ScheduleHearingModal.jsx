import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { X, Calendar, AlertCircle, AlertTriangle, Loader2, Search } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';

export default function ScheduleHearingModal({ isOpen, onClose, onSuccess, caseItem = null }) {
  const modalRef = useModalA11y(isOpen, onClose);
  const [courtrooms, setCourtrooms] = useState([]);
  const [openCases, setOpenCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(caseItem);
  const [caseSearch, setCaseSearch] = useState('');

  const [courtroomId, setCourtroomId] = useState('');
  const [date, setDate] = useState('');
  const [durationMins, setDurationMins] = useState(30);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [purpose, setPurpose] = useState('Framing of Charges');
  const [notes, setNotes] = useState('');

  const [availableSlots, setAvailableSlots] = useState([]);
  const [isWorkingDay, setIsWorkingDay] = useState(true);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState(null);
  const [warningMessage, setWarningMessage] = useState(null);

  // Initialize modal state
  useEffect(() => {
    if (isOpen) {
      setSelectedCase(caseItem);
      setError(null);
      setWarningMessage(null);
      setSelectedSlot(null);
      setNotes('');
      setPurpose('Framing of Charges');
      setDurationMins(30);

      // Default date to tomorrow or next working day in YYYY-MM-DD
      const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const yyyy = nextDay.getFullYear();
      const mm = String(nextDay.getMonth() + 1).padStart(2, '0');
      const dd = String(nextDay.getDate()).padStart(2, '0');
      setDate(`${yyyy}-${mm}-${dd}`);

      fetchMetaAndCases();
    }
  }, [isOpen, caseItem]);

  const fetchMetaAndCases = async () => {
    setLoadingMeta(true);
    try {
      const [metaRes, casesRes] = await Promise.all([
        api.get('/hearings/meta'),
        !caseItem ? api.get('/cases?pageSize=50&status=ADVOCATE_ASSIGNED') : Promise.resolve(null),
      ]);

      const metaPayload = unwrap(metaRes);
      const courtroomsList = metaPayload.courtrooms || [];
      if (Array.isArray(courtroomsList) && courtroomsList.length > 0) {
        setCourtrooms(courtroomsList);
        setCourtroomId(courtroomsList[0].id);
      }

      if (casesRes) {
        const casesPayload = unwrap(casesRes);
        if (Array.isArray(casesPayload.items)) {
          setOpenCases(casesPayload.items);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to initialize scheduling form');
    } finally {
      setLoadingMeta(false);
    }
  };

  // Fetch slot availability whenever date, courtroomId, duration, or selectedCase changes
  useEffect(() => {
    if (!isOpen || !date || !courtroomId) return;

    const judgeId = selectedCase?.judgeId || selectedCase?.judge?.id;
    fetchAvailability(date, courtroomId, judgeId, durationMins);
  }, [isOpen, date, courtroomId, durationMins, selectedCase]);

  const fetchAvailability = async (
    targetDate,
    targetCourtroomId,
    targetJudgeId,
    targetDuration
  ) => {
    setLoadingSlots(true);
    setSelectedSlot(null);
    setAvailabilityMessage('');
    try {
      let url = `/hearings/availability?date=${targetDate}&courtroomId=${targetCourtroomId}&durationMins=${targetDuration}`;
      if (targetJudgeId) {
        url += `&judgeId=${targetJudgeId}`;
      }

      const res = await api.get(url);
      const d = unwrap(res);
      if (d) {
        setIsWorkingDay(d.isWorkingDay);
        setAvailableSlots(d.availableSlots || []);
        if (!d.isWorkingDay) {
          setAvailabilityMessage(d.reason || 'Court is closed on this day');
        } else if (d.availableSlots?.length === 0) {
          setAvailabilityMessage(
            'No available slots found for this courtroom/judge on selected date'
          );
        }
      }
    } catch (err) {
      setAvailabilityMessage(err.message || 'Unable to check slot availability');
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setWarningMessage(null);

    const activeCaseId = selectedCase?.id;
    if (!activeCaseId) {
      setError('Please select a judicial case docket to schedule');
      return;
    }

    if (!courtroomId) {
      setError('Please select an active courtroom');
      return;
    }

    if (!selectedSlot) {
      setError('Please select an available hearing slot time');
      return;
    }

    if (!purpose.trim()) {
      setError('Please specify the proceeding purpose');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        caseId: activeCaseId,
        courtroomId,
        scheduledAt: selectedSlot.startIso,
        durationMins: parseInt(durationMins, 10),
        purpose: purpose.trim(),
        notes: notes.trim() || undefined,
      };

      const res = await api.post('/hearings', payload);
      const dataPayload = unwrap(res);
      if (dataPayload.hearing) {
        const warnings = dataPayload.warnings || [];
        if (onSuccess) {
          onSuccess({
            hearing: dataPayload.hearing,
            warnings,
            message: 'Hearing scheduled successfully',
          });
        }
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to schedule hearing');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCases = openCases.filter((c) => {
    if (!caseSearch.trim()) return true;
    const q = caseSearch.toLowerCase();
    return (
      c.caseNumber.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.petitioner?.toLowerCase().includes(q) ||
      c.respondent?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-hearing-title"
        className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-navy-900 text-white">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-brass-500/20 text-brass-400 rounded-md">
              <Calendar className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="schedule-hearing-title" className="font-serif text-lg font-bold">
                Schedule Court Hearing
              </h2>
              <p className="text-xs text-gray-300">
                Allocate courtroom bench slot and publish to daily cause list
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-md"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {warningMessage && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>{warningMessage}</span>
            </div>
          )}

          {/* Case Picker (if not fixed) */}
          {!caseItem ? (
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900">
                Select Case Docket *
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search open dockets by case number, title, or litigating parties..."
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-brass-500 focus:outline-none"
                />
              </div>

              <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                {filteredCases.map((c) => {
                  const isSelected = selectedCase?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCase(c)}
                      className={`w-full text-left p-2.5 text-xs flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-brass-50/70 border-l-4 border-brass-600 text-navy-950 font-semibold'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div>
                        <span className="font-mono text-navy-900 font-bold mr-2">
                          {c.caseNumber}
                        </span>
                        <span className="text-gray-900">{c.title}</span>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Judge: {c.judgeName || c.judge?.name || 'Assigned'} | Priority:{' '}
                          {c.priority}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-blue-100 text-blue-800">
                        {c.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-navy-900 uppercase tracking-wide block text-[10px]">
                  Presiding Case Docket
                </span>
                <span className="font-mono font-bold text-navy-950 text-sm">
                  {selectedCase.caseNumber}
                </span>
                <span className="text-gray-600 ml-2 font-medium">{selectedCase.title}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-gray-500 block">Presiding Judge</span>
                <span className="font-semibold text-navy-900">
                  {selectedCase.judge?.name || selectedCase.judgeName || 'Hon. Presiding Bench'}
                </span>
              </div>
            </div>
          )}

          {/* Courtroom and Date Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1">
                Courtroom *
              </label>
              <select
                value={courtroomId}
                onChange={(e) => setCourtroomId(e.target.value)}
                disabled={loadingMeta}
                className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none"
              >
                {courtrooms.map((cr) => (
                  <option key={cr.id} value={cr.id}>
                    {cr.name} ({cr.location})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1">
                Hearing Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1">
                Slot Duration *
              </label>
              <select
                value={durationMins}
                onChange={(e) => setDurationMins(parseInt(e.target.value, 10))}
                className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes (1 Hour)</option>
              </select>
            </div>
          </div>

          {/* Interactive Free Slots Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900">
                Available Time Slots (10:00 - 17:00 IST, Excl. Lunch) *
              </label>
              {loadingSlots && (
                <span className="text-[11px] text-gray-500 flex items-center space-x-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brass-600" />
                  <span>Checking calendar availability...</span>
                </span>
              )}
            </div>

            {!isWorkingDay ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs text-center">
                <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-600" />
                <p className="font-semibold">
                  {availabilityMessage || 'Court is closed on this day'}
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Court working days are Monday through Friday. Please select a working date.
                </p>
              </div>
            ) : availableSlots.length === 0 && !loadingSlots ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-gray-500 text-xs text-center">
                {availabilityMessage ||
                  'No free slots available on this date for the selected courtroom and judge.'}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1 border border-gray-200 rounded-md bg-gray-50/50">
                {availableSlots.map((slot) => {
                  const isSelected = selectedSlot?.startIso === slot.startIso;
                  return (
                    <button
                      key={slot.startIso}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-2 rounded text-xs font-mono text-center border transition-all ${
                        isSelected
                          ? 'bg-navy-900 text-brass-300 border-navy-900 font-bold shadow-sm'
                          : 'bg-white text-navy-900 border-gray-200 hover:border-brass-400 hover:bg-brass-50/30'
                      }`}
                    >
                      <div className="font-semibold">{slot.startTime}</div>
                      <div className="text-[10px] text-gray-500">{slot.endTime}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Purpose & Notes */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="schedule-purpose"
                  className="block text-xs font-bold uppercase tracking-wider text-navy-900"
                >
                  Hearing Purpose *
                </label>
                <span
                  id="schedule-purpose-counter"
                  aria-live="polite"
                  className={`text-[11px] font-mono ${
                    purpose.trim().length < 3
                      ? 'text-amber-600 font-semibold'
                      : purpose.trim().length > 200
                        ? 'text-red-600 font-bold'
                        : 'text-emerald-700'
                  }`}
                >
                  {purpose.trim().length}/3 minimum (max 200)
                </span>
              </div>
              <input
                id="schedule-purpose"
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                aria-describedby="schedule-purpose-counter schedule-purpose-hint"
                placeholder="e.g. Framing of Charges, Final Arguments, Examination of Complainant"
                className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none"
              />
              <p id="schedule-purpose-hint" className="text-[11px] text-gray-500 mt-1">
                Specify proceeding objective for cause list and daily bench calendar.
              </p>
            </div>

            <div>
              <label
                htmlFor="schedule-notes"
                className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1"
              >
                Registry Notes / Instructions (Optional)
              </label>
              <textarea
                id="schedule-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Parties directed to submit written arguments 48 hours prior to hearing..."
                rows={2}
                className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200">
            {(!selectedSlot || !isWorkingDay || purpose.trim().length < 3) && (
              <span aria-live="polite" className="text-[11px] text-gray-500 mr-auto">
                {!isWorkingDay
                  ? 'Selected date is not a working day'
                  : !selectedSlot
                    ? 'Select an available slot'
                    : `Purpose requires ${3 - purpose.trim().length} more character(s)`}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedSlot || !isWorkingDay || purpose.trim().length < 3}
              title={
                !isWorkingDay
                  ? 'Court is closed on selected date'
                  : !selectedSlot
                    ? 'Select an available hearing slot'
                    : purpose.trim().length < 3
                      ? `Enter at least 3 characters for purpose (${purpose.trim().length}/3)`
                      : 'Confirm hearing schedule'
              }
              className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-xs font-semibold hover:bg-navy-800 transition-colors shadow-sm disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin text-brass-400" />}
              <span>{submitting ? 'Scheduling Session...' : 'Confirm Hearing Schedule'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
