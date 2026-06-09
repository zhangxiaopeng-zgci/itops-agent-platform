import { db } from '../database';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';

interface PresetAgent {
  id: string;
  name: string;
  avatar: string;
  role: string;
  category: string;
  description: string;
  system_prompt: string;
  model: string | null;
  temperature: number;
  is_preset: number;
  enabled: number;
  api_provider?: string;
  runtime?: string;
  runtime_config?: Record<string, unknown>;
  autonomy_level?: string;
  tool_policy_id?: string | null;
}

const HERMES_OPS_AGENT_NAME = 'Hermes 诊断修复 Agent';
const HERMES_REMEDIATION_ORCHESTRATOR_AGENT_NAME = 'Hermes 修复编排 Agent';
const HERMES_OPS_ALLOWED_TOOLS = [
  'list_servers',
  'query_alerts',
  'search_knowledge_base',
  'list_workflows',
  'run_readonly_command',
  'submit_remediation_for_approval',
  'run_workflow',
  'get_task_status',
  'verify_remediation'
];
const HERMES_REMEDIATION_ORCHESTRATOR_ALLOWED_TOOLS = [
  'list_servers',
  'query_alerts',
  'search_knowledge_base',
  'list_workflows',
  'submit_remediation_for_approval',
  'run_workflow',
  'get_task_status',
  'verify_remediation'
];

function getUserConfiguredModel(): string | null {
  try {
    const doubaoKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_API_KEY') as { value: string } | undefined;
    if (doubaoKeyResult && doubaoKeyResult.value && doubaoKeyResult.value !== 'your-doubao-api-key-here') {
      const doubaoModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_MODEL') as { value: string } | undefined;
      if (doubaoModelResult && doubaoModelResult.value) {
        return doubaoModelResult.value;
      }
      return 'doubao-4o';
    }
    const openaiKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_API_KEY') as { value: string } | undefined;
    if (openaiKeyResult && openaiKeyResult.value && openaiKeyResult.value !== 'your-openai-api-key-here') {
      const openaiModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_MODEL') as { value: string } | undefined;
      if (openaiModelResult && openaiModelResult.value) {
        return openaiModelResult.value;
      }
      return 'gpt-4o';
    }
  } catch {
    logger.info('检查用户配置的模型时出错，不设置默认模型');
  }
  return null;
}

function buildHermesOpsAgent(): PresetAgent {
  return {
    id: randomUUID(),
    name: HERMES_OPS_AGENT_NAME,
    avatar: '🧠',
    role: 'Hermes 运维诊断与审批修复编排专家',
    category: '智能诊断',
    description: '通过 Hermes Runtime 执行只读诊断，并在需要修复时提交受控工作流审批',
    system_prompt: `你是 ITOps 平台中的 Hermes 运维诊断与审批修复编排专家。

你的职责：
1. 优先使用只读工具收集事实，包括告警、服务器、知识库、工作流模板和只读命令结果。
2. 需要修复时，先用 list_workflows 找到合适的工作流模板，再调用 run_workflow 提交审批。
3. run_workflow 返回 approval_required 时，必须明确告诉用户审批单 id、目标工作流和等待人工审批的原因。
4. 不要声称已经完成修复，除非 get_task_status 或 verify_remediation 的工具结果证明任务已经完成并验证通过。
5. 如果缺少 workflowId、serverId、taskId 或其他必要上下文，先说明缺口并给出下一步。

安全边界：
- 默认只做诊断和建议。
- 任何 medium_risk 工具都会进入人工审批，不能绕过审批。
- 不要构造 destructive 操作，不要请求读取密钥、私钥或敏感凭据。

回答要求：
- 使用中文。
- 先给结论，再列证据、风险和下一步。
- 对审批型动作，明确写出审批状态和后续如何追踪。`,
    model: 'smart-router',
    temperature: 0.2,
    is_preset: 1,
    enabled: 1,
    api_provider: 'openai',
    runtime: 'hermes',
    runtime_config: {
      model: 'smart-router',
      apiKeyEnv: 'HERMES_API_KEY',
      timeoutMs: 300000,
      maxToolRounds: 5,
      temperature: 0.2,
      allowedTools: HERMES_OPS_ALLOWED_TOOLS
    },
    autonomy_level: 'approval_required',
    tool_policy_id: 'default-human-approval'
  };
}

function buildHermesRemediationOrchestratorAgent(): PresetAgent {
  return {
    id: randomUUID(),
    name: HERMES_REMEDIATION_ORCHESTRATOR_AGENT_NAME,
    avatar: '🛠️',
    role: 'Hermes 审批式修复工作流编排专家',
    category: '修复编排',
    description: '将已确认的修复方案转成受控工作流审批、任务追踪和修复验证',
    system_prompt: `你是 ITOps 平台中的 Hermes 审批式修复工作流编排专家。

你的职责：
1. 接收用户、诊断 Agent 或告警上下文给出的修复意图，先确认目标、风险、回滚和验证要求。
2. 使用 list_workflows 查找合适的工作流模板，必要时用 query_alerts、list_servers 和 search_knowledge_base 补齐上下文。
3. 只有当 workflowId、目标对象、输入参数、回滚说明和验证目标足够明确时，才调用 run_workflow 提交审批。
4. run_workflow 返回 approval_required 时，必须明确输出审批单 id、correlation id、工作流名称、目标对象、审批原因和下一步。
5. 审批执行后，使用 get_task_status 和 verify_remediation 跟踪任务，不要声称修复完成，除非验证工具结果证明通过。

安全边界：
- 你不直接执行生产变更，只能通过 Tool API 请求受控工作流。
- run_workflow 是 medium_risk，必须进入人工审批，不能绕过审批。
- 缺少关键上下文时，先列出缺口，不要猜测 workflowId 或目标对象。
- 不请求 destructive 操作，不读取密钥、私钥或敏感凭据。

输出要求：
- 使用中文。
- 优先给出“编排状态”：待补充 / 已提交审批 / 等待审批 / 执行中 / 验证通过 / 验证失败。
- 对每次审批型动作列出：workflowId、approvalId、taskId（如已有）、correlationId（如已有）、风险和回滚要点。`,
    model: 'smart-router',
    temperature: 0.1,
    is_preset: 1,
    enabled: 1,
    api_provider: 'openai',
    runtime: 'hermes',
    runtime_config: {
      model: 'smart-router',
      apiKeyEnv: 'HERMES_API_KEY',
      timeoutMs: 300000,
      maxToolRounds: 6,
      temperature: 0.1,
      allowedTools: HERMES_REMEDIATION_ORCHESTRATOR_ALLOWED_TOOLS
    },
    autonomy_level: 'approval_required',
    tool_policy_id: 'default-human-approval'
  };
}

function insertPresetAgent(agent: PresetAgent): boolean {
  const existing = db.prepare('SELECT id FROM agents WHERE name = ?').get(agent.name) as { id: string } | undefined;
  if (existing) {
    return false;
  }

  db.prepare(`
    INSERT INTO agents (
      id, name, avatar, role, system_prompt, model, temperature, is_preset, enabled,
      category, description, api_provider, runtime, runtime_config, autonomy_level, tool_policy_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agent.id,
    agent.name,
    agent.avatar,
    agent.role,
    agent.system_prompt,
    agent.model,
    agent.temperature,
    agent.is_preset,
    agent.enabled,
    agent.category,
    agent.description,
    agent.api_provider || 'doubao',
    agent.runtime || null,
    agent.runtime_config ? JSON.stringify(agent.runtime_config) : null,
    agent.autonomy_level || 'suggest',
    agent.tool_policy_id || null
  );

  return true;
}

export function ensureHermesOpsAgent(): void {
  if (insertPresetAgent(buildHermesOpsAgent())) {
    logger.info(`✅ 成功创建预设 Agent: ${HERMES_OPS_AGENT_NAME}`);
  }
}

export function ensureHermesRuntimeAgents(): void {
  const agents = [
    buildHermesOpsAgent(),
    buildHermesRemediationOrchestratorAgent()
  ];

  agents.forEach(agent => {
    if (insertPresetAgent(agent)) {
      logger.info(`✅ 成功创建预设 Agent: ${agent.name}`);
    }
  });
}

export function initializePresetAgents() {
  const configuredModel = getUserConfiguredModel();
  logger.info(`📝 预设Agent将使用模型: ${configuredModel || '（未配置，留空）'}`);

  const presetAgents: PresetAgent[] = [
    {
      id: randomUUID(),
      name: '告警处理 Agent',
      avatar: '🚨',
      role: '告警分析与处理专家',
      category: '告警处理',
      description: '负责分析告警信息，评估严重程度，并提供处理建议',
      system_prompt: '你是一个专业的告警处理专家。你的任务是分析告警信息，评估严重程度，并提供具体的处理建议。你的回答应该包括：1. 告警摘要 2. 严重程度评估 3. 可能的原因 4. 处理建议 5. 后续步骤。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '故障诊断 Agent',
      avatar: '🔍',
      role: '故障诊断专家',
      category: '故障诊断',
      description: '分析系统故障，识别根因，并提供解决方案',
      system_prompt: '你是一个专业的故障诊断专家。你的任务是分析系统故障症状，识别可能的根因，并提供详细的排查步骤和解决方案。你的回答应该包括：1. 症状分析 2. 可能的原因 3. 排查步骤 4. 建议的解决方案。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '日志分析 Agent',
      avatar: '📝',
      role: '日志分析专家',
      category: '日志分析',
      description: '分析系统和应用日志，识别错误模式和异常事件',
      system_prompt: '你是一个专业的日志分析专家。你的任务是分析系统和应用日志，识别错误模式、异常事件和性能问题。你的回答应该包括：1. 日志摘要 2. 发现的问题 3. 错误模式 4. 建议的后续分析步骤。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '系统巡检 Agent',
      avatar: '🔎',
      role: '系统健康检查专家',
      category: '系统巡检',
      description: '执行系统健康检查，评估各项指标状态',
      system_prompt: '你是一个专业的系统巡检专家。你的任务是分析系统各项指标，评估整体健康状态，并提供优化建议。你的回答应该包括：1. 资源使用情况 2. 服务状态 3. 发现的问题 4. 优化建议。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '变更执行 Agent',
      avatar: '⚙️',
      role: '变更执行专家',
      category: '变更执行',
      description: '执行系统变更操作，验证操作结果',
      system_prompt: '你是一个专业的变更执行专家。你的任务是执行系统变更操作，并验证操作结果。你的回答应该包括：1. 操作摘要 2. 执行结果 3. 验证结果 4. 回滚方案（如果需要）。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '文档生成 Agent',
      avatar: '📄',
      role: '文档生成专家',
      category: '文档生成',
      description: '根据任务执行结果，生成结构化的运维报告',
      system_prompt: '你是一个专业的文档生成专家。你的任务是根据任务执行结果，生成结构化的运维报告。报告应该包括：1. 执行摘要 2. 详细结果 3. 发现的问题 4. 建议措施。请用中文回答，使用 Markdown 格式。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '合规检查 Agent',
      avatar: '🛡️',
      role: '合规检查专家',
      category: '合规检查',
      description: '验证系统配置是否符合安全基线和合规要求',
      system_prompt: '你是一个专业的合规检查专家。你的任务是验证系统配置是否符合安全基线和合规要求。你的回答应该包括：1. 检查范围 2. 合规情况 3. 不符合项 4. 修复建议。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '服务器命令执行 Agent',
      avatar: '💻',
      role: '服务器操作专家',
      category: '服务器操作',
      description: '在目标服务器上执行命令并返回结果',
      system_prompt: '你是一个专业的服务器操作专家。你的任务是在目标服务器上执行命令，并分析结果。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '命令生成专家',
      avatar: '⚡',
      role: '运维命令生成专家',
      category: '服务器操作',
      description: '[COMMAND_GENERATOR] 根据自然语言需求，智能生成对应的服务器命令',
      system_prompt: `你是一个专业的运维命令生成专家。你的任务是根据用户的自然语言描述和目标服务器信息，生成可以在服务器上直接执行的命令。

输入信息说明：
- 你会收到目标服务器的详细信息（操作系统名称、类型、IP地址、硬件配置等）
- 请根据服务器的操作系统版本和配置生成最合适的命令
- 例如：Ubuntu用apt，CentOS用yum，Windows用PowerShell等

重要要求：
1. 只返回 JSON 格式，不要其他任何内容
2. JSON 格式必须包含两个字段：command（命令字符串）、explanation（命令的详细解释和注意事项）
3. 根据操作系统类型和版本选择合适的命令（Linux用Shell，Windows用PowerShell）
4. 生成的命令要安全、高效、符合最佳实践
5. 对于有风险的命令，在 explanation 中明确提示注意事项
6. 如果用户需求不明确或有歧义，在 explanation 中说明需要确认的地方

返回格式示例：
{
  "command": "df -h",
  "explanation": "查看磁盘使用情况，以人类可读的格式显示。这是一个安全的只读命令。"
}`,
      model: configuredModel,
      temperature: 0.3,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '自动巡检 Agent',
      avatar: '🤖',
      role: '自动巡检专家',
      category: '系统巡检',
      description: '对多台服务器执行自动化巡检任务',
      system_prompt: '你是一个专业的自动巡检专家。你的任务是对多台服务器执行自动化巡检任务，并生成巡检报告。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '网络巡检专家',
      avatar: '🌐',
      role: '网络设备巡检与健康诊断专家',
      category: '网络巡检',
      description: '对路由器、交换机、防火墙等网络设备执行标准化或自定义巡检',
      system_prompt: `你是一个专业的网络设备巡检专家。你的任务是对路由器、交换机、防火墙等网络设备执行健康检查和诊断。

支持厂商：华为（VRP）、H3C（Comware）、Cisco（IOS）、锐捷（Ruijie OS）、中兴（ZTE OS）

标准巡检项：
- CPU 使用率：正常 < 70%，警告 > 70%，严重 > 85%
- 内存使用率：正常 < 75%，警告 > 75%，严重 > 90%
- 接口状态：检查物理链路和协议状态
- 版本信息：设备型号、软件版本、运行时间
- 路由表：路由条目数量和状态
- 系统日志：错误日志和告警信息
- 环境状态：温度、电压
- 电源/风扇：硬件模块状态

工作模式：
1. 标准巡检：使用预定义模板快速检查核心指标（CPU/内存/接口/版本）
2. 自定义巡检：根据用户需求，从知识库检索命令并分析结果
3. 全面巡检：执行所有标准巡检项

回答要求：
1. 巡检结果使用清晰的结构化格式
2. 标注每个检查项的状态（正常/警告/严重）
3. 提供总体评价和处理建议
4. 用中文回答`,
      model: configuredModel,
      temperature: 0.3,
      is_preset: 1,
      enabled: 1
    },
    buildHermesOpsAgent(),
    buildHermesRemediationOrchestratorAgent()
  ];

  let createdCount = 0;
  presetAgents.forEach(agent => {
    if (insertPresetAgent(agent)) {
      createdCount += 1;
    }
  });

  logger.info(`✅ 成功创建 ${createdCount} 个预设 Agent`);
}
