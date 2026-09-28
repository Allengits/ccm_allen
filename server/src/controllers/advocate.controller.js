import { z } from 'zod';
import prisma from '../db/prisma.js';
import { caseVisibilityFilter } from '../config/permissions.js';

// Basic Indian mobile and landline pattern validation
function isValidIndianPhone(phone) {
  if (!phone || !phone.trim()) return true;
  const cleaned = phone.replace(/[\s-]/g, '');
  const mobilePattern = /^(?:\+91)?[6-9]\d{9}$/;
  const landlinePattern = /^(?:\+91)?0\d{2,4}\d{6,8}$/;
  return mobilePattern.test(cleaned) || landlinePattern.test(cleaned);
}

const createAdvocateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Advocate name must be at least 2 characters' })
    .max(100, { message: 'Advocate name cannot exceed 100 characters' }),
  barNumber: z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .refine((val) => /^[A-Z0-9/-]{5,20}$/.test(val), {
      message:
        'Bar number must be 5-20 characters consisting of uppercase letters, digits, slash, or hyphen',
    }),
  specialization: z
    .string()
    .trim()
    .min(2, { message: 'Specialization is required' })
    .max(100, { message: 'Specialization cannot exceed 100 characters' }),
  email: z.string().trim().email({ message: 'A valid email address is required' }),
  phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((val) => isValidIndianPhone(val), {
      message: 'Invalid phone number format. Provide a valid Indian mobile or landline number',
    }),
});

const updateAdvocateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Advocate name must be at least 2 characters' })
    .max(100, { message: 'Advocate name cannot exceed 100 characters' })
    .optional(),
  specialization: z
    .string()
    .trim()
    .min(2, { message: 'Specialization cannot be empty' })
    .max(100, { message: 'Specialization cannot exceed 100 characters' })
    .optional(),
  email: z.string().trim().email({ message: 'A valid email address is required' }).optional(),
  phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((val) => isValidIndianPhone(val), {
      message: 'Invalid phone number format. Provide a valid Indian mobile or landline number',
    }),
});

/**
 * GET /api/v1/advocates
 * Returns paginated directory of registered advocates with search and filters.
 * No N+1 queries: performs batch aggregation for active and total case counts.
 */
export const getAdvocates = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, q, specialization, hasLogin } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 10));

    // Construct filter predicate
    const where = {};

    if (q && q.trim()) {
      const searchTerm = q.trim();
      where.OR = [
        { name: { contains: searchTerm } },
        { barNumber: { contains: searchTerm } },
        { email: { contains: searchTerm } },
      ];
    }

    if (specialization && specialization.trim()) {
      where.specialization = specialization.trim();
    }

    if (hasLogin !== undefined && hasLogin !== null && hasLogin !== '') {
      const wantsLogin = String(hasLogin).toLowerCase() === 'true';
      where.userId = wantsLogin ? { not: null } : null;
    }

    // Execute paginated queries in parallel without N+1
    const [total, rawAdvocates] = await Promise.all([
      prisma.advocate.count({ where }),
      prisma.advocate.findMany({
        where,
        include: {
          user: {
            select: { id: true, isActive: true },
          },
          caseAssignments: {
            select: {
              id: true,
              isActive: true,
              case: {
                select: { status: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
    ]);

    const items = rawAdvocates.map((a) => {
      const activeCaseCount = a.caseAssignments.filter(
        (ca) => ca.isActive && ca.case.status !== 'CLOSED'
      ).length;
      const totalCaseCount = a.caseAssignments.length;

      return {
        id: a.id,
        name: a.name,
        barNumber: a.barNumber,
        specialization: a.specialization,
        email: a.email,
        phone: a.phone || null,
        hasLogin: !!a.user,
        loginActive: a.user ? a.user.isActive : false,
        activeCaseCount,
        totalCaseCount,
      };
    });

    const totalPages = Math.ceil(total / size);

    return res.status(200).json({
      success: true,
      message: 'Advocates directory retrieved successfully',
      data: {
        items,
        page: pageNum,
        pageSize: size,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve advocates directory',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/advocates/:id
 * Retrieves full advocate profile and their active and past case assignments.
 * ADVOCATE role is strictly constrained to their own linked profile.
 * Case assignments are filtered by the caller's case visibility rules.
 */
export const getAdvocateById = async (req, res) => {
  try {
    const { id } = req.params;

    // Strict role check: ADVOCATE role can only view their own profile
    if (req.user.role === 'ADVOCATE') {
      const linkedAdvocate = await prisma.advocate.findUnique({
        where: { userId: req.user.id },
        select: { id: true },
      });

      if (!linkedAdvocate || linkedAdvocate.id !== id) {
        return res.status(404).json({
          success: false,
          message: 'Advocate profile not found',
          errors: ['Advocate profile not found or outside authorized scope'],
        });
      }
    }

    const visibilityWhere = caseVisibilityFilter(req.user);

    const advocate = await prisma.advocate.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
        caseAssignments: {
          where: {
            case: visibilityWhere,
          },
          include: {
            case: {
              select: {
                id: true,
                caseNumber: true,
                title: true,
                status: true,
                caseType: true,
                filingDate: true,
              },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!advocate) {
      return res.status(404).json({
        success: false,
        message: 'Advocate not found',
        errors: ['Advocate with specified ID does not exist'],
      });
    }

    const cases = advocate.caseAssignments.map((ca) => ({
      caseId: ca.case.id,
      caseNumber: ca.case.caseNumber,
      title: ca.case.title,
      status: ca.case.status,
      caseType: ca.case.caseType,
      filingDate: ca.case.filingDate,
      side: ca.side,
      isActive: ca.isActive,
      assignedAt: ca.assignedAt,
      unassignedAt: ca.unassignedAt || null,
      unassignReason: ca.unassignReason || null,
    }));

    const activeCases = cases.filter((c) => c.isActive && c.status !== 'CLOSED');

    return res.status(200).json({
      success: true,
      message: 'Advocate profile retrieved successfully',
      data: {
        advocate: {
          id: advocate.id,
          name: advocate.name,
          barNumber: advocate.barNumber,
          specialization: advocate.specialization,
          email: advocate.email,
          phone: advocate.phone || null,
          hasLogin: !!advocate.user,
          loginActive: advocate.user ? advocate.user.isActive : false,
          activeCaseCount: activeCases.length,
          totalCaseCount: cases.length,
          cases,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve advocate profile',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/advocates
 * Registers a new practicing advocate in the court directory.
 * Gated by advocate.manage permission (ADMIN, REGISTRAR).
 */
export const createAdvocate = async (req, res) => {
  try {
    const parseResult = createAdvocateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { name, barNumber, specialization, email, phone } = parseResult.data;

    // Check Bar Council number uniqueness
    const existing = await prisma.advocate.findUnique({
      where: { barNumber },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `An advocate with Bar Number "${barNumber}" already exists`,
        errors: [`Duplicate Bar Council enrollment number: "${barNumber}"`],
      });
    }

    const newAdvocate = await prisma.advocate.create({
      data: {
        name,
        barNumber,
        specialization,
        email,
        phone: phone || null,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Advocate registered successfully',
      data: {
        advocate: {
          ...newAdvocate,
          hasLogin: false,
          loginActive: false,
          activeCaseCount: 0,
          totalCaseCount: 0,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to register advocate',
      errors: [error.message],
    });
  }
};

/**
 * PATCH /api/v1/advocates/:id
 * Modifies mutable details of an advocate (name, specialization, email, phone).
 * Bar number is immutable after registration.
 */
export const updateAdvocate = async (req, res) => {
  try {
    const { id } = req.params;

    // Prohibit editing of immutable Bar Number
    if ('barNumber' in req.body) {
      return res.status(400).json({
        success: false,
        message: 'Bar Council enrollment number cannot be modified after registration',
        errors: ['Bar number is immutable'],
      });
    }

    const parseResult = updateAdvocateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const existing = await prisma.advocate.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Advocate not found',
        errors: ['Advocate with specified ID does not exist'],
      });
    }

    const updateData = {};
    const { name, specialization, email, phone } = parseResult.data;

    if (name !== undefined) updateData.name = name;
    if (specialization !== undefined) updateData.specialization = specialization;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone || null;

    const updated = await prisma.advocate.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, isActive: true } },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Advocate details updated successfully',
      data: {
        advocate: {
          id: updated.id,
          name: updated.name,
          barNumber: updated.barNumber,
          specialization: updated.specialization,
          email: updated.email,
          phone: updated.phone || null,
          hasLogin: !!updated.user,
          loginActive: updated.user ? updated.user.isActive : false,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update advocate',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/advocates/meta
 * Returns distinctive list of legal specializations across current database
 * and standard practice domains.
 */
export const getAdvocateMeta = async (req, res) => {
  try {
    const distinctRows = await prisma.advocate.findMany({
      select: { specialization: true },
      distinct: ['specialization'],
    });

    const standardSpecializations = [
      'Criminal Law',
      'Civil Litigation',
      'Family Law',
      'Corporate & Commercial Law',
      'Constitutional Law',
      'Property & Real Estate',
      'Labor & Employment',
      'Taxation & Revenue',
      'Intellectual Property',
    ];

    const uniqueSpecializations = Array.from(
      new Set([...distinctRows.map((r) => r.specialization), ...standardSpecializations])
    ).sort();

    return res.status(200).json({
      success: true,
      message: 'Advocate metadata retrieved successfully',
      data: {
        specializations: uniqueSpecializations,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve advocate metadata',
      errors: [error.message],
    });
  }
};
