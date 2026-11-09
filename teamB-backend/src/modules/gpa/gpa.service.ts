/**
 * Pure GPA calculation — deliberately independent from Express and Prisma so it
 * can be unit-tested with plain object fixtures.
 *
 * The grading scale and the retake policy are NEVER assumed: they are loaded
 * from the `academic_rules` table (keys GRADING_SCALE and RETAKE_POLICY) with
 * safe built-in fallbacks for testing.
 */

export interface GradeRecord {
  courseId: number;
  creditHours: number;
  grade: string | null;
  gradePoints: number | null;
  status: string;
  semesterId: number;
  attemptNo: number;
}

export type GradingScale = Record<string, number>;

export const BASE_GRADING_SCALE: GradingScale = {
  A: 4.0, 'A-': 3.7, B: 3.0, 'B-': 2.7, C: 2.0, 'C-': 1.7,
  D: 1.0, F: 0.0,
};

export type RetakePolicy = 'LATEST' | 'BEST' | 'FIRST';

export function pointsForGrade(grade: string, scale: GradingScale = BASE_GRADING_SCALE): number | null {
  const g = grade.trim().toUpperCase();
  return g in scale ? scale[g] : null;
}

/** Collapse multiple attempts of a course into the one counted by policy. */
export function selectCountedRecords<T extends GradeRecord>(records: T[], policy: RetakePolicy = 'LATEST'): T[] {
  const byCourse = new Map<number, T[]>();
  for (const r of records) {
    const list = byCourse.get(r.courseId) ?? [];
    list.push(r);
    byCourse.set(r.courseId, list);
  }
  const counted: T[] = [];
  for (const list of byCourse.values()) {
    const sorted = [...list].sort((a, b) => a.attemptNo - b.attemptNo);
    if (policy === 'FIRST') counted.push(sorted[0]);
    else if (policy === 'BEST') {
      const best = sorted.reduce((acc, r) => {
        const p = r.gradePoints ?? 0;
        const ap = acc.gradePoints ?? 0;
        return p > ap ? r : acc;
      }, sorted[0]);
      counted.push(best);
    } else counted.push(sorted[sorted.length - 1]); // LATEST
  }
  return counted;
}

/** Semester GPA from the counted attempts of one semester. */
export function semesterGpa(
  records: GradeRecord[],
  scale: GradingScale = BASE_GRADING_SCALE,
  policy: RetakePolicy = 'LATEST',
): { gpa: number | null; creditsAttempted: number; creditsEarned: number } {
  const graded = records.filter((r) => r.status !== 'WITHDRAWN' && r.grade !== null);
  const counted = selectCountedRecords(graded, policy);
  let points = 0;
  let attempted = 0;
  let earned = 0;
  for (const r of counted) {
    const p = r.gradePoints ?? pointsForGrade(r.grade ?? '', scale);
    if (p === null || p === undefined) continue;
    attempted += r.creditHours;
    points += p * r.creditHours;
    if (r.status === 'PASSED' || (p > 0 && r.status !== 'FAILED')) earned += r.creditHours;
  }
  return {
    gpa: attempted > 0 ? round2(points / attempted) : null,
    creditsAttempted: attempted,
    creditsEarned: earned,
  };
}

/** Cumulative GPA across all semesters (counted attempts only). */
export function cumulativeGpa(
  records: GradeRecord[],
  scale: GradingScale = BASE_GRADING_SCALE,
  policy: RetakePolicy = 'LATEST',
): { cgpa: number | null; totalCreditsAttempted: number; totalCreditsEarned: number } {
  const graded = records.filter((r) => r.status !== 'WITHDRAWN' && r.grade !== null);
  // policy collapse first, then split earned (passed) credits
  const counted = selectCountedRecords(graded, policy);
  let points = 0;
  let attempted = 0;
  let earned = 0;
  for (const r of counted) {
    const p = r.gradePoints ?? pointsForGrade(r.grade ?? '', scale);
    if (p === null || p === undefined) continue;
    attempted += r.creditHours;
    points += p * r.creditHours;
    if (r.status === 'PASSED' || (p > 0 && r.status !== 'FAILED')) earned += r.creditHours;
  }
  return {
    cgpa: attempted > 0 ? round2(points / attempted) : null,
    totalCreditsAttempted: attempted,
    totalCreditsEarned: earned,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Extract a grading scale from a stored academic_rules value (JSON). */
export function parseGradingScale(value: unknown): GradingScale {
  if (value && typeof value === 'object' && 'scale' in (value as Record<string, unknown>)) {
    const s = (value as { scale: Record<string, number> }).scale;
    if (s && typeof s === 'object') {
      const out: GradingScale = {};
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'number') out[k.toUpperCase()] = v;
      }
      if (Object.keys(out).length > 0) return out;
    }
  }
  return BASE_GRADING_SCALE;
}

export function parseRetakePolicy(value: unknown): RetakePolicy {
  if (value && typeof value === 'object' && 'mode' in (value as Record<string, unknown>)) {
    const mode = String((value as { mode: unknown }).mode).toUpperCase();
    if (mode === 'BEST' || mode === 'FIRST' || mode === 'LATEST') return mode;
  }
  return 'LATEST';
}
