import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v013AddMcpServerRegistry: Migration = {
  id: '20260610000013',
  version: 13,
  name: 'add_mcp_server_registry',
  description: 'Add MCP server registry and Hermes channel MCP bindings',

  up: async (db: any) => {
    logger.info('Creating MCP server registry tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        transport TEXT NOT NULL DEFAULT 'http',
        command TEXT,
        args TEXT,
        url TEXT,
        secret_ref TEXT,
        timeout_ms INTEGER NOT NULL DEFAULT 30000,
        enabled INTEGER NOT NULL DEFAULT 1,
        health_status TEXT NOT NULL DEFAULT 'unknown',
        last_checked_at DATETIME,
        last_error TEXT,
        capabilities_summary TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hermes_channel_mcp_servers (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        mcp_server_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        tool_import_mode TEXT NOT NULL DEFAULT 'disabled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, mcp_server_id),
        FOREIGN KEY (channel_id) REFERENCES hermes_channels(id) ON DELETE CASCADE,
        FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_servers_transport ON mcp_servers(transport);
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_health ON mcp_servers(health_status);
      CREATE INDEX IF NOT EXISTS idx_hermes_channel_mcp_servers_channel_id ON hermes_channel_mcp_servers(channel_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_channel_mcp_servers_server_id ON hermes_channel_mcp_servers(mcp_server_id);
    `);

    logger.info('MCP server registry tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing MCP server registry tables...');
    db.exec(`
      DROP TABLE IF EXISTS hermes_channel_mcp_servers;
      DROP TABLE IF EXISTS mcp_servers;
    `);
    logger.info('MCP server registry tables removed');
  }
};

export default v013AddMcpServerRegistry;
