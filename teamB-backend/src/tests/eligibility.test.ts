import { evaluateEligibility, type EngineContext } from '../modules/eligibility/eligibility.engine.js';

const COURSE = { id: 10, code: 'CS301', creditHours: 3, level: 3 };

const baseContext = (overrides: Partial<EngineContext> = {}): EngineContext => ({
  completed: [],
  prerequisites: [],
  registrations: [],
  courseAvailableInSemester: true,
  currentRegisteredHours: 9,
  cgpa: 3.5,
  creditLimitsByCgpa: [
    { minCgpa: 3.0, maxHours: 21 },
    { minCgpa: 2.0, maxHours: 18 },
    { minCgpa: 1.0, maxHours: 15 },
    { minCgpa: 0.0, maxHours: 12 },
  ],
  minCreditHours: 9,
  warnings: [],
  standing: 'ACTIVE',
  allowAlreadyPassed: false,
  maxFailedAttempts: 3,
  ...overrides,
});

describe('EligibilityEngine', () => {
  it('marks a clean request ELIGIBLE', () => {
    const res = evaluateEligibility(
      baseContext({
        prerequisites: [1],
        completed: [{ courseId: 1, status: 'PASSED', gradePoints: 3.0 }],
      }),
      COURSE,
    );
    expect(res.eligible).toBe(true);
    expect(res.status).toBe('ELIGIBLE');
    expect(res.reasons).toHaveLength(0);
  });

  it('reports missing prerequisites', () => {
    const res = evaluateEligibility(baseContext({ prerequisites: [1, 2] }), COURSE);
    expect(res.eligible).toBe(false);
    expect(res.status).toBe('NOT_ELIGIBLE');
    expect(res.missingPrerequisites).toEqual(['1', '2']);
    expect(res.reasons.some((r) => r.rule === 'PREREQUISITE_REQUIRED')).toBe(true);
    expect(res.recommendations.length).toBeGreaterThan(0);
  });

  it('does not count a failed attempt as completion', () => {
    const res = evaluateEligibility(
      baseContext({
        prerequisites: [1],
        completed: [{ courseId: 1, status: 'FAILED', gradePoints: 0 }],
      }),
      COURSE,
    );
    expect(res.missingPrerequisites).toContain('1');
  });

  it('blocks registration of an already passed course by default', () => {
    const res = evaluateEligibility(
      baseContext({ completed: [{ courseId: COURSE.id, status: 'PASSED', gradePoints: 4.0 }] }),
      COURSE,
    );
    expect(res.reasons.some((r) => r.rule === 'COURSE_ALREADY_PASSED')).toBe(true);
  });

  it('allows re-registration of a passed course only when the rule permits', () => {
    const res = evaluateEligibility(
      baseContext({
        completed: [{ courseId: COURSE.id, status: 'PASSED', gradePoints: 4.0 }],
        allowAlreadyPassed: true,
      }),
      COURSE,
    );
    expect(res.reasons.some((r) => r.rule === 'COURSE_ALREADY_PASSED')).toBe(false);
  });

  it('detects duplicate registrations', () => {
    const res = evaluateEligibility(baseContext({ registrations: [COURSE.id] }), COURSE);
    expect(res.reasons.some((r) => r.rule === 'DUPLICATE_REGISTRATION')).toBe(true);
  });

  it('blocks unavailable courses', () => {
    const res = evaluateEligibility(baseContext({ courseAvailableInSemester: false }), COURSE);
    expect(res.reasons.some((r) => r.rule === 'COURSE_NOT_AVAILABLE')).toBe(true);
  });

  it('enforces CGPA-bracket credit limits (evaluates all rules, not just the first)', () => {
    const ctx = baseContext({
      cgpa: 1.5,
      currentRegisteredHours: 13, // +3 = 16 > 15 max at CGPA 1.5 bracket -> limit breached
      prerequisites: [99], // also missing prereq
    });
    const res = evaluateEligibility(ctx, COURSE);
    const rules = res.reasons.map((r) => r.rule);
    expect(rules).toContain('PREREQUISITE_REQUIRED');
    expect(rules).toContain('CREDIT_LIMIT_EXCEEDED');
  });

  it('flags minimum-load as a warning (REVIEW_REQUIRED), not a block', () => {
    const res = evaluateEligibility(baseContext({ currentRegisteredHours: 3 }), COURSE);
    expect(res.eligible).toBe(true);
    expect(res.status).toBe('REVIEW_REQUIRED');
    expect(res.reasons.some((r) => r.rule === 'MINIMUM_CREDIT_LOAD')).toBe(true);
  });

  it('blocks suspended students', () => {
    const res = evaluateEligibility(baseContext({ standing: 'SUSPENDED' }), COURSE);
    expect(res.status).toBe('NOT_ELIGIBLE');
    expect(res.reasons.some((r) => r.rule === 'ACADEMIC_STANDING')).toBe(true);
  });

  it('flags high-severity warnings for review', () => {
    const res = evaluateEligibility(
      baseContext({ warnings: [{ reason: 'LOW_GPA', severity: 'HIGH' }] }),
      COURSE,
    );
    expect(res.status).toBe('REVIEW_REQUIRED');
    expect(res.reasons.some((r) => r.rule === 'ACADEMIC_WARNING')).toBe(true);
  });

  it('caps failed attempts per course', () => {
    const res = evaluateEligibility(
      baseContext({
        completed: [
          { courseId: COURSE.id, status: 'FAILED', gradePoints: 0 },
          { courseId: COURSE.id, status: 'FAILED', gradePoints: 0 },
          { courseId: COURSE.id, status: 'FAILED', gradePoints: 0 },
        ],
        maxFailedAttempts: 3,
      }),
      COURSE,
    );
    expect(res.reasons.some((r) => r.rule === 'MAX_ATTEMPTS_EXCEEDED')).toBe(true);
  });
});
