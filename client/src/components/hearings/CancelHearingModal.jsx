import { useState } from 'react';
import api from '../../api/axios';
import { X, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';

export default function CancelHearingModal({ isOpen, onClose, onSuccess, hearing }) {
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
      const isSuccess = res?.success ?? res?.data?.success ?? true;
      const dataPayload = res?.data?.hearing ? res.data : res?.data?.data || res?.data || {};
      if (isSuccess && dataPayload.hearing) {
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
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-md my-8 overflow-hidden animate-in fade-in duration-200">
        <div className="flex items-center justify-between px-6 py-4 bg-red-900 text-white">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-red-800 text-red-200 rounded-md">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold">Cancel Court Hearing</h2>
              <p className="text-xs text-red-200">
                Case {hearing.case?.caseNumber || hearing.caseNumber}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-red-300 hover:text-white p-1 rounded-md">
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

          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-xs space-y-1.5">
            <p className="font-semibold flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
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
            <label className="block text-xs font-bold uppercase tracking-wider text-navy-900 mb-1">
              Cancellation Reason (Required) *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Complainant withdrew motion; matter resolved out of court."
              rows={3}
              className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200">
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
