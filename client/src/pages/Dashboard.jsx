import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { unwrap } from '../api/unwrap';
import { useAuth } from '../context/AuthContext';
import StatusDistributionStamp from '../components/dashboard/StatusDistributionStamp';
import BacklogWorklist from '../components/dashboard/BacklogWorklist';
import StaleCasesWorklist from '../components/dashboard/StaleCasesWorklist';
import UpcomingHearingsWidget from '../components/dashboard/UpcomingHearingsWidget';
import WorkloadMonitor from '../components/dashboard/WorkloadMonitor';
import ThresholdSettingsModal from '../components/dashboard/ThresholdSettingsModal';
import {
  Activity,
  RefreshCw,
  Sliders,
  Calendar,
  Clock,
  AlertCircle,
  Briefcase,
  Server,
  Database,
  ArrowRight,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state management for filters and pagination
  const backlogPage = parseInt(searchParams.get('backlogPage') || '1', 10);
  const backlogSort = searchParams.get('backlogSort') || 'age';
  const backlogOrder = searchParams.get('backlogOrder') || 'desc';

  const stalePage = parseInt(searchParams.get('stalePage') || '1', 10);
  const staleRule = searchParams.get('staleRule') || 'ALL';

  const upcomingPage = parseInt(searchParams.get('upcomingPage') || '1', 10);

  // Judge caseload scope: whether viewing 'my' bench or registry-wide master
  const [isJudgeMyCaseload, setIsJudgeMyCaseload] = useState(false);

  // Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Dashboard Data States
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  const [backlogData, setBacklogData] = useState(null);
  const [backlogLoading, setBacklogLoading] = useState(true);
  const [backlogError, setBacklogError] = useState(null);

  const [staleData, setStaleData] = useState(null);
  const [staleLoading, setStaleLoading] = useState(true);
  const [staleError, setStaleError] = useState(null);

  const [upcomingData, setUpcomingData] = useState(null);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState(null);

  const [workloadData, setWorkloadData] = useState(null);
  const [workloadLoading, setWorkloadLoading] = useState(true);
  const [workloadError, setWorkloadError] = useState(null);

  // Infrastructure health probe state
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // 1. Fetch Summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await api.get('/dashboard/summary');
      const data = unwrap(res, 'Failed to fetch dashboard summary');
      setSummaryData(data);
    } catch (err) {
      setSummaryError(err.message || 'Unable to retrieve summary telemetry');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // 2. Fetch Backlog
  const fetchBacklog = useCallback(async () => {
    setBacklogLoading(true);
    setBacklogError(null);
    try {
      const scope = user?.role === 'JUDGE' && isJudgeMyCaseload ? 'my' : 'all';
      const res = await api.get('/dashboard/backlog', {
        params: {
          page: backlogPage,
          pageSize: 5,
          sortBy: backlogSort,
          sortOrder: backlogOrder,
          scope,
        },
      });
      const data = unwrap(res, 'Failed to fetch backlog worklist');
      setBacklogData(data);
    } catch (err) {
      setBacklogError(err.message || 'Unable to retrieve backlog cases');
    } finally {
      setBacklogLoading(false);
    }
  }, [backlogPage, backlogSort, backlogOrder, user?.role, isJudgeMyCaseload]);

  // 3. Fetch Stale Cases
  const fetchStaleCases = useCallback(async () => {
    setStaleLoading(true);
    setStaleError(null);
    try {
      const scope = user?.role === 'JUDGE' && isJudgeMyCaseload ? 'my' : 'all';
      const res = await api.get('/dashboard/stale-cases', {
        params: {
          page: stalePage,
          pageSize: 5,
          rule: staleRule,
          scope,
        },
      });
      const data = unwrap(res, 'Failed to fetch stale cases');
      setStaleData(data);
    } catch (err) {
      setStaleError(err.message || 'Unable to retrieve stale cases');
    } finally {
      setStaleLoading(false);
    }
  }, [stalePage, staleRule, user?.role, isJudgeMyCaseload]);

  // 4. Fetch Upcoming Hearings
  const fetchUpcomingHearings = useCallback(async () => {
    setUpcomingLoading(true);
    setUpcomingError(null);
    try {
      const scope = user?.role === 'JUDGE' && isJudgeMyCaseload ? 'my' : 'all';
      const res = await api.get('/dashboard/upcoming-hearings', {
        params: {
          page: upcomingPage,
          pageSize: 5,
          scope,
        },
      });
      const data = unwrap(res, 'Failed to fetch upcoming hearings');
      setUpcomingData(data);
    } catch (err) {
      setUpcomingError(err.message || 'Unable to retrieve upcoming hearings');
    } finally {
      setUpcomingLoading(false);
    }
  }, [upcomingPage, user?.role, isJudgeMyCaseload]);

  // 5. Fetch Workload (Admins, Registrars, Judges only)
  const fetchWorkload = useCallback(async () => {
    if (user?.role === 'ADVOCATE') {
      setWorkloadLoading(false);
      return;
    }

    setWorkloadLoading(true);
    setWorkloadError(null);
    try {
      const res = await api.get('/dashboard/workload');
      const data = unwrap(res, 'Failed to fetch workload distribution');
      setWorkloadData(data);
    } catch (err) {
      setWorkloadError(err.message || 'Unable to retrieve workload figures');
    } finally {
      setWorkloadLoading(false);
    }
  }, [user?.role]);

  // 6. Fetch Health Probe
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await api.get('/health');
      setHealthData(unwrap(res));
    } catch {
      // non-blocking
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Initial and reactive load
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchBacklog();
  }, [fetchBacklog]);

  useEffect(() => {
    fetchStaleCases();
  }, [fetchStaleCases]);

  useEffect(() => {
    fetchUpcomingHearings();
  }, [fetchUpcomingHearings]);

  useEffect(() => {
    fetchWorkload();
  }, [fetchWorkload]);

  const handleRefreshAll = () => {
    fetchSummary();
    fetchBacklog();
    fetchStaleCases();
    fetchUpcomingHearings();
    fetchWorkload();
  };

  // URL query helper
  const updateUrlParam = (key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
      return next;
    });
  };

  // Active dataset for StatusDistribution depending on Judge scope
  const activeSummary =
    user?.role === 'JUDGE' && isJudgeMyCaseload && summaryData?.myCaseload
      ? summaryData.myCaseload
      : summaryData;

  const thresholds = summaryData?.thresholds || {};

  return (
    <div className="space-y-8">
      {/* Top Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-serif text-3xl font-bold text-navy-950 tracking-tight">
              Judicial Registry Dashboard
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-navy-100 text-navy-800 border border-navy-300">
              Role: {user?.role}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Real-time court telemetry, backlog monitor, stale case detection, and automated
            threshold alerts.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Settings button (Admin / Registrar only) */}
          {(user?.role === 'ADMIN' || user?.role === 'REGISTRAR') && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center space-x-2 px-3.5 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-navy-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brass-500 shadow-2xs transition-all"
            >
              <Sliders className="w-4 h-4 text-brass-600" />
              <span>{user?.role === 'ADMIN' ? 'Threshold Settings' : 'View Thresholds'}</span>
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={handleRefreshAll}
            disabled={summaryLoading || backlogLoading || staleLoading}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-navy-900 text-white rounded-md text-sm font-medium hover:bg-navy-950 focus:outline-none focus:ring-2 focus:ring-brass-500 shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 text-brass-400 ${
                summaryLoading || backlogLoading ? 'animate-spin' : ''
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Primary Status Distribution Stamp Component */}
      <StatusDistributionStamp
        summary={activeSummary}
        loading={summaryLoading}
        error={summaryError}
        userRole={user?.role}
        isMyCaseload={isJudgeMyCaseload}
        onToggleScope={user?.role === 'JUDGE' ? setIsJudgeMyCaseload : null}
      />

      {/* Operational Highlights Cards (Real-time computed metrics) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Dockets */}
        <div className="registry-card rounded-lg p-5 legal-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-navy-700">
              <span className="text-xs font-semibold uppercase text-gray-500">
                Active Open Cases
              </span>
              <Briefcase className="w-5 h-5 text-navy-800" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-serif font-bold text-navy-950 font-mono">
                {summaryLoading ? '--' : (activeSummary?.totalOpen ?? 0)}
              </div>
              <p className="text-xs text-navy-700 font-medium mt-1">
                Out of <span className="font-bold">{activeSummary?.totalCases ?? 0}</span> total
                registered dockets
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link
              to="/cases"
              className="inline-flex items-center space-x-1 text-xs font-semibold text-brass-700 hover:text-brass-900 transition-colors"
            >
              <span>View Case Registry</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Card 2: Backlog Pendency */}
        <div className="registry-card rounded-lg p-5 border-l-4 border-amber-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-navy-700">
              <span className="text-xs font-semibold uppercase text-amber-700">
                Overdue Backlog
              </span>
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-serif font-bold text-amber-700 font-mono">
                {summaryLoading ? '--' : (activeSummary?.backlogCount ?? 0)}
              </div>
              <p className="text-xs text-amber-800 font-medium mt-1">
                Exceeding {thresholds.backlogThresholdDays || 90}-day pendency limit
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link
              to="/cases?backlog=true"
              className="inline-flex items-center space-x-1 text-xs font-semibold text-amber-800 hover:text-amber-950 transition-colors"
            >
              <span>Inspect Backlog List</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Card 3: Stale Dockets Flagged */}
        <div className="registry-card rounded-lg p-5 border-l-4 border-rose-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-navy-700">
              <span className="text-xs font-semibold uppercase text-rose-700">Stale Dockets</span>
              <AlertCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-serif font-bold text-rose-700 font-mono">
                {summaryLoading ? '--' : (activeSummary?.staleCount ?? 0)}
              </div>
              <p className="text-xs text-rose-800 font-medium mt-1">
                Rule 1: {activeSummary?.staleBreakdown?.noAdvocate ?? 0} | Rule 2:{' '}
                {activeSummary?.staleBreakdown?.noHearing ?? 0}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <a
              href="#stale-worklist-section"
              className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-800 hover:text-rose-950 transition-colors"
            >
              <span>Review Stale Rules</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Card 4: Upcoming Hearings Window */}
        <div className="registry-card rounded-lg p-5 legal-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-navy-700">
              <span className="text-xs font-semibold uppercase text-gray-500">
                Upcoming Hearings
              </span>
              <Calendar className="w-5 h-5 text-navy-800" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-serif font-bold text-navy-950 font-mono">
                {summaryLoading ? '--' : (activeSummary?.upcomingHearings ?? 0)}
              </div>
              <p className="text-xs text-navy-700 font-medium mt-1">
                Hearings today:{' '}
                <span className="font-bold">{activeSummary?.hearingsToday ?? 0}</span> (next{' '}
                {thresholds.upcomingHearingsWindowDays || 7} days)
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link
              to="/hearings"
              className="inline-flex items-center space-x-1 text-xs font-semibold text-brass-700 hover:text-brass-900 transition-colors"
            >
              <span>Open Daily Cause List</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Grid: Backlog Worklist & Stale Cases Worklist */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="stale-worklist-section">
        {/* Backlog Worklist Card */}
        <BacklogWorklist
          data={backlogData}
          loading={backlogLoading}
          error={backlogError}
          page={backlogPage}
          sortBy={backlogSort}
          sortOrder={backlogOrder}
          onPageChange={(p) => updateUrlParam('backlogPage', p)}
          onSortChange={(sb, so) => {
            updateUrlParam('backlogSort', sb);
            updateUrlParam('backlogOrder', so);
          }}
        />

        {/* Stale Cases Worklist Card */}
        <StaleCasesWorklist
          data={staleData}
          loading={staleLoading}
          error={staleError}
          page={stalePage}
          rule={staleRule}
          onPageChange={(p) => updateUrlParam('stalePage', p)}
          onRuleChange={(r) => updateUrlParam('staleRule', r)}
        />
      </section>

      {/* Grid: Upcoming Hearings & Workload Monitor */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Hearings Widget */}
        <UpcomingHearingsWidget
          data={upcomingData}
          loading={upcomingLoading}
          error={upcomingError}
          page={upcomingPage}
          onPageChange={(p) => updateUrlParam('upcomingPage', p)}
        />

        {/* Workload Monitor (Only rendered for Registrar, Admin, Judge) */}
        {user?.role !== 'ADVOCATE' && (
          <WorkloadMonitor
            data={workloadData}
            loading={workloadLoading}
            error={workloadError}
            userRole={user?.role}
          />
        )}
      </section>

      {/* Diagnostics / Health Status Footer (Collapsible) */}
      <section className="pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <button
            onClick={() => {
              setShowDiagnostics((prev) => !prev);
              if (!healthData) fetchHealth();
            }}
            className="inline-flex items-center space-x-1.5 hover:text-navy-900 transition-colors font-medium"
          >
            <Activity className="w-4 h-4 text-brass-600" />
            <span>
              {showDiagnostics ? 'Hide System Diagnostics' : 'Show Infrastructure Status'}
            </span>
          </button>
          <span className="font-mono text-[11px]">
            Court Operational Timezone: Asia/Kolkata (IST)
          </span>
        </div>

        {showDiagnostics && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="flex items-center space-x-3 bg-white p-3 rounded border border-gray-200">
              <Server className="w-4 h-4 text-navy-700" />
              <div>
                <p className="font-semibold text-navy-900">API Backend Gateway</p>
                <p className="text-gray-500 font-mono text-[11px]">
                  {healthLoading
                    ? 'Probing...'
                    : healthData?.api === 'ok'
                      ? 'Operational (200 OK)'
                      : 'Error'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3 bg-white p-3 rounded border border-gray-200">
              <Database className="w-4 h-4 text-navy-700" />
              <div>
                <p className="font-semibold text-navy-900">Database Connection Pool</p>
                <p className="text-gray-500 font-mono text-[11px]">
                  {healthLoading
                    ? 'Probing...'
                    : healthData?.database === 'connected'
                      ? 'Connected (MySQL)'
                      : 'Error'}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Threshold Settings Modal (Admin / Registrar) */}
      <ThresholdSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userRole={user?.role}
        onSaved={handleRefreshAll}
      />
    </div>
  );
}
