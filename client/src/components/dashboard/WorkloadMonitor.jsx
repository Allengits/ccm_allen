import React, { useState } from 'react';
import { Users, Scale, AlertTriangle, CheckCircle, ShieldAlert, AlertCircle } from 'lucide-react';

export default function WorkloadMonitor({ data, loading, error, userRole }) {
  const [activeTab, setActiveTab] = useState('advocates'); // 'advocates' | 'judges'

  if (userRole === 'ADVOCATE') {
    return null; // Not available to ADVOCATE role
  }

  const judges = data?.judges || [];
  const advocates = data?.advocates || [];
  const settings = data?.thresholdSettings || {};

  const isJudge = userRole === 'JUDGE';
  const effectiveTab = isJudge ? 'judges' : activeTab;

  return (
    <div className="bg-white rounded-lg legal-border shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-purple-50/30">
        <div>
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-purple-700" />
            <h3 className="font-serif text-base font-bold text-navy-950">
              Workload & Caseload Distribution
            </h3>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Active open cases monitored against court capacity thresholds (Advocate limit:{' '}
            {settings.advocateWarningThreshold || 15}, Judge limit:{' '}
            {settings.judgeWarningThreshold || 25}).
          </p>
        </div>

        {/* Tab switchers (only visible for Admin / Registrar) */}
        {!isJudge && (
          <div className="inline-flex rounded-md shadow-2xs border border-gray-300 p-0.5 bg-white text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('advocates')}
              className={`px-3 py-1 rounded font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'advocates'
                  ? 'bg-navy-900 text-white shadow-xs'
                  : 'text-gray-600 hover:text-navy-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Advocates ({advocates.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('judges')}
              className={`px-3 py-1 rounded font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'judges'
                  ? 'bg-navy-900 text-white shadow-xs'
                  : 'text-gray-600 hover:text-navy-900'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Judges ({judges.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Content Table / States */}
      <div className="flex-1 overflow-x-auto">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded"></div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-700 space-y-2">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-sm font-semibold">Failed to load workload statistics</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        ) : effectiveTab === 'advocates' ? (
          /* Advocates Table */
          advocates.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs">
              No advocate workload data available.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-100 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Advocate Name</th>
                  <th className="py-2.5 px-3">Bar Enrollment</th>
                  <th className="py-2.5 px-3">Specialization</th>
                  <th className="py-2.5 px-3">Active Dockets</th>
                  <th className="py-2.5 px-3">Capacity Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {advocates.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-navy-950">{a.name}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-600">{a.barNumber || '--'}</td>
                    <td className="py-2.5 px-3 text-gray-600 max-w-[180px] truncate">
                      {a.specialization || 'General Practice'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-navy-900 text-sm">
                      {a.activeCaseCount}
                    </td>
                    <td className="py-2.5 px-3">
                      {a.isOverloaded ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-300 font-semibold text-[10px]">
                          <AlertTriangle className="w-3 h-3 text-red-600" />
                          <span>Overload (&gt;{a.warningThreshold})</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>Within Limit (&le;{a.warningThreshold})</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : /* Judges Table */
        judges.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-xs">
            No judicial workload data available.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-100 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Presiding Judge</th>
                <th className="py-2.5 px-3">Registry Email</th>
                <th className="py-2.5 px-3">Active Dockets</th>
                <th className="py-2.5 px-3">Bench Capacity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {judges.map((j) => (
                <tr key={j.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-navy-950 font-serif">{j.name}</td>
                  <td className="py-2.5 px-3 font-mono text-gray-600">{j.email}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-navy-900 text-sm">
                    {j.activeCaseCount}
                  </td>
                  <td className="py-2.5 px-3">
                    {j.isOverloaded ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-300 font-semibold text-[10px]">
                        <ShieldAlert className="w-3 h-3 text-red-600" />
                        <span>Overload (&gt;{j.warningThreshold})</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        <span>Balanced (&le;{j.warningThreshold})</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
