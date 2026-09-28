import axios from 'axios';

/**
 * Pre-configured Axios instance.
 * Automatically sends cookies with credentials and proxies via Vite dev server.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 10000,
});

// Response interceptor to normalize error handling and handle session expiration
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const isAuthRoute =
      error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/me');

    // On 401 for protected business routes, notify user and redirect to login
    if (error.response?.status === 401 && !isAuthRoute) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?notice=session_expired&from=${currentPath}`;
      }
    }

    const customError = {
      message: error.response?.data?.message || error.message || 'Network error occurred',
      errors: error.response?.data?.errors || [error.message],
      status: error.response?.status,
      data: error.response?.data,
    };
    return Promise.reject(customError);
  }
);

export default api;
