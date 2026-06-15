import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const DEFAULT_SKILL_SEMANTICS = [
  {
    id: 'skill-hermes-diagnosis',
    applicableScenarios: ['服务器异常诊断', '告警根因初判', '只读巡检分析'],
    inputContext: ['serverId/serverIds', 'alertId', 'correlationId', '症状描述', '时间窗口'],
    evidenceRequirements: ['服务器状态', '关键指标趋势', '告警详情', '只读命令输出', '相关知识库记录'],
    recommendedTools: ['list_servers', 'query_alerts', 'search_knowledge_base', 'run_readonly_command'],
    recommendedMcpServers: ['observability', 'knowledge-base'],
    riskLevel: 'low',
    approvalPolicy: 'read_only',
    verificationMethod: '基于只读指标、日志和告警状态复核诊断结论；不得声称已执行修复。',
    rollbackGuidance: '无生产变更；如产生误判，应记录证据缺口并进入复盘。',
    outputContract: ['结论', '证据', '风险', '建议动作', '是否需要审批'],
    versionStatus: 'active'
  },
  {
    id: 'skill-hermes-remediation-approval',
    applicableScenarios: ['修复方案生成', '审批提交', '受控工作流编排', '修复状态追踪'],
    inputContext: ['诊断结论', 'serverId/serverIds', 'workflowId', 'approvalId', 'taskId', 'correlationId'],
    evidenceRequirements: ['诊断证据', '影响范围', '风险说明', '回滚方案', '验证方式'],
    recommendedTools: ['list_workflows', 'submit_remediation_for_approval', 'run_workflow', 'get_task_status', 'verify_remediation'],
    recommendedMcpServers: ['workflow-orchestrator', 'change-management'],
    riskLevel: 'high',
    approvalPolicy: 'approval_required',
    verificationMethod: '审批通过并执行后，读取 taskId 状态和 verify_remediation 结果；失败时输出失败节点和下一步。',
    rollbackGuidance: '所有执行类方案必须包含回滚命令、回滚影响面和验证步骤；高风险场景仅提交审批。',
    outputContract: ['修复计划', '风险等级', 'approvalId', 'taskId', 'correlationId', '验证结果'],
    versionStatus: 'active'
  },
  {
    id: 'skill-hermes-review-evolution',
    applicableScenarios: ['故障复盘', '失败样本分析', 'Skill 改进提案', 'Workflow/Policy 优化建议'],
    inputContext: ['correlationId', 'agentExecutionId', 'workerRunId', 'approvalId', 'taskId', '时间窗口'],
    evidenceRequirements: ['会话输出', 'Agent trace', 'Tool approval', 'Task 执行日志', 'Audit log', '失败原因'],
    recommendedTools: ['get_correlation_trace', 'list_agent_executions', 'list_tool_approvals', 'get_task_status'],
    recommendedMcpServers: ['audit-log', 'knowledge-base'],
    riskLevel: 'low',
    approvalPolicy: 'proposal_only',
    verificationMethod: '复盘建议必须引用 correlation 链路证据，并说明是否适合进入 evaluation 和 release。',
    rollbackGuidance: '复盘不直接修改运行态；发布后的改进通过 Release rollback 回退。',
    outputContract: ['事实证据', '判断', '改进建议', '优先级', '收益', '风险'],
    versionStatus: 'active'
  }
];

const v020AddSkillOperationalSemantics: Migration = {
  id: '20260613000020',
  version: 20,
  name: 'add_skill_operational_semantics',
  description: 'Add operations-oriented semantic metadata to Skill Packs',

  up: async (db: any) => {
    logger.info('Adding Skill Pack operational semantic fields...');

    addColumnIfMissing(db, 'skills', 'applicable_scenarios', 'TEXT');
    addColumnIfMissing(db, 'skills', 'input_context', 'TEXT');
    addColumnIfMissing(db, 'skills', 'evidence_requirements', 'TEXT');
    addColumnIfMissing(db, 'skills', 'recommended_tools', 'TEXT');
    addColumnIfMissing(db, 'skills', 'recommended_mcp_servers', 'TEXT');
    addColumnIfMissing(db, 'skills', 'risk_level', "TEXT NOT NULL DEFAULT 'medium'");
    addColumnIfMissing(db, 'skills', 'approval_policy', "TEXT NOT NULL DEFAULT 'inherit'");
    addColumnIfMissing(db, 'skills', 'verification_method', 'TEXT');
    addColumnIfMissing(db, 'skills', 'rollback_guidance', 'TEXT');
    addColumnIfMissing(db, 'skills', 'output_contract', 'TEXT');
    addColumnIfMissing(db, 'skills', 'version_status', "TEXT NOT NULL DEFAULT 'draft'");

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_risk_level ON skills(risk_level);
      CREATE INDEX IF NOT EXISTS idx_skills_version_status ON skills(version_status);
    `);

    const updateSkill = db.prepare(`
      UPDATE skills
      SET applicable_scenarios = COALESCE(NULLIF(applicable_scenarios, ''), ?),
          input_context = COALESCE(NULLIF(input_context, ''), ?),
          evidence_requirements = COALESCE(NULLIF(evidence_requirements, ''), ?),
          recommended_tools = COALESCE(NULLIF(recommended_tools, ''), ?),
          recommended_mcp_servers = COALESCE(NULLIF(recommended_mcp_servers, ''), ?),
          risk_level = CASE WHEN risk_level IS NULL OR risk_level = '' OR risk_level = 'medium' THEN ? ELSE risk_level END,
          approval_policy = CASE WHEN approval_policy IS NULL OR approval_policy = '' OR approval_policy = 'inherit' THEN ? ELSE approval_policy END,
          verification_method = COALESCE(NULLIF(verification_method, ''), ?),
          rollback_guidance = COALESCE(NULLIF(rollback_guidance, ''), ?),
          output_contract = COALESCE(NULLIF(output_contract, ''), ?),
          version_status = CASE WHEN version_status IS NULL OR version_status = '' OR version_status = 'draft' THEN ? ELSE version_status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    DEFAULT_SKILL_SEMANTICS.forEach((skill) => {
      updateSkill.run(
        JSON.stringify(skill.applicableScenarios),
        JSON.stringify(skill.inputContext),
        JSON.stringify(skill.evidenceRequirements),
        JSON.stringify(skill.recommendedTools),
        JSON.stringify(skill.recommendedMcpServers),
        skill.riskLevel,
        skill.approvalPolicy,
        skill.verificationMethod,
        skill.rollbackGuidance,
        JSON.stringify(skill.outputContract),
        skill.versionStatus,
        skill.id
      );
    });

    logger.info('Skill Pack operational semantic fields added successfully');
  },

  down: async () => {
    logger.info('Skipping Skill Pack semantic column rollback; SQLite column drop is intentionally not destructive');
  }
};

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export default v020AddSkillOperationalSemantics;
