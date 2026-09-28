import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { X, AlertCircle, CheckCircle2, FileText, Loader2 } from 'lucide-react';

export default function RegisterCaseModal({ isOpen, onClose, onCaseRegistered }) {
  const navigate = useNavigate();

  const [metadata, setMetadata] = useState({
    caseTypes: [],
    priorities: ['NORMAL', 'URGENT'],
    judges: [],
  });

  const [formData, setFormData] = useState({
    title: '',
    caseType: 'CRIMINAL',
    priority: 'NORMAL',
    petitioner: '',
    respondent: '',
    description: '',
    filingDate: new Date().toISOString().split('T')[0],
    judgeId: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [successInfo, setSuccessInfo] = useState(null);

  // Load form metadata (judges, case types)
  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setFieldErrors({});
    setSuccessInfo(null);

    const fetchMeta = async () => {
      try {
        const res = await api.get('/cases/meta');
        const meta = res?.data?.caseTypes ? res.data : res?.data?.data || res?.data;
        if (meta && typeof meta === 'object') {
          setMetadata(meta);
          if (meta.caseTypes?.length > 0) {
            setFormData((prev) => ({
              ...prev,
              caseType: prev.caseType || meta.caseTypes[0],
            }));
          }
        }
      } catch (err) {
        setError(err.message || 'Failed to load case registration metadata');
      }
    };

    fetchMeta();
  }, [isOpen]);

  if (!isOpen) return null;

  const today = new Date().toISOString().split('T')[0];

  const validate = () => {
    const errors = {};
    if (!formData.title.trim()) errors.title = 'Case title is required';
    if (!formData.petitioner.trim()) errors.petitioner = 'Petitioner is required';
    if (!formData.respondent.trim()) errors.respondent = 'Respondent is required';
    if (!formData.filingDate) errors.filingDate = 'Filing date is required';
    if (formData.filingDate > today) errors.filingDate = 'Filing date cannot be in the future';

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
        caseType: formData.caseType,
        priority: formData.priority,
        petitioner: formData.petitioner.trim(),
        respondent: formData.respondent.trim(),
        description: formData.description.trim() || null,
        filingDate: new Date(formData.filingDate).toISOString(),
        judgeId: formData.judgeId || null,
      };

      const res = await api.post('/cases', payload);
      const newCase = res?.data?.case || res?.data?.data?.case || res?.case;

      if (!newCase) {
        throw new Error(res?.message || 'Failed to register case');
      }

      setSuccessInfo(newCase);
      if (onCaseRegistered) {
        onCaseRegistered(newCase);
      }

      // Automatically navigate to the case detail after a short pause, or allow clicking
      setTimeout(() => {
        onClose();
        navigate(`/cases/${newCase.id}`);
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to register case');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-lg shadow-2xl max-w-2xl w-full border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-navy-950 text-white border-b border-navy-800">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-brass-400" />
            <h2 className="text-lg font-serif font-bold tracking-tight">
              Register New Court Docket
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white rounded-md p-1 hover:bg-navy-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {successInfo ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-navy-900">
                Case Registered Successfully
              </h3>
              <div className="bg-navy-50 border border-navy-200 rounded-md p-4 max-w-md mx-auto">
                <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                  Official Case Number Allocated
                </p>
                <p className="text-2xl font-mono font-bold text-navy-950 mt-1">
                  {successInfo.caseNumber}
                </p>
                <p className="text-xs text-navy-800 mt-2 font-medium">{successInfo.title}</p>
              </div>
              <p className="text-sm text-gray-500">Redirecting to case details docket...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center space-x-2 text-red-800 text-xs">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Case Title */}
              <div>
                <label className="block text-xs font-semibold text-navy-900 uppercase">
                  Case Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. State of NCT vs. Rajesh Kumar & Ors."
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                />
                {fieldErrors.title && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
                )}
              </div>

              {/* Grid: Type & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-navy-900 uppercase">
                    Case Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.caseType}
                    onChange={(e) => setFormData({ ...formData, caseType: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-brass-500 focus:border-brass-500"
                  >
                    {metadata.caseTypes?.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-navy-900 uppercase">
                    Priority <span className="text-red-500">*</span>
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
              </div>

              {/* Grid: Petitioner & Respondent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-navy-900 uppercase">
                    Petitioner / Complainant <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.petitioner}
                    onChange={(e) => setFormData({ ...formData, petitioner: e.target.value })}
                    placeholder="Name of plaintiff / complainant"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                  />
                  {fieldErrors.petitioner && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.petitioner}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-navy-900 uppercase">
                    Respondent / Accused <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.respondent}
                    onChange={(e) => setFormData({ ...formData, respondent: e.target.value })}
                    placeholder="Name of defendant / accused"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                  />
                  {fieldErrors.respondent && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.respondent}</p>
                  )}
                </div>
              </div>

              {/* Grid: Filing Date & Judge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-navy-900 uppercase">
                    Filing Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    max={today}
                    required
                    value={formData.filingDate}
                    onChange={(e) => setFormData({ ...formData, filingDate: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-brass-500 focus:border-brass-500"
                  />
                  {fieldErrors.filingDate && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.filingDate}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-navy-900 uppercase">
                    Presiding Judge (Optional)
                  </label>
                  <select
                    value={formData.judgeId}
                    onChange={(e) => setFormData({ ...formData, judgeId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-brass-500 focus:border-brass-500"
                  >
                    <option value="">-- Unassigned (Allocate Later) --</option>
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
                  Case Description & Brief
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Summary of charges, cause of action, or relief sought..."
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end space-x-3">
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
                      <span>Registering...</span>
                    </>
                  ) : (
                    <span>Register Case</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
