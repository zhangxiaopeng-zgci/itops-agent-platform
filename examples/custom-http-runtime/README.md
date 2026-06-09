# Custom HTTP Runtime Mock

This mock service implements the external Agent runtime protocol used by the
`custom_http` runtime adapter.

Start it with Node:

```bash
PORT=9001 node examples/custom-http-runtime/mock-runtime.js
```

Health check:

```bash
curl http://localhost:9001/health
```

Run request:

```bash
curl -X POST http://localhost:9001/run \
  -H 'content-type: application/json' \
  -d '{
    "agent_id": "demo",
    "agent_name": "Demo Agent",
    "input": "hello",
    "context": {},
    "allowed_tools": []
  }'
```

Example `runtime_config` for an ITOps Agent:

```json
{
  "endpoint": "http://127.0.0.1:9001/run",
  "timeoutMs": 300000,
  "allowedTools": []
}
```
