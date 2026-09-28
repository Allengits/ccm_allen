import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Scale } from 'lucide-react';

export default function ProtectedRoute({ allowedRoles, requiredPermission, children }) {
  const { user, loading, can } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-12 h-12 rounded-full bg-navy-50 border border-navy-200 flex items-center justify-center text-brass-600 animate-pulse">
          <Scale className="w-6 h-6" />
        </div>
        <p className="mt-4 text-sm font-medium text-navy-900 font-serif">
          Verifying Judicial Registry Credentials...
        </p>
      </div>
    );
  }

  // Not authenticated -> redirect to login with original destination
  if (!user) {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?from=${returnUrl}`} replace />;
  }

  // Role constraint verification
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  // Permission constraint verification
  if (requiredPermission && !can(requiredPermission)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children ? children : <Outlet />;
}
