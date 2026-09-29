import { useState } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { Scale, X, AlertTriangle, Loader2, Calendar } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';

const OUTCOME_OPTIONS = [
  { value: 'ALLOWED', label: 'ALLOWED — Relief granted in favor of petitioner/appellant' },
  { value: 'DISMISSED', label: 'DISMISSED — Petition/plaint rejected on merits or law' },
  { value: 'CONVICTED', label: 'CONVICTED — Accused found guilty and sentenced' },
  { value: 'ACQUITTED', label: 'ACQUITTED — Accused exonerated of all criminal charges' },
  { value: 'SETTLED', label: 'SETTLED — Matter resolved via compromise/arbitration deed' },
  { value: 'DISPOSED', label: 'DISPOSED — Disposed on technical/procedural grounds' },
];

export default function DeliverJudgmentModal({ isOpen, onClose, courtCase, onDelivered }) {
  const modalRef = useModalA11y(isOpen, onClose);

  // Today in IST (YYYY-MM-DD)
  const getTodayISTString = () => {
    const now = new Date();
    // Use Intl for IST date string
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  };

  const todayIST = getTodayISTString();

  const [outcome, setOutcome] = useState('');
  const [summary, setSummary] = useState('');
  const [judgmentDate, setJudgmentDate] = useState(todayIST);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !courtCase) return null;

  const trimmedSummary = summary.trim();
  const reservedAtDateStr = courtCase.judgment?.reservedAt
    ? new Date(courtCase.judgment.reservedAt).toLocaleDateString('en-CA')
    : null;

  // Validation rules
  const isOutcomeValid = Boolean(outcome);
  const isSummaryValid = trimmedSummary.length >= 20 && trimmedSummary.length <= 4000;
  const isDateValid =
    judgmentDate &&
    judgmentDate <= todayIST &&
    (!reservedAtDateStr || judgmentDate >= reservedAtDateStr);

  const canSubmit = isOutcomeValid && isSummaryValid && isDateValid;

  let disabledReason = '';
  if (!isOutcomeValid) {
    disabledReason = 'Select an operative outcome for the judgment';
  } else if (trimmedSummary.length < 20) {
    disabledReason = `Summary requires at least 20 characters (${trimmedSummary.length}/20)`;
  } else if (trimmedSummary.length > 4000) {
    disabledReason = 'Summary exceeds 4,000 character limit';
  } else if (judgmentDate > todayIST) {
    disabledReason = 'Judgment date cannot be in the future';
  } else if (reservedAtDateStr && judgmentDate < reservedAtDateStr) {
    disabledReason = `Judgment date cannot be before reservation date (${reservedAtDateStr})`;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        outcome,
        summary: trimmedSummary,
        judgmentDate: judgmentDate || todayIST,
      };

      const res = await api.post(`/cases/${courtCase.id}/judgment/deliver`, payload);
      unwrap(res, 'Failed to deliver judgment');

      onClose();
      if (onDelivered) {
        onDelivered(
          `Judgment delivered successfully with outcome "${outcome}". Case status has advanced to CLOSED.`
        );
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to deliver judgment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deliver-judgment-title"
        className="bg-white rounded-lg shadow-2xl border border-navy-900/10 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="bg-navy-900 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2">
            <Scale className="w-5 h-5 text-brass-400" aria-hidden="true" />
            <h2 id="deliver-judgment-title" className="font-serif text-lg font-bold tracking-wide">
              Pronounce & Deliver Judgment
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-navy-300 hover:text-white transition-colors"
            title="Close dialog"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              id="deliver-judgment-error"
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs flex items-start space-x-2"
            >
              <AlertTriangle
                className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          )}

          {/* Case summary context */}
          <div className="p-3.5 bg-navy-50/50 rounded-md border border-navy-100 text-xs space-y-1">
            <div className="font-mono text-navy-950 font-bold">{courtCase.caseNumber}</div>
            <div className="font-serif text-gray-800 font-semibold">{courtCase.title}</div>
            <div className="text-gray-500 pt-1">
              Delivering judgment is permanent and irreversible. Upon submission, this case will
              advance from{' '}
              <span className="font-mono font-bold text-amber-700">JUDGMENT_RESERVED</span> to{' '}
              <span className="font-mono font-bold text-emerald-700">CLOSED</span>, and all docket
              records become permanently read-only.
            </div>
          </div>

          {/* Outcome Select */}
          <div className="space-y-1.5">
            <label htmlFor="judgment-outcome" className="block text-xs font-semibold text-gray-700">
              Operative Outcome <span className="text-red-500">*</span>
            </label>
            <select
              id="judgment-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brass-500 focus:border-brass-500 bg-white"
            >
              <option value="">Select final disposition outcome...</option>
              {OUTCOME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Judgment Date */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="judgment-date"
                className="font-semibold text-gray-700 flex items-center space-x-1"
              >
                <Calendar className="w-3.5 h-3.5 text-navy-700" />
                <span>
                  Date of Pronouncement (IST) <span className="text-red-500">*</span>
                </span>
              </label>
              <span className="text-gray-400 text-[11px]">Cannot be future date</span>
            </div>
            <input
              id="judgment-date"
              type="date"
              max={todayIST}
              value={judgmentDate}
              onChange={(e) => setJudgmentDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brass-500 focus:border-brass-500"
            />
          </div>

          {/* Summary Textarea (20-4000) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="judgment-summary" className="font-semibold text-gray-700">
                Operative Judgment Summary & Reasoning <span className="text-red-500">*</span>
              </label>
              <span
                id="judgment-summary-counter"
                aria-live="polite"
                className={`font-mono text-[11px] ${
                  trimmedSummary.length < 20
                    ? 'text-amber-600 font-semibold'
                    : trimmedSummary.length > 4000
                      ? 'text-red-600 font-bold'
                      : 'text-gray-500'
                }`}
              >
                {trimmedSummary.length}/20 minimum (max 4000)
              </span>
            </div>
            <textarea
              id="judgment-summary"
              rows={5}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              aria-describedby="judgment-summary-counter judgment-summary-hint"
              placeholder="Provide a comprehensive summary of facts, issues considered, legal ratio decidendi, and operative relief / sentencing decree..."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brass-500 focus:border-brass-500 font-serif leading-relaxed"
            />
            <p id="judgment-summary-hint" className="text-[11px] text-gray-500">
              Minimum 20 characters required. The summary becomes part of the permanent judicial
              public record.
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
                disabled={submitting || !canSubmit}
                className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors flex items-center space-x-1.5 shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brass-400" />
                    <span>Delivering...</span>
                  </>
                ) : (
                  <>
                    <Scale className="w-3.5 h-3.5 text-brass-400" />
                    <span>Pronounce & Close Case</span>
                  </>
                )}
              </button>
              {disabledReason && (
                <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-[11px] rounded px-2.5 py-1 whitespace-nowrap shadow-lg z-50">
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
