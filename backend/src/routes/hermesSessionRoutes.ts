import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import db from '../models/database';
import { requireRole } from '../middleware/auth';
import { getHermesSession, listHermesSessions } from '../services/hermesSessionService';
import { listHermesChannels } from '../services/hermesChannelService';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const CHANNEL_MODE: Record<string, 'diagnose' | 'remediate' | 'review'> = {
  diagnose: 'diagnose',
  remediate: 'remediate',
  review: 'review',
};

const MODE_AGENT_NAME: Record<string, string> = {
  diagnose: 'Hermes 诊断修复 Agent',
  remediate: 'Hermes 修复编排 Agent',
  review: 'Hermes 复盘进化 Agent',
};

const DEFAULT_PROMPTS: Record<string, string> = {
  diagnose: '请以只读方式诊断当前上下文，汇总证据、风险、影响范围和建议动作，不要执行修复。',
  remediate: '请基于当前上下文生成修复编排方案，说明风险、审批要求、回滚方案和验证步骤；如需执行，请先提交审批。',
  review: '请复盘当前 correlation 链路，提取处理结果、证据缺口、流程问题和可形成的 Skill/MCP/Workflow/Policy 进化建议。',
};

function getHermesAgentForChannel(channelId: string, mode: string) {
  const byChannel = db.prepare(`
    SELECT id, name, role, enabled, runtime, autonomy_level, channel_id
    FROM agents
    WHERE channel_id = ?
    ORDER BY enabled DESC, updated_at DESC
    LIMIT 1
  `).get(channelId) as Record<string, unknown> | undefined;
  if (byChannel) return byChannel;

  return db.prepare(`
    SELECT id, name, role, enabled, runtime, autonomy_level, channel_id
    FROM agents
    WHERE name = ?
    ORDER BY enabled DESC, updated_at DESC
    LIMIT 1
  `).get(MODE_AGENT_NAME[mode] || '') as Record<string, unknown> | undefined;
}

function canLaunchMode(role: string | undefined, mode: string): boolean {
  if (mode !== 'remediate') return true;
  return role === 'admin' || role === 'operator';
}

function buildLaunchOptions(role: string | undefined) {
  return listHermesChannels()
    .filter((channel) => channel.enabled !== 0 && CHANNEL_MODE[channel.type])
    .map((channel) => {
      const mode = CHANNEL_MODE[channel.type];
      const agent = getHermesAgentForChannel(channel.id, mode);
      const allowedTools = channel.tools.filter((tool) => tool.enabled === 1).map((tool) => ({
        name: tool.tool_name,
        riskLevel: tool.risk_level_override || 'default',
      }));
      const highRiskToolCount = channel.effectiveBundle?.summary?.highRiskTools || 0;
      return {
        mode,
        channel: {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          model: channel.model,
          healthStatus: channel.health_status,
          enabled: channel.enabled,
        },
        agent: agent ? {
          id: String(agent.id),
          name: String(agent.name),
          role: agent.role ? String(agent.role) : null,
          enabled: Number(agent.enabled || 0),
          runtime: agent.runtime ? String(agent.runtime) : null,
          autonomyLevel: agent.autonomy_level ? String(agent.autonomy_level) : null,
        } : null,
        policy: {
          canLaunch: canLaunchMode(role, mode) && Boolean(agent) && Number(agent?.enabled || 0) === 1,
          mode: mode === 'remediate' ? 'approval_required' : 'read_only_first',
          currentRole: role || 'viewer',
          highRiskToolCount,
        },
        capabilitySummary: {
          tools: allowedTools,
          skillCount: channel.skills.filter((skill) => skill.enabled).length,
          mcpServerCount: channel.mcpServers.filter((server) => server.enabled).length,
          warnings: channel.effectiveBundle?.summary?.warnings || [],
        },
        defaultPrompt: DEFAULT_PROMPTS[mode],
      };
    });
}

router.get('/launch-options', requireRole('admin', 'operator', 'viewer'), (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        schemaVersion: 'hermes.sessionLaunchOptions.v1',
        role: req.user?.role || 'viewer',
        options: buildLaunchOptions(req.user?.role),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to build Hermes launch options' });
  }
});

router.post('/launch', requireRole('admin', 'operator', 'viewer'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'diagnose';
    const channelId = typeof req.body?.channelId === 'string' ? req.body.channelId : '';
    const option = buildLaunchOptions(req.user?.role).find((item) => item.mode === mode && item.channel.id === channelId);
    if (!option) {
      return res.status(404).json({ success: false, error: 'Hermes channel launch option not found' });
    }
    if (!option.policy.canLaunch) {
      return res.status(403).json({ success: false, error: 'Current role cannot launch this Hermes session' });
    }

    const correlationId = typeof req.body?.correlationId === 'string' && req.body.correlationId.trim()
      ? req.body.correlationId.trim()
      : `hermes-session-${randomUUID()}`;
    const prompt = typeof req.body?.prompt === 'string' && req.body.prompt.trim()
      ? req.body.prompt.trim()
      : option.defaultPrompt;
    const params = new URLSearchParams({
      mode,
      correlationId,
      prompt,
    });
    if (typeof req.body?.caseId === 'string' && req.body.caseId.trim()) params.set('caseId', req.body.caseId.trim());
    if (typeof req.body?.serverId === 'string' && req.body.serverId.trim()) params.set('serverId', req.body.serverId.trim());
    if (Array.isArray(req.body?.serverIds) && req.body.serverIds.length > 0) params.set('serverIds', req.body.serverIds.map(String).join(','));
    if (typeof req.body?.alertId === 'string' && req.body.alertId.trim()) params.set('alertId', req.body.alertId.trim());
    if (typeof req.body?.workflowId === 'string' && req.body.workflowId.trim()) params.set('workflowId', req.body.workflowId.trim());
    if (typeof req.body?.knowledgeCategory === 'string' && req.body.knowledgeCategory.trim()) params.set('knowledgeCategory', req.body.knowledgeCategory.trim());

    res.json({
      success: true,
      data: {
        schemaVersion: 'hermes.sessionLaunch.v1',
        launchUrl: `/hermes?${params.toString()}`,
        mode,
        channelId,
        agentId: option.agent?.id || null,
        correlationId,
        prompt,
        policy: option.policy,
        capabilitySummary: option.capabilitySummary,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to launch Hermes session' });
  }
});

router.get('/', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const result = listHermesSessions({
      mode: typeof req.query.mode === 'string' ? req.query.mode : undefined,
      correlationId: typeof req.query.correlationId === 'string' ? req.query.correlationId : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Hermes sessions' });
  }
});

router.get('/:id', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const session = getHermesSession(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Hermes session not found' });
    }

    return res.json({ success: true, data: session });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get Hermes session' });
  }
});

export default router;
