import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v007AddAgentRuntimeFields: Migration = {
  id: '20260609000007',
  version: 7,
  name: 'add_agent_runtime_fields',
  description: 'Add runtime metadata fields to agents table',

  up: async (db: any) => {
    logger.info('Adding runtime metadata fields to agents table...');

    db.exec(`
      ALTER TABLE agents ADD COLUMN runtime TEXT;
      ALTER TABLE agents ADD COLUMN runtime_config TEXT;
      ALTER TABLE agents ADD COLUMN autonomy_level TEXT DEFAULT 'suggest';
      ALTER TABLE agents ADD COLUMN tool_policy_id TEXT;
    `);

    db.exec(`
      UPDATE agents
      SET runtime = 'builtin'
      WHERE name LIKE '%服务器命令执行%'
         OR name LIKE '%系统巡检%'
         OR name LIKE '%自动巡检%';

      UPDATE agents
      SET runtime = 'llm'
      WHERE runtime IS NULL;

      CREATE INDEX IF NOT EXISTS idx_agents_runtime ON agents(runtime);
      CREATE INDEX IF NOT EXISTS idx_agents_autonomy_level ON agents(autonomy_level);
      CREATE INDEX IF NOT EXISTS idx_agents_tool_policy ON agents(tool_policy_id);
    `);

    logger.info('Agent runtime metadata fields added successfully');
  },

  down: async (db: any) => {
    logger.info('Removing runtime metadata fields from agents table...');

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
        fallback_model_id TEXT
      );

      INSERT INTO agents_new (
        id, name, avatar, role, system_prompt, model, temperature, enabled,
        is_preset, category, tags, description, usage_count, last_used_at,
        created_at, updated_at, api_provider, primary_model_id, fallback_model_id
      )
      SELECT
        id, name, avatar, role, system_prompt, model, temperature, enabled,
        is_preset, category, tags, description, usage_count, last_used_at,
        created_at, updated_at, api_provider, primary_model_id, fallback_model_id
      FROM agents;

      DROP TABLE agents;
      ALTER TABLE agents_new RENAME TO agents;

      CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
      CREATE INDEX IF NOT EXISTS idx_agents_is_preset ON agents(is_preset);
      CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);
      CREATE INDEX IF NOT EXISTS idx_agents_usage ON agents(usage_count);
      CREATE INDEX IF NOT EXISTS idx_agents_primary_model ON agents(primary_model_id);
      CREATE INDEX IF NOT EXISTS idx_agents_fallback_model ON agents(fallback_model_id);
    `);

    logger.info('Agent runtime metadata fields removed successfully');
  }
};

export default v007AddAgentRuntimeFields;
