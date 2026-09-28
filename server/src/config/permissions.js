/**
 * Central Permission Matrix & Access Control Definitions
 *
 * Implements granular role-based permissions and reusable Prisma query filters.
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
    PERMISSIONS.HEARING_VIEW,
    PERMISSIONS.HEARING_SCHEDULE,
    PERMISSIONS.HEARING_UPDATE,
    PERMISSIONS.JUDGMENT_VIEW,
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
    PERMISSIONS.HEARING_VIEW,
    PERMISSIONS.HEARING_SCHEDULE,
    PERMISSIONS.JUDGMENT_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  JUDGE: [
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.ADVOCATE_VIEW,
    PERMISSIONS.HEARING_VIEW,
    PERMISSIONS.HEARING_UPDATE,
    PERMISSIONS.JUDGMENT_VIEW,
    PERMISSIONS.JUDGMENT_RECORD,
    PERMISSIONS.JUDGMENT_DELIVER,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
  ADVOCATE: [
    PERMISSIONS.CASE_VIEW,
    PERMISSIONS.HEARING_VIEW,
    PERMISSIONS.JUDGMENT_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
  ],
};

/**
 * Checks whether a given role possesses a specific permission.
 * @param {string} role - The user's role (ADMIN, REGISTRAR, JUDGE, ADVOCATE)
 * @param {string} permission - The permission string to check
 * @returns {boolean}
 */
export const hasPermission = (role, permission) => {
  if (!role || !ROLE_PERMISSIONS[role]) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
};

/**
 * Express middleware to enforce permission on a route.
 * Requires `authenticate` middleware to have run previously.
 * @param {string} permission - The permission required to access the endpoint
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Authentication required',
        errors: ['Authentication required'],
      });
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient permissions',
        errors: [`Role '${req.user.role}' lacks required permission '${permission}'`],
      });
    }

    next();
  };
};

/**
 * Express middleware to enforce at least one of multiple permissions on a route.
 * @param {string[]} permissions - Array of permission strings
 */
export const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Authentication required',
        errors: ['Authentication required'],
      });
    }

    const hasAny = permissions.some((p) => hasPermission(req.user.role, p));
    if (!hasAny) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient permissions',
        errors: [`Role '${req.user.role}' lacks required permissions: ${permissions.join(', ')}`],
      });
    }

    next();
  };
};

/**
 * Case visibility filter helper returning a Prisma `where` clause for the Case model.
 * - ADMIN & REGISTRAR: See all cases
 * - JUDGE: Sees only cases where judgeId equals their user ID
 * - ADVOCATE: Sees only cases linked to their advocate profile via an active CaseAdvocate row
 *
 * @param {Object} user - The authenticated user object (must include id, role, and optionally advocateId)
 * @returns {Object} Prisma Case where clause
 */
export const caseVisibilityFilter = (user) => {
  if (!user) {
    return { id: '__UNAUTHORIZED_NO_ACCESS__' };
  }

  switch (user.role) {
    case 'ADMIN':
    case 'REGISTRAR':
      return {};

    case 'JUDGE':
      return { judgeId: user.id };

    case 'ADVOCATE': {
      const advocateId = user.advocateId || user.advocateProfile?.id;
      if (!advocateId) {
        return { id: '__UNLINKED_ADVOCATE_NO_CASES__' };
      }
      return {
        advocates: {
          some: {
            advocateId: advocateId,
            isActive: true,
          },
        },
      };
    }

    default:
      return { id: '__UNKNOWN_ROLE_NO_ACCESS__' };
  }
};
