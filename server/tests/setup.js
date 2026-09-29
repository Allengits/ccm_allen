import { afterAll, expect } from 'vitest';
import prisma from '../src/db/prisma.js';

export const SEEDED_BASELINE = {
  users: 7,
  advocates: 6,
  courtrooms: 4,
  cases: 14,
  caseAdvocates: 26,
  hearings: 16,
  hearingEvents: 25,
  judgments: 4,
  caseStatusHistory: 50,
  caseSequences: 2,
  systemSettings: 14,
};

export const SEEDED_SEQUENCES = [
  { prefix: 'CC', year: 2025, lastNumber: 85 },
  { prefix: 'CC', year: 2026, lastNumber: 112 },
];

export async function verifyDatabaseBaseline() {
  const tableCounts = {
    users: await prisma.user.count(),
    advocates: await prisma.advocate.count(),
    courtrooms: await prisma.courtroom.count(),
    cases: await prisma.case.count(),
    caseAdvocates: await prisma.caseAdvocate.count(),
    hearings: await prisma.hearing.count(),
    hearingEvents: await prisma.hearingEvent.count(),
    judgments: await prisma.judgment.count(),
    caseStatusHistory: await prisma.caseStatusHistory.count(),
    caseSequences: await prisma.caseSequence.count(),
    systemSettings: await prisma.systemSetting.count(),
  };

  const rawSequences = await prisma.caseSequence.findMany({
    select: { prefix: true, year: true, lastNumber: true },
    orderBy: [{ prefix: 'asc' }, { year: 'asc' }],
  });

  return { tableCounts, sequences: rawSequences };
}

afterAll(async () => {
  const { tableCounts, sequences } = await verifyDatabaseBaseline();

  expect(
    tableCounts,
    'Database integrity check failed: table row counts do not match seeded baseline'
  ).toEqual(SEEDED_BASELINE);

  expect(
    sequences,
    'Database integrity check failed: CaseSequence rows or lastNumber values do not match seeded baseline'
  ).toEqual(SEEDED_SEQUENCES);
});
