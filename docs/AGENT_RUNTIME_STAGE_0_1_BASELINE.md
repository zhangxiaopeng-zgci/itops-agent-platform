# Agent Runtime Stage 0-1 Baseline

Date: 2026-06-09

Branch:

```text
feat/agent-runtime-architecture
```

Fork remote:

```text
git@github.com:zhangxiaopeng-zgci/itops-agent-platform.git
```

## Test Host

```text
ubuntu@10.1.132.58
hostname: aiops
```

Observed environment:

```text
Docker version 29.1.3
git version 2.43.0
sudo: passwordless
node: not installed on host
npm: not installed on host
```

Node-based validation was run through Docker with the `node:20` image.

## Stage 0 Results

The working tree was packaged locally and copied to:

```text
/tmp/itops-agent-runtime-stage
```

The remote tar extraction produced macOS extended-attribute warnings and `._*`
resource-fork files. These files were removed before running the final test
pass:

```bash
find /tmp/itops-agent-runtime-stage -name "._*" -delete
```

## Stage 1 Scope

Implemented the first runtime abstraction slice:

- Added an agent runtime interface.
- Added `builtin` and `llm` runtime adapters.
- Moved the existing server command and inspection behavior into `builtin`.
- Moved the existing LLM execution behavior into `llm`.
- Kept `executeAgentNode` as the single workflow/test execution entrypoint.
- Added migration `v007_add_agent_runtime_fields`.
- Added runtime metadata support to agent create, update, import, and export
  paths.
- Preserved old behavior by inferring `builtin` runtime for legacy server
  command and inspection agents.

New runtime metadata fields:

```text
agents.runtime
agents.runtime_config
agents.autonomy_level
agents.tool_policy_id
```

## Verification Commands

Backend dependency install:

```bash
cd /tmp/itops-agent-runtime-stage/backend
docker run --rm -v "$PWD":/app -w /app node:20 npm ci
```

Backend build:

```bash
cd /tmp/itops-agent-runtime-stage/backend
docker run --rm -v "$PWD":/app -w /app node:20 npm run build
```

Result:

```text
PASS - TypeScript build completed with tsc.
```

Backend tests:

```bash
cd /tmp/itops-agent-runtime-stage/backend
docker run --rm -v "$PWD":/app -w /app node:20 npm test
```

Result:

```text
PASS - 5 test files passed, 85 tests passed.
```

The first test attempt failed because macOS `._*.test.ts` resource-fork files
were copied into the tarball and Vitest tried to parse them. After deleting
those files, the test suite passed.

Frontend install and build:

```bash
cd /tmp/itops-agent-runtime-stage/frontend
docker run --rm -v "$PWD":/app -w /app node:20 npm ci
docker run --rm -v "$PWD":/app -w /app node:20 npm run build
```

Result:

```text
PASS - frontend TypeScript and Vite production build completed.
```

Warnings:

- Existing npm audit warnings were reported.
- Existing frontend chunk-size warning was reported.
- Test environment warns when `JWT_SECRET` is not set.

## Notes

This stage intentionally does not integrate Hermes yet. The next safe slice is
to add a `custom_http` runtime adapter and a mock external runtime before
building the Hermes sidecar bridge.
