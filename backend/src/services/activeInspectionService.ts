import { createHash, randomUUID } from 'crypto';
import db from '../models/database';
import { logger } from '../utils/logger';
import {
  OperationCaseRecord,
  addOperationCaseEvent,
  createOperationCase,
  getOperationCaseByCorrelation
} from './operationCaseService';

type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
type FindingDomain = 'host' | 'kubernetes' | 'network' | 'alert';

export interface ActiveInspectionFinding {
  id: string;
  fingerprint: string;
  domain: FindingDomain;
  severity: FindingSeverity;
  title: string;
  description: string;
  assetId?: string | null;
  assetType?: string | null;
  assetName?: string | null;
  alertId?: string | null;
  evidence: Record<string, unknown>;
  recommendedAction: string;
  caseId?: string | null;
  alertRecordId?: string | null;
  status: 'detected' | 'case_created' | 'case_updated' | 'case_exists';
}

export interface ActiveInspectionRunResult {
  generatedAt: string;
  mode: 'preview' | 'active';
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    casesCreated: number;
    casesUpdated: number;
    alertsCreated: number;
  };
  findings: ActiveInspectionFinding[];
  flow: Array<{
    key: string;
    label: string;
    status: 'done' | 'attention' | 'idle';
    count: number;
  }>;
}

interface RunOptions {
  createCases?: boolean;
  createdBy?: string | null;
  source?: string;
}

const AUTO_CASE_STATUSES_TO_REUSE = new Set([
  'diagnosing',
  'diagnosis_ready',
  'approval_pending',
  'executing',
  'verifying',
  'reviewing',
  'evolving'
]);

export class ActiveInspectionService {
  runActiveInspection(options: RunOptions = {}): ActiveInspectionRunResult {
    const findings = this.evaluateFindings();
    this.attachExistingCases(findings);
    let casesCreated = 0;
    let casesUpdated = 0;
    let alertsCreated = 0;

    if (options.createCases) {
      for (const finding of findings) {
        if (!this.shouldOpenCase(finding)) {
          continue;
        }

        const alertResult = this.ensureAlert(finding);
        finding.alertRecordId = alertResult.alertId;
        if (alertResult.created) alertsCreated++;

        const caseResult = this.ensureCase(finding, {
          createdBy: options.createdBy || 'system',
          source: options.source || 'active_inspection'
        });
        finding.caseId = caseResult.caseId;
        finding.status = caseResult.status;
        if (caseResult.status === 'case_created') casesCreated++;
        if (caseResult.status === 'case_updated') casesUpdated++;
      }
    }

    const result = this.buildResult(findings, {
      mode: options.createCases ? 'active' : 'preview',
      casesCreated,
      casesUpdated,
      alertsCreated
    });

    if (options.createCases && findings.length > 0) {
      logger.info('Active inspection completed', {
        total: result.summary.total,
        casesCreated,
        casesUpdated,
        alertsCreated
      });
    }

    return result;
  }

  private evaluateFindings(): ActiveInspectionFinding[] {
    const findings: ActiveInspectionFinding[] = [
      ...this.evaluateHostFindings(),
      ...this.evaluateKubernetesFindings(),
      ...this.evaluateNetworkFindings(),
      ...this.evaluateOpenAlertFindings()
    ];

    return findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }

  private evaluateHostFindings(): ActiveInspectionFinding[] {
    const rows = db.prepare(`
      WITH latest AS (
        SELECT sm.*
        FROM server_metrics sm
        JOIN (
          SELECT server_id, MAX(collected_at) as collected_at
          FROM server_metrics
          GROUP BY server_id
        ) lm ON lm.server_id = sm.server_id AND lm.collected_at = sm.collected_at
      )
      SELECT
        s.id,
        s.name,
        s.hostname,
        s.enabled,
        s.last_connected,
        latest.cpu_usage,
        latest.memory_usage,
        latest.disk_usage,
        latest.load_1min,
        latest.collected_at
      FROM servers s
      LEFT JOIN latest ON latest.server_id = s.id
      WHERE s.enabled = 1
    `).all() as Array<Record<string, unknown>>;

    const findings: ActiveInspectionFinding[] = [];
    for (const row of rows) {
      const serverId = String(row.id);
      const serverName = String(row.name || row.hostname || serverId);
      const checks = [
        { key: 'cpu', label: 'CPU', value: numberOrNull(row.cpu_usage), high: 85, critical: 95 },
        { key: 'memory', label: '内存', value: numberOrNull(row.memory_usage), high: 90, critical: 95 },
        { key: 'disk', label: '磁盘', value: numberOrNull(row.disk_usage), high: 90, critical: 95 }
      ];

      for (const check of checks) {
        if (check.value === null || check.value < check.high) continue;
        const severity: FindingSeverity = check.value >= check.critical ? 'critical' : 'high';
        findings.push(this.createFinding({
          domain: 'host',
          severity,
          title: `${serverName} ${check.label} 使用率异常`,
          description: `${check.label} 当前 ${check.value.toFixed(1)}%，超过 ${check.high}% 巡检阈值。`,
          assetId: serverId,
          assetType: 'server',
          assetName: serverName,
          evidence: {
            metric: check.key,
            value: check.value,
            highThreshold: check.high,
            criticalThreshold: check.critical,
            collectedAt: row.collected_at || null
          },
          recommendedAction: '进入诊断中心，让 Hermes 汇总主机指标、近期命令和拓扑影响；高风险修复进入执行中心审批。'
        }));
      }

      if (!row.collected_at) {
        findings.push(this.createFinding({
          domain: 'host',
          severity: 'medium',
          title: `${serverName} 缺少主机指标`,
          description: '启用主机尚未采集到可用指标，主动巡检无法判断资源水位。',
          assetId: serverId,
          assetType: 'server',
          assetName: serverName,
          evidence: {
            lastConnected: row.last_connected || null,
            collectedAt: null
          },
          recommendedAction: '检查主机连接、凭证和指标采集任务，再重新运行主动巡检。'
        }));
      }
    }

    return findings;
  }

  private evaluateKubernetesFindings(): ActiveInspectionFinding[] {
    const clusters = db.prepare(`
      SELECT
        kc.id,
        kc.name,
        kc.environment,
        kc.enabled,
        kc.status,
        kc.last_sync_at,
        kc.last_error,
        (SELECT COUNT(*) FROM kubernetes_nodes kn WHERE kn.cluster_id = kc.id) as node_count,
        (SELECT COUNT(*) FROM kubernetes_nodes kn WHERE kn.cluster_id = kc.id AND kn.server_id IS NOT NULL) as bound_nodes,
        (SELECT COUNT(*) FROM kubernetes_pods kp WHERE kp.cluster_id = kc.id AND (lower(kp.phase) != 'running' OR kp.ready = 0)) as not_ready_pods,
        (SELECT COUNT(*) FROM kubernetes_workloads kw WHERE kw.cluster_id = kc.id AND kw.ready_replicas IS NOT NULL AND kw.replicas IS NOT NULL AND kw.ready_replicas < kw.replicas) as degraded_workloads,
        (SELECT COUNT(*) FROM kubernetes_events ke WHERE ke.cluster_id = kc.id AND lower(ke.type) = 'warning' AND (ke.last_seen_at IS NULL OR ke.last_seen_at >= datetime('now', '-24 hours'))) as warning_events
      FROM kubernetes_clusters kc
      WHERE kc.enabled = 1
    `).all() as Array<Record<string, unknown>>;

    const findings: ActiveInspectionFinding[] = [];
    for (const cluster of clusters) {
      const clusterId = String(cluster.id);
      const clusterName = String(cluster.name || clusterId);
      const nodeCount = Number(cluster.node_count || 0);
      const boundNodes = Number(cluster.bound_nodes || 0);
      const unboundNodes = Math.max(nodeCount - boundNodes, 0);
      const notReadyPods = Number(cluster.not_ready_pods || 0);
      const degradedWorkloads = Number(cluster.degraded_workloads || 0);
      const warningEvents = Number(cluster.warning_events || 0);

      if (cluster.last_error) {
        findings.push(this.createFinding({
          domain: 'kubernetes',
          severity: 'high',
          title: `${clusterName} 同步失败`,
          description: `Kubernetes 集群最近同步失败：${String(cluster.last_error)}`,
          assetId: clusterId,
          assetType: 'kubernetes_cluster',
          assetName: clusterName,
          evidence: { lastSyncAt: cluster.last_sync_at || null, lastError: cluster.last_error },
          recommendedAction: '检查 Kubernetes 凭证和 API Server 可达性，恢复同步后再由 Hermes 诊断集群风险。'
        }));
      }

      if (!cluster.last_sync_at) {
        findings.push(this.createFinding({
          domain: 'kubernetes',
          severity: 'medium',
          title: `${clusterName} 尚未同步资产`,
          description: '集群已登记但还没有资产快照，无法纳入拓扑和 Case 上下文。',
          assetId: clusterId,
          assetType: 'kubernetes_cluster',
          assetName: clusterName,
          evidence: { nodeCount, lastSyncAt: null },
          recommendedAction: '进入资源与连接中心同步 Kubernetes 资产，自动关联背后主机。'
        }));
      }

      if (notReadyPods > 0 || degradedWorkloads > 0) {
        findings.push(this.createFinding({
          domain: 'kubernetes',
          severity: notReadyPods >= 5 || degradedWorkloads >= 3 ? 'high' : 'medium',
          title: `${clusterName} 存在异常工作负载`,
          description: `发现 ${notReadyPods} 个异常 Pod，${degradedWorkloads} 个副本未就绪工作负载。`,
          assetId: clusterId,
          assetType: 'kubernetes_cluster',
          assetName: clusterName,
          evidence: { notReadyPods, degradedWorkloads, warningEvents },
          recommendedAction: '从诊断中心选择该集群，Hermes 读取 Pod、事件和背后主机关联后给出处置建议。'
        }));
      }

      if (unboundNodes > 0) {
        findings.push(this.createFinding({
          domain: 'kubernetes',
          severity: 'medium',
          title: `${clusterName} 有节点未关联主机`,
          description: `${unboundNodes} 个 Kubernetes Node 尚未绑定平台主机，影响拓扑和根因定位准确性。`,
          assetId: clusterId,
          assetType: 'kubernetes_cluster',
          assetName: clusterName,
          evidence: { nodeCount, boundNodes, unboundNodes },
          recommendedAction: '运行节点背后主机自动发现，必要时手动指定关联主机。'
        }));
      }
    }

    return findings;
  }

  private evaluateNetworkFindings(): ActiveInspectionFinding[] {
    const devices = db.prepare(`
      SELECT id, name, ip_address, vendor, status, last_inspection_at, last_inspection_result
      FROM network_devices
    `).all() as Array<Record<string, unknown>>;

    const findings: ActiveInspectionFinding[] = [];
    for (const device of devices) {
      const status = String(device.status || 'unknown').toLowerCase();
      const deviceId = String(device.id);
      const deviceName = String(device.name || device.ip_address || deviceId);

      if (['offline', 'down', 'unreachable'].includes(status)) {
        findings.push(this.createFinding({
          domain: 'network',
          severity: 'high',
          title: `${deviceName} 网络设备离线`,
          description: `设备状态为 ${status}，可能影响链路可用性。`,
          assetId: deviceId,
          assetType: 'network_device',
          assetName: deviceName,
          evidence: {
            status,
            ipAddress: device.ip_address,
            vendor: device.vendor,
            lastInspectionAt: device.last_inspection_at || null,
            lastInspectionResult: device.last_inspection_result || null
          },
          recommendedAction: '执行网络设备巡检，必要时创建 Case 并纳入拓扑影响分析。'
        }));
      }

      if (['warning', 'degraded', 'alert'].includes(status)) {
        findings.push(this.createFinding({
          domain: 'network',
          severity: 'medium',
          title: `${deviceName} 网络设备状态异常`,
          description: `设备状态为 ${status}，需要复核最近巡检结果。`,
          assetId: deviceId,
          assetType: 'network_device',
          assetName: deviceName,
          evidence: {
            status,
            ipAddress: device.ip_address,
            vendor: device.vendor,
            lastInspectionAt: device.last_inspection_at || null,
            lastInspectionResult: device.last_inspection_result || null
          },
          recommendedAction: '查看巡检历史并进入诊断中心，确认是否影响上层业务。'
        }));
      }
    }
    return findings;
  }

  private evaluateOpenAlertFindings(): ActiveInspectionFinding[] {
    const alerts = db.prepare(`
      SELECT id, source, severity, title, content, metadata, created_at
      FROM alerts
      WHERE severity IN ('critical', 'high')
        AND status IN ('new', 'active', 'open', 'confirmed', 'in_progress')
      ORDER BY created_at DESC
      LIMIT 20
    `).all() as Array<Record<string, unknown>>;

    return alerts.map((alert) => this.createFinding({
      domain: 'alert',
      severity: alert.severity === 'critical' ? 'critical' : 'high',
      title: `高风险告警待闭环：${String(alert.title || alert.id)}`,
      description: String(alert.content || '发现高风险告警，需要自动纳入 Case 闭环。'),
      alertId: String(alert.id),
      assetType: 'alert',
      assetName: String(alert.title || alert.id),
      evidence: {
        source: alert.source,
        severity: alert.severity,
        createdAt: alert.created_at,
        metadata: parseJsonObject(alert.metadata)
      },
      recommendedAction: '自动创建或关联 Case，并让 Hermes 判断影响、证据和下一步处置。'
    }));
  }

  private ensureAlert(finding: ActiveInspectionFinding): { alertId: string | null; created: boolean } {
    if (finding.alertId) {
      return { alertId: finding.alertId, created: false };
    }

    const fingerprint = `active-inspection:${finding.fingerprint}`;
    const existing = db.prepare('SELECT id FROM alerts WHERE alert_fingerprint = ?').get(fingerprint) as { id: string } | undefined;
    if (existing) {
      return { alertId: existing.id, created: false };
    }

    const id = randomUUID();
    try {
      db.prepare(`
        INSERT INTO alerts (id, source, severity, title, content, metadata, alert_fingerprint, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
      `).run(
        id,
        'active_inspection',
        normalizeAlertSeverity(finding.severity),
        finding.title,
        finding.description,
        JSON.stringify({
          findingId: finding.id,
          fingerprint: finding.fingerprint,
          domain: finding.domain,
          assetId: finding.assetId || null,
          assetType: finding.assetType || null,
          evidence: finding.evidence
        }),
        fingerprint
      );
      return { alertId: id, created: true };
    } catch (error) {
      const duplicate = db.prepare('SELECT id FROM alerts WHERE alert_fingerprint = ?').get(fingerprint) as { id: string } | undefined;
      if (duplicate) return { alertId: duplicate.id, created: false };
      throw error;
    }
  }

  private ensureCase(
    finding: ActiveInspectionFinding,
    options: { createdBy: string; source: string }
  ): { caseId: string | null; status: ActiveInspectionFinding['status'] } {
    const baseCorrelationId = `auto-inspection:${finding.fingerprint.slice(0, 24)}`;
    const existing = getOperationCaseByCorrelation(baseCorrelationId);

    if (existing && AUTO_CASE_STATUSES_TO_REUSE.has(existing.status)) {
      if (this.hasRecentCaseEvent(existing.id, finding.id)) {
        return { caseId: existing.id, status: 'case_exists' };
      }

      addOperationCaseEvent({
        caseId: existing.id,
        eventType: 'active_inspection_detected',
        sourceType: 'active_inspection',
        sourceId: finding.id,
        correlationId: existing.correlation_id,
        payload: this.buildCasePayload(finding, false),
        createdBy: options.createdBy
      });
      return { caseId: existing.id, status: 'case_updated' };
    }

    if (existing) {
      return { caseId: existing.id, status: 'case_exists' };
    }

    const operationCase: OperationCaseRecord = createOperationCase({
      title: finding.title,
      caseType: finding.domain === 'alert' ? 'alert' : 'inspection',
      status: 'diagnosing',
      severity: finding.severity,
      source: options.source,
      assetId: finding.assetId || null,
      assetType: finding.assetType || null,
      assetName: finding.assetName || null,
      alertId: finding.alertRecordId || finding.alertId || null,
      correlationId: baseCorrelationId,
      serverIds: finding.assetType === 'server' && finding.assetId ? [finding.assetId] : [],
      context: {
        activeInspection: this.buildCasePayload(finding, true)
      },
      summary: {
        finding: finding.title,
        recommendedAction: finding.recommendedAction,
        automation: 'active_inspection_auto_case'
      },
      createdBy: options.createdBy
    });

    addOperationCaseEvent({
      caseId: operationCase.id,
      eventType: 'active_inspection_detected',
      sourceType: 'active_inspection',
      sourceId: finding.id,
      correlationId: operationCase.correlation_id,
      payload: this.buildCasePayload(finding, true),
      createdBy: options.createdBy
    });

    return { caseId: operationCase.id, status: 'case_created' };
  }

  private attachExistingCases(findings: ActiveInspectionFinding[]): void {
    for (const finding of findings) {
      const existing = getOperationCaseByCorrelation(`auto-inspection:${finding.fingerprint.slice(0, 24)}`);
      if (existing && AUTO_CASE_STATUSES_TO_REUSE.has(existing.status)) {
        finding.caseId = existing.id;
        finding.status = 'case_exists';
      }
    }
  }

  private hasRecentCaseEvent(caseId: string, findingId: string): boolean {
    const row = db.prepare(`
      SELECT id
      FROM operation_case_events
      WHERE case_id = ?
        AND event_type = 'active_inspection_detected'
        AND source_id = ?
        AND created_at >= datetime('now', '-30 minutes')
      LIMIT 1
    `).get(caseId, findingId) as { id: string } | undefined;
    return Boolean(row);
  }

  private shouldOpenCase(finding: ActiveInspectionFinding): boolean {
    return finding.severity !== 'low';
  }

  private createFinding(input: Omit<ActiveInspectionFinding, 'id' | 'fingerprint' | 'status'>): ActiveInspectionFinding {
    const fingerprint = createHash('sha1')
      .update([
        input.domain,
        input.severity,
        input.assetType || '',
        input.assetId || '',
        input.alertId || '',
        input.title
      ].join(':'))
      .digest('hex');

    return {
      ...input,
      id: `finding-${fingerprint.slice(0, 12)}`,
      fingerprint,
      status: 'detected'
    };
  }

  private buildCasePayload(finding: ActiveInspectionFinding, created: boolean): Record<string, unknown> {
    return {
      findingId: finding.id,
      fingerprint: finding.fingerprint,
      domain: finding.domain,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      assetId: finding.assetId || null,
      assetType: finding.assetType || null,
      assetName: finding.assetName || null,
      alertId: finding.alertRecordId || finding.alertId || null,
      evidence: finding.evidence,
      recommendedAction: finding.recommendedAction,
      autoCaseCreated: created
    };
  }

  private buildResult(
    findings: ActiveInspectionFinding[],
    counts: { mode: 'preview' | 'active'; casesCreated: number; casesUpdated: number; alertsCreated: number }
  ): ActiveInspectionRunResult {
    const summary = {
      total: findings.length,
      critical: findings.filter((finding) => finding.severity === 'critical').length,
      high: findings.filter((finding) => finding.severity === 'high').length,
      medium: findings.filter((finding) => finding.severity === 'medium').length,
      low: findings.filter((finding) => finding.severity === 'low').length,
      casesCreated: counts.casesCreated,
      casesUpdated: counts.casesUpdated,
      alertsCreated: counts.alertsCreated
    };
    const actionable = summary.critical + summary.high + summary.medium;
    const caseLinked = counts.casesCreated
      + counts.casesUpdated
      + findings.filter((finding) => finding.status === 'case_exists').length;

    return {
      generatedAt: new Date().toISOString(),
      mode: counts.mode,
      summary,
      findings,
      flow: [
        { key: 'inspect', label: '主动巡检', status: 'done', count: findings.length },
        { key: 'detect', label: '自动发现', status: actionable > 0 ? 'attention' : 'done', count: actionable },
        { key: 'case', label: '自动建 Case', status: caseLinked > 0 ? 'attention' : actionable > 0 ? 'idle' : 'done', count: caseLinked || actionable },
        { key: 'handoff', label: '进入诊断/执行', status: actionable > 0 ? 'attention' : 'idle', count: actionable }
      ]
    };
  }
}

function severityRank(severity: FindingSeverity): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity];
}

function normalizeAlertSeverity(severity: FindingSeverity): string {
  if (severity === 'critical' || severity === 'high') return severity;
  if (severity === 'medium') return 'medium';
  return 'low';
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export const activeInspectionService = new ActiveInspectionService();
