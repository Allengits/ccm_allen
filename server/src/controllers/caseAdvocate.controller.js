import { z } from 'zod';
import prisma from '../db/prisma.js';
import { caseVisibilityFilter } from '../config/permissions.js';
import { transitionCaseStatus, WorkflowError } from '../services/caseWorkflow.js';

const assignAdvocateSchema = z.object({
  advocateId: z.string().uuid({ message: 'Valid advocate ID is required' }),
  side: z.enum(['PETITIONER', 'RESPONDENT'], {
    message: 'Side must be either PETITIONER or RESPONDENT',
  }),
});

const unassignAdvocateSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, { message: 'Reason must be at least 5 characters' })
    .max(500, { message: 'Reason cannot exceed 500 characters' }),
});

/**
 * POST /api/v1/cases/:id/advocates
 * Assigns an advocate to a case under PETITIONER or RESPONDENT representation.
 * All writes and status transitions occur inside a single atomic transaction.
 */
export const assignAdvocateToCase = async (req, res) => {
  try {
    const parseResult = assignAdvocateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { advocateId, side } = parseResult.data;
    const caseId = req.params.id;

    // 1. Case existence and scope check
    const targetCase = await prisma.case.findFirst({
      where: {
        id: caseId,
        ...caseVisibilityFilter(req.user),
      },
      select: { id: true, caseNumber: true, status: true },
    });

    if (!targetCase) {
      return res.status(404).json({
        success: false,
        message: 'Case not found',
        errors: ['Case not found or outside your authorized scope'],
      });
    }

    if (targetCase.status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign advocates to a closed case',
        errors: ['Case is CLOSED and cannot accept new advocate assignments'],
      });
    }

    // 2. Advocate existence and active login check
    const advocate = await prisma.advocate.findUnique({
      where: { id: advocateId },
      include: {
        user: { select: { id: true, isActive: true } },
      },
    });

    if (!advocate) {
      return res.status(404).json({
        success: false,
        message: 'Advocate not found',
        errors: ['Advocate with specified ID does not exist'],
      });
    }

    if (advocate.user && !advocate.user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Advocate account is inactive',
        errors: ['Advocate linked user account is inactive and cannot be assigned'],
      });
    }

    // 3. Execute assignment logic within an atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Fetch all existing assignments for this case
      const existingAssignments = await tx.caseAdvocate.findMany({
        where: { caseId },
      });

      // Check conflict of interest & duplicate active assignment
      const activeSameAdvocate = existingAssignments.find(
        (a) => a.advocateId === advocateId && a.isActive
      );

      if (activeSameAdvocate) {
        if (activeSameAdvocate.side !== side) {
          throw new WorkflowError(
            `Conflict of interest: Advocate ${advocate.name} is already actively representing ${activeSameAdvocate.side} on this case`,
            400
          );
        }
        throw new WorkflowError(
          `Advocate ${advocate.name} is already actively assigned to this case`,
          400
        );
      }

      // Check representation limits (max 2 active advocates per side)
      const activeOnSide = existingAssignments.filter((a) => a.isActive && a.side === side);
      if (activeOnSide.length >= 2) {
        throw new WorkflowError(
          `Maximum of 2 active advocates allowed per side (already have 2 on ${side})`,
          400
        );
      }

      // Workload warning threshold calculation
      const thresholdSetting = await tx.systemSetting.findUnique({
        where: { key: 'advocate_workload_warning_threshold' },
      });
      const threshold = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 15;

      const activeOpenCases = await tx.caseAdvocate.count({
        where: {
          advocateId,
          isActive: true,
          case: { status: { not: 'CLOSED' } },
        },
      });

      let warning = null;
      if (activeOpenCases >= threshold) {
        warning = `Advocate ${advocate.name} currently has ${activeOpenCases} active open cases, which meets or exceeds the workload threshold (${threshold}).`;
      }

      // Reactivate previous assignment or create new row
      const existingRow = existingAssignments.find((a) => a.advocateId === advocateId);
      let assignment;

      if (existingRow) {
        assignment = await tx.caseAdvocate.update({
          where: { id: existingRow.id },
          data: {
            side,
            isActive: true,
            assignedAt: new Date(),
            assignedById: req.user.id,
            unassignedAt: null,
            unassignedById: null,
            unassignReason: null,
          },
          include: {
            advocate: {
              select: {
                id: true,
                name: true,
                barNumber: true,
                specialization: true,
                email: true,
                phone: true,
              },
            },
            assignedBy: { select: { id: true, name: true, email: true } },
          },
        });
      } else {
        assignment = await tx.caseAdvocate.create({
          data: {
            caseId,
            advocateId,
            side,
            isActive: true,
            assignedAt: new Date(),
            assignedById: req.user.id,
          },
          include: {
            advocate: {
              select: {
                id: true,
                name: true,
                barNumber: true,
                specialization: true,
                email: true,
                phone: true,
              },
            },
            assignedBy: { select: { id: true, name: true, email: true } },
          },
        });
      }

      // AUTOMATION: First active advocate on REGISTERED case moves to ADVOCATE_ASSIGNED
      let statusChanged = false;
      let currentStatus = targetCase.status;

      if (targetCase.status === 'REGISTERED') {
        await transitionCaseStatus({
          tx,
          caseId,
          toStatus: 'ADVOCATE_ASSIGNED',
          reason: `Advocate ${advocate.name} assigned`,
          userId: req.user.id,
        });
        statusChanged = true;
        currentStatus = 'ADVOCATE_ASSIGNED';
      }

      return { assignment, warning, statusChanged, currentStatus };
    });

    return res.status(201).json({
      success: true,
      message: result.statusChanged
        ? `Advocate assigned successfully. Case status updated to Advocate Assigned.`
        : 'Advocate assigned successfully',
      data: {
        assignment: result.assignment,
        warning: result.warning,
        statusChanged: result.statusChanged,
        currentStatus: result.currentStatus,
      },
    });
  } catch (error) {
    if (error instanceof WorkflowError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errors: [error.message],
      });
    }

    // Handle concurrent duplicate attempts hitting Prisma unique constraint or write conflict
    if (
      error.code === 'P2002' ||
      error.code === 'P2034' ||
      error.message?.includes('Unique constraint failed') ||
      error.message?.includes('deadlock') ||
      error.message?.includes('Transaction failed')
    ) {
      return res.status(400).json({
        success: false,
        message: 'Advocate is already actively assigned to this case',
        errors: ['Concurrent assignment detected; duplicate active assignments are rejected'],
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to assign advocate to case',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/cases/:id/advocates/:advocateId/unassign
 * Unassigns an advocate from a case with mandatory audit reason.
 * If removing the last advocate on ADVOCATE_ASSIGNED case, reverts status to REGISTERED.
 */
export const unassignAdvocateFromCase = async (req, res) => {
  try {
    const parseResult = unassignAdvocateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { reason } = parseResult.data;
    const { id: caseId, advocateId } = req.params;

    // 1. Case existence and scope check
    const targetCase = await prisma.case.findFirst({
      where: {
        id: caseId,
        ...caseVisibilityFilter(req.user),
      },
      select: { id: true, caseNumber: true, status: true },
    });

    if (!targetCase) {
      return res.status(404).json({
        success: false,
        message: 'Case not found',
        errors: ['Case not found or outside your authorized scope'],
      });
    }

    if (targetCase.status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot unassign advocates from a closed case',
        errors: ['Case is CLOSED and advocate records cannot be modified'],
      });
    }

    // 2. Perform unassignment within transaction
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.caseAdvocate.findUnique({
        where: {
          caseId_advocateId: { caseId, advocateId },
        },
        include: { advocate: true },
      });

      if (!assignment || !assignment.isActive) {
        throw new WorkflowError('Advocate is not actively assigned to this case', 400);
      }

      // Check remaining active advocates on this case
      const activeAdvocates = await tx.caseAdvocate.findMany({
        where: { caseId, isActive: true },
      });

      const isLastAdvocate = activeAdvocates.length === 1;

      // If last advocate and case progressed beyond ADVOCATE_ASSIGNED, block removal
      if (isLastAdvocate && targetCase.status !== 'ADVOCATE_ASSIGNED') {
        throw new WorkflowError(
          `Cannot remove the last active advocate when case is in ${targetCase.status} status. Please assign a replacement advocate first.`,
          400
        );
      }

      // Soft unassign: update active flag and record audit fields
      const updatedAssignment = await tx.caseAdvocate.update({
        where: { id: assignment.id },
        data: {
          isActive: false,
          unassignedAt: new Date(),
          unassignedById: req.user.id,
          unassignReason: reason.trim(),
        },
        include: {
          advocate: {
            select: {
              id: true,
              name: true,
              barNumber: true,
              specialization: true,
              email: true,
              phone: true,
            },
          },
          unassignedBy: { select: { id: true, name: true, email: true } },
        },
      });

      // AUTOMATION: If removing last advocate on ADVOCATE_ASSIGNED case, revert to REGISTERED
      let statusChanged = false;
      let currentStatus = targetCase.status;

      if (isLastAdvocate && targetCase.status === 'ADVOCATE_ASSIGNED') {
        await transitionCaseStatus({
          tx,
          caseId,
          toStatus: 'REGISTERED',
          reason: reason.trim(),
          userId: req.user.id,
        });
        statusChanged = true;
        currentStatus = 'REGISTERED';
      }

      return { assignment: updatedAssignment, statusChanged, currentStatus };
    });

    return res.status(200).json({
      success: true,
      message: result.statusChanged
        ? `Advocate unassigned. All counsel removed; case status reverted to Registered.`
        : 'Advocate unassigned successfully',
      data: {
        assignment: result.assignment,
        statusChanged: result.statusChanged,
        currentStatus: result.currentStatus,
      },
    });
  } catch (error) {
    if (error instanceof WorkflowError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errors: [error.message],
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to unassign advocate from case',
      errors: [error.message],
    });
  }
};
