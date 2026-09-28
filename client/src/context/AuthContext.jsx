import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { hasPermission } from '../constants/permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restore session on app initialization
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/me');
      setUser(res.data?.user || null);
      setError(null);
    } catch (err) {
      setUser(null);
      // Suppress 401 logs during initial unauthenticated check
      if (err.status !== 401) {
        setError(err.message || 'Failed to verify session');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /**
   * Logs in a user with credentials.
   * @param {string} email
   * @param {string} password
   */
  const login = async (email, password) => {
    setError(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      const loggedInUser = res.data?.user;
      setUser(loggedInUser);
      return loggedInUser;
    } catch (err) {
      setError(err.message || 'Login failed');
      throw err;
    }
  };

  /**
   * Logs out the current user and clears session cookie.
   */
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  /**
   * Checks if current user has a specific permission.
   * @param {string} permission
   * @returns {boolean}
   */
  const can = useCallback(
    (permission) => {
      if (!user) return false;
      return hasPermission(user.role, permission);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        can,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
