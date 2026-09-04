import { PlanningAssignmentStatus } from '@prisma/client';

type PlanningTimeValue = Date | string | null | undefined;

export type PlanningTimeWarning =
  | 'INVALID_START_TIME'
  | 'INVALID_END_TIME'
  | 'INVALID_BREAK_MINUTES'
  | 'CANCELLED_OR_REPLACED'
  | 'BREAK_EXCEEDS_DURATION';

export type PlanningMinutesInput = {
  startTime?: PlanningTimeValue;
  endTime?: PlanningTimeValue;
  breakMinutes?: number | null;
  status?: string | null;
};

export type PlanningMinutesResult = {
  plannedMinutes: number;
  grossMinutes: number;
  breakMinutes: number;
  crossesMidnight: boolean;
  warnings: PlanningTimeWarning[];
};

export function calculatePlanningAssignmentMinutes(input: PlanningMinutesInput): PlanningMinutesResult {
  const warnings: PlanningTimeWarning[] = [];
  if (input.status === PlanningAssignmentStatus.CANCELLED || input.status === PlanningAssignmentStatus.REPLACED) {
    return { plannedMinutes: 0, grossMinutes: 0, breakMinutes: 0, crossesMidnight: false, warnings: ['CANCELLED_OR_REPLACED'] };
  }

  const start = timeValue(input.startTime);
  const end = timeValue(input.endTime);
  if (!start.valid) warnings.push('INVALID_START_TIME');
  if (!end.valid) warnings.push('INVALID_END_TIME');
  if (!start.valid || !end.valid) return { plannedMinutes: 0, grossMinutes: 0, breakMinutes: 0, crossesMidnight: false, warnings };

  let endMs = end.value;
  let crossesMidnight = false;
  if (endMs <= start.value) {
    endMs += 24 * 60 * 60 * 1000;
    crossesMidnight = true;
  }

  const grossMinutes = Math.max(0, Math.round((endMs - start.value) / 60000));
  let breakMinutes = Number(input.breakMinutes ?? 0);
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
    breakMinutes = 0;
    warnings.push('INVALID_BREAK_MINUTES');
  }
  breakMinutes = Math.round(breakMinutes);
  if (breakMinutes > grossMinutes) {
    breakMinutes = grossMinutes;
    warnings.push('BREAK_EXCEEDS_DURATION');
  }

  return {
    plannedMinutes: Math.max(0, grossMinutes - breakMinutes),
    grossMinutes,
    breakMinutes,
    crossesMidnight,
    warnings,
  };
}

export function plannedMinutes(input: PlanningMinutesInput) {
  return calculatePlanningAssignmentMinutes(input).plannedMinutes;
}

function timeValue(value: PlanningTimeValue): { valid: true; value: number } | { valid: false; value: 0 } {
  if (value instanceof Date && !Number.isNaN(+value)) return { valid: true, value: +value };
  if (typeof value !== 'string' || !value.trim()) return { valid: false, value: 0 };
  if (/^\d{2}:\d{2}$/.test(value)) {
    const [hours, minutes] = value.split(':').map(Number);
    if (hours > 23 || minutes > 59) return { valid: false, value: 0 };
    return { valid: true, value: (hours * 60 + minutes) * 60000 };
  }
  const parsed = new Date(value);
  if (Number.isNaN(+parsed)) return { valid: false, value: 0 };
  return { valid: true, value: +parsed };
}
