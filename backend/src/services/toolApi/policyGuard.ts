import { checkCommandSafety } from '../../middleware/commandFilter';
import { ToolContext, ToolDecision, ToolDefinition, ToolRiskLevel, ToolSafetyReview } from './types';

const READ_ONLY_ROLES = new Set(['admin', 'operator', 'viewer']);
const LOW_RISK_ROLES = new Set(['admin', 'operator']);
const APPROVAL_REQUEST_ROLES = new Set(['admin', 'operator']);

const READ_ONLY_COMMANDS = new Set([
  'cat',
  'df',
  'du',
  'free',
  'grep',
  'head',
  'hostname',
  'ip',
  'last',
  'ps',
  'ss',
  'tail',
  'uname',
  'uptime',
  'w',
  'who'
]);

const SHELL_CONTROL_PATTERN = /[;&|`$<>]/;
const SENSITIVE_READ_PATTERN = /(^|\s)(\/etc\/shadow|\/root\/\.ssh\/|.*id_rsa|.*\.pem|.*\.key)(\s|$)/;

interface PromptSafetyPolicy {
  name: string;
  severity: 'high_risk' | 'destructive';
  patterns: RegExp[];
}

const DESTRUCTIVE_PROMPT_POLICIES: PromptSafetyPolicy[] = [
  {
    name: 'policy_bypass_attempt',
    severity: 'destructive',
    patterns: [
      /\b(ignore|bypass|skip|disable)\b.{0,40}\b(approval|policy|safety|guardrail|audit)\b/i,
      /(绕过|跳过|忽略|关闭).{0,20}(审批|安全|策略|审计|限制)/
    ]
  },
  {
    name: 'filesystem_destructive_prompt',
    severity: 'destructive',
    patterns: [
      /\brm\s+-r?f\s+\/(?:\s|$)/i,
      /\brm\s+-r?f\s+\*/i,
      /\bshred\s+-/i,
      /\bdd\s+if=\/dev\/(?:zero|random|urandom)/i
    ]
  },
  {
    name: 'disk_partition_destructive_prompt',
    severity: 'destructive',
    patterns: [
      /\bmkfs(?:\.|\s)/i,
      /\bfdisk\s+\/dev\//i,
      /\bparted\s+\/dev\//i,
      /\bcryptsetup\b/i,
      /\b(?:lvremove|vgremove)\b/i
    ]
  },
  {
    name: 'database_destructive_prompt',
    severity: 'destructive',
    patterns: [
      /\bdrop\s+database\b/i,
      /\bdrop\s+table\b/i,
      /\btruncate\s+table\b/i
    ]
  },
  {
    name: 'cluster_mass_delete_prompt',
    severity: 'destructive',
    patterns: [
      /\bkubectl\s+delete\s+(?:all|namespace|ns)\b/i,
      /\bkubectl\s+delete\b.{0,80}\s--all\b/i,
      /\bdocker\s+system\s+prune\b.{0,40}\s(?:-a|--all)/i
    ]
  }
];

const HIGH_RISK_PROMPT_POLICIES: PromptSafetyPolicy[] = [
  {
    name: 'service_disruption_prompt',
    severity: 'high_risk',
    patterns: [
      /\b(?:shutdown|reboot|poweroff)\b/i,
      /\bsystemctl\s+(?:stop|restart|disable)\b/i,
      /\bservice\s+\S+\s+(?:stop|restart)\b/i,
      /(重启|停止|关闭).{0,20}(服务|节点|主机|集群)/
    ]
  },
  {
    name: 'cluster_mutation_prompt',
    severity: 'high_risk',
    patterns: [
      /\bkubectl\s+(?:apply|patch|scale|rollout\s+restart)\b/i,
      /\bkubectl\s+delete\s+(?:pod|deployment|service|svc|statefulset|daemonset)\b/i
    ]
  },
  {
    name: 'network_mutation_prompt',
    severity: 'high_risk',
    patterns: [
      /\biptables\s+(?:-F|--flush|-A|-D)\b/i,
      /\bip\s+link\s+(?:set|delete)\b/i,
      /\btc\s+qdisc\s+(?:add|del|change)\b/i
    ]
  },
  {
    name: 'remote_script_execution_prompt',
    severity: 'high_risk',
    patterns: [
      /\b(?:curl|wget)\b.{0,120}\|\s*(?:sh|bash)\b/i,
      /\bchmod\s+\+x\b.{0,80}\b(?:sh|bash)\b/i
    ]
  }
];

export function evaluateToolInputSafety(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  context: ToolContext
): ToolSafetyReview | null {
  const textFields = collectTextFields(input);
  if (textFields.length === 0) {
    return null;
  }

  const matchedPolicies = [...DESTRUCTIVE_PROMPT_POLICIES, ...HIGH_RISK_PROMPT_POLICIES].flatMap((policy) => {
    return textFields.flatMap((field) => {
      const matched = policy.patterns.some((pattern) => pattern.test(field.value));
      return matched ? [{
        policy: policy.name,
        severity: policy.severity,
        field: field.path,
        excerpt: buildExcerpt(field.value)
      }] : [];
    });
  });

  if (matchedPolicies.length === 0) {
    return null;
  }

  const destructive = matchedPolicies.some((match) => match.severity === 'destructive');
  const readOnlyMismatch = tool.riskLevel === 'read_only' && matchedPolicies.length > 0;
  const blocked = destructive || readOnlyMismatch;
  const riskClass: ToolRiskLevel = blocked ? 'destructive' : 'high_risk';

  return {
    schemaVersion: 'tool.safetyReview.v1',
    status: blocked ? 'blocked' : 'requires_approval',
    riskClass,
    matchedPolicies,
    explanation: blocked
      ? 'Tool input contains destructive or policy-bypass intent and was blocked before execution.'
      : 'Tool input contains high-risk operational intent and requires explicit human approval before execution.',
    operatorGuidance: blocked
      ? 'Rewrite the request as diagnosis, evidence collection, or a proposal-only remediation plan. Destructive actions cannot be executed through this tool boundary.'
      : 'Reviewer must confirm target scope, blast radius, rollback plan, and verification plan before approval.',
    generatedAt: new Date().toISOString()
  };
}

export function evaluateToolPolicy(tool: ToolDefinition, context: ToolContext, input: Record<string, unknown> = {}): ToolDecision {
  const safetyReview = evaluateToolInputSafety(tool, input, context);
  if (safetyReview?.status === 'blocked') {
    return {
      status: 'denied',
      riskLevel: safetyReview.riskClass,
      reason: safetyReview.explanation,
      safetyReview
    };
  }

  if (safetyReview?.status === 'requires_approval' && !APPROVAL_REQUEST_ROLES.has(context.userRole)) {
    return {
      status: 'denied',
      riskLevel: safetyReview.riskClass,
      reason: 'Role cannot submit high-risk tool prompts for approval',
      safetyReview
    };
  }

  if (safetyReview?.status === 'requires_approval') {
    return {
      status: 'approval_required',
      riskLevel: safetyReview.riskClass,
      reason: safetyReview.explanation,
      safetyReview
    };
  }

  if (tool.riskLevel === 'read_only') {
    return READ_ONLY_ROLES.has(context.userRole)
      ? { status: 'allowed', riskLevel: tool.riskLevel }
      : { status: 'denied', riskLevel: tool.riskLevel, reason: 'Role cannot invoke read-only tools' };
  }

  if (tool.riskLevel === 'low_risk') {
    return LOW_RISK_ROLES.has(context.userRole)
      ? { status: 'allowed', riskLevel: tool.riskLevel }
      : { status: 'denied', riskLevel: tool.riskLevel, reason: 'Role cannot invoke low-risk tools' };
  }

  if (tool.riskLevel === 'medium_risk' || tool.riskLevel === 'high_risk') {
    return APPROVAL_REQUEST_ROLES.has(context.userRole)
      ? {
        status: 'approval_required',
        riskLevel: tool.riskLevel,
        reason: 'Tool requires human approval before execution'
      }
      : {
        status: 'denied',
        riskLevel: tool.riskLevel,
        reason: 'Role cannot submit medium/high-risk tools for approval'
      };
  }

  return {
    status: 'denied',
    riskLevel: tool.riskLevel,
    reason: 'Destructive tools are not executable through the tool API'
  };
}

export function evaluateReadOnlyCommand(command: string, userRole: string): ToolDecision {
  const normalized = command.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { status: 'denied', riskLevel: 'read_only', reason: 'Command is required' };
  }

  if (SHELL_CONTROL_PATTERN.test(normalized)) {
    return {
      status: 'denied',
      riskLevel: 'read_only',
      reason: 'Shell control characters are not allowed in read-only command tools'
    };
  }

  if (SENSITIVE_READ_PATTERN.test(normalized)) {
    return {
      status: 'denied',
      riskLevel: 'read_only',
      reason: 'Sensitive credential files are not readable through agent tools'
    };
  }

  const commandName = normalized.replace(/^(?:sudo(?:\s+-\w+(?:\s+\S+)?)?\s+)+/, '').split(' ')[0];
  if (!READ_ONLY_COMMANDS.has(commandName)) {
    return {
      status: 'denied',
      riskLevel: 'read_only',
      reason: `Command '${commandName}' is not in the read-only allowlist`
    };
  }

  const commandSafety = checkCommandSafety(normalized, userRole);
  if (!commandSafety.allowed) {
    return {
      status: 'denied',
      riskLevel: 'read_only',
      reason: commandSafety.reason || 'Command rejected by safety policy'
    };
  }

  return {
    status: commandSafety.severity === 'warning' ? 'approval_required' : 'allowed',
    riskLevel: 'read_only',
    reason: commandSafety.reason
  };
}

function collectTextFields(value: unknown, path = 'input', depth = 0): Array<{ path: string; value: string }> {
  if (depth > 8 || value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? [{ path, value: normalized }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectTextFields(item, `${path}[${index}]`, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => (
      collectTextFields(item, `${path}.${key}`, depth + 1)
    ));
  }

  return [];
}

function buildExcerpt(value: string): string {
  return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}
