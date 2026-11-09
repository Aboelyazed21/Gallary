import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../utils/apiError.js';
import { selectCountedRecords } from '../gpa/gpa.service.js';
import { loadRecords } from '../students/gpa.report.service.js';

export async function degreeProgress(studentId: number) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { program: true },
  });
  if (!student) throw notFound('Student not found.');

  const requirements = await prisma.degreeRequirement.findMany({
    where: { programId: student.programId },
    include: { course: { select: { id: true, code: true, creditHours: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  const records = await loadRecords(studentId);
  const completedIds = new Set(
    records.filter((r) => r.status === 'PASSED').map((r) => r.courseId),
  );

  let requiredHoursTotal = 0;
  let requiredCoursesTotal = 0;
  let requiredCoursesDone = 0;
  let electiveNeeded = 0;
  const missingRequired: Array<{ courseId: number; code: string }> = [];

  for (const req of requirements) {
    if (req.kind === 'ELECTIVE') {
      electiveNeeded += req.minHours || 0;
      continue;
    }
    if (req.course) {
      requiredHoursTotal += req.course.creditHours;
      requiredCoursesTotal += 1;
      if (completedIds.has(req.course.id)) requiredCoursesDone += 1;
      else missingRequired.push({ courseId: req.course.id, code: req.course.code });
    }
  }

  const earnedHours = new Set(
    records.filter((r) => r.status === 'PASSED').map((r) => r.courseId),
  );
  const courseHours = new Map<number, number>();
  for (const r of records) {
    if (r.status === 'PASSED') courseHours.set(r.courseId, r.creditHours);
  }
  const completedHours = [...earnedHours].reduce((sum, id) => sum + (courseHours.get(id) ?? 0), 0);
  const remainingHours = Math.max(0, student.program.totalRequiredHours - completedHours);
  const graduationEligible =
    completedHours >= student.program.totalRequiredHours && missingRequired.length === 0;

  await prisma.degreeProgress.upsert({
    where: { studentId },
    create: {
      studentId,
      programId: student.programId,
      requiredHoursTotal: student.program.totalRequiredHours,
      completedHours,
      remainingHours,
      requiredCoursesTotal,
      requiredCoursesDone,
      electiveHoursTotal: electiveNeeded,
      electiveHoursDone: 0,
      graduationEligible,
    },
    update: {
      requiredHoursTotal: student.program.totalRequiredHours,
      completedHours,
      remainingHours,
      requiredCoursesTotal,
      requiredCoursesDone,
      electiveHoursTotal: electiveNeeded,
      graduationEligible,
    },
  });

  return {
    studentId,
    program: { id: student.program.id, code: student.program.code, nameEn: student.program.nameEn },
    requiredHoursTotal: student.program.totalRequiredHours,
    completedHours,
    remainingHours,
    requiredCoursesTotal,
    requiredCoursesDone,
    electiveHoursRemaining: electiveNeeded,
    missingRequiredCourses: missingRequired,
    graduationEligible,
  };
}
