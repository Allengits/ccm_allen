import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import {
  Sliders,
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  History,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { useModalA11y } from '../../hooks/useModalA11y';

const THRESHOLD_FIELDS = [
  {
    key: 'backlog_threshold_days',
    label: 'Backlog Pendency Threshold',
    unit: 'days',
    min: 1,
    max: 3650,
    description: 'Active case pendency limit beyond which dockets are flagged as overdue backlog.',
  },
  {
    key: 'advocate_workload_warning_threshold',
    label: 'Advocate Workload Limit',
    unit: 'active cases',
    min: 1,
    max: 500,
    description: 'Maximum active caseload before advocate assignment triggers a workload warning.',
  },
  {
    key: 'judge_workload_warning_threshold',
    label: 'Judge Workload Limit',
    unit: 'active cases',
    min: 1,
    max: 500,
    description:
      'Maximum active caseload before a presiding judge is flagged on the workload monitor.',
  },
  {
    key: 'stale_case_no_advocate_days',
    label: 'Stale Case: Rule 1 (No Advocate)',
    unit: 'days',
    min: 1,
    max: 365,
    description: 'Maximum days a REGISTERED case may remain without counsel assigned.',
  },
  {
    key: 'stale_case_no_hearing_days',
    label: 'Stale Case: Rule 2 (No Hearing)',
    unit: 'days',
    min: 1,
    max: 365,
    description: 'Maximum days an ADVOCATE_ASSIGNED case may remain without any hearing scheduled.',
  },
  {
    key: 'upcoming_hearings_window_days',
    label: 'Upcoming Hearings Horizon',
    unit: 'days',
    min: 1,
    max: 90,
    description: 'Forward-looking calendar window monitored on the registry dashboard.',
  },
];

export default function ThresholdSettingsModal({ isOpen, onClose, userRole, onSaved }) {
  const modalRef = useModalA11y(isOpen, onClose);
  const [formData, setFormData] = useState({});
  const [initialData, setInitialData] = useState({});
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const isAdmin = userRole === 'ADMIN';

  // Load existing threshold settings & audit trail
  const loadSettings = async () => {
    setLoading(true);
    setServerError(null);
    try {
      const res = await api.get('/dashboard/settings');
      const data = unwrap(res, 'Failed to fetch settings');
      const raw = data.thresholds || {};
      setFormData(raw);
      setInitialData(raw);
      setAuditLog(data.auditLog || []);
    } catch (err) {
      setServerError(err.message || 'Unable to retrieve court threshold settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      setSuccessMessage(null);
      setFieldErrors({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    // Clear validation error on touch
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: null }));
    }
    setSuccessMessage(null);
  };

  const validate = () => {
    const errors = {};
    let valid = true;

    for (const field of THRESHOLD_FIELDS) {
      const val = parseInt(formData[field.key], 10);
      if (isNaN(val)) {
        errors[field.key] = 'Must be an integer value';
        valid = false;
      } else if (val < field.min || val > field.max) {
        errors[field.key] = `Value must be between ${field.min} and ${field.max} ${field.unit}`;
        valid = false;
      }
    }

    setFieldErrors(errors);
    return valid;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!validate()) return;

    setSaving(true);
    setServerError(null);
    setSuccessMessage(null);

    // Filter only changed fields
    const updates = {};
    for (const field of THRESHOLD_FIELDS) {
      const numVal = parseInt(formData[field.key], 10);
      if (numVal !== initialData[field.key]) {
        updates[field.key] = numVal;
      }
    }

    if (Object.keys(updates).length === 0) {
      setSuccessMessage('No changes detected in threshold values.');
      setSaving(false);
      return;
    }

    try {
      const res = await api.patch('/dashboard/settings', updates);
      const data = unwrap(res, 'Failed to update settings');
      setSuccessMessage(
        `Successfully updated ${data.updatedKeys.length} threshold setting(s). Dashboard updated immediately.`
      );
      setInitialData(data.thresholds || formData);
      setFormData(data.thresholds || formData);

      // Reload audit log
      loadSettings();

      // Trigger instant parent dashboard refresh without full page reload
      if (onSaved) {
        onSaved();
      }
    } catch (err) {
      setServerError(err.message || 'Failed to apply threshold updates');
    } finally {
      setSaving(false);
    }
  };

  const formatAuditDate = (iso) => {
    if (!iso) return '--';
    try {
      return DateTime.fromISO(iso).setZone('Asia/Kolkata').toFormat('dd LLL yyyy, hh:mm a');
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4 backdrop-blur-2xs">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="threshold-settings-title"
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-navy-800 flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-navy-950 text-white flex items-center justify-between border-b border-navy-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-brass-500/20 border border-brass-400/30 flex items-center justify-center text-brass-400">
              <Sliders className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="threshold-settings-title" className="font-serif text-lg font-bold">
                Court Configuration Engine
              </h2>
              <p className="text-xs text-navy-300">
                Configure systemic thresholds for pendency, workload monitoring, and stale dockets.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-navy-400 hover:text-white hover:bg-navy-800 transition-colors"
            aria-label="Close settings modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Messages */}
          {serverError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2.5 text-red-800 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start space-x-2.5 text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          {!isAdmin && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                Read-only mode: Only Administrator accounts can adjust systemic court thresholds.
              </span>
            </div>
          )}

          {loading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg"></div>
              ))}
            </div>
          ) : (
            <form id="threshold-form" onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {THRESHOLD_FIELDS.map((field) => (
                  <div
                    key={field.key}
                    className="p-3.5 rounded-lg border border-gray-200 bg-gray-50/50 hover:bg-white hover:border-brass-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={field.key}
                        className="text-xs font-semibold text-navy-900 block"
                      >
                        {field.label}
                      </label>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {field.min} - {field.max} {field.unit}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                      {field.description}
                    </p>

                    <div className="mt-2 flex items-center space-x-2">
                      <input
                        id={field.key}
                        type="number"
                        min={field.min}
                        max={field.max}
                        disabled={!isAdmin || saving}
                        value={formData[field.key] ?? ''}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        className={`w-full text-xs font-mono px-3 py-1.5 rounded border ${
                          fieldErrors[field.key]
                            ? 'border-red-400 bg-red-50/50 focus:ring-red-500'
                            : 'border-gray-300 bg-white focus:ring-brass-500'
                        } disabled:bg-gray-100 disabled:text-gray-500`}
                      />
                      <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
                        {field.unit}
                      </span>
                    </div>

                    {fieldErrors[field.key] && (
                      <p className="text-[10px] text-red-600 mt-1">{fieldErrors[field.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </form>
          )}

          {/* Audit History Log */}
          {auditLog.length > 0 && (
            <div className="pt-4 border-t border-gray-200 space-y-3">
              <h3 className="font-serif text-sm font-bold text-navy-950 flex items-center space-x-2">
                <History className="w-4 h-4 text-brass-600" />
                <span>Threshold Change Audit Trail</span>
              </h3>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="py-1.5 px-2.5">Setting</th>
                      <th className="py-1.5 px-2.5">Old Value</th>
                      <th className="py-1.5 px-2.5">New Value</th>
                      <th className="py-1.5 px-2.5">Modified By</th>
                      <th className="py-1.5 px-2.5">Timestamp (IST)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono">
                    {auditLog.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="py-1.5 px-2.5 text-navy-900 font-sans font-medium">
                          {log.settingKey}
                        </td>
                        <td className="py-1.5 px-2.5 text-gray-500 line-through">{log.oldValue}</td>
                        <td className="py-1.5 px-2.5 font-bold text-emerald-700">{log.newValue}</td>
                        <td className="py-1.5 px-2.5 text-gray-600 font-sans">
                          {log.changedByName || 'Admin'}
                        </td>
                        <td className="py-1.5 px-2.5 text-gray-500 font-sans whitespace-nowrap">
                          {formatAuditDate(log.changedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setFormData(initialData)}
            disabled={saving || !isAdmin}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Current</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-gray-300 bg-white text-xs font-medium text-navy-800 hover:bg-gray-50"
            >
              Close
            </button>
            {isAdmin && (
              <button
                type="submit"
                form="threshold-form"
                disabled={saving || loading}
                className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded bg-navy-900 hover:bg-navy-950 text-white text-xs font-semibold shadow-sm focus:ring-2 focus:ring-brass-500 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5 text-brass-400" />
                <span>{saving ? 'Applying...' : 'Save System Settings'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
