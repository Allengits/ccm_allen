import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { X, Clock, AlertCircle, AlertTriangle, Loader2, CalendarPlus } from 'lucide-react';

export default function AdjournHearingModal({ isOpen, onClose, onSuccess, hearing }) {
  const [reason, setReason] = useState('');
  const [scheduleNext, setScheduleNext] = useState(true);

  // Next hearing fields
  const [courtrooms, setCourtrooms] = useState([]);
  const [nextCourtroomId, setNextCourtroomId] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextDurationMins, setNextDurationMins] = useState(30);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [nextPurpose, setNextPurpose] = useState('Continuation of Proceedings');

  const [availableSlots, setAvailableSlots] = useState([]);
  const [isWorkingDay, setIsWorkingDay] = useState(true);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && hearing) {
      setReason('');
      setScheduleNext(true);
      setError(null);
      setSelectedSlot(null);
      setNextPurpose('Continuation of Proceedings');
      setNextDurationMins(hearing.durationMins || hearing.durationMinutes || 30);
      setNextCourtroomId(hearing.courtroomId || hearing.courtroom?.id || '');

      // Default next date to 2 weeks ahead
      const targetDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      setNextDate(`${yyyy}-${mm}-${dd}`);

      fetchCourtrooms();
    }
  }, [isOpen, hearing]);

  const fetchCourtrooms = async () => {
    try {
      const res = await api.get('/hearings/meta');
      const metaPayload = unwrap(res);
      if (Array.isArray(metaPayload.courtrooms)) {
        setCourtrooms(metaPayload.courtrooms);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    if (!isOpen || !scheduleNext || !nextDate || !nextCourtroomId || !hearing) return;
    const judgeId = hearing.judgeId || hearing.judge?.id;
    fetchAvailability(nextDate, nextCourtroomId, judgeId, nextDurationMins);
  }, [isOpen, scheduleNext, nextDate, nextCourtroomId, nextDurationMins, hearing]);

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
      if (targetJudgeId) url += `&judgeId=${targetJudgeId}`;

      const res = await api.get(url);
      const d = unwrap(res);
      if (d) {
        setIsWorkingDay(d.isWorkingDay);
        setAvailableSlots(d.availableSlots || []);
        if (!d.isWorkingDay) {
          setAvailabilityMessage(d.reason || 'Court is closed on this day');
        } else if (d.availableSlots?.length === 0) {
          setAvailabilityMessage(
            'No free slots available on this date for this courtroom and judge'
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

  if (!isOpen || !hearing) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim() || reason.trim().length < 5) {
      setError('Please provide a valid reason for adjournment (at least 5 characters)');
      return;
    }

    if (scheduleNext && !selectedSlot) {
      setError('Please select an available slot for the next hearing date');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        reason: reason.trim(),
        nextHearing: scheduleNext
          ? {
              scheduledAt: selectedSlot.startIso,
              courtroomId: nextCourtroomId,
              durationMins: parseInt(nextDurationMins, 10),
              purpose: nextPurpose.trim() || 'Continuation of Proceedings',
            }
          : undefined,
      };

      const res = await api.post(`/hearings/${hearing.id}/adjourn`, payload);
      const dataPayload = unwrap(res);
      if (dataPayload.hearing || dataPayload.adjournedHearing) {
        if (onSuccess) {
          onSuccess({
            result: dataPayload,
            message: scheduleNext
              ? 'Hearing adjourned and next hearing session scheduled successfully'
              : 'Hearing adjourned successfully',
          });
        }
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to adjourn hearing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-lg my-8 overflow-hidden animate-in fade-in duration-200">
        <div className="flex items-center justify-between px-6 py-4 bg-navy-900 text-white">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-brass-500/20 text-brass-400 rounded-md">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold">Adjourn Court Hearing</h2>
              <p className="text-xs text-gray-300">
                Case {hearing.case?.caseNumber || hearing.caseNumber}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900">
                Adjournment Reason (Recorded in Daily Order) *
              </label>
              <span
                className={`text-[11px] font-mono ${
                  reason.trim().length < 5
                    ? 'text-amber-600 font-semibold'
                    : reason.trim().length > 500
                      ? 'text-red-600 font-bold'
                      : 'text-emerald-700'
                }`}
              >
                {reason.trim().length}/5 minimum (max 500)
              </span>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Adjourned upon request of counsel for respondent to file reply affidavit."
              rows={2}
              className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Official adjournment justification recorded in daily judicial order.
            </p>
          </div>

          {/* Toggle Next Hearing */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-3">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleNext}
                onChange={(e) => setScheduleNext(e.target.checked)}
                className="w-4 h-4 text-navy-900 rounded border-gray-300 focus:ring-brass-500"
              />
              <span className="text-xs font-bold text-navy-900 flex items-center space-x-1.5">
                <CalendarPlus className="w-3.5 h-3.5 text-brass-600" />
                <span>Fix next date of hearing immediately</span>
              </span>
            </label>

            {!scheduleNext ? (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  Notice: If no other scheduled hearing dates exist on this docket, case status will
                  automatically revert to <strong className="font-mono">ADVOCATE_ASSIGNED</strong>.
                </span>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Courtroom
                    </label>
                    <select
                      value={nextCourtroomId}
                      onChange={(e) => setNextCourtroomId(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded py-1.5 px-2 focus:ring-1 focus:ring-brass-500 focus:outline-none"
                    >
                      {courtrooms.map((cr) => (
                        <option key={cr.id} value={cr.id}>
                          {cr.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Next Date
                    </label>
                    <input
                      type="date"
                      value={nextDate}
                      onChange={(e) => setNextDate(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded py-1.5 px-2 focus:ring-1 focus:ring-brass-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Duration
                    </label>
                    <select
                      value={nextDurationMins}
                      onChange={(e) => setNextDurationMins(parseInt(e.target.value, 10))}
                      className="w-full text-xs border border-gray-300 rounded py-1.5 px-2 focus:ring-1 focus:ring-brass-500 focus:outline-none"
                    >
                      <option value={15}>15 Mins</option>
                      <option value={30}>30 Mins</option>
                      <option value={45}>45 Mins</option>
                      <option value={60}>60 Mins</option>
                    </select>
                  </div>
                </div>

                {/* Available Slots */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-gray-700">Available Free Slots:</span>
                    {loadingSlots && (
                      <span className="text-gray-400 flex items-center space-x-1">
                        <Loader2 className="w-3 h-3 animate-spin text-brass-600" />
                        <span>Searching...</span>
                      </span>
                    )}
                  </div>

                  {!isWorkingDay ? (
                    <div className="p-2 bg-amber-100/60 rounded text-amber-800 text-[11px] text-center">
                      Court closed on this day. Select a Monday–Friday working date.
                    </div>
                  ) : availableSlots.length === 0 && !loadingSlots ? (
                    <div className="p-2 bg-white rounded border border-gray-200 text-gray-400 text-[11px] text-center">
                      {availabilityMessage || 'No free slots found.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5 max-h-28 overflow-y-auto p-1 bg-white border border-gray-200 rounded">
                      {availableSlots.map((slot) => {
                        const isSelected = selectedSlot?.startIso === slot.startIso;
                        return (
                          <button
                            key={slot.startIso}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={`p-1 text-center font-mono text-[11px] rounded border transition-colors ${
                              isSelected
                                ? 'bg-navy-900 text-brass-300 font-bold border-navy-900'
                                : 'bg-gray-50 text-gray-700 hover:bg-brass-50/50'
                            }`}
                          >
                            {slot.startTime}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-gray-700">
                      Purpose of Next Hearing *
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        nextPurpose.trim().length < 3
                          ? 'text-amber-600 font-semibold'
                          : nextPurpose.trim().length > 200
                            ? 'text-red-600 font-bold'
                            : 'text-emerald-700'
                      }`}
                    >
                      {nextPurpose.trim().length}/3 minimum (max 200)
                    </span>
                  </div>
                  <input
                    type="text"
                    value={nextPurpose}
                    onChange={(e) => setNextPurpose(e.target.value)}
                    placeholder="e.g. Filing of Written Statement, Framing of Issues"
                    className="w-full text-xs border border-gray-300 rounded py-1.5 px-2 focus:ring-1 focus:ring-brass-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Specify objective for next hearing session.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200">
            {(reason.trim().length < 5 ||
              (scheduleNext && (!selectedSlot || nextPurpose.trim().length < 3))) && (
              <span className="text-[11px] text-gray-500 mr-auto">
                {reason.trim().length < 5
                  ? `Reason requires ${5 - reason.trim().length} more character(s)`
                  : scheduleNext && !selectedSlot
                    ? 'Select an available slot'
                    : `Next purpose requires ${3 - nextPurpose.trim().length} more character(s)`}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                reason.trim().length < 5 ||
                (scheduleNext && (!selectedSlot || nextPurpose.trim().length < 3))
              }
              title={
                reason.trim().length < 5
                  ? `Enter at least 5 characters for reason (${reason.trim().length}/5)`
                  : scheduleNext && !selectedSlot
                    ? 'Select an available slot for next hearing date'
                    : scheduleNext && nextPurpose.trim().length < 3
                      ? `Next purpose requires at least 3 characters (${nextPurpose.trim().length}/3)`
                      : 'Confirm adjournment'
              }
              className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-xs font-semibold hover:bg-navy-800 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin text-brass-400" />}
              <span>{submitting ? 'Adjourning...' : 'Confirm Adjournment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
