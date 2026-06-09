import { checkCommandSafety } from '../../middleware/commandFilter';
import { ToolContext, ToolDecision, ToolDefinition } from './types';

const READ_ONLY_ROLES = new Set(['admin', 'operator', 'viewer']);
const LOW_RISK_ROLES = new Set(['admin', 'operator']);

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

export function evaluateToolPolicy(tool: ToolDefinition, context: ToolContext): ToolDecision {
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
    return {
      status: 'approval_required',
      riskLevel: tool.riskLevel,
      reason: 'Tool requires human approval before execution'
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
