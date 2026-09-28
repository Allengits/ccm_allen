import React, { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';

export default function Dashboard() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/health');
      setHealthData(res.data);
      setLastChecked(new Date());
    } catch (err) {
      setError(err.message || 'Unable to reach backend health endpoint');
      setHealthData(err.data?.data || null);
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

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
            onClick={fetchHealth}
            disabled={loading}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-navy-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brass-500 shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-brass-600 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Checking...' : 'Refresh Status'}</span>
          </button>
        </div>
      </div>

      {/* System Health Connectivity Section (Phase 1 Acceptance Criteria) */}
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

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3 text-red-800 text-sm">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Connectivity Alert</p>
              <p className="text-red-700 mt-0.5">{error}</p>
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
                    {loading ? 'Probing...' : isApiOk ? 'Operational' : 'Unavailable'}
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
                    {loading ? 'Connecting...' : isDbOk ? 'Connected' : 'Disconnected'}
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

        {/* Live Diagnostics Payload Details */}
        {healthData && (
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm text-xs font-mono text-gray-700">
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">
              Raw Health Response:
            </span>
            <pre className="mt-1 overflow-x-auto text-navy-900">
              {JSON.stringify(healthData, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* Registry Metrics Placeholders (Upcoming Phases) */}
      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Court Operational Registry (Phase Preview)
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Key indicators for pending cases, backlog limits, and judicial allocation.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="registry-card rounded-lg p-5">
            <div className="flex items-center justify-between text-navy-700">
              <span className="text-xs font-semibold uppercase text-gray-500">Active Cases</span>
              <Briefcase className="w-5 h-5 text-navy-800" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-serif font-bold text-navy-900">--</div>
              <p className="text-xs text-brass-700 font-medium mt-1">
                Pending Model Setup (Phase 2)
              </p>
            </div>
          </div>

          <div className="registry-card rounded-lg p-5">
            <div className="flex items-center justify-between text-navy-700">
              <span className="text-xs font-semibold uppercase text-gray-500">Hearings Today</span>
              <Calendar className="w-5 h-5 text-navy-800" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-serif font-bold text-navy-900">--</div>
              <p className="text-xs text-brass-700 font-medium mt-1">Cause List Integration</p>
            </div>
          </div>

          <div className="registry-card rounded-lg p-5">
            <div className="flex items-center justify-between text-navy-700">
              <span className="text-xs font-semibold uppercase text-gray-500">
                Overdue (&gt;90 Days)
              </span>
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-serif font-bold text-amber-700">--</div>
              <p className="text-xs text-amber-700 font-medium mt-1">Backlog Flagging Monitor</p>
            </div>
          </div>

          <div className="registry-card rounded-lg p-5">
            <div className="flex items-center justify-between text-navy-700">
              <span className="text-xs font-semibold uppercase text-gray-500">
                Reserved Judgments
              </span>
              <Scale className="w-5 h-5 text-navy-800" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-serif font-bold text-navy-900">--</div>
              <p className="text-xs text-brass-700 font-medium mt-1">Awaiting Orders</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
