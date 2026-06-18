import { env } from '../utils/env';
import type { EvolutionProposalRecord } from './evolutionProposalService';
import type { EvolutionStructuredPatch } from './evolutionPatchService';

export type EvolutionReleaseRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface EvolutionReleaseGovernanceContext {
  actorId?: string | null;
  now?: Date;
}

export interface EvolutionReleaseGovernanceSummary {
  riskLevel: EvolutionReleaseRiskLevel;
  highRisk: boolean;
  reasons: string[];
  changeWindow: {
    enabled: boolean;
    open: boolean;
    timezone: string;
    days: string[];
    start: string;
    end: string;
    localDay: string;
    localTime: string;
  };
  dualApproval: {
    required: boolean;
    valid: boolean;
    reviewerId: string | null;
    publisherId: string | null;
    reviewedAt: string | null;
  };
  rollbackPlan: {
    required: boolean;
    valid: boolean;
    strategy: string | null;
    notes: string | null;
  };
}

const RISK_ORDER: EvolutionReleaseRiskLevel[] = ['low', 'medium', 'high', 'critical'];

export function buildEvolutionReleaseGovernance(
  proposal: EvolutionProposalRecord,
  patch: EvolutionStructuredPatch | null,
  context: EvolutionReleaseGovernanceContext = {}
): EvolutionReleaseGovernanceSummary {
  const risk = inferRisk(proposal, patch);
  const highRisk = risk.riskLevel === 'high' || risk.riskLevel === 'critical';
  const changeWindow = buildChangeWindow(context.now || new Date());
  const rollbackPlan = readRollbackPlan(patch);
  const publisherId = normalizePrincipalId(context.actorId);
  const reviewerId = normalizePrincipalId(proposal.reviewed_by);
  const dualApprovalRequired = highRisk;

  return {
    riskLevel: risk.riskLevel,
    highRisk,
    reasons: risk.reasons,
    changeWindow,
    dualApproval: {
      required: dualApprovalRequired,
      valid: !dualApprovalRequired || Boolean(reviewerId && publisherId && reviewerId !== publisherId),
      reviewerId,
      publisherId,
      reviewedAt: proposal.reviewed_at
    },
    rollbackPlan: {
      required: highRisk,
      valid: !highRisk || Boolean(rollbackPlan.notes),
      strategy: rollbackPlan.strategy,
      notes: rollbackPlan.notes
    }
  };
}

function inferRisk(
  proposal: EvolutionProposalRecord,
  patch: EvolutionStructuredPatch | null
): { riskLevel: EvolutionReleaseRiskLevel; reasons: string[] } {
  const levels: EvolutionReleaseRiskLevel[] = ['medium'];
  const reasons: string[] = [];

  if (proposal.priority === 'P0') {
    levels.push('critical');
    reasons.push('priority=P0');
  } else if (proposal.priority === 'P1') {
    levels.push('high');
    reasons.push('priority=P1');
  }

  if (proposal.type === 'workflow_template_update' || proposal.type === 'tool_policy_update' || proposal.type === 'mcp_binding_update') {
    levels.push('high');
    reasons.push(`type=${proposal.type}`);
  }

  for (const operation of patch?.operations || []) {
    if (operation.riskLevel === 'critical' || operation.riskLevel === 'high') {
      levels.push(operation.riskLevel);
      reasons.push(`operation:${operation.path}:${operation.riskLevel}`);
    }
    if (operation.op === 'remove' || operation.op === 'unbind') {
      levels.push('high');
      reasons.push(`operation:${operation.op}`);
    }
  }

  const riskNotes = `${proposal.risk_notes || ''} ${proposal.proposal_body || ''}`.toLowerCase();
  if (/(critical|destructive|高危|高风险|危险|删除|回滚|生产)/i.test(riskNotes)) {
    levels.push('high');
    reasons.push('risk_notes_or_body_high_risk_signal');
  }

  const riskLevel = maxRisk(levels);
  return {
    riskLevel,
    reasons: reasons.length > 0 ? reasons.slice(0, 8) : [`risk=${riskLevel}`]
  };
}

function buildChangeWindow(now: Date): EvolutionReleaseGovernanceSummary['changeWindow'] {
  const local = readLocalParts(now, env.EVOLUTION_RELEASE_CHANGE_WINDOW_TIMEZONE);
  const enabled = env.EVOLUTION_RELEASE_CHANGE_WINDOW_ENABLED;
  const dayAllowed = env.EVOLUTION_RELEASE_CHANGE_WINDOW_DAYS.includes(local.day);
  const timeAllowed = isTimeInWindow(
    local.time,
    env.EVOLUTION_RELEASE_CHANGE_WINDOW_START,
    env.EVOLUTION_RELEASE_CHANGE_WINDOW_END
  );

  return {
    enabled,
    open: !enabled || (dayAllowed && timeAllowed),
    timezone: env.EVOLUTION_RELEASE_CHANGE_WINDOW_TIMEZONE,
    days: env.EVOLUTION_RELEASE_CHANGE_WINDOW_DAYS,
    start: env.EVOLUTION_RELEASE_CHANGE_WINDOW_START,
    end: env.EVOLUTION_RELEASE_CHANGE_WINDOW_END,
    localDay: local.day,
    localTime: local.time
  };
}

function readLocalParts(now: Date, timezone: string): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const weekday = String(parts.find(part => part.type === 'weekday')?.value || '');
  const hour = String(parts.find(part => part.type === 'hour')?.value || '00').padStart(2, '0');
  const minute = String(parts.find(part => part.type === 'minute')?.value || '00').padStart(2, '0');
  return {
    day: weekdayToNumber(weekday),
    time: `${hour}:${minute}`
  };
}

function weekdayToNumber(value: string): string {
  const normalized = value.slice(0, 3).toLowerCase();
  const map: Record<string, string> = {
    sun: '0',
    mon: '1',
    tue: '2',
    wed: '3',
    thu: '4',
    fri: '5',
    sat: '6'
  };
  return map[normalized] || '0';
}

function isTimeInWindow(current: string, start: string, end: string): boolean {
  const currentMinutes = parseTime(current);
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function parseTime(value: string): number {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return 0;
  }
  return (Math.min(23, Number(match[1])) * 60) + Math.min(59, Number(match[2]));
}

function readRollbackPlan(patch: EvolutionStructuredPatch | null): { strategy: string | null; notes: string | null } {
  const strategy = normalizeText(patch?.rollbackPlan?.strategy);
  const notes = normalizeText(patch?.rollbackPlan?.notes);
  return { strategy, notes };
}

function maxRisk(levels: EvolutionReleaseRiskLevel[]): EvolutionReleaseRiskLevel {
  return levels.reduce((current, next) => (
    RISK_ORDER.indexOf(next) > RISK_ORDER.indexOf(current) ? next : current
  ), 'low');
}

function normalizeText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePrincipalId(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  return text.replace(/\.0$/, '');
}
