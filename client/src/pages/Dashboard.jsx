import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import {
  Activity,
  Database,
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Briefcase,
  Calendar,
  Clock,
  Scale,
  ArrowRight,
} from 'lucide-react';

export default function Dashboard() {
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  // Real case statistics from Phase 4 API
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await api.get('/health');
      setHealthData(res.data);
      setLastChecked(new Date());
    } catch (err) {
      setHealthError(err.message || 'Unable to reach backend health endpoint');
      setHealthData(err.data?.data || null);
      setLastChecked(new Date());
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await api.get('/cases/stats');
      if (res.data?.data) {
        setStatsData(res.data.data);
      }
    } catch {
      // Silently fail or keep stats null
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchStats();
  }, [fetchHealth, fetchStats]);

  const handleRefreshAll = () => {
    fetchHealth();
    fetchStats();
  };

  const isApiOk = healthData?.api === 'ok';
  const isDbOk = healthData?.database === 'connected';

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
            Judicial Registry Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Real-time court operations monitoring, case backlog telemetry, and system diagnostics.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefreshAll}
            disabled={healthLoading || statsLoading}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-navy-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brass-500 shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 text-brass-600 ${
                healthLoading || statsLoading ? 'animate-spin' : ''
              }`}
            />
            <span>{healthLoading || statsLoading ? 'Refreshing...' : 'Refresh Status'}</span>
          </button>
        </div>
      </div>

      {/* Operational Registry Metrics (Real numbers from Phase 4 API) */}
      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Court Operational Registry
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Key operational indicators filtered strictly by your active judicial clearance.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Real Total Open Cases */}
          <div className="registry-card rounded-lg p-5 legal-border flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-navy-700">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  Total Open Cases
                </span>
                <Briefcase className="w-5 h-5 text-navy-800" />
              </div>
              <div className="mt-3">
                <div className="text-3xl font-serif font-bold text-navy-950 font-mono">
                  {statsLoading ? '--' : (statsData?.totalOpenCases ?? 0)}
                </div>
                <p className="text-xs text-navy-700 font-medium mt-1">
                  Active dockets pending adjudication
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <Link
                to="/cases"
                className="inline-flex items-center space-x-1 text-xs font-semibold text-brass-700 hover:text-brass-900 transition-colors"
              >
                <span>View All Open Cases</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 2: Real Overdue Backlog Cases */}
          <div className="registry-card rounded-lg p-5 border-l-4 border-amber-500 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-navy-700">
                <span className="text-xs font-semibold uppercase text-gray-500">Overdue Cases</span>
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div className="mt-3">
                <div className="text-3xl font-serif font-bold text-amber-700 font-mono">
                  {statsLoading ? '--' : (statsData?.overdueCases ?? 0)}
                </div>
                <p className="text-xs text-amber-700 font-medium mt-1">
                  Exceeding {statsData?.backlogThresholdDays || 90}-day pendency limit
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <Link
                to="/cases?backlog=true"
                className="inline-flex items-center space-x-1 text-xs font-semibold text-amber-800 hover:text-amber-950 transition-colors"
              >
                <span>View Backlog Monitor</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 3: Hearings Preview */}
          <div className="registry-card rounded-lg p-5 flex flex-col justify-between opacity-85">
            <div>
              <div className="flex items-center justify-between text-navy-700">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  Hearings Today
                </span>
                <Calendar className="w-5 h-5 text-navy-800" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-serif font-bold text-gray-400">--</div>
                <p className="text-xs text-gray-500 font-medium mt-1">Daily Cause List (Phase 6)</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-400 italic">
              Module arrives in Phase 6
            </div>
          </div>

          {/* Card 4: Judgments Preview */}
          <div className="registry-card rounded-lg p-5 flex flex-col justify-between opacity-85">
            <div>
              <div className="flex items-center justify-between text-navy-700">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  Reserved Judgments
                </span>
                <Scale className="w-5 h-5 text-navy-800" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-serif font-bold text-gray-400">--</div>
                <p className="text-xs text-gray-500 font-medium mt-1">Awaiting Orders (Phase 8)</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-400 italic">
              Module arrives in Phase 8
            </div>
          </div>
        </div>
      </section>

      {/* System Health Connectivity Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-navy-900 flex items-center space-x-2">
            <Activity className="w-5 h-5 text-brass-600" />
            <span>Infrastructure Health Status</span>
          </h2>
          {lastChecked && (
            <span className="text-xs text-gray-500 font-mono">
              Last probe: {lastChecked.toLocaleTimeString('en-IN')}
            </span>
          )}
        </div>

        {healthError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3 text-red-800 text-sm">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Connectivity Alert</p>
              <p className="text-red-700 mt-0.5">{healthError}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* API Server Card */}
          <div className="registry-card rounded-lg p-6 legal-border flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <Server className="w-4 h-4 text-navy-700" />
                <span>Backend Express API</span>
              </div>
              <div className="flex items-center space-x-3 pt-1">
                {isApiOk ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                )}
                <div>
                  <h3 className="text-lg font-bold text-navy-900">
                    {healthLoading ? 'Probing...' : isApiOk ? 'Operational' : 'Unavailable'}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">Endpoint: /api/v1/health</p>
                </div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                isApiOk
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}
            >
              {isApiOk ? 'STATUS 200 OK' : 'FAILED'}
            </span>
          </div>

          {/* Database Connectivity Card */}
          <div className="registry-card rounded-lg p-6 legal-border flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <Database className="w-4 h-4 text-navy-700" />
                <span>MySQL via Prisma ORM</span>
              </div>
              <div className="flex items-center space-x-3 pt-1">
                {isDbOk ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                )}
                <div>
                  <h3 className="text-lg font-bold text-navy-900">
                    {healthLoading ? 'Connecting...' : isDbOk ? 'Connected' : 'Disconnected'}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    Host: localhost:3307 | Schema: court_cms
                  </p>
                </div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                isDbOk
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}
            >
              {isDbOk ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
