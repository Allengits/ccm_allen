import React from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { DateTime } from 'luxon';

export default function UpcomingHearingsWidget({ data, loading, error, page, onPageChange }) {
  const items = data?.items || [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const windowDays = data?.windowDays || 7;

  const formatISTDateTime = (iso) => {
    if (!iso) return { date: '--', time: '--' };
    try {
      const dt = DateTime.fromISO(iso).setZone('Asia/Kolkata');
      return {
        date: dt.toFormat('dd LLL yyyy'),
        day: dt.toFormat('ccc'),
        time: dt.toFormat('hh:mm a'),
      };
    } catch {
      return { date: '--', day: '', time: '--' };
    }
  };

  return (
    <div className="bg-white rounded-lg legal-border shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-navy-50/40">
        <div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-navy-800" />
            <h3 className="font-serif text-base font-bold text-navy-950">
              Upcoming Hearings (Next {windowDays} Days)
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-navy-100 text-navy-900 border border-navy-300 font-mono">
              {total} listed
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Court proceedings and arguments scheduled across judicial courtrooms.
          </p>
        </div>

        <Link
          to="/hearings"
          className="inline-flex items-center space-x-1 text-xs font-semibold text-brass-700 hover:text-brass-900 px-2.5 py-1 rounded bg-white border border-brass-300 shadow-2xs hover:bg-brass-50 transition-colors self-start sm:self-auto"
        >
          <span>Daily Cause List</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
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
            <p className="text-sm font-semibold">Failed to load upcoming hearings</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500 space-y-2">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center border border-blue-200">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-navy-900">No Upcoming Hearings</p>
            <p className="text-xs text-gray-500">
              Zero proceedings scheduled in the next {windowDays} calendar days.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-100 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Date & Time (IST)</th>
                <th className="py-2.5 px-3">Case</th>
                <th className="py-2.5 px-3">Purpose</th>
                <th className="py-2.5 px-3">Courtroom</th>
                <th className="py-2.5 px-3">Bench</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((h) => {
                const { date, day, time } = formatISTDateTime(h.scheduledAt);
                return (
                  <tr key={h.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-semibold text-navy-950 font-mono">
                        {date} <span className="text-gray-500 font-normal">({day})</span>
                      </div>
                      <div className="text-[11px] text-gray-600 flex items-center space-x-1 mt-0.5">
                        <Clock className="w-3 h-3 text-brass-600" />
                        <span className="font-mono">{time}</span>
                        {h.estimatedDurationMinutes && (
                          <span className="text-gray-400">({h.estimatedDurationMinutes}m)</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 max-w-xs">
                      <Link
                        to={`/cases/${h.caseId}`}
                        className="text-brass-700 hover:text-brass-900 hover:underline font-mono font-semibold"
                      >
                        {h.caseNumber}
                      </Link>
                      <div
                        className="text-[11px] text-gray-600 truncate mt-0.5"
                        title={h.caseTitle}
                      >
                        {h.caseTitle}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 max-w-[160px] truncate text-gray-800">
                      {h.purpose || 'Judicial Hearing'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {h.courtroom ? (
                        <span className="inline-flex items-center space-x-1 text-gray-700">
                          <MapPin className="w-3 h-3 text-navy-600" />
                          <span>{h.courtroom.name}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                      {h.judge ? h.judge.name : <span className="text-gray-400">Unassigned</span>}
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
              aria-label="Previous upcoming hearings page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
              aria-label="Next upcoming hearings page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
