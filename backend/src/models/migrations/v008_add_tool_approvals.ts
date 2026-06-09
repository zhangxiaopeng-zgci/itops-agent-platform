import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v008AddToolApprovals: Migration = {
  id: '20260609000008',
  version: 8,
  name: 'add_tool_approvals',
  description: 'Add tool approval queue for controlled agent actions',

  up: async (db: any) => {
    logger.info('Creating tool approvals table...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_approvals (
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

      CREATE INDEX IF NOT EXISTS idx_tool_approvals_status ON tool_approvals(status);
      CREATE INDEX IF NOT EXISTS idx_tool_approvals_tool ON tool_approvals(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_approvals_requested_at ON tool_approvals(requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tool_approvals_requester ON tool_approvals(requester_user_id);
    `);

    logger.info('Tool approvals table created successfully');
  },

  down: async (db: any) => {
    logger.info('Dropping tool approvals table...');
    db.exec('DROP TABLE IF EXISTS tool_approvals;');
    logger.info('Tool approvals table dropped');
  }
};

export default v008AddToolApprovals;
