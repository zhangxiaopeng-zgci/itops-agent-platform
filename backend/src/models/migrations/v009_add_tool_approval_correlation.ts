import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v009AddToolApprovalCorrelation: Migration = {
  id: '20260609000009',
  version: 9,
  name: 'add_tool_approval_correlation',
  description: 'Add correlation id to tool approvals for agent runtime observability',

  up: async (db: any) => {
    logger.info('Adding correlation id to tool approvals...');

    const columns = db.prepare('PRAGMA table_info(tool_approvals)').all() as Array<{ name: string }>;
    if (!columns.some(column => column.name === 'correlation_id')) {
      db.exec('ALTER TABLE tool_approvals ADD COLUMN correlation_id TEXT;');
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tool_approvals_correlation_id ON tool_approvals(correlation_id);
    `);

    logger.info('Tool approval correlation id added successfully');
  },

  down: async (db: any) => {
    logger.info('Removing correlation id from tool approvals...');

    db.exec(`
      DROP INDEX IF EXISTS idx_tool_approvals_correlation_id;
    `);

    const columns = db.prepare('PRAGMA table_info(tool_approvals)').all() as Array<{ name: string }>;
    if (columns.some(column => column.name === 'correlation_id')) {
      db.exec(`
        CREATE TABLE tool_approvals_without_correlation (
          id TEXT PRIMARY KEY,
          tool_name TEXT NOT NULL,
          input TEXT NOT NULL,
          requester_user_id TEXT,
          requester_role TEXT,
          source TEXT DEFAULT 'api',
          risk_level TEXT NOT NULL,
          reason TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          reviewed_by TEXT,
          reviewed_at DATETIME,
          review_comment TEXT,
          execution_result TEXT,
          execution_audit_id TEXT,
          ip_address TEXT
        );

        INSERT INTO tool_approvals_without_correlation (
          id, tool_name, input, requester_user_id, requester_role, source,
          risk_level, reason, status, requested_at, reviewed_by, reviewed_at,
          review_comment, execution_result, execution_audit_id, ip_address
        )
        SELECT
          id, tool_name, input, requester_user_id, requester_role, source,
          risk_level, reason, status, requested_at, reviewed_by, reviewed_at,
          review_comment, execution_result, execution_audit_id, ip_address
        FROM tool_approvals;

        DROP TABLE tool_approvals;
        ALTER TABLE tool_approvals_without_correlation RENAME TO tool_approvals;

        CREATE INDEX IF NOT EXISTS idx_tool_approvals_status ON tool_approvals(status);
        CREATE INDEX IF NOT EXISTS idx_tool_approvals_tool ON tool_approvals(tool_name);
        CREATE INDEX IF NOT EXISTS idx_tool_approvals_requested_at ON tool_approvals(requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tool_approvals_requester ON tool_approvals(requester_user_id);
      `);
    }

    logger.info('Tool approval correlation id removed');
  }
};

export default v009AddToolApprovalCorrelation;
