import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { X, UserPlus, AlertCircle } from 'lucide-react';

export default function AddAdvocateModal({ isOpen, onClose, onSuccess, specializations = [] }) {
  const [formData, setFormData] = useState({
    name: '',
    barNumber: '',
    specialization: '',
    email: '',
    phone: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        barNumber: '',
        specialization: specializations[0] || 'Civil Litigation',
        email: '',
        phone: '',
      });
      setError(null);
      setFieldErrors({});
    }
  }, [isOpen, specializations]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'barNumber') {
      setFormData((prev) => ({ ...prev, [name]: value.toUpperCase() }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters';
    }
    const cleanBar = formData.barNumber.trim().toUpperCase();
    if (!cleanBar || !/^[A-Z0-9/-]{5,20}$/.test(cleanBar)) {
      errors.barNumber = 'Bar number must be 5-20 characters (letters, digits, slash, or hyphen)';
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
      const res = await api.post('/advocates', {
        name: formData.name.trim(),
        barNumber: formData.barNumber.trim().toUpperCase(),
        specialization: formData.specialization.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
      });

      const data = unwrap(res, 'Failed to register advocate');
      if (data.advocate) {
        onSuccess(data.advocate);
        onClose();
      } else {
        throw new Error('Failed to register advocate');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0] ||
          'Failed to register advocate'
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
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold">Register Legal Counsel</h3>
              <p className="text-xs text-navy-300">
                Enroll new advocate in the official court directory
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
              placeholder="e.g. Adv. Rakesh K. Srivastava"
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

          {/* Bar Council Number */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>
                Bar Council Number <span className="text-red-500">*</span>
              </span>
              <span className="text-[11px] text-gray-400 font-normal lowercase">
                e.g. D/2014/1892
              </span>
            </label>
            <input
              type="text"
              name="barNumber"
              value={formData.barNumber}
              onChange={handleChange}
              placeholder="STATE/YEAR/ROLL"
              className={`w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border focus:outline-none focus:ring-2 ${
                fieldErrors.barNumber
                  ? 'border-red-300 focus:ring-red-400 bg-red-50/30'
                  : 'border-gray-300 focus:ring-navy-600'
              }`}
            />
            {fieldErrors.barNumber && (
              <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.barNumber}</p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              Official Bar Council enrollment ID. Cannot be modified after registration.
            </p>
          </div>

          {/* Specialization */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Primary Practice Specialization <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="specialization"
              list="specialization-options"
              value={formData.specialization}
              onChange={handleChange}
              placeholder="Select or enter specialization"
              className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                fieldErrors.specialization
                  ? 'border-red-300 focus:ring-red-400 bg-red-50/30'
                  : 'border-gray-300 focus:ring-navy-600'
              }`}
            />
            <datalist id="specialization-options">
              {specializations.map((spec) => (
                <option key={spec} value={spec} />
              ))}
            </datalist>
            {fieldErrors.specialization && (
              <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.specialization}</p>
            )}
          </div>

          {/* Email & Phone grid */}
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
                placeholder="advocate@chambers.in"
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
                Phone Number <span className="text-gray-400 font-normal lowercase">(optional)</span>
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

          {/* Action Buttons */}
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
              {loading ? (
                <span>Registering...</span>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register Advocate</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
