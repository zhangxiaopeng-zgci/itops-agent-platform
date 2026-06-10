import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const SKILLS = [
  {
    id: 'skill-hermes-diagnosis',
    name: '故障诊断 Skill Pack',
    description: '面向告警和服务器异常的只读诊断方法论',
    category: 'diagnosis',
    version: '1.0.0',
    content: [
      '你负责先收集证据再给出结论。',
      '优先使用只读工具查询服务器、告警、知识库和已有工作流。',
      '输出必须包含：结论、证据、风险、建议动作、是否需要审批。',
      '没有工具证据时，不要声称已经确认根因。'
    ].join('\n'),
    requiredTools: ['list_servers', 'query_alerts', 'search_knowledge_base', 'run_readonly_command'],
    riskNotes: '默认只读；修复建议必须进入审批或交由修复编排通道处理。'
  },
  {
    id: 'skill-hermes-remediation-approval',
    name: '审批修复 Skill Pack',
    description: '面向修复方案、审批提交、任务追踪和验证的编排约束',
    category: 'remediation',
    version: '1.0.0',
    content: [
      '你负责把已确认的问题转成可审批的修复计划。',
      '提交修复前必须说明目标对象、影响范围、风险、回滚方案和验证方式。',
      '执行类动作必须通过工具审批或受控工作流，不得绕过人工确认。',
      '工具返回 approvalId、taskId 或 correlationId 时，必须在输出中明确列出。'
    ].join('\n'),
    requiredTools: ['list_workflows', 'submit_remediation_for_approval', 'run_workflow', 'get_task_status', 'verify_remediation'],
    riskNotes: '修复动作默认需审批；高风险或不确定场景只输出计划。'
  },
  {
    id: 'skill-hermes-review-evolution',
    name: '复盘进化 Skill Pack',
    description: '面向链路复盘、审计证据和后续优化 proposal 的方法论',
    category: 'review',
    version: '1.0.0',
    content: [
      '你负责复盘 correlation 链路中的会话、Agent 执行、审批、任务和审计记录。',
      '输出必须区分事实证据、判断和改进建议。',
      '优化建议按 P0/P1/P2/P3 标注优先级，并说明收益和风险。',
      '复盘通道不直接执行生产变更，只提出可审批的改进 proposal。'
    ].join('\n'),
    requiredTools: ['get_correlation_trace', 'list_agent_executions', 'list_tool_approvals', 'get_task_status'],
    riskNotes: '只读复盘；任何优化落地都应转入审批或后续计划。'
  }
];

const CHANNEL_SKILLS = [
  { channelId: 'hermes-channel-diagnose', skillId: 'skill-hermes-diagnosis' },
  { channelId: 'hermes-channel-remediate', skillId: 'skill-hermes-remediation-approval' },
  { channelId: 'hermes-channel-review', skillId: 'skill-hermes-review-evolution' }
];

const v012AddSkillRegistry: Migration = {
  id: '20260610000012',
  version: 12,
  name: 'add_skill_registry',
  description: 'Add Skill Pack registry and Hermes channel skill bindings',

  up: async (db: any) => {
    logger.info('Creating Skill Pack registry tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        version TEXT NOT NULL DEFAULT '1.0.0',
        content TEXT NOT NULL,
        required_tools TEXT,
        risk_notes TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hermes_channel_skills (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, skill_id),
        FOREIGN KEY (channel_id) REFERENCES hermes_channels(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
      CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
      CREATE INDEX IF NOT EXISTS idx_hermes_channel_skills_channel_id ON hermes_channel_skills(channel_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_channel_skills_skill_id ON hermes_channel_skills(skill_id);
    `);

    const insertSkill = db.prepare(`
      INSERT OR IGNORE INTO skills (
        id, name, description, category, version, content, required_tools, risk_notes, enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    SKILLS.forEach((skill) => {
      insertSkill.run(
        skill.id,
        skill.name,
        skill.description,
        skill.category,
        skill.version,
        skill.content,
        JSON.stringify(skill.requiredTools),
        skill.riskNotes
      );
    });

    const insertChannelSkill = db.prepare(`
      INSERT OR IGNORE INTO hermes_channel_skills (id, channel_id, skill_id, enabled)
      VALUES (?, ?, ?, 1)
    `);

    CHANNEL_SKILLS.forEach((binding) => {
      insertChannelSkill.run(`${binding.channelId}:${binding.skillId}`, binding.channelId, binding.skillId);
    });

    logger.info('Skill Pack registry tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing Skill Pack registry tables...');
    db.exec(`
      DROP TABLE IF EXISTS hermes_channel_skills;
      DROP TABLE IF EXISTS skills;
    `);
    logger.info('Skill Pack registry tables removed');
  }
};

export default v012AddSkillRegistry;
