/**
 * Dashboard & Automation Settings Utilities
 *
 * Centralizes configurable court threshold settings for pendency monitoring,
 * stale case detection, workload thresholds, and hearing windows.
 * Sane defaults are applied whenever a row is missing from SystemSetting.
 */

import prisma from '../db/prisma.js';

export const DEFAULT_DASHBOARD_SETTINGS = {
  backlog_threshold_days: 90,
  advocate_workload_warning_threshold: 15,
  judge_workload_warning_threshold: 25,
  stale_case_no_advocate_days: 14,
  stale_case_no_hearing_days: 21,
  upcoming_hearings_window_days: 7,
};

export const SETTING_RANGES = {
  backlog_threshold_days: { min: 1, max: 3650, label: 'Backlog Pendency Threshold (Days)' },
  advocate_workload_warning_threshold: {
    min: 1,
    max: 500,
    label: 'Advocate Workload Warning Threshold (Cases)',
  },
  judge_workload_warning_threshold: {
    min: 1,
    max: 500,
    label: 'Judge Workload Warning Threshold (Cases)',
  },
  stale_case_no_advocate_days: {
    min: 1,
    max: 365,
    label: 'Stale Case No Advocate Threshold (Days)',
  },
  stale_case_no_hearing_days: { min: 1, max: 365, label: 'Stale Case No Hearing Threshold (Days)' },
  upcoming_hearings_window_days: {
    min: 1,
    max: 90,
    label: 'Upcoming Hearings Monitoring Window (Days)',
  },
};

/**
 * Loads all dashboard threshold settings from database with safe fallback defaults.
 * @param {object} tx - Optional Prisma transaction or client
 * @returns {Promise<{
 *   backlogThresholdDays: number,
 *   advocateWorkloadWarningThreshold: number,
 *   judgeWorkloadWarningThreshold: number,
 *   staleCaseNoAdvocateDays: number,
 *   staleCaseNoHearingDays: number,
 *   upcomingHearingsWindowDays: number,
 *   raw: Record<string, number>
 * }>}
 */
export async function getDashboardSettings(tx = prisma) {
  const keys = Object.keys(DEFAULT_DASHBOARD_SETTINGS);
  const rows = await tx.systemSetting.findMany({
    where: { key: { in: keys } },
  });

  const raw = { ...DEFAULT_DASHBOARD_SETTINGS };
  for (const row of rows) {
    const parsed = parseInt(row.value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      raw[row.key] = parsed;
    }
  }

  return {
    backlogThresholdDays: raw.backlog_threshold_days,
    advocateWorkloadWarningThreshold: raw.advocate_workload_warning_threshold,
    judgeWorkloadWarningThreshold: raw.judge_workload_warning_threshold,
    staleCaseNoAdvocateDays: raw.stale_case_no_advocate_days,
    staleCaseNoHearingDays: raw.stale_case_no_hearing_days,
    upcomingHearingsWindowDays: raw.upcoming_hearings_window_days,
    raw,
  };
}

/**
 * Loads recent audit log history for dashboard setting modifications.
 * @param {object} tx - Optional Prisma transaction or client
 * @returns {Promise<Array<object>>}
 */
export async function getSettingsAuditLog(tx = prisma) {
  const rows = await tx.systemSetting.findMany({
    where: { key: { startsWith: 'audit:' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return rows.map((r) => {
    let parsed;
    try {
      parsed = JSON.parse(r.value);
    } catch {
      parsed = {};
    }
    return {
      id: r.key,
      settingKey: parsed.settingKey || '',
      oldValue: parsed.oldValue || '',
      newValue: parsed.newValue || '',
      changedById: parsed.changedById || '',
      changedByName: r.description || 'System',
      changedAt: r.createdAt.toISOString(),
    };
  });
}
