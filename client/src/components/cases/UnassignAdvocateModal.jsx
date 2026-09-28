import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { X, UserMinus, AlertCircle, AlertTriangle } from 'lucide-react';

export default function UnassignAdvocateModal({
  isOpen,
  onClose,
  onSuccess,
  caseId,
  caseNumber,
  advocate,
  isLastAdvocate,
  caseStatus,
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !advocate) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Please provide a withdrawal/unassignment reason of at least 5 characters');
      return;
    }

    if (reason.trim().length > 500) {
      setError('Reason cannot exceed 500 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post(`/cases/${caseId}/advocates/${advocate.advocateId}/unassign`, {
        reason: reason.trim(),
      });

      if (res.data?.success) {
        onSuccess({
          assignment: res.data.data.assignment,
          statusChanged: res.data.data.statusChanged,
          currentStatus: res.data.data.currentStatus,
          message: res.data.message,
        });
        onClose();
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0] ||
          'Failed to unassign advocate'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-navy-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-navy-900 text-white px-6 py-4 flex items-center justify-between border-b border-navy-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-400/40 flex items-center justify-center text-red-400">
              <UserMinus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold">Unassign Legal Counsel</h3>
              <p className="text-xs text-navy-300">
                Docket <span className="font-mono text-brass-300 font-semibold">{caseNumber}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-navy-300 hover:text-white transition-colors p-1 rounded hover:bg-navy-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start space-x-2 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Advocate summary */}
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-navy-950 text-sm">{advocate.advocate?.name}</span>
              <span className="font-mono text-[11px] text-gray-500 bg-gray-200/70 px-1.5 py-0.5 rounded">
                {advocate.advocate?.barNumber}
              </span>
            </div>
            <p className="text-gray-600">
              Representing: <strong className="text-navy-900">{advocate.side}</strong> |
              Specialization: {advocate.advocate?.specialization}
            </p>
          </div>

          {/* Last advocate warning banner */}
          {isLastAdvocate && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sole Assigned Counsel Notice:</span> This is the only
                active legal counsel on this docket.
                {caseStatus === 'ADVOCATE_ASSIGNED' ? (
                  <span className="block mt-0.5">
                    Upon unassignment, case status will automatically revert to{' '}
                    <strong>Registered</strong> until replacement counsel is assigned.
                  </span>
                ) : (
                  <span className="block mt-0.5 font-semibold text-red-700">
                    Removing the last counsel when case is in {caseStatus} is restricted. Assign a
                    substitute counsel first.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Withdrawal Reason Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Reason for Unassignment / Withdrawal <span className="text-red-500">*</span>
              </label>
              <span
                className={`text-[11px] font-mono ${
                  reason.length < 5
                    ? 'text-gray-400'
                    : reason.length > 500
                      ? 'text-red-600 font-bold'
                      : 'text-emerald-700'
                }`}
              >
                {reason.length} / 500 chars (min 5)
              </span>
            </div>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Record mandatory administrative / judicial reason for advocate withdrawal (e.g. Vakalatnama revoked by party, advocate conflict of interest, elevated to bench, failure to appear)..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-navy-600"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              This statement will be permanently recorded in the immutable judicial case audit
              trail.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || reason.trim().length < 5 || reason.trim().length > 500}
              className="px-5 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
            >
              {loading ? (
                <span>Unassigning...</span>
              ) : (
                <>
                  <UserMinus className="w-3.5 h-3.5" />
                  <span>Confirm Unassignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
