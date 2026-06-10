import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const DIAGNOSE_TOOLS = [
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

const REMEDIATE_TOOLS = [
  'list_servers',
  'query_alerts',
  'search_knowledge_base',
  'list_workflows',
  'submit_remediation_for_approval',
  'run_workflow',
  'get_task_status',
  'verify_remediation'
];

const REVIEW_TOOLS = [
  'list_agent_executions',
  'list_tool_approvals',
  'get_correlation_trace',
  'get_task_status',
  'verify_remediation',
  'list_workflows',
  'search_knowledge_base'
];

const CHANNELS = [
  {
    id: 'hermes-channel-diagnose',
    name: 'Hermes 诊断通道',
    description: '用于告警理解、上下文收集、只读诊断和受控修复建议',
    type: 'diagnose',
    maxToolRounds: 5,
    temperature: 0.2,
    agentName: 'Hermes 诊断修复 Agent',
    tools: DIAGNOSE_TOOLS
  },
  {
    id: 'hermes-channel-remediate',
    name: 'Hermes 修复编排通道',
    description: '用于审批式修复工作流编排、任务追踪和验证',
    type: 'remediate',
    maxToolRounds: 6,
    temperature: 0.1,
    agentName: 'Hermes 修复编排 Agent',
    tools: REMEDIATE_TOOLS
  },
  {
    id: 'hermes-channel-review',
    name: 'Hermes 复盘通道',
    description: '用于复盘 trace、审批、任务、审计并输出改进建议',
    type: 'review',
    maxToolRounds: 6,
    temperature: 0.15,
    agentName: 'Hermes 复盘进化 Agent',
    tools: REVIEW_TOOLS
  }
];

const v011AddHermesChannels: Migration = {
  id: '20260610000011',
  version: 11,
  name: 'add_hermes_channels',
  description: 'Add Hermes channel registry and default channel bindings',

  up: async (db: any) => {
    logger.info('Creating Hermes channels tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS hermes_channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'custom',
        runtime_type TEXT NOT NULL DEFAULT 'external_openai_compatible',
        base_url TEXT,
        model TEXT NOT NULL DEFAULT 'smart-router',
        api_key_ref TEXT NOT NULL DEFAULT 'HERMES_API_KEY',
        timeout_ms INTEGER NOT NULL DEFAULT 300000,
        max_tool_rounds INTEGER NOT NULL DEFAULT 3,
        temperature REAL,
        policy_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        health_status TEXT NOT NULL DEFAULT 'unknown',
        last_checked_at DATETIME,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hermes_channel_tools (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        risk_level_override TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, tool_name),
        FOREIGN KEY (channel_id) REFERENCES hermes_channels(id) ON DELETE CASCADE
      );

      ALTER TABLE agents ADD COLUMN channel_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_hermes_channels_type ON hermes_channels(type);
      CREATE INDEX IF NOT EXISTS idx_hermes_channels_enabled ON hermes_channels(enabled);
      CREATE INDEX IF NOT EXISTS idx_hermes_channel_tools_channel_id ON hermes_channel_tools(channel_id);
      CREATE INDEX IF NOT EXISTS idx_agents_channel_id ON agents(channel_id);
    `);

    const insertChannel = db.prepare(`
      INSERT OR IGNORE INTO hermes_channels (
        id, name, description, type, runtime_type, base_url, model, api_key_ref,
        timeout_ms, max_tool_rounds, temperature, policy_id, enabled
      )
      VALUES (?, ?, ?, ?, 'external_openai_compatible', NULL, 'smart-router', 'HERMES_API_KEY', 300000, ?, ?, 'default-human-approval', 1)
    `);

    const insertTool = db.prepare(`
      INSERT OR IGNORE INTO hermes_channel_tools (id, channel_id, tool_name, enabled)
      VALUES (?, ?, ?, 1)
    `);

    const bindAgent = db.prepare(`
      UPDATE agents
      SET channel_id = ?
      WHERE name = ? AND runtime = 'hermes'
    `);

    CHANNELS.forEach((channel) => {
      insertChannel.run(
        channel.id,
        channel.name,
        channel.description,
        channel.type,
        channel.maxToolRounds,
        channel.temperature
      );

      channel.tools.forEach((toolName) => {
        insertTool.run(`${channel.id}:${toolName}`, channel.id, toolName);
      });

      bindAgent.run(channel.id, channel.agentName);
    });

    logger.info('Hermes channels tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing Hermes channels tables...');

    db.exec(`
      CREATE TABLE agents_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        role TEXT,
        system_prompt TEXT,
        model TEXT DEFAULT 'doubao-4o',
        temperature REAL DEFAULT 0.7,
        enabled INTEGER DEFAULT 1,
        is_preset INTEGER DEFAULT 0,
        category TEXT,
        tags TEXT,
        description TEXT,
        usage_count INTEGER DEFAULT 0,
        last_used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        api_provider TEXT DEFAULT 'doubao',
        primary_model_id TEXT,
        fallback_model_id TEXT,
        runtime TEXT,
        runtime_config TEXT,
        autonomy_level TEXT DEFAULT 'suggest',
        tool_policy_id TEXT
      );

      INSERT INTO agents_new (
        id, name, avatar, role, system_prompt, model, temperature, enabled,
        is_preset, category, tags, description, usage_count, last_used_at,
        created_at, updated_at, api_provider, primary_model_id, fallback_model_id,
        runtime, runtime_config, autonomy_level, tool_policy_id
      )
      SELECT
        id, name, avatar, role, system_prompt, model, temperature, enabled,
        is_preset, category, tags, description, usage_count, last_used_at,
        created_at, updated_at, api_provider, primary_model_id, fallback_model_id,
        runtime, runtime_config, autonomy_level, tool_policy_id
      FROM agents;

      DROP TABLE agents;
      ALTER TABLE agents_new RENAME TO agents;

      DROP TABLE IF EXISTS hermes_channel_tools;
      DROP TABLE IF EXISTS hermes_channels;

      CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
      CREATE INDEX IF NOT EXISTS idx_agents_is_preset ON agents(is_preset);
      CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);
      CREATE INDEX IF NOT EXISTS idx_agents_usage ON agents(usage_count);
      CREATE INDEX IF NOT EXISTS idx_agents_primary_model ON agents(primary_model_id);
      CREATE INDEX IF NOT EXISTS idx_agents_fallback_model ON agents(fallback_model_id);
      CREATE INDEX IF NOT EXISTS idx_agents_runtime ON agents(runtime);
      CREATE INDEX IF NOT EXISTS idx_agents_autonomy_level ON agents(autonomy_level);
      CREATE INDEX IF NOT EXISTS idx_agents_tool_policy ON agents(tool_policy_id);
    `);

    logger.info('Hermes channels tables removed');
  }
};

export default v011AddHermesChannels;
