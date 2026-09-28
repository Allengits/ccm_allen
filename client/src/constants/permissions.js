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
  HEARING_SCHEDULE: 'hearing.schedule',
  HEARING_UPDATE: 'hearing.update',
  EVIDENCE_SUBMIT: 'evidence.submit',
  EVIDENCE_REVIEW: 'evidence.review',
  JUDGMENT_RECORD: 'judgment.record',
  JUDGMENT_DELIVER: 'judgment.deliver',
  USER_MANAGE: 'user.manage',
  DASHBOARD_VIEW: 'dashboard.view',
};

export const ROLE_PERMISSIONS = {
  ADMIN: [
    PERMISSIONS.CASE_CREATE,
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.CASE_EDIT,
    PERMISSIONS.ADVOCATE_VIEW,
    PERMISSIONS.ADVOCATE_MANAGE,
    PERMISSIONS.ADVOCATE_ASSIGN,
    PERMISSIONS.HEARING_SCHEDULE,
    PERMISSIONS.HEARING_UPDATE,
    PERMISSIONS.EVIDENCE_SUBMIT,
    PERMISSIONS.EVIDENCE_REVIEW,
    PERMISSIONS.JUDGMENT_RECORD,
    PERMISSIONS.JUDGMENT_DELIVER,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  REGISTRAR: [
    PERMISSIONS.CASE_CREATE,
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.CASE_EDIT,
    PERMISSIONS.ADVOCATE_VIEW,
    PERMISSIONS.ADVOCATE_MANAGE,
    PERMISSIONS.ADVOCATE_ASSIGN,
    PERMISSIONS.HEARING_SCHEDULE,
    PERMISSIONS.EVIDENCE_SUBMIT,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  JUDGE: [
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.ADVOCATE_VIEW,
    PERMISSIONS.HEARING_UPDATE,
    PERMISSIONS.EVIDENCE_REVIEW,
    PERMISSIONS.JUDGMENT_RECORD,
    PERMISSIONS.JUDGMENT_DELIVER,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  ADVOCATE: [PERMISSIONS.CASE_VIEW, PERMISSIONS.EVIDENCE_SUBMIT, PERMISSIONS.DASHBOARD_VIEW],
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
