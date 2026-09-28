import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { useAuth } from '../../context/AuthContext';
import { X, Mail, Phone, Scale, CheckCircle2, XCircle, ExternalLink, Edit3 } from 'lucide-react';

export default function AdvocateDetailModal({ isOpen, onClose, advocateId, onEdit }) {
  const navigate = useNavigate();
  const { can } = useAuth();

  const [advocate, setAdvocate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && advocateId) {
      fetchAdvocateDetail();
    }
  }, [isOpen, advocateId]);

  const fetchAdvocateDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/advocates/${advocateId}`);
      const data = unwrap(res, 'Failed to load advocate profile');

      if (data.advocate) {
        setAdvocate(data.advocate);
      } else {
        throw new Error('Failed to parse advocate profile');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0] ||
          err.message ||
          'Failed to load advocate profile'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-navy-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-navy-900 text-white px-6 py-4 flex items-center justify-between border-b border-navy-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-brass-500/20 border border-brass-400/40 flex items-center justify-center text-brass-400 font-serif font-bold text-lg">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-serif text-lg font-bold">
                  {advocate?.name || 'Advocate Profile'}
                </h3>
                {advocate && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-brass-400/20 text-brass-300 border border-brass-400/30">
                    {advocate.barNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-navy-300">
                {advocate?.specialization || 'Bar Council Registered Legal Counsel'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {advocate && can('advocate.manage') && onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(advocate);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-brass-300 bg-navy-800 hover:bg-navy-700 border border-brass-400/30 rounded-lg transition-colors flex items-center space-x-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-navy-300 hover:text-white transition-colors p-1 rounded hover:bg-navy-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              Loading advocate profile and case representations...
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
          ) : advocate ? (
            <>
              {/* Quick Details & Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                    Contact Details
                  </span>
                  <div className="space-y-1.5 text-xs text-gray-700">
                    <div className="flex items-center space-x-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <a
                        href={`mailto:${advocate.email}`}
                        className="hover:underline text-navy-800 font-medium"
                      >
                        {advocate.email}
                      </a>
                    </div>
                    {advocate.phone && (
                      <div className="flex items-center space-x-1.5">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span>{advocate.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                    Portal Account Access
                  </span>
                  <div className="text-xs">
                    {advocate.hasLogin ? (
                      <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold mt-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Active Portal Account</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-gray-500 mt-1">
                        <XCircle className="w-4 h-4 text-gray-400" />
                        <span>No Portal Login Registered</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                    Court Caseload Summary
                  </span>
                  <div className="flex items-baseline space-x-3 mt-1">
                    <div>
                      <span className="text-xl font-serif font-bold text-navy-900">
                        {advocate.activeCaseCount || 0}
                      </span>
                      <span className="text-[11px] text-gray-500 ml-1">Active</span>
                    </div>
                    <span className="text-gray-300">|</span>
                    <div>
                      <span className="text-base font-semibold text-gray-700">
                        {advocate.totalCaseCount || 0}
                      </span>
                      <span className="text-[11px] text-gray-500 ml-1">Total All-time</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Case Representations Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Assigned Cases & Representation History ({advocate.cases?.length || 0})
                  </h4>
                </div>

                {advocate.cases?.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-gray-500 text-xs">
                    No active or historical case representation records found for this counsel.
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full text-xs text-left divide-y divide-gray-200">
                      <thead className="bg-gray-50 uppercase text-gray-500 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">Case Number</th>
                          <th className="py-2.5 px-3">Title</th>
                          <th className="py-2.5 px-3">Side</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Assigned Date</th>
                          <th className="py-2.5 px-3">Representation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {advocate.cases.map((c) => (
                          <tr
                            key={c.caseId}
                            onClick={() => {
                              onClose();
                              navigate(`/cases/${c.caseId}`);
                            }}
                            className="hover:bg-navy-50/40 cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3 font-mono font-semibold text-navy-800 flex items-center space-x-1">
                              <span>{c.caseNumber}</span>
                              <ExternalLink className="w-3 h-3 text-gray-400" />
                            </td>
                            <td className="py-2.5 px-3 font-medium text-navy-950 max-w-xs truncate">
                              {c.title}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`font-semibold uppercase px-2 py-0.5 rounded text-[10px] ${
                                  c.side === 'PETITIONER'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'bg-purple-50 text-purple-800 border border-purple-200'
                                }`}
                              >
                                {c.side}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-800">
                                {c.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                              {new Date(c.assignedAt).toLocaleDateString('en-IN')}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {c.isActive ? (
                                <span className="inline-flex items-center text-emerald-700 font-semibold text-[11px]">
                                  Active Counsel
                                </span>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center text-gray-400 font-medium text-[11px]">
                                    Withdrawn (
                                    {new Date(c.unassignedAt).toLocaleDateString('en-IN')})
                                  </span>
                                  {c.unassignReason && (
                                    <p className="text-[10px] text-gray-500 italic max-w-xs truncate">
                                      {c.unassignReason}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
