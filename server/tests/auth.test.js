import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import bcrypt from 'bcryptjs';
import { caseVisibilityFilter, PERMISSIONS, hasPermission } from '../src/config/permissions.js';

describe('Court CMS - Authentication & RBAC Suite', () => {
  const demoPassword = 'Demo@1234';
  let adminCookie = '';
  let registrarCookie = '';
  let adminId = '';

  beforeAll(async () => {
    // Locate admin user id
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@courtcms.gov.in' },
    });
    adminId = adminUser.id;
  });

  afterAll(async () => {
    // Ensure any temporary test users are completely cleaned up
    await prisma.user.deleteMany({
      where: {
        email: {
          notIn: [
            'admin@courtcms.gov.in',
            'registrar@courtcms.gov.in',
            'judge.banerjee@courtcms.gov.in',
            'judge.swaminathan@courtcms.gov.in',
            'adv.khan@courtcms.gov.in',
            'adv.iyer@courtcms.gov.in',
            'adv.mehta@courtcms.gov.in',
          ],
        },
      },
    });
  });

  // -------------------------------------------------------------
  // 1. Role-Based Login Tests
  // -------------------------------------------------------------
  describe('POST /api/v1/auth/login', () => {
    it('successfully logs in ADMIN and sets httpOnly cookie without exposing passwordHash or token in body', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@courtcms.gov.in', password: demoPassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.email).toBe('admin@courtcms.gov.in');

      // Security assertions
      expect(res.body.data.token).toBeUndefined();
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('$2a$');

      // Cookie assertions
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/court_cms_token=/);
      expect(cookies[0]).toMatch(/HttpOnly/i);

      adminCookie = cookies[0];
    });

    it('successfully logs in REGISTRAR role', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'REGISTRAR@courtcms.gov.in', password: demoPassword }); // test case insensitivity

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('REGISTRAR');
      registrarCookie = res.headers['set-cookie'][0];
    });

    it('successfully logs in JUDGE role', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'judge.swaminathan@courtcms.gov.in', password: demoPassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('JUDGE');
    });

    it('successfully logs in ADVOCATE role and includes linked advocateId', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'adv.mehta@courtcms.gov.in', password: demoPassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('ADVOCATE');
      expect(res.body.data.user.advocateId).toBeDefined();
      expect(res.body.data.user.advocateBarNumber).toBe('D/1998/0142');
    });

    it('rejects wrong password with generic error message', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@courtcms.gov.in', password: 'WrongPassword123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('rejects unknown email with exact same generic error message', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent.user@courtcms.gov.in', password: demoPassword });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('rejects inactive user with descriptive message', async () => {
      // Create temporary inactive user
      const inactiveUser = await prisma.user.create({
        data: {
          name: 'Inactive Staff',
          email: 'temp.inactive@courtcms.gov.in',
          passwordHash: await bcrypt.hash(demoPassword, 10),
          role: 'REGISTRAR',
          isActive: false,
        },
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: inactiveUser.email, password: demoPassword });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('deactivated');

      // Cleanup
      await prisma.user.delete({ where: { id: inactiveUser.id } });
    });
  });

  // -------------------------------------------------------------
  // 2. Session & Logout Tests
  // -------------------------------------------------------------
  describe('GET /api/v1/auth/me & POST /api/v1/auth/logout', () => {
    it('rejects GET /api/v1/auth/me without cookie', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns user session with valid cookie', async () => {
      const res = await request(app).get('/api/v1/auth/me').set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('admin@courtcms.gov.in');
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('clears cookie on logout and subsequent request is unauthorized', async () => {
      // Log in to obtain a fresh session
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'registrar@courtcms.gov.in', password: demoPassword });

      const sessionCookie = loginRes.headers['set-cookie'][0];

      // Call logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [sessionCookie]);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      const clearedCookies = logoutRes.headers['set-cookie'];
      expect(clearedCookies[0]).toMatch(/court_cms_token=;/);

      // Verify session expired
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', clearedCookies);

      expect(meRes.status).toBe(401);
    });
  });

  // -------------------------------------------------------------
  // 3. User Management & Safety Rules (ADMIN only)
  // -------------------------------------------------------------
  describe('User Management API (/api/v1/users)', () => {
    let createdUserId = '';

    it('forbids non-admin (REGISTRAR) from accessing user management routes with 403', async () => {
      const res = await request(app).get('/api/v1/users').set('Cookie', [registrarCookie]);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden');
    });

    it('allows ADMIN to list all users with search and role filter', async () => {
      const res = await request(app).get('/api/v1/users?role=JUDGE').set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users.length).toBe(2);
      expect(res.body.data.users.every((u) => u.role === 'JUDGE')).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('allows ADMIN to create a new user', async () => {
      const res = await request(app).post('/api/v1/users').set('Cookie', [adminCookie]).send({
        name: 'Test Registry Clerk',
        email: 'test.created@courtcms.gov.in',
        role: 'REGISTRAR',
        password: 'Password@2026',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test.created@courtcms.gov.in');
      expect(res.body.data.user.role).toBe('REGISTRAR');
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      createdUserId = res.body.data.user.id;
    });

    it('prevents creating duplicate email', async () => {
      const res = await request(app).post('/api/v1/users').set('Cookie', [adminCookie]).send({
        name: 'Duplicate Clerk',
        email: 'test.created@courtcms.gov.in',
        role: 'REGISTRAR',
        password: 'Password@2026',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('allows ADMIN to update user details and active status', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${createdUserId}`)
        .set('Cookie', [adminCookie])
        .send({
          name: 'Test Registry Clerk Updated',
          isActive: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe('Test Registry Clerk Updated');
      expect(res.body.data.user.isActive).toBe(false);

      // Verify that this deactivated user cannot log in
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test.created@courtcms.gov.in', password: 'Password@2026' });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.message).toContain('deactivated');
    });

    it('prevents ADMIN from deactivating their own account', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${adminId}`)
        .set('Cookie', [adminCookie])
        .send({ isActive: false });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('cannot deactivate their own account');
    });

    it('prevents ADMIN from demoting their own role', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${adminId}`)
        .set('Cookie', [adminCookie])
        .send({ role: 'REGISTRAR' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('cannot demote their own role');
    });

    it('allows ADMIN to reset a user password', async () => {
      const res = await request(app)
        .post(`/api/v1/users/${createdUserId}/reset-password`)
        .set('Cookie', [adminCookie])
        .send({ newPassword: 'NewResetPassword@123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('reset successfully');
    });

    afterAll(async () => {
      if (createdUserId) {
        await prisma.user.deleteMany({
          where: { id: createdUserId },
        });
      }
    });
  });

  // -------------------------------------------------------------
  // 4. Change Password Policy Tests
  // -------------------------------------------------------------
  describe('POST /api/v1/auth/change-password', () => {
    let testUserCookie = '';
    let testUserId = '';

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Change Password Tester',
          email: 'test.changepw@courtcms.gov.in',
          passwordHash: await bcrypt.hash('InitialPass@123', 10),
          role: 'REGISTRAR',
          isActive: true,
        },
      });
      testUserId = user.id;

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test.changepw@courtcms.gov.in', password: 'InitialPass@123' });

      testUserCookie = loginRes.headers['set-cookie'][0];
    });

    afterAll(async () => {
      if (testUserId) {
        await prisma.user.delete({ where: { id: testUserId } });
      }
    });

    it('rejects change-password when current password is wrong', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', [testUserCookie])
        .send({
          currentPassword: 'WrongCurrentPassword',
          newPassword: 'BrandNewPassword@2026',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Current password does not match');
    });

    it('rejects reusing the current password as the new password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', [testUserCookie])
        .send({
          currentPassword: 'InitialPass@123',
          newPassword: 'InitialPass@123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cannot be the same');
    });

    it('rejects passwords failing policy (< 8 chars or no numbers)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', [testUserCookie])
        .send({
          currentPassword: 'InitialPass@123',
          newPassword: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('accepts compliant new password and enables login with new credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', [testUserCookie])
        .send({
          currentPassword: 'InitialPass@123',
          newPassword: 'ValidNewPass@2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify login with new password using dedicated test IP
      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({
          email: 'test.changepw@courtcms.gov.in',
          password: 'ValidNewPass@2026',
        });

      expect(newLogin.status).toBe(200);
      expect(newLogin.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 5. caseVisibilityFilter Unit Tests
  // -------------------------------------------------------------
  describe('caseVisibilityFilter helper', () => {
    it('returns empty object for ADMIN (all cases)', () => {
      const filter = caseVisibilityFilter({ id: 'admin-id', role: 'ADMIN' });
      expect(filter).toEqual({});
    });

    it('returns empty object for REGISTRAR (all cases)', () => {
      const filter = caseVisibilityFilter({ id: 'reg-id', role: 'REGISTRAR' });
      expect(filter).toEqual({});
    });

    it('returns judgeId equality for JUDGE', () => {
      const filter = caseVisibilityFilter({ id: 'judge-42', role: 'JUDGE' });
      expect(filter).toEqual({ judgeId: 'judge-42' });
    });

    it('returns advocate relation filter for ADVOCATE with advocateId', () => {
      const filter = caseVisibilityFilter({
        id: 'adv-user-id',
        role: 'ADVOCATE',
        advocateId: 'advocate-guid-123',
      });
      expect(filter).toEqual({
        advocates: {
          some: {
            advocateId: 'advocate-guid-123',
            isActive: true,
          },
        },
      });
    });

    it('returns non-matching filter for ADVOCATE without linked advocate profile', () => {
      const filter = caseVisibilityFilter({
        id: 'adv-user-id',
        role: 'ADVOCATE',
        advocateId: null,
      });
      expect(filter.id).toBeDefined();
    });

    it('returns non-matching filter for null user', () => {
      const filter = caseVisibilityFilter(null);
      expect(filter.id).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // 6. Permission Matrix Verification
  // -------------------------------------------------------------
  describe('Permissions Matrix & hasPermission helper', () => {
    it('grants user.manage only to ADMIN', () => {
      expect(hasPermission('ADMIN', PERMISSIONS.USER_MANAGE)).toBe(true);
      expect(hasPermission('REGISTRAR', PERMISSIONS.USER_MANAGE)).toBe(false);
      expect(hasPermission('JUDGE', PERMISSIONS.USER_MANAGE)).toBe(false);
      expect(hasPermission('ADVOCATE', PERMISSIONS.USER_MANAGE)).toBe(false);
    });

    it('grants case.create to ADMIN and REGISTRAR but not JUDGE or ADVOCATE', () => {
      expect(hasPermission('ADMIN', PERMISSIONS.CASE_CREATE)).toBe(true);
      expect(hasPermission('REGISTRAR', PERMISSIONS.CASE_CREATE)).toBe(true);
      expect(hasPermission('JUDGE', PERMISSIONS.CASE_CREATE)).toBe(false);
      expect(hasPermission('ADVOCATE', PERMISSIONS.CASE_CREATE)).toBe(false);
    });

    it('grants judgment.deliver only to JUDGE and ADMIN', () => {
      expect(hasPermission('JUDGE', PERMISSIONS.JUDGMENT_DELIVER)).toBe(true);
      expect(hasPermission('ADMIN', PERMISSIONS.JUDGMENT_DELIVER)).toBe(true);
      expect(hasPermission('REGISTRAR', PERMISSIONS.JUDGMENT_DELIVER)).toBe(false);
      expect(hasPermission('ADVOCATE', PERMISSIONS.JUDGMENT_DELIVER)).toBe(false);
    });

    it('grants advocate.view to ADMIN, REGISTRAR, and JUDGE but not ADVOCATE', () => {
      expect(hasPermission('ADMIN', PERMISSIONS.ADVOCATE_VIEW)).toBe(true);
      expect(hasPermission('REGISTRAR', PERMISSIONS.ADVOCATE_VIEW)).toBe(true);
      expect(hasPermission('JUDGE', PERMISSIONS.ADVOCATE_VIEW)).toBe(true);
      expect(hasPermission('ADVOCATE', PERMISSIONS.ADVOCATE_VIEW)).toBe(false);
    });

    it('grants advocate.manage to ADMIN and REGISTRAR but not JUDGE or ADVOCATE', () => {
      expect(hasPermission('ADMIN', PERMISSIONS.ADVOCATE_MANAGE)).toBe(true);
      expect(hasPermission('REGISTRAR', PERMISSIONS.ADVOCATE_MANAGE)).toBe(true);
      expect(hasPermission('JUDGE', PERMISSIONS.ADVOCATE_MANAGE)).toBe(false);
      expect(hasPermission('ADVOCATE', PERMISSIONS.ADVOCATE_MANAGE)).toBe(false);
    });

    it('confirms evidence permissions are removed from matrix and roles', () => {
      expect(PERMISSIONS.EVIDENCE_SUBMIT).toBeUndefined();
      expect(PERMISSIONS.EVIDENCE_REVIEW).toBeUndefined();
      expect(hasPermission('ADMIN', 'evidence.submit')).toBe(false);
      expect(hasPermission('REGISTRAR', 'evidence.submit')).toBe(false);
      expect(hasPermission('ADVOCATE', 'evidence.submit')).toBe(false);
      expect(hasPermission('JUDGE', 'evidence.review')).toBe(false);
      expect(hasPermission('ADMIN', 'evidence.review')).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 7. Rate Limiter Test (Isolated client IP: 198.51.100.42)
  // -------------------------------------------------------------
  describe('Rate Limiter Protection', () => {
    it('returns 429 Too Many Requests when exceeding login attempts threshold on specific IP', async () => {
      const testIp = '198.51.100.42';
      let finalResponse;

      for (let i = 0; i < 11; i++) {
        finalResponse = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({ email: 'admin@courtcms.gov.in', password: 'random-invalid-password' });
      }

      expect(finalResponse.status).toBe(429);
      expect(finalResponse.body.success).toBe(false);
      expect(finalResponse.body.message).toContain('Too many login attempts');
    });
  });

  // -------------------------------------------------------------
  // 8. Public Health Endpoint Integrity
  // -------------------------------------------------------------
  describe('GET /api/v1/health', () => {
    it('remains public, unauthenticated, and returns 200 with database connected', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('System is healthy');
      expect(res.body.data.api).toBe('ok');
      expect(res.body.data.database).toBe('connected');
      expect(res.body.data.timestamp).toBeDefined();
    });
  });
});
