# Agent Runtime Stage 2: Custom HTTP Runtime

## Purpose

Stage 2 adds a generic external Agent runtime adapter before integrating Hermes.
This makes the external-runtime boundary testable without depending on a
specific Agent framework.

## Runtime Type

```text
custom_http
```

## Agent Runtime Config

Example:

```json
{
  "endpoint": "http://127.0.0.1:9001/run",
  "timeoutMs": 300000,
  "headers": {
    "x-runtime-token": "optional-token"
  },
  "allowedTools": []
}
```

Rules:

- `endpoint` is required.
- `timeoutMs` defaults to 300000 ms.
- `headers` must be a string-to-string object.
- `allowedTools` is passed through for future tool-policy integration.
- Secrets must be supplied through environment or runtime configuration outside
  of version-controlled code.

## Request Sent To Runtime

```json
{
  "agent_id": "agent-id",
  "agent_name": "Agent name",
  "input": "user or workflow input",
  "context": {},
  "task_id": "optional-task-id",
  "node_id": "optional-node-id",
  "autonomy_level": "suggest",
  "tool_policy_id": null,
  "allowed_tools": []
}
```

## Expected Response

The runtime must return either `output` or `summary`.

```json
{
  "status": "success",
  "output": "final answer",
  "trace": [],
  "metadata": {}
}
```

Error response:

```json
{
  "status": "error",
  "error": "reason"
}
```

## Mock Runtime

A zero-dependency mock service is available at:

```text
examples/custom-http-runtime/mock-runtime.js
```

Run it with:

```bash
PORT=9001 node examples/custom-http-runtime/mock-runtime.js
```

Then configure an Agent with:

```json
{
  "endpoint": "http://127.0.0.1:9001/run",
  "timeoutMs": 300000,
  "allowedTools": []
}
```

## Why This Comes Before Hermes

The `custom_http` runtime establishes the execution contract:

- How ITOps calls an external Agent runtime.
- How context, task IDs, and tool permissions are passed.
- How errors and timeouts are handled.
- How trace and metadata come back.

Hermes can later use this contract directly or receive a dedicated
`hermes` adapter with the same boundary shape.
