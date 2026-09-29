import { useState } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { X, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';

export default function CancelHearingModal({ isOpen, onClose, onSuccess, hearing }) {
  const modalRef = useModalA11y(isOpen, onClose);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !hearing) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim() || reason.trim().length < 5) {
      setError('A valid cancellation reason is required (at least 5 characters)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/hearings/${hearing.id}/cancel`, {
        reason: reason.trim(),
      });
      const dataPayload = unwrap(res);
      if (dataPayload.hearing) {
        if (onSuccess) {
          onSuccess({
            hearing: dataPayload.hearing,
            message: 'Hearing cancelled successfully',
          });
        }
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to cancel hearing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-hearing-title"
        className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-md my-8 overflow-hidden animate-in fade-in duration-200"
      >
        <div className="flex items-center justify-between px-6 py-4 bg-red-900 text-white">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-red-800 text-red-200 rounded-md">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="cancel-hearing-title" className="font-serif text-lg font-bold">
                Cancel Court Hearing
              </h2>
              <p className="text-xs text-red-200">
                Case {hearing.case?.caseNumber || hearing.caseNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-red-300 hover:text-white p-1 rounded-md"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs flex items-start space-x-2"
            >
              <AlertCircle
                className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-xs space-y-1.5">
            <p className="font-semibold flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" aria-hidden="true" />
              <span>Lifecycle Status Notice</span>
            </p>
            <p className="text-amber-800">
              If this is the only scheduled hearing on the docket, the case status will
              automatically revert to <strong className="font-mono">ADVOCATE_ASSIGNED</strong>.
            </p>
          </div>

          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-xs space-y-1">
            <span className="font-bold uppercase text-gray-400 text-[10px] block">
              Session Info
            </span>
            <div className="text-navy-950 font-semibold">
              {new Date(hearing.scheduledAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </div>
            <div className="text-gray-600">
              Courtroom: {hearing.courtroom?.name} | Purpose: {hearing.purpose}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="cancel-hearing-reason"
                className="block text-xs font-bold uppercase tracking-wider text-navy-900"
              >
                Cancellation Reason (Required) *
              </label>
              <span
                id="cancel-hearing-counter"
                aria-live="polite"
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
              id="cancel-hearing-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="cancel-hearing-counter cancel-hearing-hint"
              placeholder="e.g. Complainant withdrew motion; matter resolved out of court."
              rows={3}
              className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <p id="cancel-hearing-hint" className="text-[11px] text-gray-500 mt-1">
              Official cancellation reason permanently recorded in the audit trail.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200">
            {reason.trim().length < 5 && (
              <span aria-live="polite" className="text-[11px] text-gray-500 mr-auto">
                Reason requires {5 - reason.trim().length} more character(s)
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 5}
              title={
                reason.trim().length < 5
                  ? `Enter at least 5 characters for reason (${reason.trim().length}/5)`
                  : 'Confirm cancellation'
              }
              className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submitting ? 'Cancelling...' : 'Confirm Cancellation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
