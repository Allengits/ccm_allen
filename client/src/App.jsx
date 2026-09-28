import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import CaseDetail from './pages/CaseDetail';
import Hearings from './pages/Hearings';
import Advocates from './pages/Advocates';
import Evidence from './pages/Evidence';
import Judgments from './pages/Judgments';
import Users from './pages/Users';
import Account from './pages/Account';
import Login from './pages/Login';
import Forbidden from './pages/Forbidden';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication Route */}
          <Route path="/login" element={<Login />} />
          <Route path="/forbidden" element={<Forbidden />} />

          {/* Protected Routes enclosed within AppLayout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="cases" element={<Cases />} />
              <Route path="cases/:id" element={<CaseDetail />} />
              <Route
                path="hearings"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'REGISTRAR', 'JUDGE']}>
                    <Hearings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="advocates"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE']}>
                    <Advocates />
                  </ProtectedRoute>
                }
              />
              <Route path="evidence" element={<Evidence />} />
              <Route
                path="judgments"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'JUDGE']}>
                    <Judgments />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <Users />
                  </ProtectedRoute>
                }
              />
              <Route path="account" element={<Account />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
