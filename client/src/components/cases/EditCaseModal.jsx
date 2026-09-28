import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { X, AlertCircle, Edit2, Loader2 } from 'lucide-react';

export default function EditCaseModal({ isOpen, onClose, caseItem, onCaseUpdated }) {
  const [metadata, setMetadata] = useState({ judges: [] });
  const [formData, setFormData] = useState({
    title: '',
    petitioner: '',
    respondent: '',
    description: '',
    priority: 'NORMAL',
    judgeId: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!isOpen || !caseItem) return;

    setError('');
    setFieldErrors({});

    setFormData({
      title: caseItem.title || '',
      petitioner: caseItem.petitioner || '',
      respondent: caseItem.respondent || '',
      description: caseItem.description || '',
      priority: caseItem.priority || 'NORMAL',
      judgeId: caseItem.judgeId || caseItem.judge?.id || '',
    });

    const fetchMeta = async () => {
      try {
        const res = await api.get('/cases/meta');
        const meta = res?.data?.caseTypes ? res.data : res?.data?.data || res?.data || {};
        setMetadata(meta);
      } catch (err) {
        setError(err.message || 'Failed to load case metadata');
      }
    };

    fetchMeta();
  }, [isOpen, caseItem]);

  if (!isOpen || !caseItem) return null;

  const validate = () => {
    const errors = {};
    if (!formData.title.trim()) errors.title = 'Title cannot be empty';
    if (!formData.petitioner.trim()) errors.petitioner = 'Petitioner cannot be empty';
    if (!formData.respondent.trim()) errors.respondent = 'Respondent cannot be empty';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    try {
      setSubmitting(true);

      const payload = {
        title: formData.title.trim(),
        petitioner: formData.petitioner.trim(),
        respondent: formData.respondent.trim(),
        description: formData.description.trim() || null,
        priority: formData.priority,
        judgeId: formData.judgeId || null,
      };

      const res = await api.patch(`/cases/${caseItem.id}`, payload);
      const updated = res?.data?.case || res?.data?.data?.case || res?.case;

      if (onCaseUpdated) {
        onCaseUpdated(updated);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update case details');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-lg shadow-2xl max-w-2xl w-full border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-navy-950 text-white border-b border-navy-800">
          <div className="flex items-center space-x-2">
            <Edit2 className="w-5 h-5 text-brass-400" />
            <div>
              <h2 className="text-lg font-serif font-bold tracking-tight">Edit Case Details</h2>
              <p className="text-xs text-brass-200 font-mono mt-0.5">
                {caseItem.caseNumber} • {caseItem.caseType}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white rounded-md p-1 hover:bg-navy-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center space-x-2 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-navy-900 uppercase">
                Case Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
              />
              {fieldErrors.title && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
              )}
            </div>

            {/* Parties */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-navy-900 uppercase">
                  Petitioner <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.petitioner}
                  onChange={(e) => setFormData({ ...formData, petitioner: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                />
                {fieldErrors.petitioner && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.petitioner}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-navy-900 uppercase">
                  Respondent <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.respondent}
                  onChange={(e) => setFormData({ ...formData, respondent: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                />
                {fieldErrors.respondent && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.respondent}</p>
                )}
              </div>
            </div>

            {/* Priority & Presiding Judge */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-navy-900 uppercase">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-brass-500 focus:border-brass-500"
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="URGENT">URGENT</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-navy-900 uppercase">
                  Presiding Judge
                </label>
                <select
                  value={formData.judgeId}
                  onChange={(e) => setFormData({ ...formData, judgeId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-brass-500 focus:border-brass-500"
                >
                  <option value="">-- Unassigned --</option>
                  {metadata.judges?.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-navy-900 uppercase">
                Case Description & Remarks
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
              />
            </div>

            <div className="p-3 bg-gray-50 rounded-md text-xs text-gray-500 border border-gray-200">
              <span className="font-semibold uppercase block text-gray-700">Notice</span>
              Case Number ({caseItem.caseNumber}), Case Type, Filing Date, and Lifecycle Status are
              immutable and cannot be changed through this form.
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-navy-900 text-white rounded-md text-sm font-semibold hover:bg-navy-800 transition-colors shadow-sm flex items-center space-x-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-brass-400" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
