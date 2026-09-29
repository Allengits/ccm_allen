import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Landmark, Clock, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const formattedDate = currentTime.toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = currentTime.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-sm flex-shrink-0">
      {/* Court Title & Jurisdiction */}
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-navy-50 text-navy-900 rounded border border-navy-100 hidden sm:flex">
          <Landmark className="w-5 h-5 text-brass-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-navy-900 leading-tight">
            District & Sessions Judicial Court Complex
          </h2>
          <p className="text-xs text-gray-500">
            National E-Courts Case Allocation & Tracking Portal
          </p>
        </div>
      </div>

      {/* Right Controls: Clock, User Profile & Logout */}
      <div className="flex items-center space-x-4">
        {/* Clock */}
        <div className="hidden lg:flex items-center space-x-2 text-xs font-mono text-gray-600 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
          <Clock className="w-3.5 h-3.5 text-navy-700" />
          <span>{formattedDate}</span>
          <span className="text-gray-300">|</span>
          <span className="font-semibold text-navy-900">{formattedTime} IST</span>
        </div>

        {/* Authenticated User Status */}
        {user && (
          <div className="flex items-center space-x-3 pl-3 border-l border-gray-200">
            <Link
              to="/account"
              className="flex items-center space-x-2.5 p-1 rounded-md hover:bg-gray-50 transition-colors"
              title="View Account Details"
            >
              <div className="w-8 h-8 rounded-full bg-navy-900 text-brass-300 flex items-center justify-center font-serif font-bold text-xs shadow-inner">
                {user.name.charAt(0)}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold text-navy-900 leading-tight">{user.name}</div>
                <div className="text-[10px] text-brass-700 font-semibold uppercase tracking-wider">
                  {user.role}
                </div>
              </div>
            </Link>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
              title="Sign Out of Session"
              aria-label="Sign Out of Session"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
