import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Scale, Lock, Mail, Eye, EyeOff, AlertCircle, Info, ShieldCheck } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { role: 'ADMIN', label: 'Admin', email: 'admin@courtcms.gov.in', desc: 'Full System Access' },
  {
    role: 'REGISTRAR',
    label: 'Registrar',
    email: 'registrar@courtcms.gov.in',
    desc: 'Filing & Scheduling',
  },
  {
    role: 'JUDGE',
    label: 'Judge',
    email: 'judge.swaminathan@courtcms.gov.in',
    desc: 'Trials & Judgments',
  },
  {
    role: 'ADVOCATE',
    label: 'Advocate',
    email: 'adv.mehta@courtcms.gov.in',
    desc: 'Case Representation',
  },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const returnUrl = queryParams.get('from') ? decodeURIComponent(queryParams.get('from')) : '/';
  const sessionExpiredNotice = queryParams.get('notice') === 'session_expired';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email address and password.');
      return;
    }

    try {
      setLoading(true);
      await login(email.trim(), password);
      navigate(returnUrl, { replace: true });
    } catch (err) {
      if (err.status === 429) {
        setErrorMessage(
          'Too many login attempts. For security reasons, this IP address is temporarily locked. Please try again after 15 minutes.'
        );
      } else {
        setErrorMessage(err.message || 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('Demo@1234');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Judicial Emblem & Portal Header */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-xl bg-navy-900 border-2 border-brass-500/40 flex items-center justify-center text-brass-400 shadow-lg">
            <Scale className="w-8 h-8" />
          </div>
        </div>
        <h1 className="mt-4 text-center font-serif text-2xl font-bold tracking-tight text-navy-950 sm:text-3xl">
          Court Case Management
        </h1>
        <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-brass-700">
          Judicial Registry & Allocation Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-md rounded-lg sm:px-10 border border-gray-200 legal-border">
          {sessionExpiredNotice && (
            <div className="mb-5 p-3 rounded-md bg-amber-50 border border-amber-200 flex items-start space-x-2 text-amber-800 text-xs">
              <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>Your previous session has expired. Please log in again to continue.</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-5 p-3 rounded-md bg-red-50 border border-red-200 flex items-start space-x-2 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-navy-900 uppercase tracking-wide"
              >
                Court Official / Advocate Email
              </label>
              <div className="mt-1.5 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@courtcms.gov.in"
                  className="block w-full pl-9 pr-3 py-2 sm:text-sm border border-gray-300 rounded-md focus:ring-brass-500 focus:border-brass-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-navy-900 uppercase tracking-wide"
              >
                Secret Access Password
              </label>
              <div className="mt-1.5 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-9 pr-10 py-2 sm:text-sm border border-gray-300 rounded-md focus:ring-brass-500 focus:border-brass-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brass-500 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Authenticating Credentials...' : 'Sign In to Judicial Portal'}
              </button>
            </div>
          </form>

          {/* Development Quick-Fill Shortcuts (Rendered strictly in development mode) */}
          {import.meta.env.DEV && (
            <div className="mt-6 pt-5 border-t border-gray-200">
              <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-brass-700 mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Demo Account Shortcuts (Dev Mode Only)</span>
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                Click a role below to fill demo credentials (Password: <code>Demo@1234</code>):
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.role}
                    type="button"
                    onClick={() => handleQuickFill(acc.email)}
                    className="p-2 text-left bg-gray-50 hover:bg-brass-50/60 border border-gray-200 hover:border-brass-300 rounded text-xs transition-colors"
                  >
                    <div className="font-semibold text-navy-900">{acc.label}</div>
                    <div className="text-[10px] text-gray-500 truncate">{acc.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
