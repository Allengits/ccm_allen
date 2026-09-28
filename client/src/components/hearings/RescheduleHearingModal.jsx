import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { X, Calendar, AlertCircle, Loader2 } from 'lucide-react';

export default function RescheduleHearingModal({ isOpen, onClose, onSuccess, hearing }) {
  const [courtrooms, setCourtrooms] = useState([]);
  const [courtroomId, setCourtroomId] = useState('');
  const [date, setDate] = useState('');
  const [durationMins, setDurationMins] = useState(30);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState('');

  const [availableSlots, setAvailableSlots] = useState([]);
  const [isWorkingDay, setIsWorkingDay] = useState(true);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && hearing) {
      setReason('');
      setError(null);
      setSelectedSlot(null);
      setDurationMins(hearing.durationMins || hearing.durationMinutes || 30);
      setCourtroomId(hearing.courtroomId || hearing.courtroom?.id || '');

      // Default date to next week working day
      const nextDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const yyyy = nextDate.getFullYear();
      const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
      const dd = String(nextDate.getDate()).padStart(2, '0');
      setDate(`${yyyy}-${mm}-${dd}`);

      fetchMeta();
    }
  }, [isOpen, hearing]);

  const fetchMeta = async () => {
    setLoadingMeta(true);
    try {
      const res = await api.get('/hearings/meta');
      const metaPayload = res?.data?.courtrooms ? res.data : res?.data?.data || res?.data || {};
      if (Array.isArray(metaPayload.courtrooms)) {
        setCourtrooms(metaPayload.courtrooms);
      }
    } catch {
      // Keep existing courtroom
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !date || !courtroomId || !hearing) return;
    const judgeId = hearing.judgeId || hearing.judge?.id;
    fetchAvailability(date, courtroomId, judgeId, durationMins);
  }, [isOpen, date, courtroomId, durationMins, hearing]);

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
      const isSuccess = res?.success ?? res?.data?.success ?? true;
      const d = res?.data?.availableSlots ? res.data : res?.data?.data || res?.data || {};
      if (isSuccess && d) {
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

  if (!isOpen || !hearing) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedSlot) {
      setError('Please select a new hearing slot time');
      return;
    }

    if (!reason.trim() || reason.trim().length < 5) {
      setError('A valid reschedule reason is required (at least 5 characters)');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        scheduledAt: selectedSlot.startIso,
        courtroomId,
        durationMins: parseInt(durationMins, 10),
        reason: reason.trim(),
      };

      const res = await api.patch(`/hearings/${hearing.id}`, payload);
      const isSuccess = res?.success ?? res?.data?.success ?? true;
      const dataPayload = res?.data?.hearing ? res.data : res?.data?.data || res?.data || {};
      if (isSuccess && dataPayload.hearing) {
        if (onSuccess) {
          onSuccess({
            hearing: dataPayload.hearing,
            message: 'Hearing rescheduled successfully',
          });
        }
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to reschedule hearing');
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
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold">Reschedule Hearing</h2>
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

          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-xs space-y-1">
            <span className="font-bold uppercase text-gray-400 text-[10px] block">
              Currently Scheduled
            </span>
            <div className="text-navy-950 font-semibold">
              {new Date(hearing.scheduledAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </div>
            <div className="text-gray-600">
              Courtroom: {hearing.courtroom?.name} | Judge: {hearing.judge?.name}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1">
                Courtroom *
              </label>
              <select
                value={courtroomId}
                onChange={(e) => setCourtroomId(e.target.value)}
                disabled={loadingMeta}
                className="w-full text-xs border border-gray-300 rounded-md py-2 px-2.5 focus:ring-2 focus:ring-brass-500 focus:outline-none"
              >
                {courtrooms.map((cr) => (
                  <option key={cr.id} value={cr.id}>
                    {cr.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1">
                New Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-md py-2 px-2.5 focus:ring-2 focus:ring-brass-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1">
                Duration *
              </label>
              <select
                value={durationMins}
                onChange={(e) => setDurationMins(parseInt(e.target.value, 10))}
                className="w-full text-xs border border-gray-300 rounded-md py-2 px-2.5 focus:ring-2 focus:ring-brass-500 focus:outline-none"
              >
                <option value={15}>15 Mins</option>
                <option value={30}>30 Mins</option>
                <option value={45}>45 Mins</option>
                <option value={60}>60 Mins</option>
              </select>
            </div>
          </div>

          {/* Slots */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900">
                Select Available Slot *
              </label>
              {loadingSlots && (
                <span className="text-[11px] text-gray-400 flex items-center space-x-1">
                  <Loader2 className="w-3 h-3 animate-spin text-brass-600" />
                  <span>Checking...</span>
                </span>
              )}
            </div>

            {!isWorkingDay ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs text-center">
                Court is closed on this day (Monday–Friday working days only).
              </div>
            ) : availableSlots.length === 0 && !loadingSlots ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded text-gray-500 text-xs text-center">
                {availabilityMessage || 'No free slots found.'}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1 border border-gray-200 rounded-md bg-gray-50/50">
                {availableSlots.map((slot) => {
                  const isSelected = selectedSlot?.startIso === slot.startIso;
                  return (
                    <button
                      key={slot.startIso}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-1.5 rounded text-xs font-mono text-center border transition-all ${
                        isSelected
                          ? 'bg-navy-900 text-brass-300 border-navy-900 font-bold shadow-sm'
                          : 'bg-white text-navy-900 border-gray-200 hover:border-brass-400'
                      }`}
                    >
                      <div className="font-semibold">{slot.startTime}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1">
              Reason for Rescheduling (Audit Trail) *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Presiding judge engaged in urgent Division Bench hearing; Counsel requested adjournment."
              rows={2}
              className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedSlot || reason.trim().length < 5}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-xs font-semibold hover:bg-navy-800 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin text-brass-400" />}
              <span>{submitting ? 'Rescheduling...' : 'Confirm Reschedule'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
