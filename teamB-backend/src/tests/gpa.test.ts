import {
  semesterGpa,
  cumulativeGpa,
  pointsForGrade,
  selectCountedRecords,
  parseGradingScale,
  parseRetakePolicy,
  type GradeRecord,
} from '../modules/gpa/gpa.service.js';

const rec = (courseId: number, grade: string | null, points: number | null, ch = 3, attemptNo = 1, status = 'PASSED', semesterId = 1): GradeRecord => ({
  courseId,
  creditHours: ch,
  grade,
  gradePoints: points,
  status,
  semesterId,
  attemptNo,
});

describe('pointsForGrade', () => {
  it('maps grades via the configured scale', () => {
    expect(pointsForGrade('A')).toBe(4.0);
    expect(pointsForGrade('b-')).toBe(2.7);
    expect(pointsForGrade('Q')).toBeNull();
  });

  it('honours an overridden scale', () => {
    expect(pointsForGrade('A', { A: 5.0 })).toBe(5.0);
    expect(pointsForGrade('B', { A: 5.0 })).toBeNull();
  });
});

describe('semesterGpa', () => {
  it('computes a weighted average', () => {
    const res = semesterGpa([
      rec(1, 'A', 4.0, 3),
      rec(2, 'B', 3.0, 3),
      rec(3, 'C', 2.0, 6),
    ]);
    expect(res.gpa).toBeCloseTo((4 * 3 + 3 * 3 + 2 * 6) / 12, 2);
    expect(res.creditsAttempted).toBe(12);
    expect(res.creditsEarned).toBe(12);
  });

  it('returns null gpa when nothing is graded', () => {
    const res = semesterGpa([rec(1, null, null, 3, 1, 'IN_PROGRESS')]);
    expect(res.gpa).toBeNull();
  });

  it('excludes withdrawn records and counts retakes by policy', () => {
    const records = [
      rec(1, 'F', 0.0, 3, 1, 'FAILED'),
      rec(1, 'A', 4.0, 3, 2, 'PASSED'),
      rec(2, 'A', 4.0, 3, 1, 'WITHDRAWN'),
    ];
    expect(semesterGpa(records, undefined, 'LATEST').gpa).toBe(4.0);
    expect(semesterGpa(records, undefined, 'FIRST').gpa).toBe(0.0);
  });
});

describe('selectCountedRecords / policies', () => {
  it('LATEST picks the last attempt', () => {
    const out = selectCountedRecords([rec(1, 'F', 0, 3, 1), rec(1, 'B', 3, 3, 2)], 'LATEST');
    expect(out).toHaveLength(1);
    expect(out[0].attemptNo).toBe(2);
  });

  it('BEST picks the highest points', () => {
    const out = selectCountedRecords([rec(1, 'B', 3, 3, 2), rec(1, 'A', 4, 3, 3)], 'BEST');
    expect(out[0].grade).toBe('A');
  });
});

describe('cumulativeGpa', () => {
  it('weights across semesters with retake collapse', () => {
    const records = [
      rec(1, 'A', 4.0, 3, 1, 'PASSED', 1),
      rec(2, 'B', 3.0, 3, 1, 'PASSED', 1),
      rec(3, 'C', 2.0, 3, 1, 'PASSED', 2),
      rec(4, 'A', 4.0, 3, 1, 'PASSED', 2),
    ];
    const res = cumulativeGpa(records);
    expect(res.cgpa).toBeCloseTo((4 * 3 + 3 * 3 + 2 * 3 + 4 * 3) / 12, 2);
    expect(res.totalCreditsEarned).toBe(12);
  });
});

describe('rule value parsing', () => {
  it('falls back to base scale for malformed values', () => {
    const base = parseGradingScale({});
    expect(base.A).toBe(4.0);
    expect(base.F).toBe(0.0);
    expect(parseGradingScale({ scale: { X: 1 } })).toEqual({ X: 1 });
  });

  it('parses retake policies with a safe default', () => {
    expect(parseRetakePolicy({ mode: 'best' })).toBe('BEST');
    expect(parseRetakePolicy({ mode: 'unknown' })).toBe('LATEST');
    expect(parseRetakePolicy(null)).toBe('LATEST');
  });
});
