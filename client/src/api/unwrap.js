/**
 * Central API Response Unwrapping Helper
 *
 * Enforces the Court CMS client convention:
 * 1. The Axios interceptor (client/src/api/axios.js) returns the JSON response body:
 *    { success: boolean, message: string, data: any, errors?: string[] }
 * 2. Calling code uses `unwrap(res)` to validate success and extract `res.data`.
 * 3. If success is false or the response is invalid, an Error is thrown with the server's message.
 *
 * This eliminates dual-shape parsing and prevents false empty states.
 */

export function unwrap(res, fallbackMessage = 'Request failed') {
  if (!res) {
    throw new Error(fallbackMessage);
  }

  // Explicit failure envelope from server
  if (res.success === false) {
    const errorMsg =
      res.message ||
      (Array.isArray(res.errors) && res.errors.length > 0 ? res.errors[0] : null) ||
      fallbackMessage;
    throw new Error(errorMsg);
  }

  // Standard envelope: { success: true, message, data }
  if (res.data !== undefined) {
    return res.data;
  }

  // Direct payload fallback
  return res;
}

export default unwrap;
