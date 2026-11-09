import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../utils/apiError.js';
import { cumulativeGpa, semesterGpa, type GradeRecord, type GradingScale, type RetakePolicy } from '../gpa/gpa.service.js';
import { getGradingScale, getRetakePolicy } from '../rules/rules.service.js';

type RecordRow = {
  courseId: number;
  grade: string | null;
  gradePoints: { toNumber(): number } | number | null;
  status: string;
  semesterId: number;
  attemptNo: number;
  course: { creditHours: number };
};

function toGradeRecord(r: RecordRow): GradeRecord {
  const gp = typeof r.gradePoints === 'number' ? r.gradePoints : r.gradePoints?.toNumber() ?? null;
  return {
    courseId: r.courseId,
    creditHours: r.course.creditHours,
    grade: r.grade,
    gradePoints: gp,
    status: r.status,
    semesterId: r.semesterId,
    attemptNo: r.attemptNo,
  };
}

export async function loadRecords(studentId: number) {
  const rows = (await prisma.studentAcademicRecord.findMany({
    where: { studentId },
    include: { course: { select: { creditHours: true } } },
    orderBy: { semesterId: 'asc' },
  })) as unknown as RecordRow[];
  return rows.map(toGradeRecord);
}

export async function gpaReport(studentId: number) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw notFound('Student not found.');

  const [scale, policy] = await Promise.all([getGradingScale(), getRetakePolicy()]);
  const records = await loadRecords(studentId);
  const cum = cumulativeGpa(records, scale, policy);

  const semesters = await prisma.semester.findMany({ orderBy: { id: 'asc' } });
  const bySemester = new Map<number, GradeRecord[]>();
  for (const r of records) {
    const list = bySemester.get(r.semesterId) ?? [];
    list.push(r);
    bySemester.set(r.semesterId, list);
  }
  const history = semesters
    .filter((s) => bySemester.has(s.id))
    .map((s) => {
      const res = semesterGpa(bySemester.get(s.id)!, scale, policy);
      return {
        semesterId: s.id,
        semesterCode: s.code,
        semesterName: s.nameEn,
        gpa: res.gpa,
        creditsAttempted: res.creditsAttempted,
        creditsEarned: res.creditsEarned,
      };
    });

  return { studentId, gradingScale: scale, retakePolicy: policy, cgpa: cum.cgpa, history };
}

export async function updateSemesterGpaForStudent(studentId: number) {
  const [scale, policy] = await Promise.all([getGradingScale(), getRetakePolicy()]);
  const records = await loadRecords(studentId);
  const bySemester = new Map<number, GradeRecord[]>();
  for (const r of records) {
    const list = bySemester.get(r.semesterId) ?? [];
    list.push(r);
    bySemester.set(r.semesterId, list);
  }
  await Promise.all(
    [...bySemester.entries()].map(async ([semesterId, recs]) => {
      const res = semesterGpa(recs, scale, policy);
      await prisma.studentSemester.upsert({
        where: { studentId_semesterId: { studentId, semesterId } },
        create: { studentId, semesterId, gpa: res.gpa, registeredHours: res.creditsAttempted },
        update: { gpa: res.gpa, registeredHours: res.creditsAttempted },
      });
    }),
  );
}
