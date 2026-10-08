import { Router } from 'express';
import prisma from '../db/prisma.js';

const router = Router();

/**
 * GET /api/v1/health
 * Returns API health and database connectivity status.
 */
router.get('/', async (req, res) => {
  try {
    // Perform a lightweight query to test database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      success: true,
      message: 'System is healthy',
      data: {
        api: 'ok',
        database: 'connected',
        engine: 'MongoDB',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'Service Unavailable - Database connection failed',
      errors: [error.message],
      data: {
        api: 'ok',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
