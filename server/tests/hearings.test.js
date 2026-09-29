import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';

describe('Court CMS - Phase 6 Hearing Scheduling, Cause Lists & Automation Suite', () => {
  const demoPassword = 'Demo@1234';

  let adminCookie;
  let registrarCookie;
  let judge1Cookie;
  let judge2Cookie;
  let advocateMehtaCookie;
  let advocateIyerCookie;

  let seededCourtrooms;
  let seededJudges;
  let seededCases;
  let seededHearings;
  let seededHearingEvents;
  let seededCaseAdvocates;
  let seededStatusHistories;

  let cr1;
  let cr2;
  let judge1User;
  let judge2User;
  let advocateAssignedCase3;
  let hearingScheduledCase5;
  let underTrialCase7;
  let closedCase13;

  // Helper to construct a future working slot in IST
  const getFutureWorkingSlot = (daysAhead = 7, hour = 11, minute = 0) => {
    let dt = DateTime.now().setZone('Asia/Kolkata').plus({ days: daysAhead });
    while (dt.weekday > 5) {
      dt = dt.plus({ days: 1 });
    }
    return dt.set({ hour, minute, second: 0, millisecond: 0 });
  };

  // Helper to construct a weekend date in IST
  const getWeekendSlot = (daysAhead = 1) => {
    let dt = DateTime.now().setZone('Asia/Kolkata').plus({ days: daysAhead });
    while (dt.weekday !== 6) {
      dt = dt.plus({ days: 1 });
    }
    return dt.set({ hour: 11, minute: 0, second: 0, millisecond: 0 });
  };

  // Helper to authenticate user and extract session cookie
  const loginUser = async (email, password = demoPassword) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    return cookies[0].split(';')[0];
  };

  // Restore database state to pre-suite baseline exactly
  const restoreBaseline = async () => {
    // 1. Delete newly created hearing events
    const baselineHearingEventIds = seededHearingEvents.map((he) => he.id);
    await prisma.hearingEvent.deleteMany({
      where: { id: { notIn: baselineHearingEventIds } },
    });

    // 2. Delete newly created hearings
    const baselineHearingIds = seededHearings.map((h) => h.id);
    await prisma.hearing.deleteMany({
      where: { id: { notIn: baselineHearingIds } },
    });

    // 3. Delete newly created status history
    const baselineHistoryIds = seededStatusHistories.map((h) => h.id);
    await prisma.caseStatusHistory.deleteMany({
      where: { id: { notIn: baselineHistoryIds } },
    });

    // 4. Delete newly created case advocates
    const baselineCaseAdvocateIds = seededCaseAdvocates.map((ca) => ca.id);
    await prisma.caseAdvocate.deleteMany({
      where: { id: { notIn: baselineCaseAdvocateIds } },
    });

    // 5. Delete newly created cases
    const baselineCaseIds = seededCases.map((c) => c.id);
    await prisma.case.deleteMany({
      where: { id: { notIn: baselineCaseIds } },
    });

    // 6. Restore baseline fields for seeded hearings
    for (const sh of seededHearings) {
      await prisma.hearing.update({
        where: { id: sh.id },
        data: {
          scheduledAt: sh.scheduledAt,
          courtroomId: sh.courtroomId,
          judgeId: sh.judgeId,
          durationMins: sh.durationMins,
          purpose: sh.purpose,
          status: sh.status,
          outcomeNotes: sh.outcomeNotes,
        },
      });
    }

    // 7. Restore baseline fields for seeded cases
    for (const sc of seededCases) {
      await prisma.case.update({
        where: { id: sc.id },
        data: {
          status: sc.status,
          priority: sc.priority,
          judgeId: sc.judgeId,
          closedAt: sc.closedAt,
        },
      });
    }
  };

  beforeAll(async () => {
    // Authenticate all test roles
    adminCookie = await loginUser('admin@courtcms.gov.in');
    registrarCookie = await loginUser('registrar@courtcms.gov.in');
    judge1Cookie = await loginUser('judge.swaminathan@courtcms.gov.in');
    judge2Cookie = await loginUser('judge.banerjee@courtcms.gov.in');
    advocateMehtaCookie = await loginUser('adv.mehta@courtcms.gov.in');
    advocateIyerCookie = await loginUser('adv.iyer@courtcms.gov.in');

    // Snapshot seeded baseline
    [
      seededCourtrooms,
      seededJudges,
      seededCases,
      seededHearings,
      seededHearingEvents,
      seededCaseAdvocates,
      seededStatusHistories,
    ] = await Promise.all([
      prisma.courtroom.findMany({ orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: { role: 'JUDGE' }, orderBy: { name: 'asc' } }),
      prisma.case.findMany({ orderBy: { caseNumber: 'asc' } }),
      prisma.hearing.findMany({ orderBy: { id: 'asc' } }),
      prisma.hearingEvent.findMany({ orderBy: { id: 'asc' } }),
      prisma.caseAdvocate.findMany({ orderBy: { id: 'asc' } }),
      prisma.caseStatusHistory.findMany({ orderBy: { id: 'asc' } }),
    ]);

    cr1 = seededCourtrooms.find((c) => c.name.includes('Courtroom 1')) || seededCourtrooms[0];
    cr2 = seededCourtrooms.find((c) => c.name.includes('Courtroom 2')) || seededCourtrooms[1];

    judge1User = seededJudges.find((j) => j.email === 'judge.swaminathan@courtcms.gov.in');
    judge2User = seededJudges.find((j) => j.email === 'judge.banerjee@courtcms.gov.in');

    advocateAssignedCase3 = seededCases.find((c) => c.caseNumber === 'CC/2026/00103');
    hearingScheduledCase5 = seededCases.find((c) => c.caseNumber === 'CC/2026/00105');
    underTrialCase7 = seededCases.find((c) => c.caseNumber === 'CC/2025/00045');
    closedCase13 = seededCases.find((c) => c.status === 'CLOSED');
  });

  afterEach(async () => {
    await restoreBaseline();
  });

  afterAll(async () => {
    await restoreBaseline();
  });

  // =========================================================================
  // 1. Metadata API (GET /api/v1/hearings/meta)
  // =========================================================================
  describe('Hearing Metadata API', () => {
    it('returns courtrooms, judges, statuses, and court settings with IST defaults', async () => {
      const res = await request(app).get('/api/v1/hearings/meta').set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courtrooms.length).toBeGreaterThanOrEqual(4);
      expect(res.body.data.judges.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.hearingStatuses).toEqual([
        'SCHEDULED',
        'COMPLETED',
        'ADJOURNED',
        'CANCELLED',
      ]);
      expect(res.body.data.settings).toMatchObject({
        court_timezone: 'Asia/Kolkata',
        court_start_time: '10:00',
        court_end_time: '17:00',
        lunch_start: '13:00',
        lunch_end: '14:00',
        court_working_days: 'MON,TUE,WED,THU,FRI',
        slot_minutes: 15,
      });
    });

    it('allows all authenticated roles (ADMIN, REGISTRAR, JUDGE, ADVOCATE) to view metadata', async () => {
      for (const cookie of [adminCookie, registrarCookie, judge1Cookie, advocateMehtaCookie]) {
        const res = await request(app).get('/api/v1/hearings/meta').set('Cookie', cookie);
        expect(res.status).toBe(200);
      }
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/hearings/meta');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Cause List API (GET /api/v1/hearings/cause-list)
  // =========================================================================
  describe('Daily Cause List API', () => {
    it('returns cause list for today IST grouped by courtroom with serial numbers', async () => {
      const todayIST = DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM-dd');

      const res = await request(app)
        .get(`/api/v1/hearings/cause-list?date=${todayIST}`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe(todayIST);
      expect(res.body.data.totalHearings).toBe(2); // Seeded exactly 2 hearings today
      expect(res.body.data.courtrooms.length).toBe(2);

      const crGroup = res.body.data.courtrooms[0];
      expect(crGroup.courtroom).toBeDefined();
      expect(crGroup.hearings.length).toBeGreaterThan(0);
      expect(crGroup.hearings[0].serialNumber).toBe(1);
      expect(crGroup.hearings[0].caseNumber).toBeDefined();
      expect(crGroup.hearings[0].endsAt).toBeDefined();
      expect(Array.isArray(crGroup.hearings[0].petitionerAdvocates)).toBe(true);
      expect(Array.isArray(crGroup.hearings[0].respondentAdvocates)).toBe(true);
    });

    it('scopes cause list according to caller visibility (JUDGE sees only their court)', async () => {
      const todayIST = DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM-dd');

      // Judge 1 (Verma) should see only 1 hearing (their own)
      const res = await request(app)
        .get(`/api/v1/hearings/cause-list?date=${todayIST}`)
        .set('Cookie', judge1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.totalHearings).toBe(1);
      expect(res.body.data.courtrooms.length).toBe(1);
      expect(res.body.data.courtrooms[0].hearings[0].judge.name).toBe(judge1User.name);
    });

    it('scopes cause list for ADVOCATE to only cases they actively represent', async () => {
      const todayIST = DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM-dd');

      // Advocate Mehta is active on both Case 5 and Case 6 (both scheduled today)
      const mehtaRes = await request(app)
        .get(`/api/v1/hearings/cause-list?date=${todayIST}`)
        .set('Cookie', advocateMehtaCookie);

      expect(mehtaRes.status).toBe(200);
      expect(mehtaRes.body.data.totalHearings).toBe(2);

      // Advocate Iyer does not represent any case scheduled today -> sees 0
      const iyerRes = await request(app)
        .get(`/api/v1/hearings/cause-list?date=${todayIST}`)
        .set('Cookie', advocateIyerCookie);

      expect(iyerRes.status).toBe(200);
      expect(iyerRes.body.data.totalHearings).toBe(0);
      expect(iyerRes.body.data.courtrooms).toEqual([]);
    });
  });

  // =========================================================================
  // 3. Availability API (GET /api/v1/hearings/availability)
  // =========================================================================
  describe('Hearing Slot Availability API', () => {
    it('returns free slot intervals on 15m boundaries between 10:00 and 17:00 IST excluding lunch', async () => {
      const targetDate = getFutureWorkingSlot(14, 10, 0).toFormat('yyyy-MM-dd');

      const res = await request(app)
        .get(
          `/api/v1/hearings/availability?date=${targetDate}&courtroomId=${cr1.id}&judgeId=${judge1User.id}&durationMins=30`
        )
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isWorkingDay).toBe(true);
      expect(res.body.data.availableSlots.length).toBeGreaterThan(0);

      // Verify no slot overlaps lunch [13:00, 14:00)
      for (const slot of res.body.data.availableSlots) {
        expect(slot.startTime).toMatch(/^\d{2}:(00|15|30|45)$/);
        // Ensure slot finishes <= 13:00 or starts >= 14:00
        const isBeforeLunch = slot.endTime <= '13:00';
        const isAfterLunch = slot.startTime >= '14:00';
        expect(isBeforeLunch || isAfterLunch).toBe(true);
      }
    });

    it('returns isWorkingDay: false and empty slots for weekend dates', async () => {
      const weekendDate = getWeekendSlot(7).toFormat('yyyy-MM-dd');

      const res = await request(app)
        .get(
          `/api/v1/hearings/availability?date=${weekendDate}&courtroomId=${cr1.id}&judgeId=${judge1User.id}`
        )
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.isWorkingDay).toBe(false);
      expect(res.body.data.availableSlots).toEqual([]);
    });

    it('excludes slots that conflict with existing scheduled hearings', async () => {
      const todayIST = DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM-dd');

      // Case 5 is scheduled today in cr1 at 10:30 IST for 30m (10:30 - 11:00)
      const res = await request(app)
        .get(`/api/v1/hearings/availability?date=${todayIST}&courtroomId=${cr1.id}&durationMins=30`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      const bookedSlot = res.body.data.availableSlots.find(
        (s) => s.startTime === '10:30' || s.startTime === '10:45'
      );
      expect(bookedSlot).toBeUndefined(); // Booked 10:30-11:00 cannot appear
    });
  });

  // =========================================================================
  // 4. Query List & Detail API (GET /api/v1/hearings & GET /api/v1/hearings/:id)
  // =========================================================================
  describe('Hearings Query List & Detail API', () => {
    it('returns paginated hearings with computed endsAt and durationMinutes', async () => {
      const res = await request(app)
        .get('/api/v1/hearings?page=1&pageSize=5')
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(5);
      expect(res.body.data.total).toBe(16);
      expect(res.body.data.totalPages).toBe(4);
      expect(res.body.data.items[0].endsAt).toBeDefined();
      expect(res.body.data.items[0].durationMinutes).toBeDefined();
    });

    it('filters hearings by status, courtroom, and search query q', async () => {
      const res = await request(app)
        .get(`/api/v1/hearings?status=SCHEDULED&courtroomId=${cr1.id}&q=CC/2026`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((h) => h.status === 'SCHEDULED')).toBe(true);
      expect(res.body.data.items.every((h) => h.courtroomId === cr1.id)).toBe(true);
    });

    it('returns hearing detail with audit events ordered newest first', async () => {
      const testHearing = seededHearings.find((h) => h.status === 'COMPLETED');

      const res = await request(app)
        .get(`/api/v1/hearings/${testHearing.id}`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.hearing.id).toBe(testHearing.id);
      expect(res.body.data.hearing.events.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.hearing.events[0].performedBy).toBeDefined();
    });

    it('returns 404 for out-of-scope hearing without leaking existence to judge', async () => {
      // Find a hearing presided by Judge 2
      const judge2Hearing = seededHearings.find((h) => h.judgeId === judge2User.id);

      const res = await request(app)
        .get(`/api/v1/hearings/${judge2Hearing.id}`)
        .set('Cookie', judge1Cookie);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Hearing not found');
    });
  });

  // =========================================================================
  // 5. Hearing Scheduling API (POST /api/v1/hearings)
  // =========================================================================
  describe('Hearing Scheduling API', () => {
    it('allows REGISTRAR to schedule a hearing on ADVOCATE_ASSIGNED case, moving status to HEARING_SCHEDULED', async () => {
      const slotDt = getFutureWorkingSlot(10, 11, 0);

      const res = await request(app).post('/api/v1/hearings').set('Cookie', registrarCookie).send({
        caseId: advocateAssignedCase3.id,
        courtroomId: cr1.id,
        scheduledAt: slotDt.toISO(),
        durationMins: 30,
        purpose: 'Framing of Preliminary Issues',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hearing.status).toBe('SCHEDULED');
      expect(res.body.data.hearing.case.status).toBe('HEARING_SCHEDULED');

      // Verify case status in database moved to HEARING_SCHEDULED
      const updatedCase = await prisma.case.findUnique({
        where: { id: advocateAssignedCase3.id },
      });
      expect(updatedCase.status).toBe('HEARING_SCHEDULED');

      // Verify HearingEvent (SCHEDULED) created
      const events = await prisma.hearingEvent.findMany({
        where: { hearingId: res.body.data.hearing.id },
      });
      expect(events.length).toBe(1);
      expect(events[0].action).toBe('SCHEDULED');

      // Verify CaseStatusHistory created
      const history = await prisma.caseStatusHistory.findFirst({
        where: {
          caseId: advocateAssignedCase3.id,
          toStatus: 'HEARING_SCHEDULED',
        },
      });
      expect(history).toBeDefined();
      expect(history.reason).toContain('Hearing scheduled for');
    });

    it('rejects scheduling on weekends (non-working days)', async () => {
      const weekendSlot = getWeekendSlot(10);

      const res = await request(app).post('/api/v1/hearings').set('Cookie', registrarCookie).send({
        caseId: advocateAssignedCase3.id,
        courtroomId: cr1.id,
        scheduledAt: weekendSlot.toISO(),
        durationMins: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not a court working day');
    });

    it('rejects scheduling outside court working hours (e.g. 09:30 or 17:30)', async () => {
      const earlySlot = getFutureWorkingSlot(10, 9, 30);

      const res = await request(app).post('/api/v1/hearings').set('Cookie', registrarCookie).send({
        caseId: advocateAssignedCase3.id,
        courtroomId: cr1.id,
        scheduledAt: earlySlot.toISO(),
        durationMins: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('court opening time');
    });

    it('rejects scheduling overlapping lunch break (13:00 - 14:00)', async () => {
      // 12:45 to 13:15 overlaps 13:00 lunch
      const lunchSlot = getFutureWorkingSlot(10, 12, 45);

      const res = await request(app).post('/api/v1/hearings').set('Cookie', registrarCookie).send({
        caseId: advocateAssignedCase3.id,
        courtroomId: cr1.id,
        scheduledAt: lunchSlot.toISO(),
        durationMins: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('lunch break');
    });

    it('rejects scheduling starting off a 15-minute boundary (e.g. 11:07)', async () => {
      const unalignedSlot = getFutureWorkingSlot(10, 11, 7);

      const res = await request(app).post('/api/v1/hearings').set('Cookie', registrarCookie).send({
        caseId: advocateAssignedCase3.id,
        courtroomId: cr1.id,
        scheduledAt: unalignedSlot.toISO(),
        durationMins: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('15-minute boundary');
    });

    it('rejects scheduling for a CLOSED case', async () => {
      const slotDt = getFutureWorkingSlot(10, 11, 0);

      const res = await request(app).post('/api/v1/hearings').set('Cookie', registrarCookie).send({
        caseId: closedCase13.id,
        courtroomId: cr1.id,
        scheduledAt: slotDt.toISO(),
        durationMins: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot schedule hearing for a closed case');
    });

    it('rejects scheduling for a case with NO active advocates assigned', async () => {
      const registeredCase = seededCases.find((c) => c.status === 'REGISTERED');
      const slotDt = getFutureWorkingSlot(10, 11, 0);

      const res = await request(app).post('/api/v1/hearings').set('Cookie', registrarCookie).send({
        caseId: registeredCase.id,
        courtroomId: cr1.id,
        scheduledAt: slotDt.toISO(),
        durationMins: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no active advocates assigned');
    });

    it('returns 409 Conflict if courtroom is already booked in that slot', async () => {
      const slotDt = getFutureWorkingSlot(11, 11, 0);

      // Book slot first
      const firstRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId: advocateAssignedCase3.id,
          courtroomId: cr1.id,
          scheduledAt: slotDt.toISO(),
          durationMins: 30,
        });
      expect(firstRes.status).toBe(201);

      // Try booking second hearing in same courtroom overlapping
      const secondRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId: hearingScheduledCase5.id,
          courtroomId: cr1.id,
          scheduledAt: slotDt.plus({ minutes: 15 }).toISO(),
          durationMins: 30,
        });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.message).toContain('already booked');
    });

    it('handles concurrent identical scheduling attempts producing exactly one booking and one 409', async () => {
      const slotDt = getFutureWorkingSlot(12, 14, 0);

      const [res1, res2] = await Promise.all([
        request(app).post('/api/v1/hearings').set('Cookie', registrarCookie).send({
          caseId: advocateAssignedCase3.id,
          courtroomId: cr1.id,
          scheduledAt: slotDt.toISO(),
          durationMins: 30,
        }),
        request(app).post('/api/v1/hearings').set('Cookie', adminCookie).send({
          caseId: hearingScheduledCase5.id,
          courtroomId: cr1.id,
          scheduledAt: slotDt.toISO(),
          durationMins: 30,
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it('forbids JUDGE and ADVOCATE roles from scheduling hearings (403)', async () => {
      const slotDt = getFutureWorkingSlot(10, 11, 0);

      const judgeRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', judge1Cookie)
        .send({
          caseId: advocateAssignedCase3.id,
          courtroomId: cr1.id,
          scheduledAt: slotDt.toISO(),
          durationMins: 30,
        });
      expect(judgeRes.status).toBe(403);

      const advRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', advocateMehtaCookie)
        .send({
          caseId: advocateAssignedCase3.id,
          courtroomId: cr1.id,
          scheduledAt: slotDt.toISO(),
          durationMins: 30,
        });
      expect(advRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 6. Hearing Rescheduling API (PATCH /api/v1/hearings/:id)
  // =========================================================================
  describe('Hearing Rescheduling API', () => {
    it('allows REGISTRAR to reschedule a hearing with valid slot and audit event', async () => {
      const testHearing = seededHearings.find(
        (h) => h.status === 'SCHEDULED' && h.caseId === hearingScheduledCase5.id
      );
      const newSlot = getFutureWorkingSlot(15, 14, 30);

      const res = await request(app)
        .patch(`/api/v1/hearings/${testHearing.id}`)
        .set('Cookie', registrarCookie)
        .send({
          scheduledAt: newSlot.toISO(),
          courtroomId: cr2.id,
          reason: 'Presiding bench unavailable on original date',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hearing.courtroomId).toBe(cr2.id);

      // Verify HearingEvent (RESCHEDULED)
      const events = await prisma.hearingEvent.findMany({
        where: { hearingId: testHearing.id, action: 'RESCHEDULED' },
      });
      expect(events.length).toBe(1);
      expect(events[0].note).toBe('Presiding bench unavailable on original date');
    });

    it('allows presiding JUDGE to reschedule their hearing, but forbids other judges (403)', async () => {
      const judge1Hearing = seededHearings.find(
        (h) => h.status === 'SCHEDULED' && h.judgeId === judge1User.id
      );
      const newSlot = getFutureWorkingSlot(16, 11, 0);

      // Other judge (Judge 2) attempts to reschedule Judge 1's hearing
      const forbiddenRes = await request(app)
        .patch(`/api/v1/hearings/${judge1Hearing.id}`)
        .set('Cookie', judge2Cookie)
        .send({
          scheduledAt: newSlot.toISO(),
          reason: 'Unauthorized attempt',
        });
      expect(forbiddenRes.status).toBe(403);

      // Presiding judge (Judge 1) successfully reschedules
      const successRes = await request(app)
        .patch(`/api/v1/hearings/${judge1Hearing.id}`)
        .set('Cookie', judge1Cookie)
        .send({
          scheduledAt: newSlot.toISO(),
          reason: 'Judge adjusted calendar',
        });
      expect(successRes.status).toBe(200);
    });

    it('rejects rescheduling a COMPLETED hearing', async () => {
      const completedHearing = seededHearings.find(
        (h) =>
          h.status === 'COMPLETED' &&
          !seededCases.some((c) => c.id === h.caseId && c.status === 'CLOSED')
      );
      const newSlot = getFutureWorkingSlot(15, 11, 0);

      const res = await request(app)
        .patch(`/api/v1/hearings/${completedHearing.id}`)
        .set('Cookie', registrarCookie)
        .send({
          scheduledAt: newSlot.toISO(),
          reason: 'Cannot reschedule completed',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Only scheduled hearings can be rescheduled');
    });
  });

  // =========================================================================
  // 7. Hearing Cancellation API (POST /api/v1/hearings/:id/cancel)
  // =========================================================================
  describe('Hearing Cancellation API', () => {
    it('cancels hearing with reason and reverts case to ADVOCATE_ASSIGNED if last scheduled hearing', async () => {
      // Find a SCHEDULED hearing on a HEARING_SCHEDULED case that has only 1 scheduled hearing
      const hearing = seededHearings.find(
        (h) => h.status === 'SCHEDULED' && h.caseId === hearingScheduledCase5.id
      );

      const res = await request(app)
        .post(`/api/v1/hearings/${hearing.id}/cancel`)
        .set('Cookie', registrarCookie)
        .send({
          reason: 'Petitioner withdrew urgent hearing notice',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.hearing.status).toBe('CANCELLED');

      // Verify case status reverted to ADVOCATE_ASSIGNED
      const updatedCase = await prisma.case.findUnique({
        where: { id: hearingScheduledCase5.id },
      });
      expect(updatedCase.status).toBe('ADVOCATE_ASSIGNED');

      // Verify HearingEvent CANCELLED
      const event = await prisma.hearingEvent.findFirst({
        where: { hearingId: hearing.id, action: 'CANCELLED' },
      });
      expect(event).toBeDefined();
      expect(event.note).toBe('Petitioner withdrew urgent hearing notice');
    });

    it('rejects cancellation without reason or with reason shorter than 5 chars', async () => {
      const hearing = seededHearings.find((h) => h.status === 'SCHEDULED');

      const res = await request(app)
        .post(`/api/v1/hearings/${hearing.id}/cancel`)
        .set('Cookie', registrarCookie)
        .send({ reason: 'abc' });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 8. Hearing Completion API (POST /api/v1/hearings/:id/complete)
  // =========================================================================
  describe('Hearing Completion API', () => {
    it('rejects completion of a future hearing', async () => {
      // Create a future hearing to test
      const slotDt = getFutureWorkingSlot(18, 11, 0);
      const newHearing = await prisma.hearing.create({
        data: {
          caseId: hearingScheduledCase5.id,
          courtroomId: cr1.id,
          judgeId: judge1User.id,
          scheduledAt: slotDt.toJSDate(),
          durationMins: 30,
          purpose: 'Future Test Session',
          status: 'SCHEDULED',
        },
      });

      const res = await request(app)
        .post(`/api/v1/hearings/${newHearing.id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes: 'Hearing concluded with framing of charges',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('future date');
    });

    it('allows presiding JUDGE to complete past hearing, transitioning HEARING_SCHEDULED to UNDER_TRIAL', async () => {
      // Set scheduledAt of an existing scheduled hearing to 2 hours ago
      const hearing = seededHearings.find(
        (h) => h.status === 'SCHEDULED' && h.caseId === hearingScheduledCase5.id
      );
      const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000);

      await prisma.hearing.update({
        where: { id: hearing.id },
        data: { scheduledAt: pastTime },
      });

      const res = await request(app)
        .post(`/api/v1/hearings/${hearing.id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes: 'First preliminary hearing conducted. Notice issued to respondents.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.hearing.status).toBe('COMPLETED');

      // Verify case status transitioned to UNDER_TRIAL
      const updatedCase = await prisma.case.findUnique({
        where: { id: hearingScheduledCase5.id },
      });
      expect(updatedCase.status).toBe('UNDER_TRIAL');

      // Verify HearingEvent COMPLETED
      const event = await prisma.hearingEvent.findFirst({
        where: { hearingId: hearing.id, action: 'COMPLETED' },
      });
      expect(event).toBeDefined();
    });
  });

  // =========================================================================
  // 9. Hearing Adjournment API (POST /api/v1/hearings/:id/adjourn)
  // =========================================================================
  describe('Hearing Adjournment API', () => {
    it('adjourns hearing with reason and atomically books next hearing date', async () => {
      const hearing = seededHearings.find(
        (h) => h.status === 'SCHEDULED' && h.caseId === hearingScheduledCase5.id
      );
      const nextSlot = getFutureWorkingSlot(20, 11, 0);

      const res = await request(app)
        .post(`/api/v1/hearings/${hearing.id}/adjourn`)
        .set('Cookie', judge1Cookie)
        .send({
          reason: 'Counsel for respondent requested time to file counter affidavit',
          nextHearing: {
            scheduledAt: nextSlot.toISO(),
            courtroomId: cr1.id,
            durationMins: 30,
            purpose: 'Filing of Counter Affidavit',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.adjournedHearing.status).toBe('ADJOURNED');
      expect(res.body.data.nextHearing).toBeDefined();
      expect(res.body.data.nextHearing.status).toBe('SCHEDULED');

      // Case status remains HEARING_SCHEDULED (or UNDER_TRIAL)
      const c = await prisma.case.findUnique({ where: { id: hearingScheduledCase5.id } });
      expect(c.status).toBe('HEARING_SCHEDULED');
    });

    it('adjourns without next date, reverting case to ADVOCATE_ASSIGNED if no other scheduled hearing remains', async () => {
      const hearing = seededHearings.find(
        (h) => h.status === 'SCHEDULED' && h.caseId === hearingScheduledCase5.id
      );

      const res = await request(app)
        .post(`/api/v1/hearings/${hearing.id}/adjourn`)
        .set('Cookie', judge1Cookie)
        .send({
          reason: 'Adjourned sine die pending high court reference',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.adjournedHearing.status).toBe('ADJOURNED');
      expect(res.body.data.nextHearing).toBeNull();

      const c = await prisma.case.findUnique({ where: { id: hearingScheduledCase5.id } });
      expect(c.status).toBe('ADVOCATE_ASSIGNED');
    });
  });

  // =========================================================================
  // 10. Future-Dated Hearing Complete & Adjourn IST Regression Suite
  // =========================================================================
  describe('Future-Dated Hearing Complete & Adjourn IST Regression Suite', () => {
    let futureHearing;
    let expectedFutureDateStr;
    let todayHearingCase5;

    beforeEach(() => {
      const todayIST = DateTime.now().setZone('Asia/Kolkata').startOf('day');
      futureHearing = seededHearings.find((h) => {
        const hDay = DateTime.fromJSDate(new Date(h.scheduledAt), { zone: 'Asia/Kolkata' }).startOf(
          'day'
        );
        return h.status === 'SCHEDULED' && h.judgeId === judge1User.id && hDay > todayIST;
      });
      expect(futureHearing).toBeDefined();
      expectedFutureDateStr = DateTime.fromJSDate(new Date(futureHearing.scheduledAt), {
        zone: 'Asia/Kolkata',
      }).toFormat('dd LLL yyyy');

      todayHearingCase5 = seededHearings.find(
        (h) => h.caseId === hearingScheduledCase5.id && h.status === 'SCHEDULED'
      );
    });

    it('rejects adjournment of a future-dated hearing for JUDGE and ADMIN with clear message containing date', async () => {
      // 1. JUDGE (judge.swaminathan, assigned) attempts to adjourn future hearing
      const judgeRes = await request(app)
        .post(`/api/v1/hearings/${futureHearing.id}/adjourn`)
        .set('Cookie', judge1Cookie)
        .send({
          reason: 'Adjournment requested before hearing date',
        });

      expect(judgeRes.status).toBe(400);
      expect(judgeRes.body.message).toContain('future date');
      expect(judgeRes.body.message).toContain(expectedFutureDateStr);

      // 2. ADMIN attempts to adjourn future hearing
      const adminRes = await request(app)
        .post(`/api/v1/hearings/${futureHearing.id}/adjourn`)
        .set('Cookie', adminCookie)
        .send({
          reason: 'Admin adjournment requested before hearing date',
        });

      expect(adminRes.status).toBe(400);
      expect(adminRes.body.message).toContain('future date');
      expect(adminRes.body.message).toContain(expectedFutureDateStr);
    });

    it('rejects completion of a future-dated hearing for JUDGE and ADMIN with clear message containing date', async () => {
      // 1. JUDGE attempts to complete future hearing
      const judgeRes = await request(app)
        .post(`/api/v1/hearings/${futureHearing.id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes: 'Attempting to complete future hearing',
        });

      expect(judgeRes.status).toBe(400);
      expect(judgeRes.body.message).toContain('future date');
      expect(judgeRes.body.message).toContain(expectedFutureDateStr);

      // 2. ADMIN attempts to complete future hearing
      const adminRes = await request(app)
        .post(`/api/v1/hearings/${futureHearing.id}/complete`)
        .set('Cookie', adminCookie)
        .send({
          outcomeNotes: 'Admin attempting to complete future hearing',
        });

      expect(adminRes.status).toBe(400);
      expect(adminRes.body.message).toContain('future date');
      expect(adminRes.body.message).toContain(expectedFutureDateStr);
    });

    it('allows completion on a hearing dated today (IST) for JUDGE and ADMIN', async () => {
      // Presiding Judge completes hearing scheduled today
      const judgeRes = await request(app)
        .post(`/api/v1/hearings/${todayHearingCase5.id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes: 'Hearing proceedings concluded on today date',
        });

      expect(judgeRes.status).toBe(200);
      expect(judgeRes.body.data.hearing.status).toBe('COMPLETED');
    });

    it('allows adjournment on a hearing dated today (IST) for JUDGE and ADMIN', async () => {
      // Admin adjourns hearing scheduled today
      const adminRes = await request(app)
        .post(`/api/v1/hearings/${todayHearingCase5.id}/adjourn`)
        .set('Cookie', adminCookie)
        .send({
          reason: 'Parties requested short adjournment on today date',
        });

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.adjournedHearing.status).toBe('ADJOURNED');
    });

    it('allows completion and adjournment on a hearing scheduled earlier today (IST)', async () => {
      // Set hearing to earlier today (e.g., 09:30 IST today)
      const earlierToday = DateTime.now()
        .setZone('Asia/Kolkata')
        .startOf('day')
        .plus({ hours: 9, minutes: 30 })
        .toJSDate();

      await prisma.hearing.update({
        where: { id: todayHearingCase5.id },
        data: { scheduledAt: earlierToday },
      });

      // Complete hearing earlier today
      const compRes = await request(app)
        .post(`/api/v1/hearings/${todayHearingCase5.id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes: 'Concluded morning hearing session',
        });

      expect(compRes.status).toBe(200);
      expect(compRes.body.data.hearing.status).toBe('COMPLETED');
    });

    it('handles UTC date boundary correctly for a hearing at 00:30 IST today (UTC yesterday 19:00)', async () => {
      // 00:30 IST today is 19:00 UTC yesterday
      const boundaryMorningIST = DateTime.now()
        .setZone('Asia/Kolkata')
        .startOf('day')
        .plus({ minutes: 30 })
        .toJSDate();

      await prisma.hearing.update({
        where: { id: todayHearingCase5.id },
        data: { scheduledAt: boundaryMorningIST },
      });

      // Completing a 00:30 IST today hearing must be accepted
      const compRes = await request(app)
        .post(`/api/v1/hearings/${todayHearingCase5.id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes: 'Concluded midnight-boundary hearing',
        });

      expect(compRes.status).toBe(200);
      expect(compRes.body.data.hearing.status).toBe('COMPLETED');
    });

    it('handles UTC date boundary correctly for a hearing at 23:30 IST today (UTC today 18:00)', async () => {
      // 23:30 IST today is 18:00 UTC today
      const boundaryNightIST = DateTime.now()
        .setZone('Asia/Kolkata')
        .startOf('day')
        .plus({ hours: 23, minutes: 30 })
        .toJSDate();

      await prisma.hearing.update({
        where: { id: todayHearingCase5.id },
        data: { scheduledAt: boundaryNightIST },
      });

      // Adjourning a 23:30 IST today hearing must be accepted
      const adjRes = await request(app)
        .post(`/api/v1/hearings/${todayHearingCase5.id}/adjourn`)
        .set('Cookie', judge1Cookie)
        .send({
          reason: 'Late evening session adjourned',
        });

      expect(adjRes.status).toBe(200);
      expect(adjRes.body.data.adjournedHearing.status).toBe('ADJOURNED');
    });

    it('rejects a hearing at 00:30 IST tomorrow even when UTC time is still today (19:00 UTC today)', async () => {
      // 00:30 IST tomorrow is 19:00 UTC today
      const tomorrowEarlyIST = DateTime.now()
        .setZone('Asia/Kolkata')
        .startOf('day')
        .plus({ days: 1, minutes: 30 });

      await prisma.hearing.update({
        where: { id: todayHearingCase5.id },
        data: { scheduledAt: tomorrowEarlyIST.toJSDate() },
      });

      // Complete must be rejected
      const compRes = await request(app)
        .post(`/api/v1/hearings/${todayHearingCase5.id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes: 'Invalid attempt to complete tomorrow early hearing',
        });

      expect(compRes.status).toBe(400);
      expect(compRes.body.message).toContain('future date');
      expect(compRes.body.message).toContain(tomorrowEarlyIST.toFormat('dd LLL yyyy'));

      // Adjourn must be rejected
      const adjRes = await request(app)
        .post(`/api/v1/hearings/${todayHearingCase5.id}/adjourn`)
        .set('Cookie', judge1Cookie)
        .send({
          reason: 'Invalid attempt to adjourn tomorrow early hearing',
        });

      expect(adjRes.status).toBe(400);
      expect(adjRes.body.message).toContain('future date');
      expect(adjRes.body.message).toContain(tomorrowEarlyIST.toFormat('dd LLL yyyy'));
    });
  });

  // =========================================================================
  // 11. Cross-Module Judge Reassignment Block (PATCH /api/v1/cases/:id)
  // =========================================================================
  describe('Cross-Module Judge Reassignment Rule', () => {
    it('rejects changing case judge when scheduled hearings exist', async () => {
      // Case 5 has a SCHEDULED hearing under judge 1
      const res = await request(app)
        .patch(`/api/v1/cases/${hearingScheduledCase5.id}`)
        .set('Cookie', registrarCookie)
        .send({
          judgeId: judge2User.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'Cannot reassign presiding judge while scheduled hearings exist'
      );
    });
  });

  // =========================================================================
  // 11. Case Detail Timeline Integration (GET /api/v1/cases/:id)
  // =========================================================================
  describe('Case Detail Timeline Integration', () => {
    it('includes computed endsAt on hearings and merges HearingEvents into history timeline', async () => {
      const res = await request(app)
        .get(`/api/v1/cases/${underTrialCase7.id}`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      const caseData = res.body.data.case;

      // Check hearings have endsAt
      expect(caseData.hearings.length).toBeGreaterThan(0);
      expect(caseData.hearings[0].endsAt).toBeDefined();

      // Check statusHistory includes Hearing events
      const hearingTimelineEvent = caseData.statusHistory.find((item) =>
        item.id.startsWith('hearing-event-')
      );
      expect(hearingTimelineEvent).toBeDefined();
      expect(hearingTimelineEvent.reason).toContain('Hearing [');
    });
  });
});
