/**
 * Case Lifecycle Workflow Service
 *
 * Provides central, reusable state machine transitions and audit logging
 * for court cases across all system phases:
 *
 * Full Lifecycle Transition Map:
 * ┌────────────────────┬───────────────────────────────────────┬──────────────────────────────────────────┐
 * │ Current Status     │ Permitted Target Statuses             │ Business Trigger / Rule                  │
 * ├────────────────────┼───────────────────────────────────────┼──────────────────────────────────────────┤
 * │ REGISTERED         │ ADVOCATE_ASSIGNED                     │ First active advocate assigned (Phase 5) │
 * │ ADVOCATE_ASSIGNED  │ REGISTERED, HEARING_SCHEDULED         │ Unassign last advocate -> REGISTERED;    │
 * │                    │                                       │ Schedule first hearing -> SCHEDULED (P6) │
 * │ HEARING_SCHEDULED  │ UNDER_TRIAL, ADVOCATE_ASSIGNED        │ First hearing completed -> UNDER_TRIAL;  │
 * │                    │                                       │ All hearings cancelled/adjourned ->      │
 * │                    │                                       │ ADVOCATE_ASSIGNED (Phase 6)              │
 * │ UNDER_TRIAL        │ JUDGMENT_RESERVED                     │ Reserve judgment after trial (Phase 7)   │
 * │ JUDGMENT_RESERVED  │ CLOSED                                │ Pronounce/deliver final decree (Phase 7) │
 * │ CLOSED             │ [] (Terminal / Permanently Read-Only) │ Delivered cases are immutable (Phase 7)  │
 * └────────────────────┴───────────────────────────────────────┴──────────────────────────────────────────┘
 */

export class WorkflowError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'WorkflowError';
    this.statusCode = statusCode;
  }
}

export const ALLOWED_TRANSITIONS = {
  REGISTERED: ['ADVOCATE_ASSIGNED'],
  ADVOCATE_ASSIGNED: ['REGISTERED', 'HEARING_SCHEDULED'],
  HEARING_SCHEDULED: ['UNDER_TRIAL', 'ADVOCATE_ASSIGNED'],
  UNDER_TRIAL: ['JUDGMENT_RESERVED'],
  JUDGMENT_RESERVED: ['CLOSED'],
  CLOSED: [],
};

/**
 * Validates and executes an atomic case status transition within a Prisma transaction,
 * updating the case record and recording an immutable CaseStatusHistory audit row.
 *
 * @param {object} params
 * @param {object} params.tx - Active Prisma transaction client
 * @param {string} params.caseId - ID of the case undergoing status transition
 * @param {string} params.toStatus - Target CaseStatus enum
 * @param {string} params.reason - Mandatory explanation for the transition
 * @param {string} params.userId - User ID of the staff/judge authorizing the change
 * @param {Date} [params.closedAt] - Optional specific closedAt timestamp for CLOSED transition
 * @returns {Promise<object>} The updated case record
 */
export async function transitionCaseStatus({ tx, caseId, toStatus, reason, userId, closedAt }) {
  if (!tx) {
    throw new WorkflowError('A database transaction client is required for case transitions', 500);
  }
  if (!caseId) {
    throw new WorkflowError('Case ID is required', 400);
  }
  if (!toStatus) {
    throw new WorkflowError('Target status is required', 400);
  }
  if (!reason || !reason.trim()) {
    throw new WorkflowError('A reason is required for status transitions', 400);
  }
  if (!userId) {
    throw new WorkflowError('Authorizing user ID is required', 400);
  }

  const currentCase = await tx.case.findUnique({
    where: { id: caseId },
    select: { id: true, status: true, caseNumber: true },
  });

  if (!currentCase) {
    throw new WorkflowError('Case not found', 404);
  }

  const fromStatus = currentCase.status;

  // No-op if target status is identical to current
  if (fromStatus === toStatus) {
    return currentCase;
  }

  const allowedNextStatuses = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowedNextStatuses.includes(toStatus)) {
    throw new WorkflowError(
      `Invalid status transition from ${fromStatus} to ${toStatus} for case ${currentCase.caseNumber}`,
      400
    );
  }

  // Update Case status and closedAt if terminal
  const updatedCase = await tx.case.update({
    where: { id: caseId },
    data: {
      status: toStatus,
      ...(toStatus === 'CLOSED' ? { closedAt: closedAt || new Date() } : {}),
      ...(fromStatus === 'CLOSED' && toStatus !== 'CLOSED' ? { closedAt: null } : {}),
    },
  });

  // Write immutable audit trail in CaseStatusHistory
  await tx.caseStatusHistory.create({
    data: {
      caseId,
      fromStatus,
      toStatus,
      reason: reason.trim(),
      changedById: userId,
    },
  });

  return updatedCase;
}
