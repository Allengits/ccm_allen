import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Forbidden() {
  const { user } = useAuth();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-16 h-16 rounded-full bg-red-50 text-red-700 flex items-center justify-center mb-4 border border-red-200">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h1 className="font-serif text-3xl font-bold text-navy-900 mb-2">403 - Access Denied</h1>
      <p className="text-sm text-gray-600 max-w-md mb-2">
        You do not possess the required judicial permissions to access this division or module.
      </p>
      {user && (
        <p className="text-xs text-gray-500 mb-6 font-mono bg-gray-100 px-3 py-1 rounded">
          Current Role: <span className="font-semibold text-navy-900">{user.role}</span>
        </p>
      )}
      <Link
        to="/"
        className="inline-flex items-center space-x-2 px-4 py-2 bg-navy-900 text-white rounded-md text-sm font-medium hover:bg-navy-800 transition-colors shadow-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Dashboard</span>
      </Link>
    </div>
  );
}
