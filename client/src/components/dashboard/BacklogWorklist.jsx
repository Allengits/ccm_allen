import React from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  ArrowRight,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { DateTime } from 'luxon';

const STATUS_BADGES = {
  REGISTERED: 'bg-blue-50 text-blue-800 border-blue-200',
  ADVOCATE_ASSIGNED: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  HEARING_SCHEDULED: 'bg-amber-50 text-amber-800 border-amber-200',
  UNDER_TRIAL: 'bg-purple-50 text-purple-800 border-purple-200',
  JUDGMENT_RESERVED: 'bg-orange-50 text-orange-800 border-orange-200',
  CLOSED: 'bg-gray-100 text-gray-700 border-gray-300',
};

export default function BacklogWorklist({
  data,
  loading,
  error,
  page,
  sortBy,
  sortOrder,
  onPageChange,
  onSortChange,
}) {
  const items = data?.items || [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const thresholdDays = data?.thresholdDays || 90;

  const formatFilingDate = (iso) => {
    if (!iso) return '--';
    try {
      return DateTime.fromISO(iso).setZone('Asia/Kolkata').toFormat('dd LLL yyyy');
    } catch {
      return '--';
    }
  };

  return (
    <div className="bg-white rounded-lg legal-border shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50/40">
        <div>
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-amber-600" />
            <h3 className="font-serif text-base font-bold text-navy-950">
              Overdue & Backlog Worklist
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 font-mono">
              {total} pending
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Active cases exceeding the {thresholdDays}-day court pendency threshold.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Sort dropdown */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split('-');
              onSortChange(sb, so);
            }}
            className="text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-white text-navy-800 focus:ring-1 focus:ring-brass-500"
            aria-label="Sort backlog cases"
          >
            <option value="age-desc">Sort: Oldest First (Highest Days)</option>
            <option value="age-asc">Sort: Newest First</option>
            <option value="status-asc">Sort: Status</option>
          </select>

          <Link
            to="/cases?backlog=true"
            className="inline-flex items-center space-x-1 text-xs font-semibold text-brass-700 hover:text-brass-900 px-2 py-1 rounded bg-white border border-brass-300 shadow-2xs hover:bg-brass-50 transition-colors"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
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
            <p className="text-sm font-semibold">Failed to load backlog worklist</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500 space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border border-emerald-200">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-navy-900">Zero Overdue Cases</p>
            <p className="text-xs text-gray-500">
              No active dockets currently exceed the configured {thresholdDays}-day pendency limit.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-100 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Case Number</th>
                <th className="py-2.5 px-3">Title & Type</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Days Open</th>
                <th className="py-2.5 px-3">Presiding Judge</th>
                <th className="py-2.5 px-3">Advocates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-medium text-navy-950">
                    <Link
                      to={`/cases/${c.id}`}
                      className="text-brass-700 hover:text-brass-900 hover:underline font-semibold"
                    >
                      {c.caseNumber}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 max-w-xs">
                    <div className="font-medium text-navy-900 truncate" title={c.title}>
                      {c.title}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Filed: {formatFilingDate(c.filingDate)} ({c.caseType})
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        STATUS_BADGES[c.status] || 'bg-gray-100'
                      }`}
                    >
                      {c.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-100/70 text-amber-900 border border-amber-200 font-mono font-bold">
                      <AlertTriangle className="w-3 h-3 text-amber-700" />
                      <span>{c.daysOpen}d</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-700">
                    {c.judge ? c.judge.name : <span className="text-gray-400">Unassigned</span>}
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 max-w-[140px] truncate">
                    {c.advocates && c.advocates.length > 0 ? (
                      c.advocates.map((a) => a.name).join(', ')
                    ) : (
                      <span className="text-gray-400 italic">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 bg-gray-50/50">
          <div>
            Page <span className="font-mono font-semibold">{page}</span> of{' '}
            <span className="font-mono font-semibold">{totalPages}</span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
              aria-label="Previous backlog page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
              aria-label="Next backlog page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
