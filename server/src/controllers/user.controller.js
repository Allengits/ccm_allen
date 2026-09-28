import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../db/prisma.js';

// Schemas
const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email is required').trim(),
  role: z.enum(['ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE'], {
    errorMap: () => ({ message: 'Role must be ADMIN, REGISTRAR, JUDGE, or ADVOCATE' }),
  }),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  advocateId: z.string().uuid('Invalid advocate ID').optional().nullable(),
});

const updateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  role: z.enum(['ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE']).optional(),
  isActive: z.boolean().optional(),
  advocateId: z.string().uuid('Invalid advocate ID').optional().nullable(),
});

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .optional(),
});

/**
 * GET /api/v1/users
 * Returns a list of users with optional filtering and search.
 */
export const getUsers = async (req, res, next) => {
  try {
    const { search, role, isActive } = req.query;

    const where = {};

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === true;
    }

    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [{ name: { contains: searchTerm } }, { email: { contains: searchTerm } }];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        advocateProfile: {
          select: {
            id: true,
            barNumber: true,
            specialization: true,
          },
        },
      },
    });

    const sanitizedUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      advocateId: u.advocateProfile?.id || null,
      advocateBarNumber: u.advocateProfile?.barNumber || null,
      advocateSpecialization: u.advocateProfile?.specialization || null,
    }));

    return res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users: sanitizedUsers,
        total: sanitizedUsers.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/users
 * Creates a new user (and optionally links an unlinked advocate profile).
 */
export const createUser = async (req, res, next) => {
  try {
    const parseResult = createUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { name, email, role, password, advocateId } = parseResult.data;

    // Check unique email (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: {
        email: { equals: email.trim().toLowerCase() },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email address already exists',
        errors: ['Email address is already registered'],
      });
    }

    // If linking an advocate, verify existence and availability
    if (role === 'ADVOCATE' && advocateId) {
      const advocate = await prisma.advocate.findUnique({
        where: { id: advocateId },
      });

      if (!advocate) {
        return res.status(404).json({
          success: false,
          message: 'Specified advocate record not found',
          errors: ['Advocate profile does not exist'],
        });
      }

      if (advocate.userId) {
        return res.status(400).json({
          success: false,
          message: 'Advocate profile is already linked to another user account',
          errors: ['Advocate profile already linked'],
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: email.trim().toLowerCase(),
          role,
          passwordHash,
          isActive: true,
        },
      });

      if (role === 'ADVOCATE' && advocateId) {
        await tx.advocate.update({
          where: { id: advocateId },
          data: { userId: user.id },
        });
      }

      return user;
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          isActive: newUser.isActive,
          advocateId: advocateId || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/users/:id
 * Updates an existing user's attributes with safety checks.
 */
export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = updateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { name, role, isActive, advocateId } = parseResult.data;

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { advocateProfile: true },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errors: ['User record does not exist'],
      });
    }

    // Safety Rule 1: An admin cannot deactivate or demote their own account
    if (req.user.id === targetUser.id) {
      if (isActive === false) {
        return res.status(400).json({
          success: false,
          message: 'Action prohibited: Administrators cannot deactivate their own account',
          errors: ['Cannot deactivate own administrator account'],
        });
      }
      if (role && role !== 'ADMIN') {
        return res.status(400).json({
          success: false,
          message: 'Action prohibited: Administrators cannot demote their own role',
          errors: ['Cannot demote own administrator role'],
        });
      }
    }

    // Safety Rule 2: System must never be left without an active ADMIN
    if (
      (role && role !== 'ADMIN' && targetUser.role === 'ADMIN') ||
      (isActive === false && targetUser.role === 'ADMIN' && targetUser.isActive)
    ) {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          role: 'ADMIN',
          isActive: true,
          id: { not: targetUser.id },
        },
      });

      if (otherActiveAdmins === 0) {
        return res.status(400).json({
          success: false,
          message:
            'Action prohibited: Cannot deactivate or demote the last remaining active Administrator',
          errors: ['System must retain at least one active administrator'],
        });
      }
    }

    // Handle Advocate linking/unlinking
    if (advocateId !== undefined) {
      if (advocateId === null) {
        // Unlink current advocate
        await prisma.advocate.updateMany({
          where: { userId: targetUser.id },
          data: { userId: null },
        });
      } else {
        const advocate = await prisma.advocate.findUnique({
          where: { id: advocateId },
        });

        if (!advocate) {
          return res.status(404).json({
            success: false,
            message: 'Advocate record not found',
            errors: ['Advocate profile does not exist'],
          });
        }

        if (advocate.userId && advocate.userId !== targetUser.id) {
          return res.status(400).json({
            success: false,
            message: 'Advocate profile is already linked to another user',
            errors: ['Advocate profile already linked'],
          });
        }

        // Link advocate
        await prisma.advocate.update({
          where: { id: advocateId },
          data: { userId: targetUser.id },
        });
      }
    }

    // Update user record
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        advocateProfile: {
          select: {
            id: true,
            barNumber: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          isActive: updated.isActive,
          advocateId: updated.advocateProfile?.id || null,
          advocateBarNumber: updated.advocateProfile?.barNumber || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/users/:id/reset-password
 * Resets a user's password to a secure default or provided value.
 */
export const resetUserPassword = async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = resetPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errors: ['User record does not exist'],
      });
    }

    const newPassword = parseResult.data?.newPassword || 'Demo@1234';
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return res.status(200).json({
      success: true,
      message: `Password has been reset successfully for user ${targetUser.email}`,
      data: null,
    });
  } catch (error) {
    next(error);
  }
};
