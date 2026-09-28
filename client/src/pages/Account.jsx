import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Account() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setErrorMessage('New password must contain at least one letter and one number.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setErrorMessage('New password cannot be the same as your current password.');
      return;
    }

    try {
      setLoading(true);
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      setSuccessMessage('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="pb-4 border-b border-gray-200">
        <h1 className="font-serif text-3xl font-bold text-navy-900 tracking-tight">
          Account Settings & Security
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage your judicial credentials, profile metadata, and security settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="registry-card rounded-lg p-6 legal-border md:col-span-1 space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-navy-900 text-brass-300 flex items-center justify-center font-serif font-bold text-lg shadow-sm">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div>
              <h2 className="text-base font-bold text-navy-900 leading-tight">{user?.name}</h2>
              <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-navy-100 text-navy-800">
                {user?.role}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 space-y-2 text-xs">
            <div>
              <span className="text-gray-400 font-semibold uppercase block">Official Email</span>
              <span className="text-navy-950 font-medium">{user?.email}</span>
            </div>
            <div>
              <span className="text-gray-400 font-semibold uppercase block">Account State</span>
              <span className="text-emerald-700 font-semibold">Active & Verified</span>
            </div>
            {user?.advocateBarNumber && (
              <div>
                <span className="text-gray-400 font-semibold uppercase block">Bar Council ID</span>
                <span className="text-brass-800 font-mono font-medium">
                  {user.advocateBarNumber}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Change Password Form */}
        <div className="registry-card rounded-lg p-6 md:col-span-2 space-y-5">
          <div className="flex items-center space-x-2 text-navy-900 font-serif text-lg font-bold border-b border-gray-100 pb-3">
            <KeyRound className="w-5 h-5 text-brass-600" />
            <span>Update Secret Password</span>
          </div>

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center space-x-2 text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center space-x-2 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-navy-900 uppercase">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-900 uppercase">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters with letter & number"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Must contain at least 8 characters, including at least one letter and one number.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-900 uppercase">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-brass-500 focus:border-brass-500"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-navy-900 text-white rounded-md text-sm font-semibold hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brass-500 disabled:opacity-50 transition-colors shadow-sm"
              >
                {loading ? 'Changing Password...' : 'Save New Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
