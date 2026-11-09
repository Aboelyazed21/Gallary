/**
 * Idempotent seed — creates clearly identified demonstration records only.
 * Guides: program (Computer Science), academic year, semesters, courses with a
 * prerequisite chain, configurable academic rules, demo users and records.
 */
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { env } from '../src/config/env.js';

const DEMO_EMAILS = [
  { email: 'admin@bua.edu.eg', role: 'ADMIN' as const, name: 'Demo Admin' },
  { email: 'advisor1@aidm.bua.edu.eg', role: 'ADVISOR' as const, name: 'Demo Advisor 1' },
  { email: 'advisor2@aidm.bua.edu.eg', role: 'ADVISOR' as const, name: 'Demo Advisor 2' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    email: `student${n}@aidm.bua.edu.eg`,
    role: 'STUDENT' as const,
    name: `Demo Student ${n}`,
  })),
];

async function main() {
  // Program
  const program = await prisma.academicProgram.upsert({
    where: { code: 'CS' },
    update: {},
    create: { code: 'CS', nameEn: 'Computer Science', nameAr: 'علوم الحاسب', totalRequiredHours: 140 },
  });

  // Academic year + semesters
  const year = await prisma.academicYear.upsert({
    where: { code: '2026-2027' },
    update: {},
    create: { code: '2026-2027', nameEn: '2026-2027', nameAr: '٢٠٢٦-٢٠٢٧' },
  });
  const fall = await prisma.semester.upsert({
    where: { academicYearId_code: { academicYearId: year.id, code: 'FALL' } },
    update: {},
    create: { academicYearId: year.id, code: 'FALL', nameEn: 'Fall 2026-2027', type: 'FALL', status: 'OPEN' },
  });
  const spring = await prisma.semester.upsert({
    where: { academicYearId_code: { academicYearId: year.id, code: 'SPRING' } },
    update: {},
    create: { academicYearId: year.id, code: 'SPRING', nameEn: 'Spring 2026-2027', type: 'SPRING', status: 'UPCOMING' },
  });

  // Courses (demonstration set around a prerequisite chain)
  const coursesData: Array<{ code: string; titleEn: string; creditHours: number; level: number; programId?: number }> = [
    { code: 'CS101', titleEn: 'Introduction to Computing', creditHours: 3, level: 1, programId: program.id },
    { code: 'CS102', titleEn: 'Programming Fundamentals', creditHours: 3, level: 1, programId: program.id },
    { code: 'CS201', titleEn: 'Data Structures', creditHours: 3, level: 2, programId: program.id },
    { code: 'MA101', titleEn: 'Discrete Mathematics', creditHours: 3, level: 1, programId: program.id },
    { code: 'CS301', titleEn: 'Algorithms', creditHours: 3, level: 3, programId: program.id },
    { code: 'CS302', titleEn: 'Database Systems', creditHours: 3, level: 3, programId: program.id },
    { code: 'CS401', titleEn: 'Operating Systems', creditHours: 3, level: 4, programId: program.id },
    { code: 'CS402', titleEn: 'Capstone Project', creditHours: 6, level: 4, programId: program.id },
    { code: 'CS103', titleEn: 'Discrete Structures II', creditHours: 3, level: 2, programId: program.id },
  ];
  const coursesByCode = new Map<string, number>();
  for (const c of coursesData) {
    const row = await prisma.course.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
    coursesByCode.set(c.code, row.id);
  }

  // Prerequisite chain: CS102 < CS201 < CS301 ; MA101 < CS201 ; CS301 < CS402
  const prereqPairs: Array<[string, string]> = [
    ['CS102', 'CS201'],
    ['CS201', 'CS301'],
    ['MA101', 'CS201'],
    ['CS301', 'CS402'],
    ['CS201', 'CS302'],
  ];
  for (const [from, to] of prereqPairs) {
    await prisma.coursePrerequisite.upsert({
      where: {
        courseId_prerequisiteCourseId: {
          courseId: coursesByCode.get(to)!,
          prerequisiteCourseId: coursesByCode.get(from)!,
        },
      },
      update: {},
      create: { courseId: coursesByCode.get(to)!, prerequisiteCourseId: coursesByCode.get(from)!, isRequired: true },
    });
  }

  // Degree requirements (REQUIRED for each program course)
  for (const c of coursesData) {
    await prisma.degreeRequirement.create({
      data: { programId: program.id, courseId: coursesByCode.get(c.code)!, kind: 'REQUIRED', minHours: c.creditHours },
    }).catch(() => undefined);
  }

  // Configurable academic rules (marked as requiring official confirmation)
  const upsertRule = async (key: string, category: string, titleEn: string, value: unknown, sourceRef?: string) => {
    const existing = await prisma.academicRule.findFirst({ where: { key, isActive: true } });
    if (existing) return;
    await prisma.academicRule.create({
      data: {
        key,
        category,
        titleEn,
        value: value as never,
        sourceRef: sourceRef ?? `BUA-AIDM Regulations (Section #${key})`,
        requiresConfirmation: true,
        version: 1,
      },
    });
  };

  await upsertRule('GRADING_SCALE', 'GPA', 'Official grading scale', {
    scale: { A: 4.0, 'A-': 3.7, B: 3.0, 'B-': 2.7, C: 2.0, 'C-': 1.7, D: 1.0, F: 0.0 },
  });
  await upsertRule('RETAKE_POLICY', 'GPA', 'Course retake counting policy', { mode: 'LATEST' });
  await upsertRule('CREDIT_LIMIT_BY_CGPA', 'Registration', 'Maximum semester credit hours per CGPA bracket', {
    brackets: [
      { minCgpa: 3.0, maxHours: 21 },
      { minCgpa: 2.0, maxHours: 18 },
      { minCgpa: 1.0, maxHours: 15 },
      { minCgpa: 0.0, maxHours: 12 },
    ],
  });
  await upsertRule('MIN_CREDIT_LOAD', 'Registration', 'Minimum semester credit load', { hours: 9 });
  await upsertRule('ALLOW_ALREADY_PASSED', 'Registration', 'Allow re-registering a passed course', { allowed: false });
  await upsertRule('MAX_FAILED_ATTEMPTS', 'Registration', 'Maximum attempts per course', { max: 3 });

  // Demo users (idempotent)
  const passwordHash = await hashPassword(env.DEMO_PASSWORD);
  for (const spec of DEMO_EMAILS) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: {},
      create: { email: spec.email, passwordHash, role: spec.role },
    });
    if (spec.role === 'STUDENT') {
      const existing = await prisma.student.findUnique({ where: { userId: user.id } });
      if (!existing) {
        const seq = spec.name.replace(/\D/g, '').padStart(2, '0').slice(-2);
        await prisma.student.create({
          data: {
            userId: user.id,
            universityId: `2026${seq}0001`,
            fullName: spec.name,
            programId: program.id,
            academicYearId: year.id,
            level: 2,
            status: 'ACTIVE',
          },
        }).catch(() => undefined);
      }
    }
  }

  // Demo records for student1 (passed CS101/CS102/MA101 in FALL? here FALL 2025 equivalent — use first semester)
  const student1 = await prisma.student.findFirst({ where: { user: { email: 'student1@aidm.bua.edu.eg' } } });
  if (student1) {
    const passed: Array<[string, string, number]> = [
      ['CS101', 'A', 4.0],
      ['CS102', 'B', 3.0],
      ['MA101', 'A-', 3.7],
    ];
    for (const [code, grade, points] of passed) {
      const courseId = coursesByCode.get(code)!;
      const exists = await prisma.studentAcademicRecord.findFirst({
        where: { studentId: student1.id, courseId, semesterId: fall.id },
      });
      if (!exists) {
        await prisma.studentAcademicRecord.create({
          data: {
            studentId: student1.id,
            courseId,
            semesterId: fall.id,
            grade,
            gradePoints: points,
            creditsEarned: coursesData.find((c) => c.code === code)!.creditHours,
            attemptNo: 1,
            status: 'PASSED',
          },
        });
      }
    }
    await prisma.studentSemester.upsert({
      where: { studentId_semesterId: { studentId: student1.id, semesterId: fall.id } },
      update: {},
      create: { studentId: student1.id, semesterId: fall.id, registeredHours: 9, gpa: 3.57 },
    });
  }

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log('Seed complete.');
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
