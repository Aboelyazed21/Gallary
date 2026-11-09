import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../utils/apiError.js';
import { parseGradingScale, parseRetakePolicy } from '../gpa/gpa.service.js';

/**
 * Academic rules are editable data (versioned table), never hard-coded.
 * Controllers/services ask for a rule by key; defaults only apply for tests.
 */
export async function getActiveRule(key: string) {
  return prisma.academicRule.findFirst({
    where: { key, isActive: true },
    orderBy: { version: 'desc' },
  });
}

export async function requireRule(key: string) {
  const rule = await getActiveRule(key);
  if (!rule) throw notFound(`Academic rule ${key} is not configured.`);
  return rule;
}

export async function listRules(activeOnly = true) {
  return prisma.academicRule.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ category: 'asc' }, { key: 'asc' }, { version: 'desc' }],
  });
}

export async function getRuleById(id: number) {
  const rule = await prisma.academicRule.findUnique({ where: { id } });
  if (!rule) throw notFound('Academic rule not found.');
  return rule;
}

// ----- typed projections used across the app -----

export interface Brackets {
  brackets: Array<{ minCgpa: number; maxHours: number }>;
}

export async function getGradingScale(): Promise<Record<string, number>> {
  const rule = await getActiveRule('GRADING_SCALE');
  return rule ? parseGradingScale(rule.value) : parseGradingScale(null);
}

export async function getRetakePolicy(): Promise<'LATEST' | 'BEST' | 'FIRST'> {
  const rule = await getActiveRule('RETAKE_POLICY');
  return rule ? parseRetakePolicy(rule.value as { mode?: unknown }) : 'LATEST';
}

export async function getCreditLimitsByCgpa(): Promise<Brackets['brackets'] | null> {
  const rule = await getActiveRule('CREDIT_LIMIT_BY_CGPA');
  if (!rule) return null;
  const v = rule.value as { brackets?: Array<{ minCgpa: number; maxHours: number }> };
  if (!v?.brackets || !Array.isArray(v.brackets)) return null;
  return v.brackets
    .filter((b) => typeof b.minCgpa === 'number' && typeof b.maxHours === 'number')
    .sort((a, b) => b.minCgpa - a.minCgpa);
}

export async function getMinCreditHours(): Promise<number | null> {
  const rule = await getActiveRule('MIN_CREDIT_LOAD');
  if (!rule) return null;
  const v = rule.value as { hours?: number };
  return typeof v?.hours === 'number' ? v.hours : null;
}

export async function getAllowAlreadyPassed(): Promise<boolean> {
  const rule = await getActiveRule('ALLOW_ALREADY_PASSED');
  if (!rule) return false;
  const v = rule.value as { allowed?: boolean };
  return v?.allowed === true;
}

export async function getMaxFailedAttempts(): Promise<number | null> {
  const rule = await getActiveRule('MAX_FAILED_ATTEMPTS');
  if (!rule) return null;
  const v = rule.value as { max?: number };
  return typeof v?.max === 'number' ? v.max : null;
}

/** Upsert a rule (version bump + implicit approval by caller role check elsewhere). */
export async function upsertRule(input: {
  key: string;
  category: string;
  titleEn: string;
  descriptionEn?: string;
  value: unknown;
  sourceRef?: string;
  requiresConfirmation?: boolean;
  approvedById?: number;
}) {
  const existing = await getActiveRule(input.key);
  if (!existing) {
    return prisma.academicRule.create({
      data: {
        key: input.key,
        category: input.category,
        titleEn: input.titleEn,
        descriptionEn: input.descriptionEn,
        value: input.value as never,
        sourceRef: input.sourceRef,
        requiresConfirmation: input.requiresConfirmation ?? false,
        approvedById: input.approvedById,
        version: 1,
      },
    });
  }
  await prisma.academicRule.update({
    where: { id: existing.id },
    data: {
      value: input.value as never,
      titleEn: input.titleEn,
      descriptionEn: input.descriptionEn,
      version: existing.version + 1,
      sourceRef: input.sourceRef,
      requiresConfirmation: input.requiresConfirmation ?? existing.requiresConfirmation,
      approvedById: input.approvedById ?? existing.approvedById,
    },
  });
  return getActiveRule(input.key);
}
