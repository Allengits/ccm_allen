import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { unwrap } from '../api/unwrap';
import { useAuth } from '../context/AuthContext';
import EditCaseModal from '../components/cases/EditCaseModal';
import AssignAdvocateModal from '../components/cases/AssignAdvocateModal';
import UnassignAdvocateModal from '../components/cases/UnassignAdvocateModal';
import ScheduleHearingModal from '../components/hearings/ScheduleHearingModal';
import RescheduleHearingModal from '../components/hearings/RescheduleHearingModal';
import CancelHearingModal from '../components/hearings/CancelHearingModal';
import CompleteHearingModal from '../components/hearings/CompleteHearingModal';
import AdjournHearingModal from '../components/hearings/AdjournHearingModal';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  Gavel,
  Scale,
  Users,
  AlertTriangle,
  History,
  Edit2,
  Loader2,
  UserPlus,
  UserMinus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';

export default function CaseDetail() {
  const { id } = useParams();
  const { user, can } = useAuth();

  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [unassigningAdvocate, setUnassigningAdvocate] = useState(null);
  const [assignmentNotice, setAssignmentNotice] = useState(null);
  const [showPastAssignments, setShowPastAssignments] = useState(false);

  // Hearing modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [reschedulingHearing, setReschedulingHearing] = useState(null);
  const [cancellingHearing, setCancellingHearing] = useState(null);
  const [completingHearing, setCompletingHearing] = useState(null);
  const [adjourningHearing, setAdjourningHearing] = useState(null);
  const [hearingNotice, setHearingNotice] = useState(null);

  const fetchCaseDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/cases/${id}`);
      const data = unwrap(res, 'Case record not found');
      if (data.case) {
        setCaseData(data.case);
      } else {
        throw new Error('Case record not found');
      }
    } catch (err) {
      if (err.status === 404 || err.response?.status === 404) {
        setError('not_found');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to load case record');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaseDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-brass-600" />
        <p className="text-sm text-gray-500 font-medium">Loading docket record...</p>
      </div>
    );
  }

  if (error === 'not_found' || !caseData) {
    return (
      <div className="max-w-2xl mx-auto my-12 text-center bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-navy-950 mb-2">Case Not Found</h1>
        <p className="text-sm text-gray-600 max-w-md mx-auto mb-6">
          The requested case docket does not exist, has been archived, or you do not possess the
          required judicial clearance to access it.
        </p>
        <Link
          to="/cases"
          className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-sm font-semibold hover:bg-navy-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Master Docket</span>
        </Link>
      </div>
    );
  }

  // Stamp-style badge colors
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'REGISTERED':
      case 'ADVOCATE_ASSIGNED':
        return 'bg-blue-50 text-blue-800 border-blue-300';
      case 'HEARING_SCHEDULED':
      case 'UNDER_TRIAL':
      case 'JUDGMENT_RESERVED':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'CLOSED':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      default:
        return 'bg-gray-50 text-gray-800 border-gray-300';
    }
  };

  const isClosed = caseData.status === 'CLOSED';
  const canEdit = can('case.edit') && !isClosed;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'advocates', label: `Advocates (${caseData.advocates?.length || 0})`, icon: Users },
    { id: 'hearings', label: `Hearings (${caseData.hearings?.length || 0})`, icon: Calendar },
    { id: 'judgment', label: 'Judgment', icon: Gavel },
    { id: 'history', label: `History (${caseData.statusHistory?.length || 0})`, icon: History },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Navigation Breadcrumb & Back */}
      <div className="flex items-center justify-between">
        <Link
          to="/cases"
          className="inline-flex items-center space-x-2 text-sm text-gray-600 hover:text-navy-900 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Master Docket</span>
        </Link>

        {canEdit && (
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="inline-flex items-center space-x-2 px-3 py-1.5 bg-white border border-navy-800 text-navy-900 rounded-md text-xs font-semibold hover:bg-navy-50 transition-colors shadow-xs"
          >
            <Edit2 className="w-3.5 h-3.5 text-brass-600" />
            <span>Edit Case Details</span>
          </button>
        )}
      </div>

      {/* Docket Header Card */}
      <div className="registry-card rounded-lg p-6 legal-border">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xl font-bold tracking-tight text-navy-950 bg-navy-50 px-2.5 py-1 rounded border border-navy-200">
                {caseData.caseNumber}
              </span>
              <span
                className={`font-mono uppercase tracking-wider text-xs font-bold px-2 py-0.5 rounded-xs border ${getStatusBadgeClass(
                  caseData.status
                )}`}
              >
                {caseData.status.replace('_', ' ')}
              </span>
              {caseData.priority === 'URGENT' && (
                <span className="bg-rose-100 text-rose-800 border border-rose-300 font-bold uppercase text-[11px] px-2 py-0.5 rounded">
                  URGENT
                </span>
              )}
              {caseData.isBacklog && (
                <span className="bg-red-50 text-red-700 border border-red-200 text-xs px-2 py-0.5 rounded font-semibold inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Overdue ({caseData.ageDays}d)</span>
                </span>
              )}
            </div>

            <h1 className="font-serif text-2xl font-bold text-navy-900 leading-snug">
              {caseData.title}
            </h1>
            <p className="text-xs text-gray-500">
              Filed on{' '}
              {new Date(caseData.filingDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}{' '}
              • Case Type: <span className="font-semibold text-navy-900">{caseData.caseType}</span>
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded border border-gray-200">
            <div>
              <span className="text-gray-400 font-medium">Presiding Bench: </span>
              <span className="font-semibold text-navy-900">
                {caseData.judge?.name || 'Unassigned'}
              </span>
            </div>
            <div>
              <span className="text-gray-400 font-medium">Registered By: </span>
              <span className="text-navy-900">
                {caseData.registeredBy?.name || 'Registry Clerk'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 border-b border-gray-200 mt-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-2.5 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-brass-600 text-navy-900 bg-brass-50/30'
                    : 'border-transparent text-gray-500 hover:text-navy-900 hover:border-gray-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-brass-600' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="space-y-4">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 registry-card rounded-lg p-6 space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                  Litigating Parties
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                    <span className="text-[11px] font-bold uppercase text-navy-800 block">
                      Petitioner / Complainant
                    </span>
                    <p className="text-sm font-semibold text-navy-950 mt-1">
                      {caseData.petitioner}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                    <span className="text-[11px] font-bold uppercase text-navy-800 block">
                      Respondent / Accused
                    </span>
                    <p className="text-sm font-semibold text-navy-950 mt-1">
                      {caseData.respondent}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Case Description & Brief
                </h3>
                <div className="p-4 bg-white border border-gray-200 rounded-md text-sm text-gray-700 leading-relaxed min-h-[80px]">
                  {caseData.description ? (
                    caseData.description
                  ) : (
                    <span className="text-gray-400 italic">
                      No formal description provided at filing.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="registry-card rounded-lg p-6 space-y-4 text-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 pb-2 border-b border-gray-100">
                Filing Metadata
              </h3>
              <div>
                <span className="text-gray-500 uppercase block font-semibold">Pendency Age</span>
                <span className="text-navy-950 font-medium font-mono text-sm">
                  {caseData.ageDays} days
                </span>
              </div>
              <div>
                <span className="text-gray-500 uppercase block font-semibold">
                  Priority Classification
                </span>
                <span className="text-navy-950 font-medium">{caseData.priority}</span>
              </div>
              <div>
                <span className="text-gray-500 uppercase block font-semibold">Case Type</span>
                <span className="text-navy-950 font-medium">{caseData.caseType}</span>
              </div>
              <div>
                <span className="text-gray-500 uppercase block font-semibold">Presiding Judge</span>
                <span className="text-navy-950 font-medium">
                  {caseData.judge?.name || 'Unassigned'}
                </span>
              </div>
              {caseData.closedAt && (
                <div>
                  <span className="text-gray-500 uppercase block font-semibold">Closed On</span>
                  <span className="text-emerald-700 font-medium">
                    {new Date(caseData.closedAt).toLocaleDateString('en-IN')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADVOCATES TAB */}
        {activeTab === 'advocates' && (
          <div className="registry-card rounded-lg p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-navy-900">
                  Legal Representation
                </h3>
                <p className="text-xs text-gray-500">
                  Advocates assigned as legal counsel for litigating parties.
                </p>
              </div>

              {can('advocate.assign') && caseData.status !== 'CLOSED' && (
                <button
                  onClick={() => setIsAssignModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800 transition-colors shadow-sm self-start sm:self-auto"
                >
                  <UserPlus className="w-3.5 h-3.5 text-brass-400" />
                  <span>Assign Advocate</span>
                </button>
              )}
            </div>

            {/* Assignment Feedback Banner */}
            {assignmentNotice && (
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{assignmentNotice.message}</span>
                  </div>
                  <button
                    onClick={() => setAssignmentNotice(null)}
                    className="text-emerald-700 hover:text-emerald-950 font-semibold text-xs ml-4"
                  >
                    Dismiss
                  </button>
                </div>

                {assignmentNotice.warning && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Caseload Advisory:</span>{' '}
                      {assignmentNotice.warning}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Active Advocates List */}
            {(() => {
              const activeAdvocates = caseData.advocates?.filter((a) => a.isActive) || [];
              const pastAdvocates = caseData.advocates?.filter((a) => !a.isActive) || [];

              return (
                <div className="space-y-6">
                  {activeAdvocates.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-gray-500 text-sm">
                      No active legal counsel currently assigned to this docket.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full text-xs text-left">
                        <thead className="bg-gray-50 uppercase text-gray-500 font-semibold border-b border-gray-200">
                          <tr>
                            <th className="py-2.5 px-3">Advocate Name</th>
                            <th className="py-2.5 px-3">Bar Council Number</th>
                            <th className="py-2.5 px-3">Specialization</th>
                            <th className="py-2.5 px-3">Representation Side</th>
                            <th className="py-2.5 px-3">Assigned Date & By</th>
                            {can('advocate.assign') && caseData.status !== 'CLOSED' && (
                              <th className="py-2.5 px-3 text-right">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {activeAdvocates.map((ca) => (
                            <tr key={ca.id} className="hover:bg-gray-50">
                              <td className="py-2.5 px-3 font-semibold text-navy-950">
                                {ca.advocate?.name}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-gray-600">
                                {ca.advocate?.barNumber}
                              </td>
                              <td className="py-2.5 px-3 text-gray-600">
                                {ca.advocate?.specialization}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`font-semibold uppercase px-2 py-0.5 rounded text-[11px] ${
                                    ca.side === 'PETITIONER'
                                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                      : 'bg-purple-50 text-purple-800 border border-purple-200'
                                  }`}
                                >
                                  {ca.side}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                <div>{new Date(ca.assignedAt).toLocaleDateString('en-IN')}</div>
                                {ca.assignedByName && (
                                  <div className="text-[10px] text-gray-400">
                                    By {ca.assignedByName}
                                  </div>
                                )}
                              </td>
                              {can('advocate.assign') && caseData.status !== 'CLOSED' && (
                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => setUnassigningAdvocate(ca)}
                                    className="px-2.5 py-1 text-xs font-semibold text-red-700 hover:text-red-900 hover:bg-red-50 rounded transition-colors inline-flex items-center space-x-1"
                                  >
                                    <UserMinus className="w-3.5 h-3.5" />
                                    <span>Unassign</span>
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Previous Assignments Collapsible Accordion */}
                  {pastAdvocates.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <button
                        onClick={() => setShowPastAssignments(!showPastAssignments)}
                        className="flex items-center space-x-2 text-xs font-semibold text-gray-600 hover:text-navy-900 transition-colors py-1"
                      >
                        {showPastAssignments ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <span>Previous Assignments ({pastAdvocates.length})</span>
                      </button>

                      {showPastAssignments && (
                        <div className="mt-3 overflow-x-auto border border-gray-200 rounded-lg">
                          <table className="min-w-full text-xs text-left">
                            <thead className="bg-gray-50 uppercase text-gray-500 font-semibold border-b border-gray-200">
                              <tr>
                                <th className="py-2.5 px-3">Advocate Name</th>
                                <th className="py-2.5 px-3">Bar Council Number</th>
                                <th className="py-2.5 px-3">Side</th>
                                <th className="py-2.5 px-3">Assigned Date & By</th>
                                <th className="py-2.5 px-3">Withdrawn Date & By</th>
                                <th className="py-2.5 px-3">Withdrawal Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white text-gray-600">
                              {pastAdvocates.map((pa) => (
                                <tr key={pa.id} className="hover:bg-gray-50">
                                  <td className="py-2.5 px-3 font-semibold text-gray-700">
                                    {pa.advocate?.name}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">
                                    {pa.advocate?.barNumber}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="font-semibold uppercase px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700">
                                      {pa.side}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div>{new Date(pa.assignedAt).toLocaleDateString('en-IN')}</div>
                                    {pa.assignedByName && (
                                      <div className="text-[10px] text-gray-400">
                                        By {pa.assignedByName}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div>
                                      {pa.unassignedAt
                                        ? new Date(pa.unassignedAt).toLocaleDateString('en-IN')
                                        : '—'}
                                    </div>
                                    {pa.unassignedByName && (
                                      <div className="text-[10px] text-gray-400">
                                        By {pa.unassignedByName}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 max-w-xs italic text-gray-700">
                                    {pa.unassignReason || 'No reason specified'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* HEARINGS TAB */}
        {activeTab === 'hearings' && (
          <div className="registry-card rounded-lg p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-navy-900">
                  Scheduled Court Hearings
                </h3>
                <p className="text-xs text-gray-500">
                  Court sessions, bench proceedings, daily orders, and cause list allocations.
                </p>
              </div>

              {can('hearing.schedule') &&
                caseData.status !== 'CLOSED' &&
                caseData.status !== 'REGISTERED' && (
                  <button
                    onClick={() => setIsScheduleModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800 transition-colors shadow-sm self-start sm:self-auto"
                  >
                    <Calendar className="w-3.5 h-3.5 text-brass-400" />
                    <span>Schedule Hearing</span>
                  </button>
                )}
            </div>

            {/* Lifecycle Automation Notice */}
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-md text-blue-900 text-xs flex items-start space-x-2">
              <Scale className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Case Status Automation</span>
                <span className="text-blue-800 text-[11px]">
                  Concluding the first hearing automatically transitions this docket to{' '}
                  <strong className="font-mono">UNDER_TRIAL</strong>. Adjourning without fixing a
                  subsequent date or cancelling the sole scheduled hearing reverts status to{' '}
                  <strong className="font-mono">ADVOCATE_ASSIGNED</strong>.
                </span>
              </div>
            </div>

            {hearingNotice && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{hearingNotice}</span>
                </div>
                <button
                  onClick={() => setHearingNotice(null)}
                  className="text-emerald-700 hover:text-emerald-950 font-bold ml-4"
                >
                  Dismiss
                </button>
              </div>
            )}

            {caseData.hearings?.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No hearings currently scheduled for this case docket.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-left">
                  <thead className="bg-gray-50 uppercase text-gray-500 font-semibold border-y border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3">Date & Time (IST)</th>
                      <th className="py-2.5 px-3">Courtroom</th>
                      <th className="py-2.5 px-3">Purpose</th>
                      <th className="py-2.5 px-3">Presiding Judge</th>
                      <th className="py-2.5 px-3">Daily Order / Notes</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {caseData.hearings.map((h) => {
                      const isActionable =
                        h.status === 'SCHEDULED' &&
                        (user?.role === 'ADMIN' ||
                          user?.role === 'REGISTRAR' ||
                          (user?.role === 'JUDGE' &&
                            (h.judgeId === user.id || caseData.judgeId === user.id)));

                      const canComplete =
                        isActionable &&
                        (user?.role === 'ADMIN' || user?.role === 'JUDGE') &&
                        new Date(h.scheduledAt) <= new Date();

                      return (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="py-2.5 px-3 font-semibold text-navy-950 whitespace-nowrap font-mono">
                            <div>
                              {new Date(h.scheduledAt).toLocaleDateString('en-IN', {
                                dateStyle: 'medium',
                              })}
                            </div>
                            <div className="text-[10px] text-gray-500 font-normal">
                              {new Date(h.scheduledAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              ({h.durationMinutes || h.durationMins || 30}m)
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                            <span className="font-semibold text-navy-900 block">
                              {h.courtroom?.name}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {h.courtroom?.location}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 font-medium text-navy-900 max-w-xs">
                            {h.purpose}
                          </td>

                          <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                            {h.judge?.name || caseData.judge?.name || 'Presiding Bench'}
                          </td>

                          <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate">
                            {h.outcomeNotes || <span className="text-gray-400 italic">—</span>}
                          </td>

                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span
                              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                                h.status === 'SCHEDULED'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : h.status === 'COMPLETED'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : h.status === 'ADJOURNED'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-red-50 text-red-800 border-red-200'
                              }`}
                            >
                              {h.status}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {isActionable ? (
                              <div className="flex items-center justify-end space-x-1">
                                {canComplete && (
                                  <button
                                    onClick={() => setCompletingHearing(h)}
                                    className="px-2 py-0.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded text-[11px] font-semibold transition-colors"
                                    title="Complete hearing"
                                  >
                                    Complete
                                  </button>
                                )}
                                <button
                                  onClick={() => setAdjourningHearing(h)}
                                  className="px-2 py-0.5 bg-navy-50 text-navy-800 hover:bg-navy-100 border border-navy-200 rounded text-[11px] font-semibold transition-colors"
                                  title="Adjourn hearing"
                                >
                                  Adjourn
                                </button>
                                <button
                                  onClick={() => setReschedulingHearing(h)}
                                  className="px-2 py-0.5 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded text-[11px] font-semibold transition-colors"
                                  title="Reschedule hearing"
                                >
                                  Reschedule
                                </button>
                                <button
                                  onClick={() => setCancellingHearing(h)}
                                  className="px-2 py-0.5 bg-red-50 text-red-800 hover:bg-red-100 border border-red-200 rounded text-[11px] font-semibold transition-colors"
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
            )}
          </div>
        )}

        {/* JUDGMENT TAB */}
        {activeTab === 'judgment' && (
          <div className="registry-card rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-navy-900">
                  Judicial Decree & Orders
                </h3>
                <p className="text-xs text-gray-500">
                  Reserved rulings, delivered decrees, and operative judicial orders.
                </p>
              </div>
              <span className="text-xs italic text-gray-400 bg-gray-50 px-2.5 py-1 rounded border border-gray-200">
                Phase 8 will enable judgment reservation & formal delivery.
              </span>
            </div>

            {!caseData.judgment ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No judgment reserved or delivered yet for this case docket.
              </div>
            ) : (
              <div className="p-6 bg-navy-50/40 rounded-lg border border-navy-100 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-serif font-bold text-navy-950 text-lg">
                      Judgment Decree
                    </span>
                    <span
                      className={`font-mono uppercase text-xs px-2.5 py-0.5 rounded font-bold ${
                        caseData.judgment.status === 'DELIVERED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {caseData.judgment.status}
                    </span>
                  </div>

                  {caseData.judgment.outcome && (
                    <span className="bg-navy-900 text-brass-300 px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider">
                      Outcome: {caseData.judgment.outcome}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-600">
                  <div>
                    <span className="text-gray-400 block font-medium uppercase">
                      Authoring Judge
                    </span>
                    <span className="font-semibold text-navy-950">
                      {caseData.judgment.judge?.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-medium uppercase">Reserved Date</span>
                    <span>
                      {caseData.judgment.reservedOn
                        ? new Date(caseData.judgment.reservedOn).toLocaleDateString('en-IN')
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-medium uppercase">
                      Delivered Date
                    </span>
                    <span>
                      {caseData.judgment.deliveredOn
                        ? new Date(caseData.judgment.deliveredOn).toLocaleDateString('en-IN')
                        : 'Pending formal delivery'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-gray-400 uppercase font-semibold block mb-1">
                    Operative Judgment Summary
                  </span>
                  <div className="p-4 bg-white rounded border border-gray-200 text-sm text-navy-950 leading-relaxed font-serif">
                    {caseData.judgment.summary}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="registry-card rounded-lg p-6 space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <h3 className="text-base font-serif font-bold text-navy-900">Audit Trail Timeline</h3>
              <p className="text-xs text-gray-500">
                Immutable lifecycle status transitions recorded in chronological sequence.
              </p>
            </div>

            {caseData.statusHistory?.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-xs">
                No historical transitions recorded.
              </div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                {caseData.statusHistory.map((item) => (
                  <div key={item.id} className="relative group text-xs text-gray-600">
                    <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-navy-900 border-2 border-white flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-brass-400" />
                    </div>

                    <div className="bg-gray-50 p-3.5 rounded-md border border-gray-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-navy-950 font-mono text-[11px] uppercase">
                          {item.fromStatus
                            ? `${item.fromStatus} → ${item.toStatus}`
                            : item.toStatus || 'REPRESENTATION UPDATE'}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {new Date(item.createdAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <p className="text-gray-800 font-medium">{item.reason}</p>
                      <div className="text-[11px] text-gray-500 pt-1">
                        Recorded by:{' '}
                        <span className="text-navy-900">
                          {item.changedBy?.name || 'System Registry'}
                        </span>
                        {item.changedBy?.role && ` (${item.changedBy.role})`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Case Modal */}
      {canEdit && (
        <EditCaseModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          caseItem={caseData}
          onCaseUpdated={(updated) => {
            setCaseData((prev) => ({
              ...prev,
              ...updated,
            }));
            fetchCaseDetail();
          }}
        />
      )}

      {/* Assign Advocate Modal */}
      {can('advocate.assign') && (
        <AssignAdvocateModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          onSuccess={(result) => {
            setAssignmentNotice({
              message: result.message,
              warning: result.warning,
              statusChanged: result.statusChanged,
            });
            fetchCaseDetail();
          }}
          caseId={caseData.id}
          caseNumber={caseData.caseNumber}
          existingAdvocates={caseData.advocates || []}
        />
      )}

      {/* Unassign Advocate Modal */}
      {can('advocate.assign') && unassigningAdvocate && (
        <UnassignAdvocateModal
          isOpen={!!unassigningAdvocate}
          onClose={() => setUnassigningAdvocate(null)}
          onSuccess={(result) => {
            setAssignmentNotice({
              message: result.message,
              statusChanged: result.statusChanged,
            });
            fetchCaseDetail();
          }}
          caseId={caseData.id}
          caseNumber={caseData.caseNumber}
          advocate={unassigningAdvocate}
          isLastAdvocate={(caseData.advocates?.filter((a) => a.isActive) || []).length === 1}
          caseStatus={caseData.status}
        />
      )}

      {/* Schedule Hearing Modal */}
      {can('hearing.schedule') && (
        <ScheduleHearingModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          caseItem={caseData}
          onSuccess={({ message }) => {
            setHearingNotice(message);
            fetchCaseDetail();
          }}
        />
      )}

      {/* Reschedule Hearing Modal */}
      {reschedulingHearing && (
        <RescheduleHearingModal
          isOpen={!!reschedulingHearing}
          onClose={() => setReschedulingHearing(null)}
          hearing={reschedulingHearing}
          onSuccess={({ message }) => {
            setHearingNotice(message);
            fetchCaseDetail();
          }}
        />
      )}

      {/* Cancel Hearing Modal */}
      {cancellingHearing && (
        <CancelHearingModal
          isOpen={!!cancellingHearing}
          onClose={() => setCancellingHearing(null)}
          hearing={cancellingHearing}
          onSuccess={({ message }) => {
            setHearingNotice(message);
            fetchCaseDetail();
          }}
        />
      )}

      {/* Complete Hearing Modal */}
      {completingHearing && (
        <CompleteHearingModal
          isOpen={!!completingHearing}
          onClose={() => setCompletingHearing(null)}
          hearing={completingHearing}
          onSuccess={({ message }) => {
            setHearingNotice(message);
            fetchCaseDetail();
          }}
        />
      )}

      {/* Adjourn Hearing Modal */}
      {adjourningHearing && (
        <AdjournHearingModal
          isOpen={!!adjourningHearing}
          onClose={() => setAdjourningHearing(null)}
          hearing={adjourningHearing}
          onSuccess={({ message }) => {
            setHearingNotice(message);
            fetchCaseDetail();
          }}
        />
      )}
    </div>
  );
}
