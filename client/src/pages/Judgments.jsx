import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { unwrap } from '../api/unwrap';
import { useAuth } from '../context/AuthContext';
import {
  Scale,
  Search,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ExternalLink,
  RotateCcw,
  Loader2,
  AlertTriangle,
  FileText,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export default function Judgments() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL Query State
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
  const q = searchParams.get('q') || '';
  const state = searchParams.get('state') || '';
  const outcome = searchParams.get('outcome') || '';
  const judgeId = searchParams.get('judgeId') || '';
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const dateField = searchParams.get('dateField') || 'judgmentDate';
  const sortBy = searchParams.get('sortBy') || 'reservedAt';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  // Local state for search input debounce
  const [searchInput, setSearchInput] = useState(q);

  // Metadata
  const [meta, setMeta] = useState({ outcomes: [], states: [], judges: [] });

  // Data
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, page: 1, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync search input when URL changes
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  // Fetch metadata once
  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      try {
        const res = await api.get('/judgments/meta');
        const data = unwrap(res);
        if (isMounted && data) {
          setMeta(data);
        }
      } catch (err) {
        console.warn('Failed to load judgment metadata:', err.message);
      }
    }
    loadMeta();
    return () => {
      isMounted = false;
    };
  }, []);

  // Update query params helper
  const updateQuery = useCallback(
    (updates) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([key, val]) => {
        if (val === undefined || val === null || val === '') {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      });
      // Reset to page 1 on filter changes unless changing page directly
      if (!('page' in updates)) {
        next.set('page', '1');
      }
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  // Fetch judgments list
  const fetchJudgments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        pageSize,
        ...(q && { q }),
        ...(state && { state }),
        ...(outcome && { outcome }),
        ...(judgeId && { judgeId }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(dateField && { dateField }),
        ...(sortBy && { sortBy }),
        ...(sortOrder && { sortOrder }),
      };

      const res = await api.get('/judgments', { params });
      const data = unwrap(res, 'Failed to fetch judgments');

      setItems(data.items || []);
      setPagination(data.pagination || { total: 0, totalPages: 1, page: 1, pageSize: 10 });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load judgments');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    q,
    state,
    outcome,
    judgeId,
    startDate,
    endDate,
    dateField,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    fetchJudgments();
  }, [fetchJudgments]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    updateQuery({ q: searchInput.trim() });
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams({ page: '1', pageSize: '10' }));
  };

  const hasActiveFilters = Boolean(
    q ||
    state ||
    outcome ||
    judgeId ||
    startDate ||
    endDate ||
    sortBy !== 'reservedAt' ||
    sortOrder !== 'desc'
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-brass-100 border border-brass-300 flex items-center justify-center text-brass-700">
              <Scale className="w-5 h-5" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-navy-950 tracking-tight">
              Judgments & Final Decrees
            </h1>
          </div>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Repository of reserved matters, delivered decrees, and public operative rulings across
            the registry.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchJudgments}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-navy-700 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload Registry</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="registry-card rounded-lg p-5 legal-border bg-white space-y-4">
        {/* Search Input Row */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Case Number (e.g. CC/2026/00110) or Case Title..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brass-500 focus:border-brass-500 bg-gray-50/50"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-navy-900 text-white rounded-md text-xs font-semibold hover:bg-navy-800 transition-colors shadow-2xs inline-flex items-center justify-center space-x-1.5"
          >
            <Search className="w-3.5 h-3.5 text-brass-400" />
            <span>Search Judgments</span>
          </button>
        </form>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1 text-xs">
          {/* State Filter */}
          <div>
            <label
              htmlFor="filter-state"
              className="block text-[11px] font-semibold text-gray-600 mb-1"
            >
              Judgment State
            </label>
            <select
              id="filter-state"
              value={state}
              onChange={(e) => updateQuery({ state: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-brass-500 bg-white"
            >
              <option value="">All States (Reserved & Delivered)</option>
              <option value="RESERVED">RESERVED (Pending Pronouncement)</option>
              <option value="DELIVERED">DELIVERED (Closed Cases)</option>
            </select>
          </div>

          {/* Outcome Filter */}
          <div>
            <label
              htmlFor="filter-outcome"
              className="block text-[11px] font-semibold text-gray-600 mb-1"
            >
              Operative Outcome
            </label>
            <select
              id="filter-outcome"
              value={outcome}
              onChange={(e) => updateQuery({ outcome: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-brass-500 bg-white"
            >
              <option value="">All Outcomes</option>
              {meta.outcomes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Judge Filter */}
          <div>
            <label
              htmlFor="filter-judge"
              className="block text-[11px] font-semibold text-gray-600 mb-1"
            >
              Presiding / Authoring Judge
            </label>
            <select
              id="filter-judge"
              value={judgeId}
              onChange={(e) => updateQuery({ judgeId: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-brass-500 bg-white"
            >
              <option value="">All Judges</option>
              {meta.judges.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Start */}
          <div>
            <label
              htmlFor="filter-start-date"
              className="block text-[11px] font-semibold text-gray-600 mb-1"
            >
              From Date (IST)
            </label>
            <input
              id="filter-start-date"
              type="date"
              value={startDate}
              onChange={(e) => updateQuery({ startDate: e.target.value })}
              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-brass-500 bg-white"
            />
          </div>

          {/* Date Range End */}
          <div>
            <label
              htmlFor="filter-end-date"
              className="block text-[11px] font-semibold text-gray-600 mb-1"
            >
              To Date (IST)
            </label>
            <input
              id="filter-end-date"
              type="date"
              value={endDate}
              onChange={(e) => updateQuery({ endDate: e.target.value })}
              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-brass-500 bg-white"
            />
          </div>
        </div>

        {/* Clear Filters row */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-500">
            <span>Filtering active results across registry</span>
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-navy-800 hover:text-navy-950 underline inline-flex items-center space-x-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset All Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Error View */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-sm">Failed to Load Judgments</div>
            <div>{error}</div>
            <button
              onClick={fetchJudgments}
              className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded font-semibold transition-colors"
            >
              Retry Query
            </button>
          </div>
        </div>
      )}

      {/* Main Table View */}
      <div className="registry-card rounded-lg overflow-hidden legal-border bg-white shadow-xs">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-brass-600" />
            <p className="text-sm font-medium">Querying judgments repository...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center mx-auto text-gray-400">
              <Scale className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-lg font-bold text-navy-900">No Judgments Found</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              {hasActiveFilters
                ? 'No judgments match the selected filters and search parameters. Try adjusting or resetting your criteria.'
                : 'No judgments have been reserved or delivered in the current registry clearance.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="mt-2 px-3 py-1.5 text-xs font-semibold text-navy-900 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-gray-50 uppercase text-gray-500 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Case Docket</th>
                  <th className="py-3 px-4 text-center">Judgment State</th>
                  <th className="py-3 px-4 text-center">Outcome</th>
                  <th className="py-3 px-4">Presiding Judge</th>
                  <th className="py-3 px-4">Key Dates (IST)</th>
                  <th className="py-3 px-4">Decree Summary Preview</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const isDelivered = item.state === 'DELIVERED';
                  const isReserved = item.state === 'RESERVED';

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Case Docket */}
                      <td className="py-3 px-4">
                        <Link
                          to={`/cases/${item.case.id}?tab=judgment`}
                          className="font-mono text-navy-900 font-bold hover:text-brass-700 transition-colors block"
                        >
                          {item.case.caseNumber}
                        </Link>
                        <div className="font-serif text-gray-700 text-xs font-medium max-w-xs truncate">
                          {item.case.title}
                        </div>
                      </td>

                      {/* State Stamp Badge */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={`font-mono uppercase text-[10px] font-bold px-2.5 py-0.5 rounded border ${
                            isDelivered
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          {item.state}
                        </span>
                      </td>

                      {/* Outcome Badge */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.outcome ? (
                          <span className="font-mono uppercase text-[11px] font-bold px-2 py-0.5 rounded bg-navy-900 text-brass-300 border border-navy-800 shadow-2xs">
                            {item.outcome}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">
                            Pending Pronouncement
                          </span>
                        )}
                      </td>

                      {/* Presiding Judge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-medium text-navy-950 font-sans">
                          {item.judgeName}
                        </span>
                      </td>

                      {/* Relevant Dates */}
                      <td className="py-3 px-4 whitespace-nowrap text-gray-600">
                        {isDelivered && item.judgmentDate ? (
                          <div>
                            <span className="text-[10px] text-gray-400 uppercase block font-semibold">
                              Pronounced
                            </span>
                            <span className="font-mono text-navy-900">
                              {new Date(item.judgmentDate).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        ) : item.reservedAt ? (
                          <div>
                            <span className="text-[10px] text-gray-400 uppercase block font-semibold">
                              Reserved
                            </span>
                            <span className="font-mono text-amber-800">
                              {new Date(item.reservedAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Summary Preview */}
                      <td className="py-3 px-4 max-w-sm text-gray-600 font-serif leading-relaxed">
                        {item.summaryPreview ? (
                          item.summaryPreview
                        ) : (
                          <span className="text-gray-400 italic font-sans text-xs">
                            Matter reserved; final operative decree summary will appear upon formal
                            pronouncement.
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Link
                          to={`/cases/${item.case.id}?tab=judgment`}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-navy-50 text-navy-900 hover:bg-navy-100 border border-navy-200 text-xs font-semibold transition-colors"
                        >
                          <span>View Decree</span>
                          <ExternalLink className="w-3 h-3 text-brass-600" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && items.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50/70 text-xs text-gray-600">
            <div>
              Showing{' '}
              <span className="font-semibold text-navy-950 font-mono">
                {(page - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-navy-950 font-mono">
                {Math.min(page * pageSize, pagination.total)}
              </span>{' '}
              of <span className="font-semibold text-navy-950 font-mono">{pagination.total}</span>{' '}
              registered judgments
            </div>

            <div className="flex items-center space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => updateQuery({ page: page - 1 })}
                className="px-2.5 py-1 border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center space-x-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="px-2 font-mono font-semibold text-navy-900">
                {page} / {pagination.totalPages || 1}
              </span>

              <button
                disabled={page >= pagination.totalPages}
                onClick={() => updateQuery({ page: page + 1 })}
                className="px-2.5 py-1 border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center space-x-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
