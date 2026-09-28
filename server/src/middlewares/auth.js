import jwt from 'jsonwebtoken';
import prisma from '../db/prisma.js';
import { config } from '../config/index.js';

/**
 * Authentication middleware.
 * Verifies JWT token from httpOnly cookie (or Authorization header),
 * reloads user from the database on each request to enforce active state,
 * and attaches sanitized user to req.user.
 */
export const authenticate = async (req, res, next) => {
  try {
    const token =
      req.cookies?.[config.cookie.name] || req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
        errors: ['Missing authentication token'],
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session. Please log in again.',
        errors: [err.message || 'Token verification failed'],
      });
    }

    // Always re-load user from database to ensure deactivated users lose access immediately
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
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
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists.',
        errors: ['User not found'],
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account has been deactivated. Please contact an administrator.',
        errors: ['User account inactive'],
      });
    }

    // Attach sanitized user to request object (never includes passwordHash)
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      advocateId: user.advocateProfile?.id || null,
      advocateBarNumber: user.advocateProfile?.barNumber || null,
    };

    next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Role authorization middleware.
 * Restricts route access to specific User roles.
 * @param  {...string} allowedRoles - List of allowed Role enums (e.g. 'ADMIN', 'JUDGE')
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Authentication required',
        errors: ['Authentication required'],
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - You do not have permission to access this resource',
        errors: [`Role '${req.user.role}' is not authorized to access this resource`],
      });
    }

    next();
  };
};
