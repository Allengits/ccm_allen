import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, UserX, CalendarX, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { DateTime } from 'luxon';

export default function StaleCasesWorklist({
  data,
  loading,
  error,
  page,
  rule,
  onPageChange,
  onRuleChange,
}) {
  const items = data?.items || [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

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
      <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-rose-50/40">
        <div>
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <h3 className="font-serif text-base font-bold text-navy-950">
              Stale Case Detection Worklist
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-300 font-mono">
              {total} flagged
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Dockets stalled awaiting advocate assignment (Rule 1) or initial hearing scheduling
            (Rule 2).
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Rule Filter Tabs */}
          <div className="inline-flex rounded-md shadow-2xs border border-gray-300 p-0.5 bg-white text-xs">
            <button
              type="button"
              onClick={() => onRuleChange('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                rule === 'ALL'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-gray-600 hover:text-navy-900'
              }`}
            >
              All Rules
            </button>
            <button
              type="button"
              onClick={() => onRuleChange('NO_ADVOCATE')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                rule === 'NO_ADVOCATE'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-gray-600 hover:text-navy-900'
              }`}
            >
              Rule 1 (No Advocate)
            </button>
            <button
              type="button"
              onClick={() => onRuleChange('NO_HEARING')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                rule === 'NO_HEARING'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-gray-600 hover:text-navy-900'
              }`}
            >
              Rule 2 (No Hearing)
            </button>
          </div>

          <Link
            to="/cases"
            className="inline-flex items-center space-x-1 text-xs font-semibold text-brass-700 hover:text-brass-900 px-2 py-1 rounded bg-white border border-brass-300 shadow-2xs hover:bg-brass-50 transition-colors"
          >
            <span>Cases</span>
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
            <p className="text-sm font-semibold">Failed to load stale cases</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500 space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border border-emerald-200">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-navy-900">Zero Stale Cases</p>
            <p className="text-xs text-gray-500">
              All registered and assigned cases are advancing according to court threshold
              timelines.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-100 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Case Number</th>
                <th className="py-2.5 px-3">Title</th>
                <th className="py-2.5 px-3">Stale Condition & Rule</th>
                <th className="py-2.5 px-3">Days Pending</th>
                <th className="py-2.5 px-3">Presiding Judge</th>
                <th className="py-2.5 px-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((c) => {
                const isRule1 = c.matchedRule === 'NO_ADVOCATE';
                return (
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
                        Filed: {formatFilingDate(c.filingDate)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          isRule1
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {isRule1 ? (
                          <UserX className="w-3 h-3 text-rose-600" />
                        ) : (
                          <CalendarX className="w-3 h-3 text-amber-600" />
                        )}
                        <span>{c.ruleLabel}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-100/70 text-rose-900 border border-rose-200 font-mono font-bold">
                        <span>{c.daysPending}d</span>
                        <span className="text-[10px] text-rose-700 font-normal">
                          (&gt;{c.thresholdDays}d limit)
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-700">
                      {c.judge ? c.judge.name : <span className="text-gray-400">Unassigned</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <Link
                        to={`/cases/${c.id}`}
                        className="inline-flex items-center space-x-1 text-[11px] font-semibold text-brass-700 hover:text-brass-900 hover:underline"
                      >
                        <span>{isRule1 ? 'Assign Advocate' : 'Schedule Hearing'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
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
              aria-label="Previous stale cases page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
              aria-label="Next stale cases page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
