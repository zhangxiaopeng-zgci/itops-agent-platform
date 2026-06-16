import { db } from '../database';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';

interface WorkflowAgentNodeSpec {
  name: string;
  avatar: string;
  description?: string;
  allowFailure?: boolean;
  runbookPhase?: string;
  evidenceRequired?: string[];
  riskGate?: string;
  approvalRequired?: boolean;
  verificationRequired?: boolean;
  recommendedSkillId?: string;
  outputKey?: string;
}

interface WorkflowTemplateSpec {
  name: string;
  description: string;
  teamType: string;
  collaborationMode: 'pipeline' | 'parallel' | 'debate';
  runbookPattern: string;
  nodes: WorkflowAgentNodeSpec[];
}

const HERMES_WORKFLOW_TEMPLATES: WorkflowTemplateSpec[] = [
  {
    name: 'Hermes 告警诊断与修复闭环',
    description: 'Hermes 先完成告警诊断和证据收集，再结合日志、服务器命令和修复编排 Agent 形成审批式修复闭环，最后生成处理报告。',
    teamType: 'alert_remediation',
    collaborationMode: 'pipeline',
    runbookPattern: 'diagnose-evidence-risk-approval-execute-verify-review',
    nodes: [
      {
        name: 'Hermes 诊断修复 Agent',
        avatar: '🧠',
        description: '收集告警上下文、提出初步 RCA 和证据缺口。',
        runbookPhase: 'diagnose',
        evidenceRequired: ['alert', 'metrics', 'recent_changes'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-diagnosis',
        outputKey: 'diagnosis'
      },
      {
        name: '日志分析 Agent',
        avatar: '📝',
        description: '围绕告警时间窗补充日志证据。',
        runbookPhase: 'evidence',
        evidenceRequired: ['logs'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-diagnosis',
        outputKey: 'log_evidence'
      },
      {
        name: '服务器命令执行 Agent',
        avatar: '💻',
        description: '执行只读命令补充主机状态和影响面。',
        runbookPhase: 'evidence',
        evidenceRequired: ['server_metrics', 'process_state'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-diagnosis',
        outputKey: 'server_evidence'
      },
      {
        name: 'Hermes 修复编排 Agent',
        avatar: '🛠️',
        description: '生成修复计划、风险说明、审批和回滚建议。',
        runbookPhase: 'approval_plan',
        evidenceRequired: ['diagnosis', 'log_evidence', 'server_evidence'],
        riskGate: 'approval_required',
        approvalRequired: true,
        verificationRequired: true,
        recommendedSkillId: 'skill-hermes-remediation-approval',
        outputKey: 'remediation_plan'
      },
      {
        name: '文档生成 Agent',
        avatar: '📄',
        description: '沉淀处理报告、验证结果和复盘输入。',
        runbookPhase: 'review',
        evidenceRequired: ['remediation_plan', 'verification_result'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-review-evolution',
        outputKey: 'runbook_report'
      }
    ]
  },
  {
    name: 'Hermes 故障诊断与审批修复',
    description: '面向明确故障的 Hermes 增强流程：诊断修复 Agent 判断根因，命令执行 Agent 补充事实，修复编排 Agent 提交审批式工作流，复盘进化 Agent 输出改进建议。',
    teamType: 'alert_remediation',
    collaborationMode: 'pipeline',
    runbookPattern: 'diagnose-evidence-approval-execute-review',
    nodes: [
      {
        name: 'Hermes 诊断修复 Agent',
        avatar: '🧠',
        description: '基于故障描述输出 RCA 假设、证据列表和风险等级。',
        runbookPhase: 'diagnose',
        evidenceRequired: ['symptom', 'metrics', 'logs'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-diagnosis',
        outputKey: 'rca'
      },
      {
        name: '服务器命令执行 Agent',
        avatar: '💻',
        description: '补齐只读命令证据，避免无证据修复。',
        runbookPhase: 'evidence',
        evidenceRequired: ['server_state'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-diagnosis',
        outputKey: 'command_evidence'
      },
      {
        name: 'Hermes 修复编排 Agent',
        avatar: '🛠️',
        description: '把 RCA 转换为受控修复计划、审批单和验证步骤。',
        runbookPhase: 'approval_plan',
        evidenceRequired: ['rca', 'command_evidence'],
        riskGate: 'approval_required',
        approvalRequired: true,
        verificationRequired: true,
        recommendedSkillId: 'skill-hermes-remediation-approval',
        outputKey: 'repair_plan'
      },
      {
        name: 'Hermes 复盘进化 Agent',
        avatar: '🧬',
        description: '根据执行结果生成 Skill/Workflow/Policy 改进建议。',
        runbookPhase: 'evolve',
        evidenceRequired: ['repair_plan', 'task_result', 'verification_result'],
        riskGate: 'review_required',
        recommendedSkillId: 'skill-hermes-review-evolution',
        outputKey: 'evolution_proposal'
      }
    ]
  },
  {
    name: 'Hermes 巡检复盘与优化建议',
    description: '用于巡检后的复盘与优化：系统巡检和命令执行收集事实，文档生成 Agent 形成报告，Hermes 复盘进化 Agent 输出可审批的优化 proposal。',
    teamType: 'inspection_review',
    collaborationMode: 'parallel',
    runbookPattern: 'inspect-evidence-report-evolve',
    nodes: [
      {
        name: '系统巡检 Agent',
        avatar: '🔎',
        description: '收集服务器和系统健康状态。',
        runbookPhase: 'inspect',
        evidenceRequired: ['metrics', 'service_state'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-diagnosis',
        outputKey: 'inspection_evidence'
      },
      {
        name: '服务器命令执行 Agent',
        avatar: '💻',
        description: '补充只读命令证据，定位异常资源。',
        runbookPhase: 'evidence',
        evidenceRequired: ['server_state'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-diagnosis',
        outputKey: 'server_evidence'
      },
      {
        name: '文档生成 Agent',
        avatar: '📄',
        description: '生成巡检报告和异常摘要。',
        runbookPhase: 'report',
        evidenceRequired: ['inspection_evidence', 'server_evidence'],
        riskGate: 'read_only',
        recommendedSkillId: 'skill-hermes-review-evolution',
        outputKey: 'inspection_report'
      },
      {
        name: 'Hermes 复盘进化 Agent',
        avatar: '🧬',
        description: '把重复异常沉淀为 Skill/Workflow/Policy 优化提案。',
        runbookPhase: 'evolve',
        evidenceRequired: ['inspection_report'],
        riskGate: 'review_required',
        recommendedSkillId: 'skill-hermes-review-evolution',
        outputKey: 'optimization_proposal'
      }
    ]
  }
];

export function initializePresetWorkflows() {
  const alertAgent = db.prepare("SELECT id FROM agents WHERE name = '告警处理 Agent'").get() as { id: string } | undefined;
  const diagnosticAgent = db.prepare("SELECT id FROM agents WHERE name = '故障诊断 Agent'").get() as { id: string } | undefined;
  const logAgent = db.prepare("SELECT id FROM agents WHERE name = '日志分析 Agent'").get() as { id: string } | undefined;
  const systemCheckAgent = db.prepare("SELECT id FROM agents WHERE name = '系统巡检 Agent'").get() as { id: string } | undefined;
  const changeAgent = db.prepare("SELECT id FROM agents WHERE name = '变更执行 Agent'").get() as { id: string } | undefined;
  const docAgent = db.prepare("SELECT id FROM agents WHERE name = '文档生成 Agent'").get() as { id: string } | undefined;
  const complianceAgent = db.prepare("SELECT id FROM agents WHERE name = '合规检查 Agent'").get() as { id: string } | undefined;
  const commandAgent = db.prepare("SELECT id FROM agents WHERE name = '服务器命令执行 Agent'").get() as { id: string } | undefined;

  const healthNode1 = randomUUID();
  const healthNode2 = randomUUID();
  const healthNode3 = randomUUID();
  
  const dailyHealthCheckNodes = JSON.stringify([
    { id: healthNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '系统巡检 Agent', agentId: systemCheckAgent?.id || null, avatar: '🔎' } },
    { id: healthNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: healthNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const dailyHealthCheckEdges = JSON.stringify([
    { id: randomUUID(), source: healthNode1, target: healthNode2 },
    { id: randomUUID(), source: healthNode2, target: healthNode3 }
  ]);

  const alertNode1 = randomUUID();
  const alertNode2 = randomUUID();
  const alertNode3 = randomUUID();
  
  const alertHandlingNodes = JSON.stringify([
    { id: alertNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '告警处理 Agent', agentId: alertAgent?.id || null, avatar: '🚨' } },
    { id: alertNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '日志分析 Agent', agentId: logAgent?.id || null, avatar: '📝' } },
    { id: alertNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const alertHandlingEdges = JSON.stringify([
    { id: randomUUID(), source: alertNode1, target: alertNode2 },
    { id: randomUUID(), source: alertNode2, target: alertNode3 }
  ]);

  const diagNode1 = randomUUID();
  const diagNode2 = randomUUID();
  const diagNode3 = randomUUID();
  const diagNode4 = randomUUID();
  
  const diagnosticNodes = JSON.stringify([
    { id: diagNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '故障诊断 Agent', agentId: diagnosticAgent?.id || null, avatar: '🔍' } },
    { id: diagNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '日志分析 Agent', agentId: logAgent?.id || null, avatar: '📝' } },
    { id: diagNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: diagNode4, type: 'agent', position: { x: 1000, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const diagnosticEdges = JSON.stringify([
    { id: randomUUID(), source: diagNode1, target: diagNode2 },
    { id: randomUUID(), source: diagNode2, target: diagNode3 },
    { id: randomUUID(), source: diagNode3, target: diagNode4 }
  ]);

  const compNode1 = randomUUID();
  const compNode2 = randomUUID();
  const compNode3 = randomUUID();
  
  const complianceNodes = JSON.stringify([
    { id: compNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '合规检查 Agent', agentId: complianceAgent?.id || null, avatar: '🛡️' } },
    { id: compNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: compNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const complianceEdges = JSON.stringify([
    { id: randomUUID(), source: compNode1, target: compNode2 },
    { id: randomUUID(), source: compNode2, target: compNode3 }
  ]);

  const changeNode1 = randomUUID();
  const changeNode2 = randomUUID();
  const changeNode3 = randomUUID();
  
  const changeNodes = JSON.stringify([
    { id: changeNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '变更执行 Agent', agentId: changeAgent?.id || null, avatar: '⚙️' } },
    { id: changeNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: changeNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const changeEdges = JSON.stringify([
    { id: randomUUID(), source: changeNode1, target: changeNode2 },
    { id: randomUUID(), source: changeNode2, target: changeNode3 }
  ]);

  const logNode1 = randomUUID();
  const logNode2 = randomUUID();
  const logNode3 = randomUUID();
  
  const logAnalysisNodes = JSON.stringify([
    { id: logNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '日志分析 Agent', agentId: logAgent?.id || null, avatar: '📝' } },
    { id: logNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: logNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const logAnalysisEdges = JSON.stringify([
    { id: randomUUID(), source: logNode1, target: logNode2 },
    { id: randomUUID(), source: logNode2, target: logNode3 }
  ]);
  
  const presetWorkflows = [
    {
      id: randomUUID(),
      name: '日常健康检查',
      description: '对服务器进行日常健康检查，包括系统巡检、命令执行和报告生成',
      nodes: dailyHealthCheckNodes,
      edges: dailyHealthCheckEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '告警处理',
      description: '处理系统告警，分析告警信息，检查日志并生成处理报告',
      nodes: alertHandlingNodes,
      edges: alertHandlingEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '故障诊断',
      description: '对系统故障进行全面诊断，分析症状、检查日志、执行命令并生成诊断报告',
      nodes: diagnosticNodes,
      edges: diagnosticEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '合规检查',
      description: '验证服务器配置是否符合安全基线和合规要求，生成合规检查报告',
      nodes: complianceNodes,
      edges: complianceEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '变更执行',
      description: '执行系统变更操作，验证操作结果，生成变更执行报告',
      nodes: changeNodes,
      edges: changeEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '日志分析',
      description: '分析系统和应用日志，识别错误模式和异常事件，生成分析报告',
      nodes: logAnalysisNodes,
      edges: logAnalysisEdges,
      is_template: 1
    }
  ];

  const insertWorkflow = db.prepare(`
    INSERT INTO workflows (id, name, description, nodes, edges, is_template)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  presetWorkflows.forEach(workflow => {
    insertWorkflow.run(workflow.id, workflow.name, workflow.description, workflow.nodes, workflow.edges, workflow.is_template);
  });

  logger.info(`✅ 成功创建 ${presetWorkflows.length} 个预设工作流`);
}

export function ensureHermesWorkflowTemplates(): void {
  const agents = db.prepare('SELECT id, name FROM agents').all() as Array<{ id: string; name: string }>;
  const agentMap = new Map(agents.map(agent => [agent.name, agent.id]));
  const existingWorkflows = db.prepare('SELECT name FROM workflows WHERE is_template = 1').all() as Array<{ name: string }>;
  const existingNames = new Set(existingWorkflows.map(workflow => workflow.name));

  const insertWorkflow = db.prepare(`
    INSERT INTO workflows (id, name, description, nodes, edges, agent_configs, is_template)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateWorkflow = db.prepare(`
    UPDATE workflows
    SET description = ?,
        nodes = ?,
        edges = ?,
        agent_configs = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE name = ? AND is_template = 1
  `);

  let createdCount = 0;
  let updatedCount = 0;
  HERMES_WORKFLOW_TEMPLATES.forEach(template => {
    const { nodes, edges } = buildLinearAgentWorkflow(template.nodes, agentMap);
    const agentConfigs = buildHermesWorkflowAgentConfig(template);

    if (existingNames.has(template.name)) {
      updateWorkflow.run(
        template.description,
        JSON.stringify(nodes),
        JSON.stringify(edges),
        JSON.stringify(agentConfigs),
        template.name
      );
      updatedCount += 1;
      return;
    }

    insertWorkflow.run(
      randomUUID(),
      template.name,
      template.description,
      JSON.stringify(nodes),
      JSON.stringify(edges),
      JSON.stringify(agentConfigs),
      1
    );
    createdCount += 1;
  });

  if (createdCount > 0) {
    logger.info(`✅ 成功创建 ${createdCount} 个 Hermes 增强版工作流模板`);
  }
  if (updatedCount > 0) {
    logger.info(`✅ 成功更新 ${updatedCount} 个 Hermes 增强版工作流模板`);
  }
}

function buildLinearAgentWorkflow(
  nodeSpecs: WorkflowAgentNodeSpec[],
  agentMap: Map<string, string>
) {
  const nodes = nodeSpecs.map((spec, index) => ({
    id: randomUUID(),
    type: 'agent',
    position: { x: 100 + index * 300, y: 100 },
    data: {
      label: spec.name,
      agentId: agentMap.get(spec.name) || null,
      avatar: spec.avatar,
      description: spec.description,
      allowFailure: spec.allowFailure || false,
      runbookPhase: spec.runbookPhase,
      evidenceRequired: spec.evidenceRequired || [],
      riskGate: spec.riskGate || 'read_only',
      approvalRequired: Boolean(spec.approvalRequired),
      verificationRequired: Boolean(spec.verificationRequired),
      recommendedSkillId: spec.recommendedSkillId,
      recommendedSkillIds: spec.recommendedSkillId ? [spec.recommendedSkillId] : [],
      outputKey: spec.outputKey
    }
  }));

  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: randomUUID(),
    source: node.id,
    target: nodes[index + 1].id
  }));

  return { nodes, edges };
}

function buildHermesWorkflowAgentConfig(template: WorkflowTemplateSpec) {
  return {
    hermesEnhanced: true,
    runbookDriven: true,
    teamType: template.teamType,
    collaborationMode: template.collaborationMode,
    runbookPattern: template.runbookPattern,
    safety: {
      evidenceFirst: true,
      approvalGate: template.nodes.some(node => node.approvalRequired),
      verificationRequired: template.nodes.some(node => node.verificationRequired),
      productionBoundary: 'Hermes proposes and records controlled plans; backend approval, workflow and tool policy remain the execution boundary.'
    },
    stages: template.nodes.map((node, index) => ({
      order: index + 1,
      agent: node.name,
      phase: node.runbookPhase,
      evidenceRequired: node.evidenceRequired || [],
      riskGate: node.riskGate || 'read_only',
      approvalRequired: Boolean(node.approvalRequired),
      verificationRequired: Boolean(node.verificationRequired),
      recommendedSkillId: node.recommendedSkillId || null,
      recommendedSkillIds: node.recommendedSkillId ? [node.recommendedSkillId] : [],
      outputKey: node.outputKey || null
    }))
  };
}
