import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ScheduleHearingModal from '../components/hearings/ScheduleHearingModal';
import RescheduleHearingModal from '../components/hearings/RescheduleHearingModal';
import CancelHearingModal from '../components/hearings/CancelHearingModal';
import CompleteHearingModal from '../components/hearings/CompleteHearingModal';
import AdjournHearingModal from '../components/hearings/AdjournHearingModal';
import {
  Calendar,
  MapPin,
  Search,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';

export default function Hearings() {
  const { user, can } = useAuth();

  // View state: 'cause-list' or 'registry'
  const [activeTab, setActiveTab] = useState('cause-list');

  // Cause List state
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [causeListData, setCauseListData] = useState(null);
  const [loadingCauseList, setLoadingCauseList] = useState(true);

  // Registry List state
  const [hearings, setHearings] = useState([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);
  const [registryPage, setRegistryPage] = useState(1);
  const [registryTotalPages, setRegistryTotalPages] = useState(1);
  const [registryTotal, setRegistryTotal] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [courtroomFilter, setCourtroomFilter] = useState('');
  const [courtroomsList, setCourtroomsList] = useState([]);

  // Modals state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [reschedulingHearing, setReschedulingHearing] = useState(null);
  const [cancellingHearing, setCancellingHearing] = useState(null);
  const [completingHearing, setCompletingHearing] = useState(null);
  const [adjourningHearing, setAdjourningHearing] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // General error
  const [error, setError] = useState(null);

  // Fetch cause list for selectedDate
  const fetchCauseList = useCallback(async (dateStr) => {
    setLoadingCauseList(true);
    setError(null);
    try {
      const res = await api.get(`/hearings/cause-list?date=${dateStr}`);
      const causeList = res?.data?.courtrooms ? res.data : res?.data?.data || res?.data;
      const isSuccess = res?.success ?? res?.data?.success ?? !!causeList;

      if (isSuccess && causeList) {
        setCauseListData(causeList);
      } else {
        throw new Error(res?.message || res?.data?.message || 'Failed to load daily cause list');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load daily cause list');
    } finally {
      setLoadingCauseList(false);
    }
  }, []);

  // Fetch registry hearings list
  const fetchRegistryHearings = useCallback(async () => {
    setLoadingRegistry(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: registryPage,
        pageSize: 10,
      });
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (statusFilter) params.append('status', statusFilter);
      if (courtroomFilter) params.append('courtroomId', courtroomFilter);

      const res = await api.get(`/hearings?${params.toString()}`);
      const payload = res?.data?.items
        ? res.data
        : res?.data?.data?.items
          ? res.data.data
          : res?.data || {};

      const isSuccess = res?.success ?? res?.data?.success ?? Array.isArray(payload?.items);

      if (isSuccess && Array.isArray(payload.items)) {
        setHearings(payload.items);
        setRegistryTotalPages(payload.totalPages ?? 1);
        setRegistryTotal(payload.total ?? payload.items.length);
      } else {
        throw new Error(res?.message || res?.data?.message || 'Failed to load hearings registry');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load hearings registry');
    } finally {
      setLoadingRegistry(false);
    }
  }, [registryPage, searchQuery, statusFilter, courtroomFilter]);

  // Fetch metadata courtrooms
  const fetchMeta = useCallback(async () => {
    try {
      const res = await api.get('/hearings/meta');
      const rooms = res?.data?.courtrooms || res?.data?.data?.courtrooms || [];
      if (Array.isArray(rooms) && rooms.length > 0) {
        setCourtroomsList(rooms);
      }
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    if (activeTab === 'cause-list') {
      fetchCauseList(selectedDate);
    } else {
      fetchRegistryHearings();
    }
  }, [activeTab, selectedDate, fetchCauseList, fetchRegistryHearings]);

  // Date step helper (prev/next day)
  const stepDate = (days) => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + days);
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleRefresh = () => {
    if (activeTab === 'cause-list') {
      fetchCauseList(selectedDate);
    } else {
      fetchRegistryHearings();
    }
  };

  const formatISTTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatISTDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(y, parseInt(m, 10) - 1, d);
    return dt.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SCHEDULED':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'ADJOURNED':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'CANCELLED':
        return 'bg-red-50 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Permission helpers for hearing action buttons
  const canSchedule = can('hearing.schedule');

  const canActionHearing = (hearing) => {
    if (!hearing || hearing.status !== 'SCHEDULED') return false;
    if (user?.role === 'ADMIN' || user?.role === 'REGISTRAR') return true;
    if (user?.role === 'JUDGE' && (hearing.judgeId === user.id || hearing.judge?.id === user.id)) {
      return true;
    }
    return false;
  };

  const canCompleteHearing = (hearing) => {
    if (!hearing || hearing.status !== 'SCHEDULED') return false;
    // Cannot complete future hearing
    const isPast = new Date(hearing.scheduledAt) <= new Date();
    if (!isPast) return false;
    if (user?.role === 'ADMIN') return true;
    if (user?.role === 'JUDGE' && (hearing.judgeId === user.id || hearing.judge?.id === user.id)) {
      return true;
    }
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
            Hearing Calendar & Cause Lists
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Daily court schedules, courtroom roster management, bench allocations, and proceedings
            tracking.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            className="p-2 border border-gray-300 rounded-md text-navy-800 hover:bg-gray-50 transition-colors shadow-sm"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>

          {canSchedule && (
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-sm font-semibold hover:bg-navy-800 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 text-brass-400" />
              <span>Schedule Hearing</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{actionNotice}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('cause-list')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'cause-list'
                ? 'border-brass-600 text-navy-950 bg-brass-50/20'
                : 'border-transparent text-gray-500 hover:text-navy-900 hover:border-gray-300'
            }`}
          >
            <Calendar className="w-4 h-4 text-brass-600" />
            <span>Daily Cause List</span>
          </button>

          <button
            onClick={() => setActiveTab('registry')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'registry'
                ? 'border-brass-600 text-navy-950 bg-brass-50/20'
                : 'border-transparent text-gray-500 hover:text-navy-900 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4 text-navy-700" />
            <span>Master Hearing Registry</span>
          </button>
        </div>

        {activeTab === 'cause-list' && (
          <div className="flex items-center space-x-2 pb-2">
            <button
              onClick={() => stepDate(-1)}
              className="p-1.5 border border-gray-200 rounded hover:bg-gray-100 text-gray-600 transition-colors"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                setSelectedDate(`${yyyy}-${mm}-${dd}`);
              }}
              className="px-2.5 py-1 text-xs border border-gray-200 rounded font-semibold hover:bg-gray-50 text-navy-900"
            >
              Today
            </button>

            <button
              onClick={() => stepDate(1)}
              className="p-1.5 border border-gray-200 rounded hover:bg-gray-100 text-gray-600 transition-colors"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2.5 py-1 focus:ring-1 focus:ring-brass-500 font-mono"
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. CAUSE LIST VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'cause-list' && (
        <div className="space-y-6">
          {/* Cause list calendar header */}
          <div className="bg-navy-900 text-white rounded-lg p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-brass-300 font-bold">
                Official Judicial Cause List
              </span>
              <h2 className="font-serif text-2xl font-bold mt-0.5">
                {formatISTDate(selectedDate)}
              </h2>
              <p className="text-xs text-gray-300 mt-1">
                District & Sessions Court, Central Judicial Complex • Operational Timezone:
                Asia/Kolkata (IST)
              </p>
            </div>

            <div className="flex items-center space-x-6 text-center">
              <div>
                <span className="block text-2xl font-serif font-bold text-brass-300">
                  {causeListData?.totalHearings ?? 0}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-gray-300">
                  Total Hearings
                </span>
              </div>
              <div className="w-px h-8 bg-navy-700" />
              <div>
                <span className="block text-2xl font-serif font-bold text-white">
                  {causeListData?.courtroomsCount ?? 0}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-gray-300">
                  Active Benches
                </span>
              </div>
            </div>
          </div>

          {/* Courtroom Cause Lists */}
          {loadingCauseList ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin text-brass-600 mx-auto mb-2" />
              <span>Compiling daily cause list roster...</span>
            </div>
          ) : causeListData?.courtrooms?.length === 0 ? (
            <div className="registry-card rounded-lg p-12 text-center legal-border bg-white space-y-3">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto" />
              <h3 className="font-serif text-lg font-bold text-navy-900">
                No Hearings Scheduled for this Date
              </h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                No cause list proceedings are scheduled on {formatISTDate(selectedDate)} within your
                judicial clearance scope.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {causeListData?.courtrooms?.map((crGroup) => (
                <div
                  key={crGroup.courtroom.id}
                  className="registry-card rounded-lg overflow-hidden legal-border bg-white shadow-sm"
                >
                  {/* Courtroom Banner */}
                  <div className="bg-gray-50 border-b border-gray-200 px-6 py-3.5 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-brass-700" />
                      <h3 className="font-serif text-base font-bold text-navy-950">
                        {crGroup.courtroom.name}
                      </h3>
                      <span className="text-xs text-gray-500">({crGroup.courtroom.location})</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-navy-100 text-navy-800">
                      {crGroup.hearings.length}{' '}
                      {crGroup.hearings.length === 1 ? 'matter' : 'matters'}
                    </span>
                  </div>

                  {/* Hearings Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs text-left">
                      <thead className="bg-gray-50/70 uppercase text-gray-500 font-semibold border-b border-gray-200 text-[11px]">
                        <tr>
                          <th className="py-2.5 px-4 w-12 text-center">Item</th>
                          <th className="py-2.5 px-4">Time (IST)</th>
                          <th className="py-2.5 px-4">Case Docket</th>
                          <th className="py-2.5 px-4">Presiding Judge</th>
                          <th className="py-2.5 px-4">Legal Counsel</th>
                          <th className="py-2.5 px-4">Purpose / Remarks</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {crGroup.hearings.map((h) => {
                          const isActionable = canActionHearing(h);
                          const isCompletable = canCompleteHearing(h);

                          return (
                            <tr key={h.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3 px-4 font-mono font-bold text-center text-navy-900">
                                {h.serialNumber}
                              </td>

                              <td className="py-3 px-4 whitespace-nowrap">
                                <span className="font-mono font-bold text-navy-950 block">
                                  {formatISTTime(h.scheduledAt)}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  to {formatISTTime(h.endsAt)} ({h.durationMins || 30}m)
                                </span>
                              </td>

                              <td className="py-3 px-4 max-w-xs">
                                <Link
                                  to={`/cases/${h.caseId}`}
                                  className="font-mono font-bold text-brass-700 hover:text-brass-900 block hover:underline"
                                >
                                  {h.caseNumber}
                                </Link>
                                <span className="text-gray-900 font-medium block truncate">
                                  {h.caseTitle}
                                </span>
                                {h.priority === 'URGENT' && (
                                  <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-red-100 text-red-800">
                                    Urgent
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-4 font-medium text-navy-900 whitespace-nowrap">
                                {h.judge?.name || 'Assigned Bench'}
                              </td>

                              <td className="py-3 px-4 max-w-xs text-[11px] space-y-1">
                                {h.petitionerAdvocates?.length > 0 && (
                                  <div>
                                    <span className="text-gray-400 font-semibold uppercase text-[9px] block">
                                      Petitioner
                                    </span>
                                    <span className="text-gray-800">
                                      {h.petitionerAdvocates.join(', ')}
                                    </span>
                                  </div>
                                )}
                                {h.respondentAdvocates?.length > 0 && (
                                  <div>
                                    <span className="text-gray-400 font-semibold uppercase text-[9px] block">
                                      Respondent
                                    </span>
                                    <span className="text-gray-800">
                                      {h.respondentAdvocates.join(', ')}
                                    </span>
                                  </div>
                                )}
                              </td>

                              <td className="py-3 px-4 max-w-xs">
                                <span className="font-semibold text-navy-950 block">
                                  {h.purpose}
                                </span>
                                {h.outcomeNotes && (
                                  <span className="text-gray-500 italic block mt-0.5 truncate text-[11px]">
                                    Order: {h.outcomeNotes}
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${getStatusBadge(
                                    h.status
                                  )}`}
                                >
                                  {h.status}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                {isActionable ? (
                                  <div className="flex items-center justify-end space-x-1">
                                    {isCompletable && (
                                      <button
                                        onClick={() => setCompletingHearing(h)}
                                        className="px-2 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded text-[11px] font-semibold transition-colors"
                                        title="Conclude hearing proceedings"
                                      >
                                        Complete
                                      </button>
                                    )}

                                    <button
                                      onClick={() => setAdjourningHearing(h)}
                                      className="px-2 py-1 bg-navy-50 text-navy-800 hover:bg-navy-100 border border-navy-200 rounded text-[11px] font-semibold transition-colors"
                                      title="Adjourn matter"
                                    >
                                      Adjourn
                                    </button>

                                    <button
                                      onClick={() => setReschedulingHearing(h)}
                                      className="px-2 py-1 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded text-[11px] font-semibold transition-colors"
                                      title="Reschedule to new date/time"
                                    >
                                      Reschedule
                                    </button>

                                    <button
                                      onClick={() => setCancellingHearing(h)}
                                      className="px-2 py-1 bg-red-50 text-red-800 hover:bg-red-100 border border-red-200 rounded text-[11px] font-semibold transition-colors"
                                      title="Cancel hearing"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs italic">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MASTER HEARING REGISTRY VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'registry' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="registry-card rounded-lg p-4 legal-border bg-white shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="w-full md:w-80 relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search case docket, title, judge, courtroom..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setRegistryPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-brass-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setRegistryPage(1);
                }}
                className="text-xs border border-gray-300 rounded-md py-1.5 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="ADJOURNED">Adjourned</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={courtroomFilter}
                onChange={(e) => {
                  setCourtroomFilter(e.target.value);
                  setRegistryPage(1);
                }}
                className="text-xs border border-gray-300 rounded-md py-1.5 px-3 focus:ring-2 focus:ring-brass-500 focus:outline-none"
              >
                <option value="">All Courtrooms</option>
                {courtroomsList.map((cr) => (
                  <option key={cr.id} value={cr.id}>
                    {cr.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Registry Table */}
          <div className="registry-card rounded-lg overflow-hidden legal-border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs text-left">
                <thead className="bg-gray-50 uppercase text-gray-500 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Scheduled Date & Time</th>
                    <th className="py-3 px-4">Case Docket</th>
                    <th className="py-3 px-4">Courtroom</th>
                    <th className="py-3 px-4">Presiding Judge</th>
                    <th className="py-3 px-4">Purpose</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingRegistry ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-brass-600" />
                        <span>Loading hearing registry...</span>
                      </td>
                    </tr>
                  ) : hearings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500 text-sm">
                        No hearings found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    hearings.map((h) => {
                      const isActionable = canActionHearing(h);
                      const isCompletable = canCompleteHearing(h);

                      return (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 whitespace-nowrap font-mono">
                            <span className="font-bold text-navy-950 block">
                              {new Date(h.scheduledAt).toLocaleDateString('en-IN', {
                                dateStyle: 'medium',
                              })}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              {formatISTTime(h.scheduledAt)} ({h.durationMinutes || 30}m)
                            </span>
                          </td>

                          <td className="py-3 px-4 max-w-xs">
                            <Link
                              to={`/cases/${h.case?.id || h.caseId}`}
                              className="font-mono font-bold text-brass-700 hover:text-brass-900 hover:underline block"
                            >
                              {h.case?.caseNumber || 'Case Docket'}
                            </Link>
                            <span className="text-gray-800 truncate block">{h.case?.title}</span>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-gray-700">
                            {h.courtroom?.name}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-navy-950 font-medium">
                            {h.judge?.name || 'Presiding Bench'}
                          </td>

                          <td className="py-3 px-4 max-w-xs truncate text-gray-800">{h.purpose}</td>

                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${getStatusBadge(
                                h.status
                              )}`}
                            >
                              {h.status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {isActionable ? (
                              <div className="flex items-center justify-end space-x-1">
                                {isCompletable && (
                                  <button
                                    onClick={() => setCompletingHearing(h)}
                                    className="px-2 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded text-[11px] font-semibold"
                                  >
                                    Complete
                                  </button>
                                )}
                                <button
                                  onClick={() => setAdjourningHearing(h)}
                                  className="px-2 py-1 bg-navy-50 text-navy-800 hover:bg-navy-100 border border-navy-200 rounded text-[11px] font-semibold"
                                >
                                  Adjourn
                                </button>
                                <button
                                  onClick={() => setReschedulingHearing(h)}
                                  className="px-2 py-1 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded text-[11px] font-semibold"
                                >
                                  Reschedule
                                </button>
                                <button
                                  onClick={() => setCancellingHearing(h)}
                                  className="px-2 py-1 bg-red-50 text-red-800 hover:bg-red-100 border border-red-200 rounded text-[11px] font-semibold"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs italic">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {registryTotalPages > 1 && (
              <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600 bg-gray-50/50">
                <span>
                  Showing {hearings.length} of {registryTotal} hearing entries
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    disabled={registryPage <= 1}
                    onClick={() => setRegistryPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 font-semibold"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-gray-700">
                    {registryPage} / {registryTotalPages}
                  </span>
                  <button
                    disabled={registryPage >= registryTotalPages}
                    onClick={() => setRegistryPage((p) => Math.min(registryTotalPages, p + 1))}
                    className="px-2.5 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 font-semibold"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <ScheduleHearingModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        onSuccess={({ message }) => {
          setActionNotice(message);
          handleRefresh();
        }}
      />

      {reschedulingHearing && (
        <RescheduleHearingModal
          isOpen={!!reschedulingHearing}
          onClose={() => setReschedulingHearing(null)}
          hearing={reschedulingHearing}
          onSuccess={({ message }) => {
            setActionNotice(message);
            handleRefresh();
          }}
        />
      )}

      {cancellingHearing && (
        <CancelHearingModal
          isOpen={!!cancellingHearing}
          onClose={() => setCancellingHearing(null)}
          hearing={cancellingHearing}
          onSuccess={({ message }) => {
            setActionNotice(message);
            handleRefresh();
          }}
        />
      )}

      {completingHearing && (
        <CompleteHearingModal
          isOpen={!!completingHearing}
          onClose={() => setCompletingHearing(null)}
          hearing={completingHearing}
          onSuccess={({ message }) => {
            setActionNotice(message);
            handleRefresh();
          }}
        />
      )}

      {adjourningHearing && (
        <AdjournHearingModal
          isOpen={!!adjourningHearing}
          onClose={() => setAdjourningHearing(null)}
          hearing={adjourningHearing}
          onSuccess={({ message }) => {
            setActionNotice(message);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
