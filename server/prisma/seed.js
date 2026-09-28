// Prisma Database Seed Script
// Populates realistic demo dataset for the Court Case Management System.
// Safe to re-run: clears all tables in foreign-key dependency order before reseeding.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Helper to generate dates relative to current execution time
const now = new Date();
const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const daysAhead = (days, hour = 10, minute = 0) => {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const setTime = (date, hour, minute) => {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function main() {
  console.log('--- Starting Court CMS Database Seed ---');

  // ==========================================
  // 1. CLEAN EXISTING DATA (Safe Re-run)
  // ==========================================
  console.log('Clearing existing records in reverse dependency order...');
  await prisma.evidenceCustodyLog.deleteMany({});
  await prisma.evidence.deleteMany({});
  await prisma.hearing.deleteMany({});
  await prisma.judgment.deleteMany({});
  await prisma.caseStatusHistory.deleteMany({});
  await prisma.caseAdvocate.deleteMany({});
  await prisma.case.deleteMany({});
  await prisma.courtroom.deleteMany({});
  await prisma.advocate.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.caseSequence.deleteMany({});
  await prisma.systemSetting.deleteMany({});
  console.log('✓ All existing records cleared.');

  // ==========================================
  // 2. SYSTEM SETTINGS
  // ==========================================
  console.log('Seeding system settings...');
  await prisma.systemSetting.createMany({
    data: [
      {
        key: 'backlog_threshold_days',
        value: '90',
        description:
          'Case pendency threshold in days beyond which active cases are flagged on backlog monitor',
      },
      {
        key: 'court_jurisdiction',
        value: 'District & Sessions Court, Central Judicial Complex',
        description: 'Official court jurisdiction title',
      },
      {
        key: 'advocate_workload_warning_threshold',
        value: '15',
        description:
          'Active open cases threshold beyond which a soft workload warning is flagged during advocate assignment',
      },
    ],
  });

  // ==========================================
  // 3. CASE SEQUENCES
  // ==========================================
  console.log('Seeding case sequences...');
  await prisma.caseSequence.createMany({
    data: [
      { prefix: 'CC', year: 2026, lastNumber: 112 },
      { prefix: 'CC', year: 2025, lastNumber: 85 },
    ],
  });

  // ==========================================
  // 4. USERS (Demo credentials: Demo@1234)
  // ==========================================
  console.log('Seeding demo users (Password: Demo@1234)...');
  const demoPasswordHash = bcrypt.hashSync('Demo@1234', 10);

  // 1 Admin
  const adminUser = await prisma.user.create({
    data: {
      name: 'Rajesh Varma (Registrar Admin)',
      email: 'admin@courtcms.gov.in',
      passwordHash: demoPasswordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  // 1 Registrar
  const registrarUser = await prisma.user.create({
    data: {
      name: 'Sunita Sharma (Chief Clerk)',
      email: 'registrar@courtcms.gov.in',
      passwordHash: demoPasswordHash,
      role: 'REGISTRAR',
      isActive: true,
    },
  });

  // 2 Judges
  const judge1 = await prisma.user.create({
    data: {
      name: 'Hon. Justice D. Y. Swaminathan',
      email: 'judge.swaminathan@courtcms.gov.in',
      passwordHash: demoPasswordHash,
      role: 'JUDGE',
      isActive: true,
    },
  });

  const judge2 = await prisma.user.create({
    data: {
      name: 'Hon. Justice Ruma Banerjee',
      email: 'judge.banerjee@courtcms.gov.in',
      passwordHash: demoPasswordHash,
      role: 'JUDGE',
      isActive: true,
    },
  });

  // 3 Advocate Users
  const advUser1 = await prisma.user.create({
    data: {
      name: 'Harish Mehta',
      email: 'adv.mehta@courtcms.gov.in',
      passwordHash: demoPasswordHash,
      role: 'ADVOCATE',
      isActive: true,
    },
  });

  const advUser2 = await prisma.user.create({
    data: {
      name: 'Priya Iyer',
      email: 'adv.iyer@courtcms.gov.in',
      passwordHash: demoPasswordHash,
      role: 'ADVOCATE',
      isActive: true,
    },
  });

  const advUser3 = await prisma.user.create({
    data: {
      name: 'Zafar Khan',
      email: 'adv.khan@courtcms.gov.in',
      passwordHash: demoPasswordHash,
      role: 'ADVOCATE',
      isActive: true,
    },
  });

  // ==========================================
  // 5. ADVOCATES (6 total: 3 linked, 3 unlinked)
  // ==========================================
  console.log('Seeding advocates...');
  const adv1 = await prisma.advocate.create({
    data: {
      userId: advUser1.id,
      name: 'Harish Mehta',
      barNumber: 'D/1998/0142',
      specialization: 'Criminal Law & Constitutional Writs',
      email: 'adv.mehta@courtcms.gov.in',
      phone: '+91 98110 23456',
    },
  });

  const adv2 = await prisma.advocate.create({
    data: {
      userId: advUser2.id,
      name: 'Priya Iyer',
      barNumber: 'TN/2007/0891',
      specialization: 'Commercial & Corporate Arbitration',
      email: 'adv.iyer@courtcms.gov.in',
      phone: '+91 98401 56789',
    },
  });

  const adv3 = await prisma.advocate.create({
    data: {
      userId: advUser3.id,
      name: 'Zafar Khan',
      barNumber: 'MAH/2012/1045',
      specialization: 'Property & Land Title Disputes',
      email: 'adv.khan@courtcms.gov.in',
      phone: '+91 98220 34567',
    },
  });

  const adv4 = await prisma.advocate.create({
    data: {
      userId: null,
      name: 'Anand Grover',
      barNumber: 'DL/2002/0543',
      specialization: 'Civil & Family Law',
      email: 'anand.grover@bar.org.in',
      phone: '+91 98100 87654',
    },
  });

  const adv5 = await prisma.advocate.create({
    data: {
      userId: null,
      name: 'Meenakshi Sundaram',
      barNumber: 'KA/2015/0732',
      specialization: 'White Collar Crime & Cyber Law',
      email: 'm.sundaram@bar.org.in',
      phone: '+91 97400 12345',
    },
  });

  const adv6 = await prisma.advocate.create({
    data: {
      userId: null,
      name: 'Vikram Deshmukh',
      barNumber: 'WB/2010/0219',
      specialization: 'Contract & Commercial Litigation',
      email: 'v.deshmukh@bar.org.in',
      phone: '+91 98300 98765',
    },
  });

  // ==========================================
  // 6. COURTROOMS (4 total)
  // ==========================================
  console.log('Seeding courtrooms...');
  const cr1 = await prisma.courtroom.create({
    data: {
      name: 'Court Hall 1 (Chief Justice Bench)',
      location: 'Ground Floor, Main Heritage Wing',
      isActive: true,
    },
  });

  const cr2 = await prisma.courtroom.create({
    data: {
      name: 'Court Hall 2 (Commercial Division)',
      location: '1st Floor, North Block',
      isActive: true,
    },
  });

  const cr3 = await prisma.courtroom.create({
    data: {
      name: 'Court Hall 3 (Sessions & Criminal Bench)',
      location: '1st Floor, South Block',
      isActive: true,
    },
  });

  const cr4 = await prisma.courtroom.create({
    data: {
      name: 'Court Hall 4 (Family & Civil Bench)',
      location: '2nd Floor, Annex Building',
      isActive: true,
    },
  });

  // ==========================================
  // 7. CASES (14 total across all 6 statuses)
  // ==========================================
  console.log('Seeding cases across full lifecycle...');

  // --- STATUS: REGISTERED (2 cases: no advocate, no hearing) ---
  const case1 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2026/00101',
      title: 'State of NCT vs. Rameshwar Prasad & Ors.',
      caseType: 'CRIMINAL',
      status: 'REGISTERED',
      priority: 'NORMAL',
      petitioner: 'State through Inspector S.K. Verma',
      respondent: 'Rameshwar Prasad, Jagdish Prasad',
      description: 'Allegations of illegal warehousing under Essential Commodities Act.',
      filingDate: daysAgo(10),
      judgeId: judge1.id,
      registeredById: registrarUser.id,
    },
  });

  const case2 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2026/00102',
      title: 'Kavita Nair vs. Apex Logistics Ltd.',
      caseType: 'CIVIL',
      status: 'REGISTERED',
      priority: 'URGENT',
      petitioner: 'Kavita Nair',
      respondent: 'Apex Logistics Pvt. Ltd.',
      description: 'Injunction petition for urgent preservation of perishable cargo in transit.',
      filingDate: daysAgo(5),
      judgeId: judge2.id,
      registeredById: registrarUser.id,
    },
  });

  // --- STATUS: ADVOCATE_ASSIGNED (2 cases: advocates assigned, no hearing) ---
  const case3 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2026/00103',
      title: 'Balram Yadav vs. Municipal Corporation',
      caseType: 'PROPERTY',
      status: 'ADVOCATE_ASSIGNED',
      priority: 'NORMAL',
      petitioner: 'Balram Yadav',
      respondent: 'Municipal Corporation of Delhi',
      description: 'Boundary demarcations and property encroachment objection on plot 42.',
      filingDate: daysAgo(25),
      judgeId: judge1.id,
      registeredById: registrarUser.id,
    },
  });

  // Case 4: Backlog Case #1 (>90 days old, open)
  const case4 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2025/00085',
      title: 'Sterling Agro Exports vs. National Marine Insurers',
      caseType: 'COMMERCIAL',
      status: 'ADVOCATE_ASSIGNED',
      priority: 'NORMAL',
      petitioner: 'Sterling Agro Exports Corp',
      respondent: 'National Marine Insurance Co.',
      description: 'Breach of marine consignment indemnity contract during transit delays.',
      filingDate: daysAgo(115), // Backlog (>90 days)
      judgeId: judge2.id,
      registeredById: adminUser.id,
    },
  });

  // --- STATUS: HEARING_SCHEDULED (2 cases: advocates + future scheduled hearing) ---
  const case5 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2026/00105',
      title: 'Shalini Verma vs. Gaurav Verma',
      caseType: 'FAMILY',
      status: 'HEARING_SCHEDULED',
      priority: 'NORMAL',
      petitioner: 'Shalini Verma',
      respondent: 'Gaurav Verma',
      description: 'Petition for custody and maintenance under Hindu Marriage Act.',
      filingDate: daysAgo(35),
      judgeId: judge1.id,
      registeredById: registrarUser.id,
    },
  });

  // Case 6: Backlog Case #2 (>90 days old, open)
  const case6 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2025/00072',
      title: 'Public Welfare Forum vs. State Pollution Board',
      caseType: 'CONSTITUTIONAL',
      status: 'HEARING_SCHEDULED',
      priority: 'URGENT',
      petitioner: 'Public Welfare Forum',
      respondent: 'State Pollution Control Board & Anr.',
      description: 'Public interest writ challenging river discharge permits.',
      filingDate: daysAgo(145), // Backlog (>90 days)
      judgeId: judge2.id,
      registeredById: adminUser.id,
    },
  });

  // --- STATUS: UNDER_TRIAL (4 cases: advocates + past hearings + future hearing + evidence) ---
  // Case 7: Backlog Case #3 (>90 days old, open)
  const case7 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2025/00045',
      title: 'State vs. Vikramjeet Malhotra',
      caseType: 'CRIMINAL',
      status: 'UNDER_TRIAL',
      priority: 'URGENT',
      petitioner: 'State through CBI Economic Offences Wing',
      respondent: 'Vikramjeet Malhotra',
      description: 'Corporate misappropriation and counterfeit banking instrument charges.',
      filingDate: daysAgo(185), // Backlog (>90 days)
      judgeId: judge1.id,
      registeredById: adminUser.id,
    },
  });

  // Case 8: Backlog Case #4 (>90 days old, open)
  const case8 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2025/00058',
      title: 'Orient Infotech Ltd. vs. Skyward Telecom Solutions',
      caseType: 'COMMERCIAL',
      status: 'UNDER_TRIAL',
      priority: 'NORMAL',
      petitioner: 'Orient Infotech Ltd.',
      respondent: 'Skyward Telecom Solutions Pvt. Ltd.',
      description: 'Recovery of software licensing dues and breach of exclusive vendor contract.',
      filingDate: daysAgo(155), // Backlog (>90 days)
      judgeId: judge2.id,
      registeredById: registrarUser.id,
    },
  });

  const case9 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2026/00109',
      title: 'Chander Bhan vs. Govind Ram & Ors.',
      caseType: 'PROPERTY',
      status: 'UNDER_TRIAL',
      priority: 'NORMAL',
      petitioner: 'Chander Bhan',
      respondent: 'Govind Ram, Sitaram',
      description: 'Partition suit regarding ancestral agricultural parcel measuring 14 bighas.',
      filingDate: daysAgo(72),
      judgeId: judge1.id,
      registeredById: registrarUser.id,
    },
  });

  const case10 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2026/00110',
      title: 'Dr. Anita Joshi vs. Metro Healthcare Hospital',
      caseType: 'CIVIL',
      status: 'UNDER_TRIAL',
      priority: 'NORMAL',
      petitioner: 'Dr. Anita Joshi',
      respondent: 'Metro Healthcare Hospitals Ltd.',
      description: 'Damages claim for unlawful termination of senior consultant appointment.',
      filingDate: daysAgo(52),
      judgeId: judge2.id,
      registeredById: registrarUser.id,
    },
  });

  // --- STATUS: JUDGMENT_RESERVED (2 cases: Judgment with status RESERVED) ---
  // Case 11: Backlog Case #5 (>90 days old, open)
  const case11 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2025/00030',
      title: 'State vs. Anand Mohan & Associates',
      caseType: 'CRIMINAL',
      status: 'JUDGMENT_RESERVED',
      priority: 'URGENT',
      petitioner: 'State through Crime Branch',
      respondent: 'Anand Mohan',
      description: 'Trial concluding on tender manipulation and public contract fraud.',
      filingDate: daysAgo(210), // Backlog (>90 days)
      judgeId: judge1.id,
      registeredById: adminUser.id,
    },
  });

  const case12 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2026/00112',
      title: 'Zenith Retailers vs. Apex Real Estate Developers',
      caseType: 'COMMERCIAL',
      status: 'JUDGMENT_RESERVED',
      priority: 'NORMAL',
      petitioner: 'Zenith Retailers Consortium',
      respondent: 'Apex Real Estate Developers Ltd.',
      description: 'Dispute over commercial mall space delivery and lease rentals.',
      filingDate: daysAgo(82),
      judgeId: judge2.id,
      registeredById: registrarUser.id,
    },
  });

  // --- STATUS: CLOSED (2 cases: Judgment status DELIVERED, closedAt set) ---
  const case13 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2025/00015',
      title: 'Naveen Jindal vs. Haryana Urban Development',
      caseType: 'CIVIL',
      status: 'CLOSED',
      priority: 'NORMAL',
      petitioner: 'Naveen Jindal',
      respondent: 'Haryana Urban Development Authority',
      description: 'Enhancement of compensation for land acquired under urban development scheme.',
      filingDate: daysAgo(310),
      closedAt: daysAgo(25),
      judgeId: judge1.id,
      registeredById: adminUser.id,
    },
  });

  const case14 = await prisma.case.create({
    data: {
      caseNumber: 'CC/2025/00022',
      title: 'State vs. Satish Kumar & Anr.',
      caseType: 'CRIMINAL',
      status: 'CLOSED',
      priority: 'NORMAL',
      petitioner: 'State through Police Station Karol Bagh',
      respondent: 'Satish Kumar, Manoj Kumar',
      description: 'Trial under Section 420/468 Indian Penal Code for fake identity documents.',
      filingDate: daysAgo(270),
      closedAt: daysAgo(42),
      judgeId: judge2.id,
      registeredById: adminUser.id,
    },
  });

  // ==========================================
  // 8. CASE ADVOCATES (Assignments)
  // ==========================================
  console.log('Seeding case advocate assignments...');
  await prisma.caseAdvocate.createMany({
    data: [
      // Case 3 (ADVOCATE_ASSIGNED)
      {
        caseId: case3.id,
        advocateId: adv3.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(20),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case3.id,
        advocateId: adv4.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(18),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 4 (ADVOCATE_ASSIGNED - Backlog)
      {
        caseId: case4.id,
        advocateId: adv2.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(100),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case4.id,
        advocateId: adv6.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(95),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 5 (HEARING_SCHEDULED)
      {
        caseId: case5.id,
        advocateId: adv4.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(30),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case5.id,
        advocateId: adv1.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(28),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 6 (HEARING_SCHEDULED - Backlog)
      {
        caseId: case6.id,
        advocateId: adv1.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(130),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case6.id,
        advocateId: adv5.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(125),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 7 (UNDER_TRIAL - Backlog)
      {
        caseId: case7.id,
        advocateId: adv3.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(190),
        assignedById: registrarUser.id,
        isActive: false,
        unassignedAt: daysAgo(176),
        unassignedById: registrarUser.id,
        unassignReason: 'Advocate withdrew due to scheduling conflict before the High Court',
      },
      {
        caseId: case7.id,
        advocateId: adv1.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(175),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case7.id,
        advocateId: adv5.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(170),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 8 (UNDER_TRIAL - Backlog)
      {
        caseId: case8.id,
        advocateId: adv2.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(145),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case8.id,
        advocateId: adv6.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(140),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 9 (UNDER_TRIAL)
      {
        caseId: case9.id,
        advocateId: adv1.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(80),
        assignedById: registrarUser.id,
        isActive: false,
        unassignedAt: daysAgo(61),
        unassignedById: registrarUser.id,
        unassignReason: 'Client requested substitution of legal counsel',
      },
      {
        caseId: case9.id,
        advocateId: adv3.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(65),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case9.id,
        advocateId: adv4.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(60),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 10 (UNDER_TRIAL)
      {
        caseId: case10.id,
        advocateId: adv2.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(48),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case10.id,
        advocateId: adv6.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(45),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 11 (JUDGMENT_RESERVED - Backlog)
      {
        caseId: case11.id,
        advocateId: adv1.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(200),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case11.id,
        advocateId: adv5.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(195),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 12 (JUDGMENT_RESERVED)
      {
        caseId: case12.id,
        advocateId: adv2.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(78),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case12.id,
        advocateId: adv6.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(75),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 13 (CLOSED)
      {
        caseId: case13.id,
        advocateId: adv4.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(300),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case13.id,
        advocateId: adv3.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(295),
        assignedById: registrarUser.id,
        isActive: true,
      },

      // Case 14 (CLOSED)
      {
        caseId: case14.id,
        advocateId: adv1.id,
        side: 'PETITIONER',
        assignedAt: daysAgo(260),
        assignedById: registrarUser.id,
        isActive: true,
      },
      {
        caseId: case14.id,
        advocateId: adv5.id,
        side: 'RESPONDENT',
        assignedAt: daysAgo(255),
        assignedById: registrarUser.id,
        isActive: true,
      },
    ],
  });

  // ==========================================
  // 9. HEARINGS (16 total: Past & Future, No Double-Booking)
  // ==========================================
  console.log('Seeding hearings (ensuring no courtroom/judge double booking)...');
  await prisma.hearing.createMany({
    data: [
      // Past Hearings (Completed & Adjourned)
      {
        caseId: case13.id,
        courtroomId: cr1.id,
        judgeId: judge1.id,
        scheduledAt: setTime(daysAgo(40), 10, 0),
        durationMins: 45,
        purpose: 'Final Arguments on Compensation Assessment',
        status: 'COMPLETED',
        outcomeNotes: 'Final oral arguments concluded by both senior counsels.',
      },
      {
        caseId: case14.id,
        courtroomId: cr3.id,
        judgeId: judge2.id,
        scheduledAt: setTime(daysAgo(40), 11, 30),
        durationMins: 30,
        purpose: 'Recording Statement under Section 313 CrPC',
        status: 'COMPLETED',
        outcomeNotes: 'Accused statement recorded. Matter posted for final judgment.',
      },
      {
        caseId: case11.id,
        courtroomId: cr1.id,
        judgeId: judge1.id,
        scheduledAt: setTime(daysAgo(30), 10, 0),
        durationMins: 60,
        purpose: 'Concluding Arguments & Case Summary',
        status: 'COMPLETED',
        outcomeNotes: 'Both sides completed arguments. Judgment reserved.',
      },
      {
        caseId: case12.id,
        courtroomId: cr2.id,
        judgeId: judge2.id,
        scheduledAt: setTime(daysAgo(30), 11, 30),
        durationMins: 45,
        purpose: 'Final Submissions on Commercial Lease Repudiation',
        status: 'COMPLETED',
        outcomeNotes: 'Submissions placed on record. Judgment reserved.',
      },
      {
        caseId: case7.id,
        courtroomId: cr3.id,
        judgeId: judge1.id,
        scheduledAt: setTime(daysAgo(20), 10, 0),
        durationMins: 45,
        purpose: 'Cross-Examination of Prosecution Witness PW-1',
        status: 'COMPLETED',
        outcomeNotes: 'PW-1 cross-examination completed. Exhibits P1 to P4 marked.',
      },
      {
        caseId: case8.id,
        courtroomId: cr2.id,
        judgeId: judge2.id,
        scheduledAt: setTime(daysAgo(20), 14, 0),
        durationMins: 30,
        purpose: 'Admission of Electronic Data Logs',
        status: 'ADJOURNED',
        outcomeNotes: 'Respondent requested adjournment due to unavailability of counsel.',
      },
      {
        caseId: case8.id,
        courtroomId: cr2.id,
        judgeId: judge2.id,
        scheduledAt: setTime(daysAgo(15), 10, 0),
        durationMins: 45,
        purpose: 'Resumed Hearing: Admission of Electronic Records',
        status: 'COMPLETED',
        outcomeNotes: 'Electronic escrow certificates admitted under Section 65B.',
      },
      {
        caseId: case9.id,
        courtroomId: cr4.id,
        judgeId: judge1.id,
        scheduledAt: setTime(daysAgo(10), 10, 0),
        durationMins: 30,
        purpose: 'Settlement of Issues on Ancestral Partition',
        status: 'COMPLETED',
        outcomeNotes: 'Issues framed. Local commissioner report submitted.',
      },
      {
        caseId: case10.id,
        courtroomId: cr1.id,
        judgeId: judge2.id,
        scheduledAt: setTime(daysAgo(5), 10, 0),
        durationMins: 30,
        purpose: 'Preliminary Objections on Employment Termination',
        status: 'COMPLETED',
        outcomeNotes: 'Preliminary objections dismissed. Plaintiff evidence commenced.',
      },

      // Future Hearings (Scheduled)
      {
        caseId: case5.id,
        courtroomId: cr4.id,
        judgeId: judge1.id,
        scheduledAt: daysAhead(2, 10, 0),
        durationMins: 30,
        purpose: 'First Appearance & Mediation Exploration',
        status: 'SCHEDULED',
        outcomeNotes: null,
      },
      {
        caseId: case6.id,
        courtroomId: cr1.id,
        judgeId: judge2.id,
        scheduledAt: daysAhead(2, 11, 30),
        durationMins: 45,
        purpose: 'Preliminary Hearing on Interim Stay Application',
        status: 'SCHEDULED',
        outcomeNotes: null,
      },
      {
        caseId: case7.id,
        courtroomId: cr3.id,
        judgeId: judge1.id,
        scheduledAt: daysAhead(5, 10, 0),
        durationMins: 60,
        purpose: 'Cross-Examination of Forensic Expert PW-2',
        status: 'SCHEDULED',
        outcomeNotes: null,
      },
      {
        caseId: case8.id,
        courtroomId: cr2.id,
        judgeId: judge2.id,
        scheduledAt: daysAhead(5, 11, 30),
        durationMins: 45,
        purpose: 'Defendant Witness Evidence',
        status: 'SCHEDULED',
        outcomeNotes: null,
      },
      {
        caseId: case9.id,
        courtroomId: cr4.id,
        judgeId: judge1.id,
        scheduledAt: daysAhead(7, 10, 0),
        durationMins: 30,
        purpose: 'Cross-Examination of Revenue Surveyor',
        status: 'SCHEDULED',
        outcomeNotes: null,
      },
      {
        caseId: case10.id,
        courtroomId: cr1.id,
        judgeId: judge2.id,
        scheduledAt: daysAhead(7, 11, 30),
        durationMins: 45,
        purpose: 'Cross-Examination of Complainant Dr. Joshi',
        status: 'SCHEDULED',
        outcomeNotes: null,
      },
      {
        caseId: case6.id,
        courtroomId: cr2.id,
        judgeId: judge1.id,
        scheduledAt: daysAhead(10, 14, 0),
        durationMins: 60,
        purpose: 'Substantive Arguments on Constitutional Bench Referral',
        status: 'SCHEDULED',
        outcomeNotes: null,
      },
    ],
  });

  // ==========================================
  // 10. EVIDENCE & CUSTODY LOGS (8 items)
  // ==========================================
  console.log('Seeding evidence items and custody audit logs...');

  // Evidence 1 (Case 7)
  const ev1 = await prisma.evidence.create({
    data: {
      caseId: case7.id,
      title: 'CCTV Surveillance Footage of Bank Locker Facility',
      evidenceType: 'VIDEO',
      description: 'High-definition MP4 capture from Security Camera #04 dated 14-Aug.',
      submittedBy: 'Inspector S.K. Verma',
      submittedById: null,
      status: 'ADMITTED',
      submittedAt: daysAgo(25),
      fileName: 'CCTV_Bank_Locker_Cam4.mp4',
      filePath: 'vault/2025/case7/ev1.mp4',
      mimeType: 'video/mp4',
      fileSize: 48920150,
      fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
  });
  await prisma.evidenceCustodyLog.createMany({
    data: [
      {
        evidenceId: ev1.id,
        action: 'SUBMITTED',
        performedById: registrarUser.id,
        note: 'Received from investigating agency via secure drive',
        createdAt: daysAgo(25),
      },
      {
        evidenceId: ev1.id,
        action: 'ADMITTED',
        performedById: judge1.id,
        note: 'Marked Exhibit P-1 after hearing on video admissibility',
        createdAt: daysAgo(20),
      },
    ],
  });

  // Evidence 2 (Case 7)
  const ev2 = await prisma.evidence.create({
    data: {
      caseId: case7.id,
      title: 'Forensic Audit Report of Diverted Accounts',
      evidenceType: 'DOCUMENT',
      description: 'Certified forensic audit compiled by Special Investigation Cell.',
      submittedBy: 'Harish Mehta',
      submittedById: advUser1.id,
      status: 'ADMITTED',
      submittedAt: daysAgo(22),
      fileName: 'Forensic_Audit_Report_v2.pdf',
      filePath: 'vault/2025/case7/ev2.pdf',
      mimeType: 'application/pdf',
      fileSize: 5240180,
      fileHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    },
  });
  await prisma.evidenceCustodyLog.createMany({
    data: [
      {
        evidenceId: ev2.id,
        action: 'SUBMITTED',
        performedById: advUser1.id,
        note: 'Filed along with affidavit under Section 65B',
        createdAt: daysAgo(22),
      },
      {
        evidenceId: ev2.id,
        action: 'ADMITTED',
        performedById: judge1.id,
        note: 'Marked Exhibit P-2 in proceedings',
        createdAt: daysAgo(20),
      },
    ],
  });

  // Evidence 3 (Case 8)
  const ev3 = await prisma.evidence.create({
    data: {
      caseId: case8.id,
      title: 'Master Service Agreement and Addendum Contract',
      evidenceType: 'DOCUMENT',
      description: 'Digitally signed MSA between Orient Infotech and Skyward Telecom.',
      submittedBy: 'Priya Iyer',
      submittedById: advUser2.id,
      status: 'ADMITTED',
      submittedAt: daysAgo(25),
      fileName: 'Orient_Skyward_MSA_2023.pdf',
      filePath: 'vault/2025/case8/ev3.pdf',
      mimeType: 'application/pdf',
      fileSize: 1845120,
      fileHash: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    },
  });
  await prisma.evidenceCustodyLog.createMany({
    data: [
      {
        evidenceId: ev3.id,
        action: 'SUBMITTED',
        performedById: advUser2.id,
        note: 'Original contract uploaded with digital signature certificate',
        createdAt: daysAgo(25),
      },
      {
        evidenceId: ev3.id,
        action: 'VIEWED',
        performedById: judge2.id,
        note: 'Reviewed in chambers prior to admission',
        createdAt: daysAgo(18),
      },
      {
        evidenceId: ev3.id,
        action: 'ADMITTED',
        performedById: judge2.id,
        note: 'Marked Exhibit C-1',
        createdAt: daysAgo(15),
      },
    ],
  });

  // Evidence 4 (Case 8)
  const ev4 = await prisma.evidence.create({
    data: {
      caseId: case8.id,
      title: 'Server Access Logs & Git Repository Commit Records',
      evidenceType: 'DIGITAL_RECORD',
      description: 'Audit logs demonstrating unauthorized repository clone from restricted IP.',
      submittedBy: 'Priya Iyer',
      submittedById: advUser2.id,
      status: 'SUBMITTED',
      submittedAt: daysAgo(16),
      fileName: 'Server_Access_Audit.zip',
      filePath: 'vault/2025/case8/ev4.zip',
      mimeType: 'application/zip',
      fileSize: 12450890,
      fileHash: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    },
  });
  await prisma.evidenceCustodyLog.create({
    data: {
      evidenceId: ev4.id,
      action: 'SUBMITTED',
      performedById: advUser2.id,
      note: 'Placed on record for examination during next hearing',
      createdAt: daysAgo(16),
    },
  });

  // Evidence 5 (Case 9)
  const ev5 = await prisma.evidence.create({
    data: {
      caseId: case9.id,
      title: 'Certified Land Revenue Map & Mutation Registry Register',
      evidenceType: 'DOCUMENT',
      description: 'Official revenue document showing historical survey demarcations.',
      submittedBy: 'Zafar Khan',
      submittedById: advUser3.id,
      status: 'ADMITTED',
      submittedAt: daysAgo(18),
      fileName: 'Revenue_Map_Plot42.pdf',
      filePath: 'vault/2026/case9/ev5.pdf',
      mimeType: 'application/pdf',
      fileSize: 8520340,
      fileHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    },
  });
  await prisma.evidenceCustodyLog.createMany({
    data: [
      {
        evidenceId: ev5.id,
        action: 'SUBMITTED',
        performedById: advUser3.id,
        note: 'Certified copy procured from District Tehsil',
        createdAt: daysAgo(18),
      },
      {
        evidenceId: ev5.id,
        action: 'ADMITTED',
        performedById: judge1.id,
        note: 'Marked Exhibit D-1 without objection from respondent',
        createdAt: daysAgo(10),
      },
    ],
  });

  // Evidence 6 (Case 10)
  const ev6 = await prisma.evidence.create({
    data: {
      caseId: case10.id,
      title: 'Consultancy Agreement and Performance Appraisal Records',
      evidenceType: 'DOCUMENT',
      description: 'Contract documentation of Dr. Anita Joshi along with annual reviews.',
      submittedBy: 'Dr. Anita Joshi',
      submittedById: null,
      status: 'ADMITTED',
      submittedAt: daysAgo(12),
      fileName: 'Consultancy_Appraisal_Records.pdf',
      filePath: 'vault/2026/case10/ev6.pdf',
      mimeType: 'application/pdf',
      fileSize: 3450120,
      fileHash: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e',
    },
  });
  await prisma.evidenceCustodyLog.createMany({
    data: [
      {
        evidenceId: ev6.id,
        action: 'SUBMITTED',
        performedById: registrarUser.id,
        note: 'Filing received and checked for court stamp',
        createdAt: daysAgo(12),
      },
      {
        evidenceId: ev6.id,
        action: 'ADMITTED',
        performedById: judge2.id,
        note: 'Marked Exhibit P-1',
        createdAt: daysAgo(5),
      },
    ],
  });

  // Evidence 7 (Case 11)
  const ev7 = await prisma.evidence.create({
    data: {
      caseId: case11.id,
      title: 'Audio Recording of Procurement Bid Deliberation',
      evidenceType: 'AUDIO',
      description: 'Audio recording submitted by whistleblower regarding tender fixing.',
      submittedBy: 'Special Public Prosecutor',
      submittedById: null,
      status: 'ADMITTED',
      submittedAt: daysAgo(45),
      fileName: 'Tender_Bid_Deliberation.wav',
      filePath: 'vault/2025/case11/ev7.wav',
      mimeType: 'audio/wav',
      fileSize: 34890120,
      fileHash: '2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d',
    },
  });
  await prisma.evidenceCustodyLog.createMany({
    data: [
      {
        evidenceId: ev7.id,
        action: 'SUBMITTED',
        performedById: registrarUser.id,
        note: 'Received along with certificate of acoustic forensics',
        createdAt: daysAgo(45),
      },
      {
        evidenceId: ev7.id,
        action: 'ADMITTED',
        performedById: judge1.id,
        note: 'Admitted following forensic expert testimony',
        createdAt: daysAgo(30),
      },
    ],
  });

  // Evidence 8 (Case 13)
  const ev8 = await prisma.evidence.create({
    data: {
      caseId: case13.id,
      title: 'Government Gazette Notification for Land Acquisition',
      evidenceType: 'DOCUMENT',
      description: 'Official gazette publication dated 12-Nov-2022 detailing circle rates.',
      submittedBy: 'Anand Grover',
      submittedById: null,
      status: 'ADMITTED',
      submittedAt: daysAgo(60),
      fileName: 'Gazette_Notification_CircleRates.pdf',
      filePath: 'vault/2025/case13/ev8.pdf',
      mimeType: 'application/pdf',
      fileSize: 4210980,
      fileHash: '6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b',
    },
  });
  await prisma.evidenceCustodyLog.createMany({
    data: [
      {
        evidenceId: ev8.id,
        action: 'SUBMITTED',
        performedById: registrarUser.id,
        note: 'Official gazette copy tendered in court',
        createdAt: daysAgo(60),
      },
      {
        evidenceId: ev8.id,
        action: 'ADMITTED',
        performedById: judge1.id,
        note: 'Marked Exhibit P-5 during final arguments',
        createdAt: daysAgo(40),
      },
    ],
  });

  // ==========================================
  // 11. JUDGMENTS (4 total: 2 Reserved, 2 Delivered)
  // ==========================================
  console.log('Seeding judgments...');

  // Judgment for Case 11 (RESERVED)
  await prisma.judgment.create({
    data: {
      caseId: case11.id,
      judgeId: judge1.id,
      status: 'RESERVED',
      outcome: null,
      summary:
        'Arguments on public tender bid fraud concluded. Final verdict reserved under Order XX Rule 1 CPC.',
      reservedOn: daysAgo(15),
      deliveredOn: null,
    },
  });

  // Judgment for Case 12 (RESERVED)
  await prisma.judgment.create({
    data: {
      caseId: case12.id,
      judgeId: judge2.id,
      status: 'RESERVED',
      outcome: null,
      summary:
        'Detailed written arguments submitted regarding commercial lease repudiation. Orders reserved.',
      reservedOn: daysAgo(7),
      deliveredOn: null,
    },
  });

  // Judgment for Case 13 (DELIVERED, ALLOWED)
  await prisma.judgment.create({
    data: {
      caseId: case13.id,
      judgeId: judge1.id,
      status: 'DELIVERED',
      outcome: 'ALLOWED',
      summary:
        'Petition allowed with direction to recalculate market value of acquired parcel plus statutory interest @ 9% per annum.',
      reservedOn: daysAgo(40),
      deliveredOn: daysAgo(25),
    },
  });

  // Judgment for Case 14 (DELIVERED, CONVICTED)
  await prisma.judgment.create({
    data: {
      caseId: case14.id,
      judgeId: judge2.id,
      status: 'DELIVERED',
      outcome: 'CONVICTED',
      summary:
        'Accused found guilty under Section 420/468 IPC beyond reasonable doubt. Sentenced to rigorous imprisonment of 2 years with fine.',
      reservedOn: daysAgo(55),
      deliveredOn: daysAgo(42),
    },
  });

  // ==========================================
  // 12. CASE STATUS HISTORY (Audit Trail)
  // ==========================================
  console.log('Seeding case status history audit trails...');
  const histories = [
    // Case 1
    {
      caseId: case1.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Initial criminal complaint accepted and registered by Registry',
      changedById: registrarUser.id,
      createdAt: daysAgo(10),
    },

    // Case 2
    {
      caseId: case2.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Urgent civil injunction petition registered on urgent roster',
      changedById: registrarUser.id,
      createdAt: daysAgo(5),
    },

    // Case 3
    {
      caseId: case3.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Property suit registered at Registry counter',
      changedById: registrarUser.id,
      createdAt: daysAgo(25),
    },
    {
      caseId: case3.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Vakalatnama filed by counsel for petitioner and respondent',
      changedById: registrarUser.id,
      createdAt: daysAgo(20),
    },

    // Case 4 (Backlog)
    {
      caseId: case4.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Commercial suit registered in e-filing portal',
      changedById: adminUser.id,
      createdAt: daysAgo(115),
    },
    {
      caseId: case4.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Petitioner and respondent legal representation linked',
      changedById: adminUser.id,
      createdAt: daysAgo(100),
    },

    // Case 5
    {
      caseId: case5.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Family maintenance petition registered',
      changedById: registrarUser.id,
      createdAt: daysAgo(35),
    },
    {
      caseId: case5.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Advocates entered appearance for both spouses',
      changedById: registrarUser.id,
      createdAt: daysAgo(30),
    },
    {
      caseId: case5.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Roster allocated for Court Hall 4 preliminary hearing',
      changedById: registrarUser.id,
      createdAt: daysAgo(15),
    },

    // Case 6 (Backlog)
    {
      caseId: case6.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Constitutional PIL registered',
      changedById: adminUser.id,
      createdAt: daysAgo(145),
    },
    {
      caseId: case6.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Senior counsels notified and assigned',
      changedById: adminUser.id,
      createdAt: daysAgo(130),
    },
    {
      caseId: case6.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Scheduled before Commercial Bench',
      changedById: adminUser.id,
      createdAt: daysAgo(20),
    },

    // Case 7 (Backlog)
    {
      caseId: case7.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'CBI charge-sheet taken on court docket',
      changedById: adminUser.id,
      createdAt: daysAgo(185),
    },
    {
      caseId: case7.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Defense counsel entered appearance',
      changedById: adminUser.id,
      createdAt: daysAgo(175),
    },
    {
      caseId: case7.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Trial dates allocated on master cause list',
      changedById: adminUser.id,
      createdAt: daysAgo(100),
    },
    {
      caseId: case7.id,
      fromStatus: 'HEARING_SCHEDULED',
      toStatus: 'UNDER_TRIAL',
      reason: 'First prosecution witness testified; formal trial underway',
      changedById: judge1.id,
      createdAt: daysAgo(20),
    },

    // Case 8 (Backlog)
    {
      caseId: case8.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Commercial recovery suit filed',
      changedById: registrarUser.id,
      createdAt: daysAgo(155),
    },
    {
      caseId: case8.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Attorneys on record notified',
      changedById: registrarUser.id,
      createdAt: daysAgo(145),
    },
    {
      caseId: case8.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Hearing scheduled in Courtroom 2',
      changedById: registrarUser.id,
      createdAt: daysAgo(80),
    },
    {
      caseId: case8.id,
      fromStatus: 'HEARING_SCHEDULED',
      toStatus: 'UNDER_TRIAL',
      reason: 'Issues framed and evidence commenced',
      changedById: judge2.id,
      createdAt: daysAgo(20),
    },

    // Case 9
    {
      caseId: case9.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Partition plaint filed',
      changedById: registrarUser.id,
      createdAt: daysAgo(72),
    },
    {
      caseId: case9.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Bar advocates enrolled for parties',
      changedById: registrarUser.id,
      createdAt: daysAgo(65),
    },
    {
      caseId: case9.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Cause list date set',
      changedById: registrarUser.id,
      createdAt: daysAgo(30),
    },
    {
      caseId: case9.id,
      fromStatus: 'HEARING_SCHEDULED',
      toStatus: 'UNDER_TRIAL',
      reason: 'Local commissioner examination underway',
      changedById: judge1.id,
      createdAt: daysAgo(10),
    },

    // Case 10
    {
      caseId: case10.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Civil damages suit filed',
      changedById: registrarUser.id,
      createdAt: daysAgo(52),
    },
    {
      caseId: case10.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Counsel appearance marked',
      changedById: registrarUser.id,
      createdAt: daysAgo(48),
    },
    {
      caseId: case10.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Hearing scheduled for framing issues',
      changedById: registrarUser.id,
      createdAt: daysAgo(20),
    },
    {
      caseId: case10.id,
      fromStatus: 'HEARING_SCHEDULED',
      toStatus: 'UNDER_TRIAL',
      reason: 'Preliminary objections disposed; trial initiated',
      changedById: judge2.id,
      createdAt: daysAgo(5),
    },

    // Case 11 (Backlog)
    {
      caseId: case11.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Criminal case registered',
      changedById: adminUser.id,
      createdAt: daysAgo(210),
    },
    {
      caseId: case11.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Advocates assigned',
      changedById: adminUser.id,
      createdAt: daysAgo(200),
    },
    {
      caseId: case11.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Hearings scheduled',
      changedById: adminUser.id,
      createdAt: daysAgo(120),
    },
    {
      caseId: case11.id,
      fromStatus: 'HEARING_SCHEDULED',
      toStatus: 'UNDER_TRIAL',
      reason: 'Witness depositions concluded',
      changedById: judge1.id,
      createdAt: daysAgo(60),
    },
    {
      caseId: case11.id,
      fromStatus: 'UNDER_TRIAL',
      toStatus: 'JUDGMENT_RESERVED',
      reason: 'Final arguments concluded; judgment reserved',
      changedById: judge1.id,
      createdAt: daysAgo(15),
    },

    // Case 12
    {
      caseId: case12.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Commercial dispute registered',
      changedById: registrarUser.id,
      createdAt: daysAgo(82),
    },
    {
      caseId: case12.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Counsel assigned',
      changedById: registrarUser.id,
      createdAt: daysAgo(78),
    },
    {
      caseId: case12.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Speedy commercial hearing scheduled',
      changedById: registrarUser.id,
      createdAt: daysAgo(50),
    },
    {
      caseId: case12.id,
      fromStatus: 'HEARING_SCHEDULED',
      toStatus: 'UNDER_TRIAL',
      reason: 'Arbitration award reviewed under trial bench',
      changedById: judge2.id,
      createdAt: daysAgo(25),
    },
    {
      caseId: case12.id,
      fromStatus: 'UNDER_TRIAL',
      toStatus: 'JUDGMENT_RESERVED',
      reason: 'Orders reserved following oral submissions',
      changedById: judge2.id,
      createdAt: daysAgo(7),
    },

    // Case 13 (Closed)
    {
      caseId: case13.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Compensation reference registered',
      changedById: adminUser.id,
      createdAt: daysAgo(310),
    },
    {
      caseId: case13.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Advocates assigned',
      changedById: adminUser.id,
      createdAt: daysAgo(300),
    },
    {
      caseId: case13.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Hearing roster date set',
      changedById: adminUser.id,
      createdAt: daysAgo(200),
    },
    {
      caseId: case13.id,
      fromStatus: 'HEARING_SCHEDULED',
      toStatus: 'UNDER_TRIAL',
      reason: 'Evidence led on land valuation rates',
      changedById: judge1.id,
      createdAt: daysAgo(100),
    },
    {
      caseId: case13.id,
      fromStatus: 'UNDER_TRIAL',
      toStatus: 'JUDGMENT_RESERVED',
      reason: 'Arguments concluded',
      changedById: judge1.id,
      createdAt: daysAgo(40),
    },
    {
      caseId: case13.id,
      fromStatus: 'JUDGMENT_RESERVED',
      toStatus: 'CLOSED',
      reason: 'Final decree passed; petition allowed; file consigned to record room',
      changedById: judge1.id,
      createdAt: daysAgo(25),
    },

    // Case 14 (Closed)
    {
      caseId: case14.id,
      fromStatus: null,
      toStatus: 'REGISTERED',
      reason: 'Criminal case registered upon police charge-sheet',
      changedById: adminUser.id,
      createdAt: daysAgo(270),
    },
    {
      caseId: case14.id,
      fromStatus: 'REGISTERED',
      toStatus: 'ADVOCATE_ASSIGNED',
      reason: 'Defense advocate assigned',
      changedById: adminUser.id,
      createdAt: daysAgo(260),
    },
    {
      caseId: case14.id,
      fromStatus: 'ADVOCATE_ASSIGNED',
      toStatus: 'HEARING_SCHEDULED',
      reason: 'Sessions trial listed',
      changedById: adminUser.id,
      createdAt: daysAgo(180),
    },
    {
      caseId: case14.id,
      fromStatus: 'HEARING_SCHEDULED',
      toStatus: 'UNDER_TRIAL',
      reason: 'Witness evidence recorded',
      changedById: judge2.id,
      createdAt: daysAgo(90),
    },
    {
      caseId: case14.id,
      fromStatus: 'UNDER_TRIAL',
      toStatus: 'JUDGMENT_RESERVED',
      reason: 'Arguments concluded; judgment reserved',
      changedById: judge2.id,
      createdAt: daysAgo(55),
    },
    {
      caseId: case14.id,
      fromStatus: 'JUDGMENT_RESERVED',
      toStatus: 'CLOSED',
      reason: 'Judgment delivered in open court; convicted; warrants prepared',
      changedById: judge2.id,
      createdAt: daysAgo(42),
    },
  ];

  await prisma.caseStatusHistory.createMany({ data: histories });

  // ==========================================
  // 13. PRINT SUMMARY TABLE
  // ==========================================
  const counts = {
    users: await prisma.user.count(),
    advocates: await prisma.advocate.count(),
    courtrooms: await prisma.courtroom.count(),
    cases: await prisma.case.count(),
    caseAdvocates: await prisma.caseAdvocate.count(),
    hearings: await prisma.hearing.count(),
    evidence: await prisma.evidence.count(),
    evidenceCustodyLogs: await prisma.evidenceCustodyLog.count(),
    judgments: await prisma.judgment.count(),
    caseStatusHistory: await prisma.caseStatusHistory.count(),
    caseSequences: await prisma.caseSequence.count(),
    systemSettings: await prisma.systemSetting.count(),
  };

  console.log('\n======================================================');
  console.log('           SEEDING COMPLETE - SUMMARY TABLE           ');
  console.log('======================================================');
  console.table(
    Object.entries(counts).map(([model, count]) => ({
      Model: model,
      'Record Count': count,
    }))
  );
  console.log('Demo Credentials: All accounts password = "Demo@1234"');
  console.log('Admin:     admin@courtcms.gov.in');
  console.log('Registrar: registrar@courtcms.gov.in');
  console.log('Judges:    judge.swaminathan@courtcms.gov.in, judge.banerjee@courtcms.gov.in');
  console.log(
    'Advocates: adv.mehta@courtcms.gov.in, adv.iyer@courtcms.gov.in, adv.khan@courtcms.gov.in'
  );
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('Seed execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
