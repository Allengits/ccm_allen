import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { unwrap } from '../api/unwrap';
import { useAuth } from '../context/AuthContext';
import AddAdvocateModal from '../components/advocates/AddAdvocateModal';
import EditAdvocateModal from '../components/advocates/EditAdvocateModal';
import AdvocateDetailModal from '../components/advocates/AdvocateDetailModal';
import GrantAdvocateAccessModal from '../components/advocates/GrantAdvocateAccessModal';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  Mail,
  Phone,
  Scale,
  CheckCircle2,
  Edit3,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
} from 'lucide-react';

export default function Advocates() {
  const { user, can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state synchronization
  const qParam = searchParams.get('q') || '';
  const specParam = searchParams.get('specialization') || '';
  const hasLoginParam = searchParams.get('hasLogin') || '';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const pageSizeParam = parseInt(searchParams.get('pageSize') || '10', 10);

  // Search input state
  const [searchInput, setSearchInput] = useState(qParam);

  // Data states for Directory
  const [advocates, setAdvocates] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [specializations, setSpecializations] = useState([]);

  // Data states for ADVOCATE "My Profile" view
  const [myProfile, setMyProfile] = useState(null);
  const [myProfileLoading, setMyProfileLoading] = useState(false);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAdvocate, setEditingAdvocate] = useState(null);
  const [detailAdvocateId, setDetailAdvocateId] = useState(null);
  const [grantingAdvocate, setGrantingAdvocate] = useState(null);
  const [bannerNotice, setBannerNotice] = useState(null);

  const isAdvocateRole = user?.role === 'ADVOCATE';

  // Helper to sync URL params
  const updateParams = useCallback(
    (newParams) => {
      const current = Object.fromEntries(searchParams.entries());
      const updated = { ...current, ...newParams };

      Object.keys(updated).forEach((key) => {
        if (
          updated[key] === '' ||
          updated[key] === null ||
          updated[key] === undefined ||
          (key === 'page' && updated[key] === 1) ||
          (key === 'pageSize' && updated[key] === 10)
        ) {
          delete updated[key];
        }
      });

      setSearchParams(updated, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Debounced search sync to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== qParam) {
        updateParams({ q: searchInput, page: 1 });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  // Fetch metadata (specializations) once
  useEffect(() => {
    if (!isAdvocateRole) {
      api
        .get('/advocates/meta')
        .then((res) => {
          const data = unwrap(res);
          if (Array.isArray(data.specializations)) {
            setSpecializations(data.specializations);
          }
        })
        .catch((err) => {
          console.warn('Failed to load advocate metadata:', err.message);
        });
    }
  }, [isAdvocateRole]);

  // Fetch directory list for Staff & Judges
  const fetchDirectory = useCallback(async () => {
    if (isAdvocateRole) return;
    setLoading(true);
    setError(null);

    try {
      const params = {
        page: pageParam,
        pageSize: pageSizeParam,
      };
      if (qParam) params.q = qParam;
      if (specParam) params.specialization = specParam;
      if (hasLoginParam) params.hasLogin = hasLoginParam;

      const res = await api.get('/advocates', { params });
      const data = unwrap(res, 'Failed to load advocate directory');

      if (Array.isArray(data.items)) {
        setAdvocates(data.items);
        setTotal(data.total ?? data.items.length);
        setTotalPages(data.totalPages ?? 1);
      } else {
        throw new Error('Failed to parse advocate records from server response');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0] ||
          err.message ||
          'Failed to load advocate directory'
      );
    } finally {
      setLoading(false);
    }
  }, [pageParam, pageSizeParam, qParam, specParam, hasLoginParam, isAdvocateRole]);

  // Fetch "My Profile" if caller is an advocate
  const fetchMyProfile = useCallback(async () => {
    if (!isAdvocateRole) return;
    setMyProfileLoading(true);
    setError(null);

    try {
      // Find advocateId from user profile
      const advocateId = user?.advocateId;
      if (!advocateId) {
        throw new Error('No linked advocate record found for your user account.');
      }

      const res = await api.get(`/advocates/${advocateId}`);
      const data = unwrap(res, 'Failed to load your advocate profile');

      if (data.advocate) {
        setMyProfile(data.advocate);
      } else {
        throw new Error('Failed to parse advocate profile from server response');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || 'Failed to load your advocate profile'
      );
    } finally {
      setMyProfileLoading(false);
    }
  }, [isAdvocateRole, user]);

  useEffect(() => {
    if (isAdvocateRole) {
      fetchMyProfile();
    } else {
      fetchDirectory();
    }
  }, [isAdvocateRole, fetchDirectory, fetchMyProfile]);

  const handleCreated = (newAdv) => {
    setBannerNotice(
      `Advocate "${newAdv.name}" enrolled successfully with Bar No. ${newAdv.barNumber}.`
    );
    fetchDirectory();
  };

  const handleUpdated = (updatedAdv) => {
    setBannerNotice(`Advocate details for "${updatedAdv.name}" updated successfully.`);
    fetchDirectory();
  };

  const handleGrantSuccess = (createdUser, adv) => {
    setBannerNotice(
      `Portal access granted for "${adv.name}" (${adv.email}). Initial password: Demo@1234.`
    );
    fetchDirectory();
  };

  // -------------------------------------------------------------
  // ADVOCATE ROLE: "MY PROFILE" VIEW
  // -------------------------------------------------------------
  if (isAdvocateRole) {
    return (
      <div className="space-y-6">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
            My Advocate Profile
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Bar Council enrollment, active vakalatnamas, and court case representations.
          </p>
        </div>

        {myProfileLoading ? (
          <div className="p-12 text-center text-gray-500 text-sm">
            Loading your advocate profile and case representations...
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        ) : myProfile ? (
          <div className="space-y-6">
            {/* Profile Overview Card */}
            <div className="registry-card rounded-lg p-6 bg-white border border-gray-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-xl bg-navy-900 text-brass-400 flex items-center justify-center font-serif text-2xl font-bold border border-brass-400/40">
                    <Scale className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="font-serif text-xl font-bold text-navy-950">{myProfile.name}</h2>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-brass-50 text-brass-800 border border-brass-200 font-semibold">
                        Bar No: {myProfile.barNumber}
                      </span>
                      <span className="text-xs text-gray-600 font-medium">
                        • {myProfile.specialization}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Enrolled Counsel
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                    Contact Email
                  </span>
                  <div className="flex items-center space-x-1.5 text-sm text-gray-800">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{myProfile.email}</span>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                    Registered Mobile
                  </span>
                  <div className="flex items-center space-x-1.5 text-sm text-gray-800">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{myProfile.phone || 'Not provided'}</span>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                    Representation Caseload
                  </span>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-serif font-bold text-navy-900">
                      {myProfile.activeCaseCount || 0}
                    </span>
                    <span className="text-xs text-gray-500">Active Cases</span>
                    <span className="text-gray-300">/</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {myProfile.totalCaseCount || 0} Total
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Representations List */}
            <div className="registry-card rounded-lg p-6 bg-white border border-gray-200 shadow-sm space-y-4">
              <h3 className="font-serif text-lg font-bold text-navy-900">
                My Case Representations ({myProfile.cases?.length || 0})
              </h3>

              {myProfile.cases?.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-gray-500 text-sm">
                  You are not currently assigned to any court cases.
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full text-xs text-left divide-y divide-gray-200">
                    <thead className="bg-gray-50 uppercase text-gray-500 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Case Number</th>
                        <th className="py-2.5 px-3">Title</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Representation Side</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Assigned Date</th>
                        <th className="py-2.5 px-3">Appearance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {myProfile.cases.map((c) => (
                        <tr key={c.caseId} className="hover:bg-gray-50">
                          <td className="py-2.5 px-3 font-mono font-semibold text-navy-800">
                            <a
                              href={`/cases/${c.caseId}`}
                              className="hover:underline flex items-center space-x-1"
                            >
                              <span>{c.caseNumber}</span>
                              <ExternalLink className="w-3 h-3 text-gray-400" />
                            </a>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-navy-950 max-w-xs truncate">
                            {c.title}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">{c.caseType}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`font-semibold uppercase px-2 py-0.5 rounded text-[10px] ${
                                c.side === 'PETITIONER'
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : 'bg-purple-50 text-purple-800 border border-purple-200'
                              }`}
                            >
                              {c.side}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-800">
                              {c.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                            {new Date(c.assignedAt).toLocaleDateString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3">
                            {c.isActive ? (
                              <span className="text-emerald-700 font-semibold">Active Counsel</span>
                            ) : (
                              <span className="text-gray-400 italic">Withdrawn</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // -------------------------------------------------------------
  // REGISTRY / JUDICIAL ROLE: FULL DIRECTORY VIEW
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
            Advocate Directory
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Bar Council enrollment records, practice specializations, and party representation
            caseloads.
          </p>
        </div>

        {can('advocate.manage') && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800 transition-colors shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 text-brass-400" />
            <span>Add Advocate</span>
          </button>
        )}
      </div>

      {/* Banner notification */}
      {bannerNotice && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{bannerNotice}</span>
          </div>
          <button
            onClick={() => setBannerNotice(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="registry-card rounded-lg p-4 bg-white border border-gray-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search Q */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by advocate name, Bar number, or email..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white"
            />
          </div>

          {/* Specialization Filter */}
          <div>
            <select
              value={specParam}
              onChange={(e) => updateParams({ specialization: e.target.value, page: 1 })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white text-gray-700"
            >
              <option value="">All Specializations</option>
              {specializations.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>

          {/* Has Login Filter */}
          <div>
            <select
              value={hasLoginParam}
              onChange={(e) => updateParams({ hasLogin: e.target.value, page: 1 })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white text-gray-700"
            >
              <option value="">All Login Accounts</option>
              <option value="true">Portal Account Linked</option>
              <option value="false">Unlinked / No Portal Account</option>
            </select>
          </div>
        </div>

        {/* Clear Filters indicator */}
        {(qParam || specParam || hasLoginParam) && (
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
            <span>Filtering by active parameters ({total} advocates matched)</span>
            <button
              onClick={() => {
                setSearchInput('');
                setSearchParams({});
              }}
              className="text-navy-700 hover:text-navy-950 font-medium underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Directory Table */}
      <div className="registry-card rounded-lg bg-white border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-gray-500 text-sm flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-navy-600" />
            <span>Loading advocate records...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 text-sm">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-500" />
            <span>{error}</span>
          </div>
        ) : advocates.length === 0 ? (
          <div className="p-16 text-center text-gray-500 text-sm">
            <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="font-semibold text-gray-700">No advocates found</p>
            <p className="text-xs text-gray-500 mt-1">
              Try adjusting your search criteria or register a new advocate.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left divide-y divide-gray-200">
              <thead className="bg-gray-50 uppercase text-gray-600 font-semibold tracking-wider">
                <tr>
                  <th className="py-3 px-4">Bar Council Roll</th>
                  <th className="py-3 px-4">Advocate Name</th>
                  <th className="py-3 px-4">Practice Domain</th>
                  <th className="py-3 px-4">Contact Details</th>
                  <th className="py-3 px-4 text-center">Active Cases</th>
                  <th className="py-3 px-4">Portal Account</th>
                  {can('advocate.manage') && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {advocates.map((adv) => (
                  <tr
                    key={adv.id}
                    onClick={() => setDetailAdvocateId(adv.id)}
                    className="hover:bg-navy-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-navy-900 whitespace-nowrap">
                      {adv.barNumber}
                    </td>
                    <td className="py-3 px-4 font-semibold text-navy-950 whitespace-nowrap">
                      {adv.name}
                    </td>
                    <td className="py-3 px-4 text-gray-700">{adv.specialization}</td>
                    <td className="py-3 px-4 text-gray-600">
                      <div>{adv.email}</div>
                      {adv.phone && <div className="text-[11px] text-gray-400">{adv.phone}</div>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-semibold text-xs bg-navy-50 text-navy-800 border border-navy-200">
                        {adv.activeCaseCount}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {adv.hasLogin ? (
                        adv.loginActive ? (
                          <span className="inline-flex items-center text-emerald-700 font-medium text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-amber-700 font-medium text-[11px]">
                            <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                            Inactive
                          </span>
                        )
                      ) : can('user.manage') ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGrantingAdvocate(adv);
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-navy-900 text-white hover:bg-navy-800 transition-all shadow-xs"
                          title={`Grant portal access for ${adv.name}`}
                        >
                          <KeyRound className="w-3 h-3 text-brass-400" />
                          <span>Grant Access</span>
                        </button>
                      ) : (
                        <span className="text-gray-400 text-[11px]">Unlinked</span>
                      )}
                    </td>
                    {can('advocate.manage') && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingAdvocate(adv);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-navy-700 hover:text-navy-950 hover:bg-gray-100 rounded transition-colors inline-flex items-center space-x-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && total > 0 && (
          <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-600 gap-2">
            <span>
              Showing {(pageParam - 1) * pageSizeParam + 1} to{' '}
              {Math.min(pageParam * pageSizeParam, total)} of {total} advocates
            </span>
            <div className="flex items-center space-x-2">
              <button
                disabled={pageParam <= 1}
                onClick={() => updateParams({ page: pageParam - 1 })}
                className="px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-gray-700">
                Page {pageParam} of {totalPages}
              </span>
              <button
                disabled={pageParam >= totalPages}
                onClick={() => updateParams({ page: pageParam + 1 })}
                className="px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Advocate Modal */}
      <AddAdvocateModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={handleCreated}
        specializations={specializations}
      />

      {/* Edit Advocate Modal */}
      <EditAdvocateModal
        isOpen={!!editingAdvocate}
        onClose={() => setEditingAdvocate(null)}
        onSuccess={handleUpdated}
        advocate={editingAdvocate}
        specializations={specializations}
      />

      {/* Advocate Detail Modal */}
      <AdvocateDetailModal
        isOpen={!!detailAdvocateId}
        onClose={() => setDetailAdvocateId(null)}
        advocateId={detailAdvocateId}
        onEdit={(adv) => setEditingAdvocate(adv)}
      />

      {/* Grant Advocate Access Modal */}
      <GrantAdvocateAccessModal
        isOpen={!!grantingAdvocate}
        onClose={() => setGrantingAdvocate(null)}
        advocate={grantingAdvocate}
        onSuccess={handleGrantSuccess}
      />
    </div>
  );
}
