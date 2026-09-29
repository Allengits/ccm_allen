import React from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Calendar,
  Scale,
  UserPlus,
  AlertCircle,
} from 'lucide-react';

const STATUS_CONFIG = {
  REGISTERED: {
    label: 'Registered',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    barColor: 'bg-blue-600',
    icon: UserPlus,
    description: 'Initial intake, awaiting advocate assignment',
  },
  ADVOCATE_ASSIGNED: {
    label: 'Advocate Assigned',
    color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    barColor: 'bg-indigo-600',
    icon: Briefcase,
    description: 'Counsel on record, awaiting first hearing',
  },
  HEARING_SCHEDULED: {
    label: 'Hearing Scheduled',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    barColor: 'bg-amber-500',
    icon: Calendar,
    description: 'Listed on cause list for judicial hearing',
  },
  UNDER_TRIAL: {
    label: 'Under Trial',
    color: 'bg-purple-50 text-purple-800 border-purple-200',
    barColor: 'bg-purple-600',
    icon: Clock,
    description: 'Active courtroom proceedings and arguments',
  },
  JUDGMENT_RESERVED: {
    label: 'Judgment Reserved',
    color: 'bg-orange-50 text-orange-800 border-orange-200',
    barColor: 'bg-orange-600',
    icon: Scale,
    description: 'Arguments concluded, pending pronouncement',
  },
  CLOSED: {
    label: 'Closed',
    color: 'bg-gray-100 text-gray-700 border-gray-300',
    barColor: 'bg-gray-500',
    icon: CheckCircle2,
    description: 'Final judgment delivered or decree issued',
  },
};

export default function StatusDistributionStamp({
  summary,
  loading,
  error,
  userRole,
  isMyCaseload = false,
  onToggleScope,
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 legal-border shadow-sm animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-5 flex items-start space-x-3 text-red-800">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
        <div>
          <h3 className="font-semibold text-sm">Failed to Load Status Distribution</h3>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const distribution = summary?.statusDistribution || {};
  const totalCases = summary?.totalCases ?? 0;
  const totalOpen = summary?.totalOpen ?? 0;
  const totalClosed = summary?.totalClosed ?? 0;

  return (
    <div className="bg-white rounded-lg p-6 legal-border shadow-sm space-y-5">
      {/* Header and Scope Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100">
        <div>
          <h2 className="font-serif text-lg font-bold text-navy-950 flex items-center space-x-2">
            <span>Caseload Status Breakdown</span>
            {userRole === 'ADVOCATE' && (
              <span className="text-xs font-sans font-normal px-2 py-0.5 rounded bg-navy-100 text-navy-800">
                My Representation
              </span>
            )}
            {userRole === 'JUDGE' && (
              <span className="text-xs font-sans font-normal px-2 py-0.5 rounded bg-brass-100 text-brass-900">
                {isMyCaseload ? 'My Assigned Bench' : 'Registry-Wide Master'}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time case tally across the six judicial lifecycle stages.
          </p>
        </div>

        {/* Judge View Scope Switcher */}
        {userRole === 'JUDGE' && onToggleScope && (
          <div className="inline-flex rounded-md shadow-sm border border-gray-300 p-0.5 bg-gray-50 text-xs">
            <button
              type="button"
              onClick={() => onToggleScope(false)}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                !isMyCaseload
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'text-gray-600 hover:text-navy-900'
              }`}
            >
              Registry-Wide
            </button>
            <button
              type="button"
              onClick={() => onToggleScope(true)}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                isMyCaseload
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'text-gray-600 hover:text-navy-900'
              }`}
            >
              My Bench Caseload
            </button>
          </div>
        )}

        {/* Aggregate Counts Pill */}
        <div className="flex items-center space-x-3 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-navy-50 text-navy-900 font-semibold border border-navy-200">
            Total: <span className="font-mono text-sm">{totalCases}</span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
            Active Open: <span className="font-mono text-sm">{totalOpen}</span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-700 font-semibold border border-gray-200">
            Closed: <span className="font-mono text-sm">{totalClosed}</span>
          </span>
        </div>
      </div>

      {/* 6 Lifecycle Stamps */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(STATUS_CONFIG).map(([statusKey, cfg]) => {
          const count = distribution[statusKey] || 0;
          const percentage = totalCases > 0 ? Math.round((count / totalCases) * 100) : 0;
          const Icon = cfg.icon;

          return (
            <Link
              key={statusKey}
              to={`/cases?status=${statusKey}`}
              className={`rounded-lg p-3.5 border transition-all duration-150 hover:shadow-md hover:border-brass-400 flex flex-col justify-between ${cfg.color}`}
              title={`${cfg.description} — Click to filter cases`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <Icon className="w-4 h-4 opacity-75" />
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/70 border border-current">
                    {percentage}%
                  </span>
                </div>
                <div className="mt-2 text-2xl font-serif font-bold font-mono tracking-tight">
                  {count}
                </div>
                <div className="text-xs font-semibold mt-1 leading-snug">{cfg.label}</div>
              </div>

              <div className="mt-3 pt-2 border-t border-current/10">
                <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full ${cfg.barColor}`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
