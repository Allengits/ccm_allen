import { DateTime } from 'luxon';
import prisma from '../db/prisma.js';

export const DEFAULT_COURT_SETTINGS = {
  court_timezone: 'Asia/Kolkata',
  court_start_time: '10:00',
  court_end_time: '17:00',
  lunch_start: '13:00',
  lunch_end: '14:00',
  court_working_days: 'MON,TUE,WED,THU,FRI',
  slot_minutes: '15',
};

const WEEKDAY_NAMES = ['', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * Loads court settings from system_settings table with safe fallbacks.
 * @param {object} tx - Prisma transaction or default prisma client
 * @returns {Promise<object>}
 */
export async function getCourtSettings(tx = prisma) {
  const keys = Object.keys(DEFAULT_COURT_SETTINGS);
  const rows = await tx.systemSetting.findMany({
    where: { key: { in: keys } },
  });

  const settings = { ...DEFAULT_COURT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return {
    timezone: settings.court_timezone || 'Asia/Kolkata',
    startTime: settings.court_start_time || '10:00',
    endTime: settings.court_end_time || '17:00',
    lunchStart: settings.lunch_start || '13:00',
    lunchEnd: settings.lunch_end || '14:00',
    workingDays: (settings.court_working_days || 'MON,TUE,WED,THU,FRI')
      .split(',')
      .map((d) => d.trim().toUpperCase()),
    slotMinutes: parseInt(settings.slot_minutes, 10) || 15,
  };
}

/**
 * Parses time string (HH:mm) onto an existing DateTime object in court timezone.
 * @param {DateTime} baseDt
 * @param {string} timeStr
 * @returns {DateTime}
 */
export function parseTimeString(baseDt, timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  return baseDt.set({ hour, minute, second: 0, millisecond: 0 });
}

/**
 * Validates slot time according to court business rules:
 * - Must be in the future (relative to court's current time)
 * - Must be on a court working day
 * - Must start on a slot boundary (e.g. 15-minute boundary)
 * - Must fall within working hours (10:00 - 17:00)
 * - Must not overlap the lunch break (13:00 - 14:00)
 *
 * @param {string|Date} scheduledAtInput
 * @param {number} durationMins
 * @param {object} settings
 * @param {boolean} [allowPast=false]
 * @returns {{ startDt: DateTime, endDt: DateTime }}
 */
export function validateSlotRules(scheduledAtInput, durationMins, settings, allowPast = false) {
  const startDt = DateTime.fromJSDate(new Date(scheduledAtInput), { zone: settings.timezone });

  if (!startDt.isValid) {
    throw new Error('Invalid scheduledAt date format');
  }

  const now = DateTime.now().setZone(settings.timezone);
  if (!allowPast && startDt <= now) {
    throw new Error('Hearing must be scheduled in the future');
  }

  // Working day validation
  const dayCode = WEEKDAY_NAMES[startDt.weekday];
  if (!settings.workingDays.includes(dayCode)) {
    throw new Error(
      `Date ${startDt.toFormat('yyyy-MM-dd')} (${startDt.toFormat('cccc')}) is not a court working day`
    );
  }

  // Slot boundary validation
  if (startDt.minute % settings.slotMinutes !== 0 || startDt.second !== 0) {
    throw new Error(
      `Hearing slot must start on a ${settings.slotMinutes}-minute boundary (e.g. 10:00, 10:15)`
    );
  }

  // Duration validation
  if (
    !durationMins ||
    durationMins < settings.slotMinutes ||
    durationMins % settings.slotMinutes !== 0
  ) {
    throw new Error(
      `Duration must be a multiple of ${settings.slotMinutes} minutes (minimum ${settings.slotMinutes} minutes)`
    );
  }

  const endDt = startDt.plus({ minutes: durationMins });

  // Court hours boundaries
  const dayStart = parseTimeString(startDt, settings.startTime);
  const dayEnd = parseTimeString(startDt, settings.endTime);

  if (startDt < dayStart) {
    throw new Error(
      `Hearing cannot start before court opening time (${settings.startTime} ${settings.timezone})`
    );
  }

  if (endDt > dayEnd) {
    throw new Error(
      `Hearing cannot extend past court closing time (${settings.endTime} ${settings.timezone})`
    );
  }

  // Lunch break overlap check: [startDt, endDt) intersects [lunchStart, lunchEnd)
  const lunchStart = parseTimeString(startDt, settings.lunchStart);
  const lunchEnd = parseTimeString(startDt, settings.lunchEnd);

  if (startDt < lunchEnd && endDt > lunchStart) {
    throw new Error(
      `Hearing cannot overlap court lunch break (${settings.lunchStart} - ${settings.lunchEnd} ${settings.timezone})`
    );
  }

  return { startDt, endDt };
}

/**
 * Checks whether two time intervals [startA, endA) and [startB, endB) overlap.
 * @param {Date} startA
 * @param {Date} endA
 * @param {Date} startB
 * @param {Date} endB
 * @returns {boolean}
 */
export function intervalsOverlap(startA, endA, startB, endB) {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

/**
 * Formats a Date to a human readable IST time string.
 * @param {Date} date
 * @param {string} timezone
 * @returns {string} e.g. "10:30 AM"
 */
export function formatTimeIST(date, timezone = 'Asia/Kolkata') {
  return DateTime.fromJSDate(date, { zone: timezone }).toFormat('hh:mm a');
}

/**
 * Formats a Date to a full readable IST date-time string.
 * @param {Date} date
 * @param {string} timezone
 * @returns {string} e.g. "29 Sep 2026, 10:30 AM"
 */
export function formatDateTimeIST(date, timezone = 'Asia/Kolkata') {
  return DateTime.fromJSDate(date, { zone: timezone }).toFormat('dd LLL yyyy, hh:mm a');
}
