#!/usr/bin/env node

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const databasePath = process.env.DATABASE_PATH || '/app/data/app.db';
const outputDir = process.env.KITE_BOOTSTRAP_DIR || '/app/kite-bootstrap';
const outputPath = process.env.KITE_BOOTSTRAP_KUBECONFIG || path.join(outputDir, 'kubeconfig');
const clusterId = process.env.KITE_BOOTSTRAP_CLUSTER_ID || '';

function decrypt(encryptedString, key) {
  if (!encryptedString) return '';
  const parts = String(encryptedString).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encryptedData = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString('utf8');
}

function getActiveEncryptionKey(db) {
  const row = db.prepare(`
    SELECT key_value
    FROM encryption_keys
    WHERE key_type = 'aes-256-gcm' AND active = 1
    LIMIT 1
  `).get();
  if (!row?.key_value) {
    throw new Error('Active encryption key not found');
  }
  return Buffer.from(row.key_value, 'base64');
}

const db = new Database(databasePath, { readonly: true });
try {
  const key = getActiveEncryptionKey(db);
  const cluster = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.credential_id,
      kc.kubeconfig
    FROM kubernetes_clusters c
    JOIN kubernetes_credentials kc ON kc.id = c.credential_id
    WHERE c.enabled = 1
      AND c.auth_type = 'kubeconfig'
      AND kc.credential_type = 'kubeconfig'
      AND kc.kubeconfig IS NOT NULL
      AND kc.kubeconfig != ''
      ${clusterId ? 'AND c.id = @clusterId' : ''}
    ORDER BY
      CASE WHEN c.status = 'synced' THEN 0 ELSE 1 END,
      c.updated_at DESC
    LIMIT 1
  `).get(clusterId ? { clusterId } : {});

  if (!cluster) {
    throw new Error('No enabled Kubernetes cluster with kubeconfig credential found');
  }

  const kubeconfig = decrypt(cluster.kubeconfig, key).trim();
  if (!kubeconfig) {
    throw new Error(`Kubeconfig for cluster ${cluster.id} is empty`);
  }

  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, `${kubeconfig}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    ok: true,
    clusterId: cluster.id,
    clusterName: cluster.name,
    outputPath
  }, null, 2));
} finally {
  db.close();
}
