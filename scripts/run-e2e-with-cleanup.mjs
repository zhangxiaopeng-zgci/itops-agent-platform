#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const passthroughArgs = process.argv.slice(2);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });

  return typeof result.status === 'number' ? result.status : 1;
}

function cleanup(label) {
  console.log(`\n[${label}] Cleaning E2E pilot test data...`);

  if (process.env.E2E_CLEANUP_DOCKER_SERVICE) {
    return run('docker', [
      'exec',
      process.env.E2E_CLEANUP_DOCKER_SERVICE,
      'node',
      '/app/scripts/cleanup-pilot-test-data.mjs',
      '--execute'
    ]);
  }

  if (process.env.E2E_CLEANUP_SUDO === 'true') {
    const sudoEnv = [`PATH=${process.env.PATH || ''}`];
    if (process.env.DATABASE_PATH) {
      sudoEnv.push(`DATABASE_PATH=${process.env.DATABASE_PATH}`);
    }

    return run('sudo', ['env', ...sudoEnv, process.execPath, 'scripts/cleanup-pilot-test-data.mjs', '--execute']);
  }

  return run(process.execPath, ['scripts/cleanup-pilot-test-data.mjs', '--execute']);
}

const preCleanupStatus = cleanup('pre-e2e');
if (preCleanupStatus !== 0) {
  process.exit(preCleanupStatus);
}

const testStatus = run('npx', ['playwright', 'test', ...passthroughArgs]);
const postCleanupStatus = cleanup('post-e2e');

process.exit(testStatus !== 0 ? testStatus : postCleanupStatus);
