import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../db/prisma.js';
import { config } from '../config/index.js';

// Pre-computed dummy hash to ensure constant-time comparison on unknown email to prevent timing leaks
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Valid email is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters long')
      .regex(/[a-zA-Z]/, 'New password must contain at least one letter')
      .regex(/[0-9]/, 'New password must contain at least one number'),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password cannot be the same as the current password',
    path: ['newPassword'],
  });

/**
 * POST /api/v1/auth/login
 * Authenticates user credentials and issues an httpOnly JWT cookie.
 */
export const login = async (req, res, next) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors[0]?.message || 'Validation failed';
      return res.status(400).json({
        success: false,
        message: errorMsg,
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { email, password } = parseResult.data;

    // Case-insensitive email lookup
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: email.trim().toLowerCase(),
        },
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

    if (!user) {
      // Dummy compare to avoid timing leak
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        errors: ['Invalid email or password'],
      });
    }

    // Check account active state
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account has been deactivated. Please contact an administrator.',
        errors: ['User account inactive'],
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        errors: ['Invalid email or password'],
      });
    }

    // Sign JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Set token in httpOnly cookie (Never in response body)
    res.cookie(config.cookie.name, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: config.cookie.maxAge,
      path: '/',
    });

    // Return sanitized user data
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          advocateId: user.advocateProfile?.id || null,
          advocateBarNumber: user.advocateProfile?.barNumber || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/logout
 * Clears the session cookie.
 */
export const logout = async (req, res) => {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  });

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
    data: null,
  });
};

/**
 * GET /api/v1/auth/me
 * Returns current authenticated user information from session.
 */
export const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Current session user',
    data: {
      user: req.user,
    },
  });
};

/**
 * POST /api/v1/auth/change-password
 * Allows an authenticated user to change their password adhering to security policy.
 */
export const changePassword = async (req, res, next) => {
  try {
    const parseResult = changePasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors[0]?.message || 'Validation failed';
      return res.status(400).json({
        success: false,
        message: errorMsg,
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { currentPassword, newPassword } = parseResult.data;

    // Fetch user with current password hash
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errors: ['User not found'],
      });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password does not match',
        errors: ['Current password does not match'],
      });
    }

    // Rehash new password and update
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newPasswordHash },
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      data: null,
    });
  } catch (error) {
    next(error);
  }
};
