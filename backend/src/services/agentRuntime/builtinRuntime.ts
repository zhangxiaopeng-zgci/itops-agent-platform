import db from '../../models/database';
import { Server } from '../../types';
import { logger } from '../../utils/logger';
import { executeCommand, runComplianceCheck } from '../sshService';
import { AgentRunRequest, AgentRunResult, AgentRuntime } from './types';

export class BuiltinAgentRuntime implements AgentRuntime {
  type = 'builtin' as const;

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const agent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(request.agentId) as { id: string; name: string } | undefined;
    if (!agent) {
      throw new Error(`Agent not found: ${request.agentId}`);
    }

    const output = await executeBuiltinAgent(agent.name, request.input, request.context);
    return {
      status: 'success',
      output,
      metadata: {
        runtime: this.type,
        agentName: agent.name
      }
    };
  }
}

async function executeBuiltinAgent(
  agentName: string,
  input: string,
  context?: Record<string, unknown>
): Promise<string> {
  if (agentName.includes('服务器命令执行')) {
    return await executeServerCommandAgent(input, context);
  }

  if (agentName.includes('系统巡检') || agentName.includes('自动巡检')) {
    return await executeAutoInspectionAgent(input, context);
  }

  throw new Error(`Agent "${agentName}" is not supported by builtin runtime`);
}

async function executeServerCommandAgent(input: string, context?: Record<string, unknown>): Promise<string> {
  logger.info('💻 executeServerCommandAgent called with:', { input, context });

  let serverIds: string[] | undefined = context?.serverIds as string[] | undefined;
  let command: string | undefined = context?.command as string | undefined;

  if (!serverIds && context?.serverId) {
    serverIds = [context.serverId as string];
  }

  logger.info('💻 Selected server IDs:', serverIds);

  const servers = db.prepare('SELECT id, name, hostname FROM servers WHERE enabled = 1').all() as Server[];
  if (servers.length === 0) {
    return '## 无法执行操作\n\n**错误**: 没有找到可用的服务器。请先在服务器管理中添加服务器。';
  }

  if (!serverIds || serverIds.length === 0) {
    serverIds = [servers[0].id];
  }

  if (!command) {
    command = 'uname -a && uptime && free -h && df -h';

    if (input.toLowerCase().includes('cpu')) {
      command = 'top -bn1 | head -20';
    } else if (input.toLowerCase().includes('memory') || input.toLowerCase().includes('内存')) {
      command = 'free -h && cat /proc/meminfo | head -20';
    } else if (input.toLowerCase().includes('disk') || input.toLowerCase().includes('磁盘')) {
      command = 'df -h && du -sh /* 2>/dev/null | sort -rh | head -20';
    } else if (input.toLowerCase().includes('network') || input.toLowerCase().includes('网络')) {
      command = 'ip addr && ss -tulpn';
    } else if (input.toLowerCase().includes('service') || input.toLowerCase().includes('服务')) {
      command = 'systemctl list-units --type=service --state=running || service --status-all 2>&1 | head -50';
    }
  }

  let report = `## 服务器命令执行结果\n\n**执行时间**: ${new Date().toLocaleString()}\n**执行命令**: \n\`\`\`bash\n${command}\n\`\`\`\n**目标服务器**: ${serverIds.length} 台\n\n---\n`;

  let totalSuccess = 0;
  let totalFail = 0;

  for (const serverId of serverIds) {
    const server = servers.find((s: Server) => s.id === serverId);
    if (!server) continue;

    report += `\n### 🖥️ ${server.name} (${server.hostname})\n\n`;

    try {
      const result = await executeCommand(serverId, command!);

      if (result.success) {
        totalSuccess++;
        report += `**状态**: ✅ 成功 (${result.duration}ms)\n\n`;
      } else {
        totalFail++;
        report += `**状态**: ❌ 失败 (${result.duration}ms)\n\n`;
      }

      report += `**输出**: \n\`\`\`\n${result.stdout?.substring(0, 500) || '(无输出)'}\n\`\`\`\n`;

      if (result.stderr) {
        report += `**错误**: \n\`\`\`\n${result.stderr}\n\`\`\`\n`;
      }

    } catch (error: unknown) {
      totalFail++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      report += `**错误**: ${errorMessage}\n\n`;
    }

    report += '---\n';
  }

  report += `\n**统计**: ${totalSuccess} 台成功, ${totalFail} 台失败\n`;

  return report;
}

async function executeAutoInspectionAgent(input: string, context?: Record<string, unknown>): Promise<string> {
  logger.info('🔍 executeAutoInspectionAgent called with:', { input, context });

  let serverIds: string[] | undefined = context?.serverIds as string[] | undefined;

  if (!serverIds && context?.serverId) {
    serverIds = [context.serverId as string];
  }

  logger.info('🔍 Selected server IDs for inspection:', serverIds);

  const servers = db.prepare('SELECT id, name, hostname FROM servers WHERE enabled = 1').all() as Server[];
  if (servers.length === 0) {
    return '## 无法执行巡检\n\n**错误**: 没有找到可用的服务器。请先在服务器管理中添加服务器。';
  }

  if (!serverIds || serverIds.length === 0) {
    serverIds = [servers[0].id];
  }

  let report = `## 服务器自动巡检报告\n\n**检查时间**: ${new Date().toLocaleString()}\n**目标服务器**: ${serverIds.length} 台\n\n---\n`;

  let totalSuccessChecks = 0;
  let totalFailChecks = 0;

  for (const serverId of serverIds) {
    const server = servers.find((s: Server) => s.id === serverId);
    if (!server) continue;

    let successCount = 0;
    let failCount = 0;

    try {
      logger.info(`🔍 对服务器 ${server.name}(${server.hostname}) 执行自动巡检...`);
      const results = await runComplianceCheck(serverId);

      report += `\n### 🖥️ ${server.name} (${server.hostname})\n\n`;

      for (const [, result] of Object.entries(results)) {
        if (result.success) {
          successCount++;
          totalSuccessChecks++;
        } else {
          failCount++;
          totalFailChecks++;
        }
      }

      report += `**检查结果**: ${successCount} ✅, ${failCount} ❌\n\n`;

      for (const [checkName, result] of Object.entries(results)) {
        report += `${result.success ? '✅' : '❌'} **${checkName}**: ${result.success ? '通过' : '失败'}\n`;
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      report += `\n### 🖥️ ${server.name} (${server.hostname})\n\n**错误**: ${errorMessage}\n\n`;
      totalFailChecks += failCount;
    }

    report += '\n---\n';
  }

  report += `\n**总体统计**: ${totalSuccessChecks} 项成功, ${totalFailChecks} 项失败\n`;

  return report;
}
