import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const DEFAULT_TEAMS = [
  {
    id: 'team-alert-remediation',
    name: '告警诊断与修复团队',
    description: '面向告警处理闭环：诊断证据、修复编排、审批执行和复盘优化。',
    team_type: 'alert_remediation',
    collaboration_mode: 'pipeline',
    status: 'enabled'
  },
  {
    id: 'team-inspection-review',
    name: '巡检复盘团队',
    description: '面向服务器和系统巡检：并行收集状态，沉淀异常模式和优化建议。',
    team_type: 'inspection_review',
    collaboration_mode: 'parallel',
    status: 'enabled'
  },
  {
    id: 'team-change-risk-review',
    name: '变更风险审查团队',
    description: '面向上线、修复和策略调整：多角色讨论风险、收益、回滚和发布边界。',
    team_type: 'change_risk',
    collaboration_mode: 'debate',
    status: 'enabled'
  }
];

const DEFAULT_MEMBERS = [
  { team_id: 'team-alert-remediation', role: 'leader', display_name: 'Ops Leader', channel_type: null, worker_role: null, step_order: 0 },
  { team_id: 'team-alert-remediation', role: 'diagnose_worker', display_name: 'Diagnose Worker', channel_type: 'diagnose', worker_role: 'diagnose', step_order: 1 },
  { team_id: 'team-alert-remediation', role: 'remediate_worker', display_name: 'Remediate Worker', channel_type: 'remediate', worker_role: 'remediate', step_order: 2 },
  { team_id: 'team-alert-remediation', role: 'evolve_worker', display_name: 'Evolve Worker', channel_type: 'review', worker_role: 'evolve', step_order: 3 },

  { team_id: 'team-inspection-review', role: 'leader', display_name: 'Ops Leader', channel_type: null, worker_role: null, step_order: 0 },
  { team_id: 'team-inspection-review', role: 'diagnose_worker', display_name: 'Diagnose Worker', channel_type: 'diagnose', worker_role: 'diagnose', step_order: 1 },
  { team_id: 'team-inspection-review', role: 'evolve_worker', display_name: 'Evolve Worker', channel_type: 'review', worker_role: 'evolve', step_order: 2 },

  { team_id: 'team-change-risk-review', role: 'leader', display_name: 'Ops Leader', channel_type: null, worker_role: null, step_order: 0 },
  { team_id: 'team-change-risk-review', role: 'remediate_worker', display_name: 'Remediate Worker', channel_type: 'remediate', worker_role: 'remediate', step_order: 1 },
  { team_id: 'team-change-risk-review', role: 'evolve_worker', display_name: 'Evolve Worker', channel_type: 'review', worker_role: 'evolve', step_order: 2 }
];

const v019AddAgentTeams: Migration = {
  id: '20260613000019',
  version: 19,
  name: 'add_agent_teams',
  description: 'Add first-class Agent Team templates, members, runs, and run steps',

  up: async (db: any) => {
    logger.info('Creating Agent Team tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        team_type TEXT NOT NULL UNIQUE,
        collaboration_mode TEXT NOT NULL DEFAULT 'pipeline',
        status TEXT NOT NULL DEFAULT 'enabled',
        leader_agent_id TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (leader_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS agent_team_members (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        agent_id TEXT,
        channel_type TEXT,
        worker_role TEXT,
        step_order INTEGER NOT NULL DEFAULT 0,
        required INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id, role),
        FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS agent_team_runs (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        input TEXT NOT NULL,
        context TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        correlation_id TEXT,
        leader_plan TEXT,
        output TEXT,
        error TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS agent_team_run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        team_member_id TEXT,
        step_order INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL,
        agent_id TEXT,
        channel_id TEXT,
        worker_role TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        input TEXT,
        output TEXT,
        metadata TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (run_id) REFERENCES agent_team_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (team_member_id) REFERENCES agent_team_members(id) ON DELETE SET NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
        FOREIGN KEY (channel_id) REFERENCES hermes_channels(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_teams_status ON agent_teams(status);
      CREATE INDEX IF NOT EXISTS idx_agent_team_members_team ON agent_team_members(team_id, step_order);
      CREATE INDEX IF NOT EXISTS idx_agent_team_runs_team_time ON agent_team_runs(team_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_team_runs_status ON agent_team_runs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_team_runs_correlation ON agent_team_runs(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_agent_team_run_steps_run ON agent_team_run_steps(run_id, step_order);
    `);

    const insertTeam = db.prepare(`
      INSERT OR IGNORE INTO agent_teams (
        id, name, description, team_type, collaboration_mode, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    DEFAULT_TEAMS.forEach((team) => {
      insertTeam.run(team.id, team.name, team.description, team.team_type, team.collaboration_mode, team.status);
    });

    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO agent_team_members (
        id, team_id, role, display_name, channel_type, worker_role, step_order,
        required, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    DEFAULT_MEMBERS.forEach((member) => {
      insertMember.run(
        `${member.team_id}:${member.role}`,
        member.team_id,
        member.role,
        member.display_name,
        member.channel_type,
        member.worker_role,
        member.step_order
      );
    });

    logger.info('Agent Team tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing Agent Team tables...');
    db.exec(`
      DROP TABLE IF EXISTS agent_team_run_steps;
      DROP TABLE IF EXISTS agent_team_runs;
      DROP TABLE IF EXISTS agent_team_members;
      DROP TABLE IF EXISTS agent_teams;
    `);
    logger.info('Agent Team tables removed');
  }
};

export default v019AddAgentTeams;
