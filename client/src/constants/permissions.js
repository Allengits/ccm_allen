/**
 * Frontend Permission Matrix & Access Helpers
 * Mirrors the server authority matrix for UI presentation and conditional rendering.
 */

export const PERMISSIONS = {
  CASE_CREATE: 'case.create',
  CASE_VIEW: 'case.view',
  CASE_EDIT: 'case.edit',
  ADVOCATE_VIEW: 'advocate.view',
  ADVOCATE_MANAGE: 'advocate.manage',
  ADVOCATE_ASSIGN: 'advocate.assign',
  HEARING_VIEW: 'hearing.view',
  HEARING_SCHEDULE: 'hearing.schedule',
  HEARING_UPDATE: 'hearing.update',
  JUDGMENT_VIEW: 'judgment.view',
  JUDGMENT_RECORD: 'judgment.record',
  JUDGMENT_DELIVER: 'judgment.deliver',
  USER_MANAGE: 'user.manage',
  DASHBOARD_VIEW_ALL: 'dashboard.view.all',
  DASHBOARD_VIEW_OWN: 'dashboard.view.own',
};

export const ROLE_PERMISSIONS = {
  ADMIN: [
    PERMISSIONS.CASE_CREATE,
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.CASE_EDIT,
    PERMISSIONS.ADVOCATE_VIEW,
    PERMISSIONS.ADVOCATE_MANAGE,
    PERMISSIONS.ADVOCATE_ASSIGN,
    PERMISSIONS.HEARING_VIEW,
    PERMISSIONS.HEARING_SCHEDULE,
    PERMISSIONS.HEARING_UPDATE,
    PERMISSIONS.JUDGMENT_VIEW,
    PERMISSIONS.JUDGMENT_RECORD,
    PERMISSIONS.JUDGMENT_DELIVER,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.DASHBOARD_VIEW_ALL,
  ],
  REGISTRAR: [
    PERMISSIONS.CASE_CREATE,
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.CASE_EDIT,
    PERMISSIONS.ADVOCATE_VIEW,
    PERMISSIONS.ADVOCATE_MANAGE,
    PERMISSIONS.ADVOCATE_ASSIGN,
    PERMISSIONS.HEARING_VIEW,
    PERMISSIONS.HEARING_SCHEDULE,
    PERMISSIONS.JUDGMENT_VIEW,
    PERMISSIONS.DASHBOARD_VIEW_ALL,
  ],
  JUDGE: [
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.ADVOCATE_VIEW,
    PERMISSIONS.HEARING_VIEW,
    PERMISSIONS.HEARING_UPDATE,
    PERMISSIONS.JUDGMENT_VIEW,
    PERMISSIONS.JUDGMENT_RECORD,
    PERMISSIONS.JUDGMENT_DELIVER,
    PERMISSIONS.DASHBOARD_VIEW_ALL,
  ],
  ADVOCATE: [
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.HEARING_VIEW,
    PERMISSIONS.JUDGMENT_VIEW,
    PERMISSIONS.DASHBOARD_VIEW_OWN,
  ],
};

/**
 * Evaluates whether a user role possesses a specific permission.
 * @param {string} role - User role
 * @param {string} permission - Permission key
 * @returns {boolean}
 */
export const hasPermission = (role, permission) => {
  if (!role || !ROLE_PERMISSIONS[role]) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
};

export const ALL_VALID_PERMISSIONS = new Set(Object.values(PERMISSIONS));

/**
 * Validates whether a permission key exists in the RBAC permission schema.
 * @param {string} permission
 * @returns {boolean}
 */
export const isValidPermission = (permission) => ALL_VALID_PERMISSIONS.has(permission);
