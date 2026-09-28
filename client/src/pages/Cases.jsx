import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import RegisterCaseModal from '../components/cases/RegisterCaseModal';
import {
  Search,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  X,
  RefreshCw,
  AlertCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function Cases() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state synchronization
  const qParam = searchParams.get('q') || '';
  const statusParam = searchParams.get('status') || '';
  const caseTypeParam = searchParams.get('caseType') || '';
  const priorityParam = searchParams.get('priority') || '';
  const judgeIdParam = searchParams.get('judgeId') || '';
  const backlogParam = searchParams.get('backlog') === 'true';
  const fromParam = searchParams.get('from') || '';
  const toParam = searchParams.get('to') || '';
  const sortByParam = searchParams.get('sortBy') || 'filingDate';
  const sortOrderParam = searchParams.get('sortOrder') || 'desc';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const pageSizeParam = parseInt(searchParams.get('pageSize') || '10', 10);

  // Local state for debounced search input
  const [searchInput, setSearchInput] = useState(qParam);

  // Data states
  const [cases, setCases] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Metadata for filter dropdowns
  const [metadata, setMetadata] = useState({
    caseTypes: [],
    statuses: [],
    judges: [],
  });

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // Debounce search input to URL query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== qParam) {
        updateParams({ q: searchInput, page: 1 });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Keep search input in sync if URL changes externally
  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  // Helper to update URL params
  const updateParams = useCallback(
    (newParams) => {
      const current = Object.fromEntries(searchParams.entries());
      const updated = { ...current, ...newParams };

      // Clean empty string or default values
      Object.keys(updated).forEach((key) => {
        if (
          updated[key] === '' ||
          updated[key] === null ||
          updated[key] === undefined ||
          (key === 'page' && updated[key] === 1) ||
          (key === 'pageSize' && updated[key] === 10) ||
          (key === 'sortBy' && updated[key] === 'filingDate') ||
          (key === 'sortOrder' && updated[key] === 'desc') ||
          (key === 'backlog' && updated[key] === false)
        ) {
          delete updated[key];
        }
      });

      setSearchParams(updated, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Load metadata for filters
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await api.get('/cases/meta');
        const meta =
          res?.data?.caseTypes || res?.data?.statuses ? res.data : res?.data?.data || res?.data;
        if (meta && typeof meta === 'object') {
          setMetadata(meta);
        }
      } catch (err) {
        console.warn('Failed to load case metadata:', err.message);
      }
    };
    fetchMeta();
  }, []);

  // Fetch cases from API
  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: pageParam,
        pageSize: pageSizeParam,
        sortBy: sortByParam,
        sortOrder: sortOrderParam,
      };

      if (qParam) params.q = qParam;
      if (statusParam) params.status = statusParam;
      if (caseTypeParam) params.caseType = caseTypeParam;
      if (priorityParam) params.priority = priorityParam;
      if (judgeIdParam) params.judgeId = judgeIdParam;
      if (backlogParam) params.backlog = true;
      if (fromParam) params.from = fromParam;
      if (toParam) params.to = toParam;

      const res = await api.get('/cases', { params });
      const payload = res?.data?.items
        ? res.data
        : res?.data?.data?.items
          ? res.data.data
          : res?.data || {};

      const isSuccess = res?.success ?? res?.data?.success ?? Array.isArray(payload?.items);

      if (isSuccess && Array.isArray(payload.items)) {
        setCases(payload.items);
        setTotal(payload.total ?? payload.items.length);
        setTotalPages(payload.totalPages ?? 1);
      } else {
        throw new Error(
          res?.message || res?.data?.message || 'Failed to parse case records from server response'
        );
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load case records');
    } finally {
      setLoading(false);
    }
  }, [
    pageParam,
    pageSizeParam,
    sortByParam,
    sortOrderParam,
    qParam,
    statusParam,
    caseTypeParam,
    priorityParam,
    judgeIdParam,
    backlogParam,
    fromParam,
    toParam,
  ]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Sorting helper
  const handleSort = (field) => {
    if (sortByParam === field) {
      updateParams({
        sortOrder: sortOrderParam === 'asc' ? 'desc' : 'asc',
        page: 1,
      });
    } else {
      updateParams({
        sortBy: field,
        sortOrder: 'asc',
        page: 1,
      });
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams({}, { replace: true });
  };

  const hasActiveFilters = Boolean(
    qParam ||
    statusParam ||
    caseTypeParam ||
    priorityParam ||
    judgeIdParam ||
    backlogParam ||
    fromParam ||
    toParam
  );

  // Badge styling for status stamps
  const getStatusBadge = (status) => {
    let colorClasses = 'bg-gray-50 text-gray-800 border-gray-300';

    if (status === 'REGISTERED' || status === 'ADVOCATE_ASSIGNED') {
      colorClasses = 'bg-blue-50 text-blue-800 border-blue-300';
    } else if (
      status === 'HEARING_SCHEDULED' ||
      status === 'UNDER_TRIAL' ||
      status === 'JUDGMENT_RESERVED'
    ) {
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-300';
    } else if (status === 'CLOSED') {
      colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-300';
    }

    return (
      <span
        className={`font-mono uppercase tracking-wider text-[11px] font-bold px-2 py-0.5 rounded-xs border ${colorClasses}`}
      >
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  const renderSortIcon = (field) => {
    if (sortByParam !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-navy-900" />;
    }
    return sortOrderParam === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-brass-600" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-brass-600" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
            Master Case Docket
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Registry dockets, judicial bench allocations, and case pendency tracking.
          </p>
        </div>

        {can('case.create') && (
          <button
            type="button"
            onClick={() => setIsRegisterModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-sm font-semibold hover:bg-navy-800 transition-colors shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 text-brass-400" />
            <span>Register Case</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="registry-card rounded-lg p-4 space-y-4">
        {/* Search Row */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by case number (e.g. CC/2026/...), title, petitioner, respondent..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:ring-brass-500 focus:border-brass-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 text-xs font-semibold text-navy-950 cursor-pointer select-none bg-gray-50 border border-gray-200 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={backlogParam}
                onChange={(e) => updateParams({ backlog: e.target.checked, page: 1 })}
                className="rounded text-navy-900 focus:ring-brass-500 h-4 w-4"
              />
              <span className="flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Backlog Cases Only</span>
              </span>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center space-x-1 text-xs text-gray-600 hover:text-red-700 font-medium px-2 py-2"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-2 border-t border-gray-100 text-xs">
          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
              Status
            </label>
            <select
              value={statusParam}
              onChange={(e) => updateParams({ status: e.target.value, page: 1 })}
              className="w-full border border-gray-300 rounded px-2 py-1.5 bg-white text-xs text-gray-800"
            >
              <option value="">All Statuses</option>
              {metadata.statuses?.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Case Type Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
              Case Type
            </label>
            <select
              value={caseTypeParam}
              onChange={(e) => updateParams({ caseType: e.target.value, page: 1 })}
              className="w-full border border-gray-300 rounded px-2 py-1.5 bg-white text-xs text-gray-800"
            >
              <option value="">All Types</option>
              {metadata.caseTypes?.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
              Priority
            </label>
            <select
              value={priorityParam}
              onChange={(e) => updateParams({ priority: e.target.value, page: 1 })}
              className="w-full border border-gray-300 rounded px-2 py-1.5 bg-white text-xs text-gray-800"
            >
              <option value="">All Priorities</option>
              <option value="NORMAL">NORMAL</option>
              <option value="URGENT">URGENT</option>
            </select>
          </div>

          {/* Judge Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
              Judge
            </label>
            <select
              value={judgeIdParam}
              onChange={(e) => updateParams({ judgeId: e.target.value, page: 1 })}
              className="w-full border border-gray-300 rounded px-2 py-1.5 bg-white text-xs text-gray-800 truncate"
            >
              <option value="">All Judges</option>
              {metadata.judges?.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
              Filing From
            </label>
            <input
              type="date"
              value={fromParam}
              onChange={(e) => updateParams({ from: e.target.value, page: 1 })}
              className="w-full border border-gray-300 rounded px-2 py-1.5 bg-white text-xs text-gray-800"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
              Filing To
            </label>
            <input
              type="date"
              value={toParam}
              onChange={(e) => updateParams({ to: e.target.value, page: 1 })}
              className="w-full border border-gray-300 rounded px-2 py-1.5 bg-white text-xs text-gray-800"
            />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="registry-card rounded-lg overflow-hidden legal-border shadow-xs">
        {/* Error State */}
        {error ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
            <p className="text-sm font-semibold text-navy-950">{error}</p>
            <button
              type="button"
              onClick={fetchCases}
              className="inline-flex items-center space-x-2 px-3 py-1.5 bg-navy-900 text-white rounded text-xs hover:bg-navy-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Query</span>
            </button>
          </div>
        ) : loading ? (
          /* Loading Skeleton */
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded w-full" />
              ))}
            </div>
          </div>
        ) : cases.length === 0 ? (
          /* Empty State */
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-lg font-bold text-navy-900">
              No cases match your filters
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search criteria, clearing date ranges, or resetting filters.'
                : 'No cases are currently registered or accessible under your judicial clearance.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gray-100 text-navy-900 rounded-md text-xs font-semibold hover:bg-gray-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear All Filters</span>
              </button>
            )}
          </div>
        ) : (
          /* Data Table */
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left divide-y divide-gray-200">
              <thead className="bg-gray-50 uppercase text-gray-500 font-bold tracking-wider select-none">
                <tr>
                  <th
                    className="py-3 px-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                    onClick={() => handleSort('caseNumber')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Case Number</span>
                      {renderSortIcon('caseNumber')}
                    </div>
                  </th>
                  <th className="py-3 px-3.5">Title & Parties</th>
                  <th className="py-3 px-3">Type</th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:bg-gray-100 transition-colors group"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Status</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:bg-gray-100 transition-colors group"
                    onClick={() => handleSort('priority')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Priority</span>
                      {renderSortIcon('priority')}
                    </div>
                  </th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:bg-gray-100 transition-colors group"
                    onClick={() => handleSort('filingDate')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Filing Date</span>
                      {renderSortIcon('filingDate')}
                    </div>
                  </th>
                  <th className="py-3 px-3">Next Hearing</th>
                  <th className="py-3 px-3">Presiding Judge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/cases/${c.id}`)}
                    className="hover:bg-navy-50/40 cursor-pointer transition-colors"
                  >
                    {/* Case Number */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="font-mono font-bold text-navy-950 text-xs">
                        {c.caseNumber}
                      </div>
                      {c.isBacklog && (
                        <div className="mt-0.5">
                          <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] px-1.5 py-0.2 rounded font-semibold inline-flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            <span>Overdue ({c.ageDays}d)</span>
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Title & Parties */}
                    <td className="py-3 px-3.5 max-w-xs sm:max-w-md">
                      <div className="font-semibold text-navy-950 line-clamp-1">{c.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                        <span className="font-medium text-gray-700">{c.petitioner}</span>
                        <span className="mx-1 text-gray-400">vs</span>
                        <span className="font-medium text-gray-700">{c.respondent}</span>
                      </div>
                    </td>

                    {/* Case Type */}
                    <td className="py-3 px-3 whitespace-nowrap text-gray-700 font-medium">
                      {c.caseType}
                    </td>

                    {/* Status Stamp */}
                    <td className="py-3 px-3 whitespace-nowrap">{getStatusBadge(c.status)}</td>

                    {/* Priority */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {c.priority === 'URGENT' ? (
                        <span className="bg-rose-100 text-rose-800 border border-rose-300 font-bold uppercase text-[10px] px-1.5 py-0.5 rounded">
                          URGENT
                        </span>
                      ) : (
                        <span className="text-gray-500 text-[11px]">Normal</span>
                      )}
                    </td>

                    {/* Filing Date & Age */}
                    <td className="py-3 px-3 whitespace-nowrap text-gray-700">
                      <div>
                        {new Date(c.filingDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        {c.ageDays} days ago
                      </div>
                    </td>

                    {/* Next Hearing */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {c.nextHearingDate ? (
                        <div className="text-navy-950 font-medium">
                          {new Date(c.nextHearingDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                          <span className="text-[10px] text-gray-400 ml-1">
                            {new Date(c.nextHearingDate).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic text-[11px]">—</span>
                      )}
                    </td>

                    {/* Presiding Judge */}
                    <td className="py-3 px-3 whitespace-nowrap text-gray-700">
                      {c.judgeName ? (
                        <span className="font-medium text-navy-900">{c.judgeName}</span>
                      ) : (
                        <span className="text-gray-400 italic text-[11px]">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination & Footer */}
        {!loading && !error && cases.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
            <div className="flex items-center space-x-2">
              <span>Showing</span>
              <span className="font-semibold text-navy-900">
                {(pageParam - 1) * pageSizeParam + 1}
              </span>
              <span>to</span>
              <span className="font-semibold text-navy-900">
                {Math.min(pageParam * pageSizeParam, total)}
              </span>
              <span>of</span>
              <span className="font-semibold text-navy-900">{total}</span>
              <span>dockets</span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Page Size Selector */}
              <div className="flex items-center space-x-1.5">
                <span className="text-gray-500">Per page:</span>
                <select
                  value={pageSizeParam}
                  onChange={(e) =>
                    updateParams({ pageSize: parseInt(e.target.value, 10), page: 1 })
                  }
                  className="border border-gray-300 rounded px-1.5 py-1 bg-white text-xs text-gray-800"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              {/* Page Buttons */}
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  disabled={pageParam <= 1}
                  onClick={() => updateParams({ page: pageParam - 1 })}
                  className="p-1.5 border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-medium">
                  {pageParam} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={pageParam >= totalPages}
                  onClick={() => updateParams({ page: pageParam + 1 })}
                  className="p-1.5 border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Register Case Modal */}
      {can('case.create') && (
        <RegisterCaseModal
          isOpen={isRegisterModalOpen}
          onClose={() => setIsRegisterModalOpen(false)}
          onCaseRegistered={() => {
            fetchCases();
          }}
        />
      )}
    </div>
  );
}
