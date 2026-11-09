import { prisma } from '../../lib/prisma.js';
import { notFound, forbidden } from '../../utils/apiError.js';
import type { AuthContext } from '../../config/env.js';

export async function getStudentById(studentId: number) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { id: true, email: true, role: true, lastLoginAt: true } },
      program: true,
      academicYear: true,
    },
  });
  if (!student) throw notFound('Student not found.');
  return student;
}

export async function getByUserId(userId: number) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: { program: true, academicYear: true },
  });
  if (!student) throw notFound('No student profile for this account.');
  return student;
}

export async function listStudents(params: { page: number; limit: number; programId?: number; search?: string }) {
  const where: Record<string, unknown> = {};
  if (params.programId) where.programId = params.programId;
  if (params.search) {
    where.OR = [
      { fullName: { contains: params.search } },
      { universityId: { contains: params.search } },
      { user: { email: { contains: params.search } } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: { user: { select: { email: true } }, program: { select: { code: true, nameEn: true } } },
      orderBy: { fullName: 'asc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);
  return { total, rows, page: params.page, limit: params.limit };
}

export async function getMyProfile(auth: AuthContext) {
  if (auth.role !== 'STUDENT') throw forbidden('Student role required.');
  return getByUserId(auth.userId);
}

export async function getAcademicSummary(studentId: number, _auth: AuthContext) {
  const student = await getStudentById(studentId);
  const records = await prisma.studentAcademicRecord.findMany({
    where: { studentId },
    include: { course: { select: { id: true, code: true, titleEn: true, creditHours: true } },
               semester: { select: { id: true, code: true, nameEn: true } } },
    orderBy: [{ semesterId: 'asc' }, { attemptNo: 'asc' }],
  });
  const registrations = await prisma.courseRegistration.findMany({
    where: { studentId },
    include: { course: { select: { id: true, code: true, titleEn: true, creditHours: true } },
               semester: { select: { id: true, code: true, nameEn: true } } },
    orderBy: { registeredAt: 'desc' },
  });
  return { student, records, registrations };
}
