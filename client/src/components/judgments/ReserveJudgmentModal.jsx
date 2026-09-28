import { useState } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { Gavel, X, AlertTriangle, Loader2 } from 'lucide-react';

export default function ReserveJudgmentModal({ isOpen, onClose, courtCase, onReserved }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !courtCase) return null;

  const trimmedNote = note.trim();
  const isNoteValid = trimmedNote.length === 0 || (trimmedNote.length >= 5 && trimmedNote.length <= 500);

  let disabledReason = '';
  if (!isNoteValid) {
    if (trimmedNote.length < 5) {
      disabledReason = 'Note must be at least 5 characters if provided (or left empty)';
    } else if (trimmedNote.length > 500) {
      disabledReason = 'Note cannot exceed 500 characters';
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isNoteValid) return;

    try {
      setSubmitting(true);
      setError(null);

      const payload = {};
      if (trimmedNote.length > 0) {
        payload.note = trimmedNote;
      }

      const res = await api.post(`/cases/${courtCase.id}/judgment/reserve`, payload);
      unwrap(res, 'Failed to reserve judgment');

      onClose();
      if (onReserved) {
        onReserved('Judgment reserved successfully. Case status has advanced to JUDGMENT_RESERVED.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to reserve judgment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl border border-navy-900/10 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-navy-900 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2">
            <Gavel className="w-5 h-5 text-brass-400" />
            <h2 className="font-serif text-lg font-bold tracking-wide">Reserve Judgment</h2>
          </div>
          <button
            onClick={onClose}
            className="text-navy-300 hover:text-white transition-colors"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Case summary */}
          <div className="p-3.5 bg-navy-50/50 rounded-md border border-navy-100 text-xs space-y-1">
            <div className="font-mono text-navy-950 font-bold">{courtCase.caseNumber}</div>
            <div className="font-serif text-gray-800 font-semibold">{courtCase.title}</div>
            <div className="text-gray-500 pt-1">
              Trial hearings concluded. Reserving judgment will automatically advance case status from{' '}
              <span className="font-mono font-bold text-navy-900">UNDER_TRIAL</span> to{' '}
              <span className="font-mono font-bold text-amber-700">JUDGMENT_RESERVED</span>.
            </div>
          </div>

          {/* Reserve Note (optional 5-500) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="reserve-note" className="font-semibold text-gray-700">
                Reservation Bench Note <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <span
                className={`font-mono text-[11px] ${
                  trimmedNote.length > 0 && trimmedNote.length < 5
                    ? 'text-amber-600 font-semibold'
                    : trimmedNote.length > 500
                    ? 'text-red-600 font-bold'
                    : 'text-gray-500'
                }`}
              >
                {trimmedNote.length > 0 ? `${trimmedNote.length}/5 min` : '0/500'}
                {trimmedNote.length > 500 ? ' (exceeds 500)' : ' (max 500)'}
              </span>
            </div>
            <textarea
              id="reserve-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Oral submissions concluded; written arguments taken on record. Matter reserved for pronouncement."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brass-500 focus:border-brass-500"
            />
            <p className="text-[11px] text-gray-500">
              Optional bench memorandum or scheduling context for reserving judgment. Minimum 5 characters if entered.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <div className="relative group inline-block">
              <button
                type="submit"
                disabled={submitting || !isNoteValid}
                className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors flex items-center space-x-1.5 shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brass-400" />
                    <span>Reserving...</span>
                  </>
                ) : (
                  <>
                    <Gavel className="w-3.5 h-3.5 text-brass-400" />
                    <span>Reserve Judgment</span>
                  </>
                )}
              </button>
              {disabledReason && (
                <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-[11px] rounded px-2 py-1 whitespace-nowrap shadow-lg z-50">
                  {disabledReason}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
