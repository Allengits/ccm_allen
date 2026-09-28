import { useState } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { X, CheckCircle2, AlertCircle, Loader2, Scale } from 'lucide-react';

export default function CompleteHearingModal({ isOpen, onClose, onSuccess, hearing }) {
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !hearing) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!outcomeNotes.trim() || outcomeNotes.trim().length < 5) {
      setError('Please provide detailed proceedings outcome notes (at least 5 characters)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/hearings/${hearing.id}/complete`, {
        outcomeNotes: outcomeNotes.trim(),
      });
      const dataPayload = unwrap(res);
      if (dataPayload.hearing) {
        if (onSuccess) {
          onSuccess({
            hearing: dataPayload.hearing,
            message: 'Hearing proceedings completed successfully',
          });
        }
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to complete hearing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-lg my-8 overflow-hidden animate-in fade-in duration-200">
        <div className="flex items-center justify-between px-6 py-4 bg-emerald-900 text-white">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-emerald-800 text-emerald-200 rounded-md">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold">Conclude Hearing Session</h2>
              <p className="text-xs text-emerald-200">
                Case {hearing.case?.caseNumber || hearing.caseNumber}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-emerald-300 hover:text-white p-1 rounded-md">
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

          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-900 text-xs space-y-1">
            <p className="font-semibold flex items-center space-x-1.5">
              <Scale className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span>Judicial Proceedings Outcome</span>
            </p>
            <p className="text-emerald-800">
              Completing this session records the formal daily order. If this is the docket's first
              completed hearing, case status will automatically advance to{' '}
              <strong className="font-mono">UNDER_TRIAL</strong>.
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
              Courtroom: {hearing.courtroom?.name} | Presiding: {hearing.judge?.name}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-navy-900">
                Daily Order / Proceedings Outcome Notes *
              </label>
              <span
                className={`text-[11px] font-mono ${
                  outcomeNotes.trim().length < 5
                    ? 'text-amber-600 font-semibold'
                    : outcomeNotes.trim().length > 2000
                      ? 'text-red-600 font-bold'
                      : 'text-emerald-700'
                }`}
              >
                {outcomeNotes.trim().length}/5 minimum (max 2000)
              </span>
            </div>
            <textarea
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
              placeholder="e.g. Accused present. Charges framed under sections 420 & 406 IPC. Counsel for complainant cross-examined PW-1. Matter directed for further evidence."
              rows={4}
              className="w-full text-xs border border-gray-300 rounded-md py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Recorded in daily order. Formal record of proceeding findings.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200">
            {outcomeNotes.trim().length < 5 && (
              <span className="text-[11px] text-gray-500 mr-auto">
                Notes require {5 - outcomeNotes.trim().length} more character(s)
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
              disabled={submitting || outcomeNotes.trim().length < 5}
              title={
                outcomeNotes.trim().length < 5
                  ? `Enter at least 5 characters for outcome notes (${outcomeNotes.trim().length}/5)`
                  : 'Conclude & Record Order'
              }
              className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-700 text-white rounded-md text-xs font-semibold hover:bg-emerald-800 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submitting ? 'Recording Order...' : 'Conclude & Record Order'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
