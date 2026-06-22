import { MigrationManager, Migration } from './migrationFramework';
import v001InitialSchema from './v001_initial_schema';
import v002AddApiProvider from './v002_add_api_provider';
import v003AddAIModelsTable from './v003_add_ai_models';
import v004AddAgentModelFields from './v004_add_agent_model_fields';
import v005SSHKeyPasswordSupport from './v005_ssh_key_password_support';
import v006NetworkDeviceCredentials from './v006_network_device_credentials';
import v007AddAgentRuntimeFields from './v007_add_agent_runtime_fields';
import v008AddToolApprovals from './v008_add_tool_approvals';
import v009AddToolApprovalCorrelation from './v009_add_tool_approval_correlation';
import v010AddHermesSessions from './v010_add_hermes_sessions';
import v011AddHermesChannels from './v011_add_hermes_channels';
import v012AddSkillRegistry from './v012_add_skill_registry';
import v013AddMcpServerRegistry from './v013_add_mcp_server_registry';
import v014AddHermesWorkerObservability from './v014_add_hermes_worker_observability';
import v015AddEvolutionProposals from './v015_add_evolution_proposals';
import v016AddEvolutionProposalEvaluations from './v016_add_evolution_proposal_evaluations';
import v017AddEvolutionReleaseVersions from './v017_add_evolution_release_versions';
import v018AddEvolutionContinuousTasks from './v018_add_evolution_continuous_tasks';
import v019AddAgentTeams from './v019_add_agent_teams';
import v020AddSkillOperationalSemantics from './v020_add_skill_operational_semantics';
import v021AddEvolutionFeedbackClusters from './v021_add_evolution_feedback_clusters';
import v022AddEvolutionProposalEnrichmentTask from './v022_add_evolution_proposal_enrichment_task';
import v023AddBackupRestoreDrills from './v023_add_backup_restore_drills';
import v024AddContainerRebuildDrills from './v024_add_container_rebuild_drills';
import v025AddKubernetesAssets from './v025_add_kubernetes_assets';
import v026AddHermesDashboardBridge from './v026_add_hermes_dashboard_bridge';
import v027AddHermesDelegationPolicy from './v027_add_hermes_delegation_policy';
import v028AddHermesSessionSummariesAndFeedback from './v028_add_hermes_session_summaries_and_feedback';

export const ALL_MIGRATIONS: Migration[] = [
  v001InitialSchema,
  v002AddApiProvider,
  v003AddAIModelsTable,
  v004AddAgentModelFields,
  v005SSHKeyPasswordSupport,
  v006NetworkDeviceCredentials,
  v007AddAgentRuntimeFields,
  v008AddToolApprovals,
  v009AddToolApprovalCorrelation,
  v010AddHermesSessions,
  v011AddHermesChannels,
  v012AddSkillRegistry,
  v013AddMcpServerRegistry,
  v014AddHermesWorkerObservability,
  v015AddEvolutionProposals,
  v016AddEvolutionProposalEvaluations,
  v017AddEvolutionReleaseVersions,
  v018AddEvolutionContinuousTasks,
  v019AddAgentTeams,
  v020AddSkillOperationalSemantics,
  v021AddEvolutionFeedbackClusters,
  v022AddEvolutionProposalEnrichmentTask,
  v023AddBackupRestoreDrills,
  v024AddContainerRebuildDrills,
  v025AddKubernetesAssets,
  v026AddHermesDashboardBridge,
  v027AddHermesDelegationPolicy,
  v028AddHermesSessionSummariesAndFeedback,
];

export function createMigrationManager(db: any): MigrationManager {
  const manager = new MigrationManager(db);
  manager.registerBatch(ALL_MIGRATIONS);
  return manager;
}

export { MigrationManager } from './migrationFramework';
export type { Migration, MigrationRecord, MigrationResult } from './migrationFramework';
