import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { X, Edit3, AlertCircle, Lock } from 'lucide-react';

export default function EditAdvocateModal({
  isOpen,
  onClose,
  onSuccess,
  advocate,
  specializations = [],
}) {
  const [formData, setFormData] = useState({
    name: '',
    specialization: '',
    email: '',
    phone: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (advocate && isOpen) {
      setFormData({
        name: advocate.name || '',
        specialization: advocate.specialization || '',
        email: advocate.email || '',
        phone: advocate.phone || '',
      });
      setError(null);
      setFieldErrors({});
    }
  }, [advocate, isOpen]);

  if (!isOpen || !advocate) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters';
    }
    if (!formData.specialization.trim()) {
      errors.specialization = 'Specialization is required';
    }
    if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email.trim())) {
      errors.email = 'A valid email address is required';
    }
    if (formData.phone && formData.phone.trim()) {
      const cleanPhone = formData.phone.replace(/[\s-]/g, '');
      const validPhone = /^(?:\+91)?[6-9]\d{9}$|^(?:\+91)?0\d{2,4}\d{6,8}$/.test(cleanPhone);
      if (!validPhone) {
        errors.phone = 'Provide a valid 10-digit Indian mobile or landline number';
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.patch(`/advocates/${advocate.id}`, {
        name: formData.name.trim(),
        specialization: formData.specialization.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
      });

      const data = unwrap(res, 'Failed to update advocate');
      if (data.advocate) {
        onSuccess(data.advocate);
        onClose();
      } else {
        throw new Error('Failed to update advocate');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0] ||
          'Failed to update advocate'
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
            <div className="w-8 h-8 rounded-lg bg-brass-500/20 border border-brass-400/40 flex items-center justify-center text-brass-400">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold">Edit Advocate Details</h3>
              <p className="text-xs text-navy-300">Update practice profile & contact information</p>
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

          {/* Bar Number (Read-only / Immutable) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Bar Council Number</span>
              <span className="inline-flex items-center text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                <Lock className="w-2.5 h-2.5 mr-1" />
                Immutable
              </span>
            </label>
            <input
              type="text"
              disabled
              value={advocate.barNumber}
              className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Bar Council enrollment number cannot be modified after registration.
            </p>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Advocate Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                fieldErrors.name
                  ? 'border-red-300 focus:ring-red-400 bg-red-50/30'
                  : 'border-gray-300 focus:ring-navy-600'
              }`}
            />
            {fieldErrors.name && (
              <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.name}</p>
            )}
          </div>

          {/* Specialization */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Practice Specialization <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="specialization"
              list="edit-spec-options"
              value={formData.specialization}
              onChange={handleChange}
              className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                fieldErrors.specialization
                  ? 'border-red-300 focus:ring-red-400 bg-red-50/30'
                  : 'border-gray-300 focus:ring-navy-600'
              }`}
            />
            <datalist id="edit-spec-options">
              {specializations.map((spec) => (
                <option key={spec} value={spec} />
              ))}
            </datalist>
            {fieldErrors.specialization && (
              <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.specialization}</p>
            )}
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                  fieldErrors.email
                    ? 'border-red-300 focus:ring-red-400 bg-red-50/30'
                    : 'border-gray-300 focus:ring-navy-600'
                }`}
              />
              {fieldErrors.email && (
                <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Phone Number
              </label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+91 98XXX XXXXX"
                className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                  fieldErrors.phone
                    ? 'border-red-300 focus:ring-red-400 bg-red-50/30'
                    : 'border-gray-300 focus:ring-navy-600'
                }`}
              />
              {fieldErrors.phone && (
                <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.phone}</p>
              )}
            </div>
          </div>

          {/* Actions */}
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
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
            >
              {loading ? <span>Saving...</span> : <span>Save Changes</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
