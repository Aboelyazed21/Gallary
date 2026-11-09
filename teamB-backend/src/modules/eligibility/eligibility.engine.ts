/**
 * Rule-based academic eligibility engine.
 *
 * Evaluates ALL applicable rules (never stops at the first failure) and
 * returns a structured verdict. Pure and framework-free so the rules can be
 * tested and reused by any caller (API, jobs, simulations).
 */
import type { EligibilityStatus } from '@prisma/client';

export interface EngineReason {
  rule: string;
  message: string;
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
}

export interface CourseInput {
  id: number;
  code: string;
  creditHours: number;
  level: number;
}

export interface EngineContext {
  /** Completed/attempted records (status PASSED or FAILED) for the student. */
  completed: Array<{
    courseId: number;
    status: 'PASSED' | 'FAILED';
    gradePoints: number | null;
  }>;
  /** Prerequisites required by the target course (courseIds). */
  prerequisites: number[];
  /** Course ids already registered for the target semester. */
  registrations: number[];
  /** Whether the course is offered in the target semester. */
  courseAvailableInSemester: boolean;
  /** Current accumulated registered hours for the semester (excluding target course). */
  currentRegisteredHours: number;
  /** Effective CGPA used for brackets (may be null for new students). */
  cgpa: number | null;
  /** Active rules loaded from the academic_rules table. */
  creditLimitsByCgpa: Array<{ minCgpa: number; maxHours: number }> | null;
  minCreditHours: number | null;
  warnings: Array<{ reason: string; severity: string }>;
  standing: 'ACTIVE' | 'SUSPENDED' | 'GRADUATED' | 'ON_LEAVE';
  allowAlreadyPassed: boolean;
  maxFailedAttempts: number | null;
}

export interface EngineResult {
  eligible: boolean;
  status: EligibilityStatus;
  courseCode: string;
  reasons: EngineReason[];
  missingPrerequisites: string[];
  failedPrerequisites: string[];
  recommendations: string[];
  warnings: Array<{ reason: string; severity: string }>;
}

export class EligibilityEngine {
  constructor(private readonly ctx: EngineContext, private readonly course: CourseInput) {}

  evaluate(): EngineResult {
    const reasons: EngineReason[] = [];
    const missing: string[] = [];
    const failed: string[] = [];
    const recommendations: string[] = [];
    const warnings = [...this.ctx.warnings];
    const { ctx, course } = this;

    // 1) Prerequisites
    const passedIds = new Set(ctx.completed.filter((c) => c.status === 'PASSED').map((c) => c.courseId));
    const failedIds = new Set(ctx.completed.filter((c) => c.status === 'FAILED').map((c) => c.courseId));
    for (const preId of ctx.prerequisites) {
      if (!passedIds.has(preId)) {
        missing.push(String(preId));
        reasons.push({
          rule: 'PREREQUISITE_REQUIRED',
          message: `Prerequisite course ${preId} must be passed before registering for ${course.code}.`,
          severity: 'BLOCKING',
        });
        recommendations.push(`Complete prerequisite course ${preId} successfully before registering for ${course.code}.`);
      } else if (failedIds.has(preId)) {
        failed.push(String(preId));
        reasons.push({
          rule: 'PREREQUISITE_FAILED',
          message: `Prerequisite course ${preId} was previously failed; check the retake policy.`,
          severity: 'WARNING',
        });
      }
    }

    // 2) Already passed this course
    if (passedIds.has(course.id) && !ctx.allowAlreadyPassed) {
      reasons.push({
        rule: 'COURSE_ALREADY_PASSED',
        message: `Course ${course.code} has already been passed.`,
        severity: 'BLOCKING',
      });
      recommendations.push(`Retaking ${course.code} requires official approval under the retake policy.`);
    }

    // 3) Already registered for the same semester
    if (ctx.registrations.includes(course.id)) {
      reasons.push({
        rule: 'DUPLICATE_REGISTRATION',
        message: `You are already registered for ${course.code} in this semester.`,
        severity: 'BLOCKING',
      });
    }

    // 4) Course availability
    if (!ctx.courseAvailableInSemester) {
      reasons.push({
        rule: 'COURSE_NOT_AVAILABLE',
        message: `Course ${course.code} is not offered in the current semester (or is inactive).`,
        severity: 'BLOCKING',
      });
      recommendations.push(`Choose another course offered in this semester or check an upcoming semester.`);
    }

    // 5) Credit limits (configurable brackets from academic_rules)
    const limit = this.maxHoursAllowed();
    const projected = ctx.currentRegisteredHours + course.creditHours;
    if (limit !== null && projected > limit) {
      reasons.push({
        rule: 'CREDIT_LIMIT_EXCEEDED',
        message: `Projected load ${projected}h exceeds the allowed maximum ${limit}h for your CGPA${ctx.cgpa !== null ? ` (${ctx.cgpa})` : ''}.`,
        severity: 'BLOCKING',
      });
      recommendations.push(
        `Drop ${Math.max(0, projected - limit)} credit hours or improve your CGPA to unlock a higher limit.`,
      );
    }

    // 6) Minimum load
    if (ctx.minCreditHours !== null && projected < ctx.minCreditHours) {
      reasons.push({
        rule: 'MINIMUM_CREDIT_LOAD',
        message: `Projected load ${projected}h is below the minimum ${ctx.minCreditHours}h.`,
        severity: 'WARNING',
      });
      warnings.push({ reason: 'MINIMUM_CREDIT_LOAD', severity: 'MEDIUM' });
    }

    // 7) Failed-attempts cap
    if (ctx.maxFailedAttempts !== null) {
      const attempts = ctx.completed.filter((c) => c.courseId === course.id).length;
      if (attempts >= ctx.maxFailedAttempts) {
        reasons.push({
          rule: 'MAX_ATTEMPTS_EXCEEDED',
          message: `Course ${course.code} may be attempted at most ${ctx.maxFailedAttempts} time(s); it has been attempted ${attempts} time(s).`,
          severity: 'BLOCKING',
        });
        recommendations.push(`An academic advisor must review this case before any further attempt.`);
      }
    }

    // 8) Academic standing
    if (ctx.standing !== 'ACTIVE') {
      reasons.push({
        rule: 'ACADEMIC_STANDING',
        message: `Student standing is ${ctx.standing}; registration is not permitted.`,
        severity: 'BLOCKING',
      });
    }
    if (warnings.some((w) => w.reason === 'LOW_GPA' || w.severity === 'HIGH')) {
      reasons.push({
        rule: 'ACADEMIC_WARNING',
        message: 'An active academic warning requires advisor review.',
        severity: 'WARNING',
      });
    }

    const blocking = reasons.some((r) => r.severity === 'BLOCKING');
    const warning = reasons.some((r) => r.severity === 'WARNING');

    const status: EligibilityStatus = blocking ? 'NOT_ELIGIBLE' : warning ? 'REVIEW_REQUIRED' : 'ELIGIBLE';

    return {
      eligible: !blocking,
      status,
      courseCode: course.code,
      reasons,
      missingPrerequisites: missing,
      failedPrerequisites: failed,
      recommendations,
      warnings,
    };
  }

  private maxHoursAllowed(): number | null {
    const brackets = this.ctx.creditLimitsByCgpa;
    if (!brackets || brackets.length === 0) return null;
    const cgpa = this.ctx.cgpa ?? 0;
    const sorted = [...brackets].sort((a, b) => b.minCgpa - a.minCgpa);
    for (const b of sorted) {
      if (cgpa >= b.minCgpa) return b.maxHours;
    }
    return sorted[sorted.length - 1]?.maxHours ?? null;
  }
}

export function evaluateEligibility(ctx: EngineContext, course: CourseInput): EngineResult {
  return new EligibilityEngine(ctx, course).evaluate();
}
