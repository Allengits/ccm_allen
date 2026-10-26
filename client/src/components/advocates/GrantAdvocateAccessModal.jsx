import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { useModalA11y } from '../../hooks/useModalA11y';
import { X, KeyRound, Scale, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function GrantAdvocateAccessModal({ isOpen, onClose, advocate, onSuccess }) {
  const modalRef = useModalA11y(isOpen, onClose);
  const [password, setPassword] = useState('Demo@1234');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('Demo@1234');
      setError(null);
    }
  }, [isOpen, advocate]);

  if (!isOpen || !advocate) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/users', {
        name: advocate.name,
        email: advocate.email,
        role: 'ADVOCATE',
        password,
        advocateId: advocate.id,
      });

      const data = unwrap(res, 'Failed to create advocate portal account');
      if (onSuccess) {
        onSuccess(data.user, advocate);
      }
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0] ||
          err.message ||
          'Failed to grant portal access'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-access-modal-title"
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-navy-100 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="bg-navy-900 text-white px-6 py-4 flex items-center justify-between border-b border-navy-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-brass-500/20 border border-brass-400/40 flex items-center justify-center text-brass-400 font-serif font-bold text-lg">
              <KeyRound className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 id="grant-access-modal-title" className="font-serif text-lg font-bold">
                Grant Portal Access
              </h3>
              <p className="text-xs text-navy-300">Authorize advocate judicial portal credentials</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-navy-300 hover:text-white transition-colors p-1 rounded hover:bg-navy-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Advocate Summary Box */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-navy-950 text-sm">{advocate.name}</div>
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-brass-100 text-brass-900 border border-brass-300">
                {advocate.barNumber}
              </span>
            </div>
            <div className="flex items-center space-x-2 text-gray-600">
              <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="font-medium text-gray-800">{advocate.email}</span>
            </div>
            <div className="text-[11px] text-gray-500 flex items-center space-x-1">
              <Scale className="w-3 h-3 text-gray-400" />
              <span>Domain: {advocate.specialization}</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="grant-access-role"
              className="block font-semibold text-navy-900 uppercase text-[11px]"
            >
              Assigned System Role
            </label>
            <input
              id="grant-access-role"
              type="text"
              readOnly
              value="ADVOCATE"
              className="mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-xs font-semibold text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="grant-access-password"
              className="block font-semibold text-navy-900 uppercase text-[11px]"
            >
              Initial Portal Password
            </label>
            <input
              id="grant-access-password"
              type="text"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="e.g. Demo@1234"
              className="mt-1 w-full px-3 py-2 border rounded-md text-sm font-mono focus:ring-brass-500 focus:border-brass-500"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Advocate will use their registered email and this password to log in.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-navy-900 text-white rounded text-xs font-semibold hover:bg-navy-800 disabled:opacity-50 transition-colors shadow-sm flex items-center space-x-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 text-brass-400" />
              <span>{loading ? 'Authorizing Access...' : 'Authorize & Grant Access'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
