import { prisma } from '../../lib/prisma.js';
import { notFound, badRequest, conflict } from '../../utils/apiError.js';
import { evaluateEligibility, type EngineContext } from '../eligibility/eligibility.engine.js';
import {
  getAllowAlreadyPassed,
  getCreditLimitsByCgpa,
  getGradingScale,
  getMaxFailedAttempts,
  getMinCreditHours,
  getRetakePolicy,
} from '../rules/rules.service.js';
import { cumulativeGpa, selectCountedRecords } from '../gpa/gpa.service.js';
import { loadRecords } from '../students/gpa.report.service.js';

async function buildContext(studentId: number, targetSemesterId: number, targetCourseId: number): Promise<{
  ctx: EngineContext;
  course: { id: number; code: string; creditHours: number; level: number };
  student: { id: number; status: string };
}> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw notFound('Student not found.');

  const course = await prisma.course.findUnique({ where: { id: targetCourseId } });
  if (!course) throw notFound('Course not found.');

  const prerequisites = await prisma.coursePrerequisite.findMany({
    where: { courseId: targetCourseId, isRequired: true },
    select: { prerequisiteCourseId: true },
  });

  const records = await loadRecords(studentId);
  const completed: Array<{ courseId: number; status: 'PASSED' | 'FAILED'; gradePoints: number | null }> = [];
  for (const r of records) {
    if (r.status === 'PASSED' || r.status === 'FAILED') {
      completed.push({ courseId: r.courseId, status: r.status, gradePoints: r.gradePoints });
    }
  }

  const [scale, policy] = await Promise.all([getGradingScale(), getRetakePolicy()]);
  const cgpa = cumulativeGpa(records, scale, policy).cgpa;

  const registrations = await prisma.courseRegistration.findMany({
    where: { studentId, semesterId: targetSemesterId, status: 'REGISTERED' },
    include: { course: { select: { creditHours: true } } },
  });
  const currentRegisteredHours = registrations.reduce((s, r) => s + r.course.creditHours, 0);

  const offerings = await prisma.semester.findUnique({
    where: { id: targetSemesterId },
    include: { availableCourses: { select: { id: true } } },
  });
  const courseAvailableInSemester = Boolean(offerings?.availableCourses.some((c) => c.id === targetCourseId));

  const warnings = await prisma.academicWarning.findMany({
    where: { studentId, resolved: false },
    select: { reason: true, severity: true },
  });

  const [creditLimitsByCgpa, minCreditHours, allowAlreadyPassed, maxFailedAttempts] = await Promise.all([
    getCreditLimitsByCgpa(),
    getMinCreditHours(),
    getAllowAlreadyPassed(),
    getMaxFailedAttempts(),
  ]);

  const ctx: EngineContext = {
    completed,
    prerequisites: prerequisites.map((p) => p.prerequisiteCourseId),
    registrations: registrations.map((r) => r.courseId),
    courseAvailableInSemester,
    currentRegisteredHours,
    cgpa,
    creditLimitsByCgpa,
    minCreditHours,
    warnings: warnings.map((w) => ({ reason: w.reason, severity: w.severity })),
    standing: student.status,
    allowAlreadyPassed,
    maxFailedAttempts,
  };

  return { ctx, course: { id: course.id, code: course.code, creditHours: course.creditHours, level: course.level }, student };
}

export async function checkEligibility(studentId: number, courseId: number, semesterId: number) {
  const { ctx, course } = await buildContext(studentId, semesterId, courseId);
  return evaluateEligibility(ctx, course);
}

export async function checkEligibilityBulk(studentId: number, courseIds: number[], semesterId: number) {
  const results = [];
  for (const courseId of courseIds) {
    const { ctx, course } = await buildContext(studentId, semesterId, courseId);
    const result = evaluateEligibility(ctx, course);
    // Recommend eligible courses only — recommendations are post-filter suggestions.
    results.push(result);
  }
  return results;
}

export async function registerStudent(studentId: number, courseId: number, semesterId: number) {
  const { ctx, course } = await buildContext(studentId, semesterId, courseId);
  const result = evaluateEligibility(ctx, course);
  if (!result.eligible) {
    throw badRequest('NOT_ELIGIBLE', 'Student is not eligible for this course.', result);
  }
  if (result.status === 'REVIEW_REQUIRED') {
    throw badRequest('REVIEW_REQUIRED', 'This registration requires advisor review.', result);
  }
  const existing = await prisma.courseRegistration.findUnique({
    where: { studentId_courseId_semesterId: { studentId, courseId, semesterId } },
  });
  if (existing && existing.status === 'REGISTERED') {
    throw conflict('DUPLICATE_REGISTRATION', 'Student is already registered for this course in this semester.');
  }
  const registration = await prisma.courseRegistration.upsert({
    where: { studentId_courseId_semesterId: { studentId, courseId, semesterId } },
    create: { studentId, courseId, semesterId, status: 'REGISTERED' },
    update: { status: 'REGISTERED' },
  });
  const updatedHours = ctx.currentRegisteredHours + course.creditHours;
  await prisma.studentSemester.upsert({
    where: { studentId_semesterId: { studentId, semesterId } },
    create: { studentId, semesterId, registeredHours: updatedHours },
    update: { registeredHours: updatedHours },
  });
  return registration;
}
