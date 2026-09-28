import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { unwrap } from '../api/unwrap';
import { useAuth } from '../context/AuthContext';
import {
  UserPlus,
  Search,
  KeyRound,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-react';

const ROLES = ['ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE'];

export default function Users() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [toast, setToast] = useState(null);

  // Dialog states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'REGISTRAR',
    password: 'Password@2026',
    isActive: true,
  });
  const [resetPasswordVal, setResetPasswordVal] = useState('Demo@1234');
  const [formErrors, setFormErrors] = useState([]);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (roleFilter) params.role = roleFilter;

      const res = await api.get('/users', { params });
      const data = unwrap(res);
      const userList = data?.users || [];
      setUsers(Array.isArray(userList) ? userList : []);
    } catch (err) {
      showToast(err.message || 'Failed to fetch users', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Create User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormErrors([]);
    setFormSubmitting(true);

    try {
      await api.post('/users', {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        password: formData.password,
      });

      showToast(`User ${formData.email} created successfully`);
      setShowCreateModal(false);
      setFormData({
        name: '',
        email: '',
        role: 'REGISTRAR',
        password: 'Password@2026',
        isActive: true,
      });
      fetchUsers();
    } catch (err) {
      setFormErrors(err.errors || [err.message]);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Edit User
  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormErrors([]);
    setFormSubmitting(true);

    try {
      await api.patch(`/users/${selectedUser.id}`, {
        name: formData.name,
        role: formData.role,
        isActive: formData.isActive,
      });

      showToast(`User ${selectedUser.email} updated successfully`);
      setShowEditModal(false);
      fetchUsers();
    } catch (err) {
      setFormErrors(err.errors || [err.message]);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Reset Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormErrors([]);
    setFormSubmitting(true);

    try {
      await api.post(`/users/${selectedUser.id}/reset-password`, {
        newPassword: resetPasswordVal,
      });

      showToast(`Password for ${selectedUser.email} reset to "${resetPasswordVal}"`);
      setShowResetModal(false);
    } catch (err) {
      setFormErrors(err.errors || [err.message]);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle active state quick action
  const handleToggleActive = async (u) => {
    if (u.id === currentUser?.id) {
      showToast('Administrators cannot deactivate their own account', 'error');
      return;
    }

    try {
      await api.patch(`/users/${u.id}`, {
        isActive: !u.isActive,
      });
      showToast(`User ${u.email} ${!u.isActive ? 'activated' : 'deactivated'}`);
      fetchUsers();
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    }
  };

  const openEditModal = (u) => {
    setSelectedUser(u);
    setFormData({
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
    });
    setFormErrors([]);
    setShowEditModal(true);
  };

  const openResetModal = (u) => {
    setSelectedUser(u);
    setResetPasswordVal('Demo@1234');
    setFormErrors([]);
    setShowResetModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-2 text-sm font-medium ${
            toast.type === 'error'
              ? 'bg-red-900 text-white'
              : 'bg-navy-900 text-brass-300 border border-brass-500/40'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
            User Administration & Personnel Directory
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Authorize court personnel, manage role-based credentials, and configure advocate
            linkages.
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({
              name: '',
              email: '',
              role: 'REGISTRAR',
              password: 'Password@2026',
              isActive: true,
            });
            setFormErrors([]);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-sm font-medium hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brass-500 shadow-sm transition-all"
        >
          <UserPlus className="w-4 h-4 text-brass-400" />
          <span>Onboard New User</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by user name or official email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
          />
        </div>
        <div className="w-full sm:w-56">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
          >
            <option value="">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchUsers}
          className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600"
          title="Refresh User List"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Users Table */}
      <div className="registry-card rounded-lg overflow-hidden border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead className="bg-navy-900 text-white uppercase tracking-wider font-semibold">
              <tr>
                <th scope="col" className="px-5 py-3.5">
                  Personnel Details
                </th>
                <th scope="col" className="px-5 py-3.5">
                  Assigned Role
                </th>
                <th scope="col" className="px-5 py-3.5">
                  Specialization / Bar ID
                </th>
                <th scope="col" className="px-5 py-3.5">
                  Status
                </th>
                <th scope="col" className="px-5 py-3.5 text-right">
                  Administrative Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    Loading personnel records...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    No users matching the specified search criteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-navy-950 text-sm">{u.name}</div>
                        <div className="text-gray-500 font-mono mt-0.5">{u.email}</div>
                        {isCurrent && (
                          <span className="inline-block mt-1 text-[10px] bg-brass-100 text-brass-800 px-1.5 py-0.5 rounded font-semibold">
                            (Your Account)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-100 text-purple-900 border border-purple-200'
                              : u.role === 'JUDGE'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : u.role === 'REGISTRAR'
                                  ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {u.advocateBarNumber ? (
                          <div>
                            <span className="font-mono text-xs font-semibold text-navy-900">
                              {u.advocateBarNumber}
                            </span>
                            <div className="text-[10px] text-gray-500 truncate max-w-xs">
                              {u.advocateSpecialization}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Not applicable</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                            u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {u.isActive ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-600" />
                          )}
                          <span>{u.isActive ? 'Active' : 'Deactivated'}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className="px-2.5 py-1 text-xs font-medium text-navy-800 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="w-3.5 h-3.5 inline mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => openResetModal(u)}
                          className="px-2.5 py-1 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 rounded border border-amber-300 transition-colors"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5 inline mr-1" />
                          Reset
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={isCurrent}
                          className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                            u.isActive
                              ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                          }`}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl border border-gray-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-serif text-lg font-bold text-navy-950">Onboard New Personnel</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formErrors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs space-y-1">
                {formErrors.map((err, i) => (
                  <div key={i} className="flex items-center space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-navy-900 uppercase">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Ramesh Chandra"
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-navy-900 uppercase">
                  Official Email
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. r.chandra@courtcms.gov.in"
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-navy-900 uppercase">Assigned Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-navy-900 uppercase">
                  Initial Password
                </label>
                <input
                  type="text"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm font-mono focus:ring-brass-500 focus:border-brass-500"
                />
                <span className="text-[11px] text-gray-500">
                  Minimum 8 characters with at least one letter and one number.
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-navy-900 text-white rounded text-sm font-medium hover:bg-navy-800 disabled:opacity-50"
                >
                  {formSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl border border-gray-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-serif text-lg font-bold text-navy-950">
                Modify User Details: {selectedUser.email}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formErrors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs space-y-1">
                {formErrors.map((err, i) => (
                  <div key={i} className="flex items-center space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleEditUser} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-navy-900 uppercase">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-navy-900 uppercase">Role</label>
                <select
                  value={formData.role}
                  disabled={selectedUser.id === currentUser?.id}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm focus:ring-brass-500 focus:border-brass-500 disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {selectedUser.id === currentUser?.id && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    You cannot change or demote your own administrative role.
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  disabled={selectedUser.id === currentUser?.id}
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded text-navy-900 focus:ring-brass-500 h-4 w-4"
                />
                <label htmlFor="isActiveToggle" className="font-semibold text-navy-900">
                  Account is Active
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-navy-900 text-white rounded text-sm font-medium hover:bg-navy-800 disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving...' : 'Update Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {showResetModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-serif text-lg font-bold text-navy-950">
                Administrative Password Reset
              </h3>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-gray-600">
              Set a temporary password for <strong>{selectedUser.name}</strong> (
              {selectedUser.email}):
            </p>

            {formErrors.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs space-y-1">
                {formErrors.map((err, i) => (
                  <div key={i} className="flex items-center space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-navy-900 uppercase">
                  New Temporary Password
                </label>
                <input
                  type="text"
                  required
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm font-mono focus:ring-brass-500 focus:border-brass-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-amber-800 text-white rounded text-sm font-medium hover:bg-amber-900 disabled:opacity-50"
                >
                  {formSubmitting ? 'Resetting...' : 'Confirm Password Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
