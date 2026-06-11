#!/bin/sh
# Entrypoint script for backend container
# Runs as root to fix volume permissions, then drops to appuser

# Ensure persistent directories exist and set proper ownership
mkdir -p /app/data
chown -R appuser:appgroup /app/data
mkdir -p /app/backups
chown -R appuser:appgroup /app/backups

# Read-only host secret mounts may be root-only. Copy the referenced secret into
# a container-local path that the unprivileged runtime can read without exposing
# the value through docker inspect.
if [ -n "$HERMES_API_KEY_FILE" ] && [ -f "$HERMES_API_KEY_FILE" ]; then
  mkdir -p /app/runtime-secrets
  cp "$HERMES_API_KEY_FILE" /app/runtime-secrets/hermes_api_key
  chown appuser:appgroup /app/runtime-secrets/hermes_api_key
  chmod 0400 /app/runtime-secrets/hermes_api_key
  export HERMES_API_KEY_FILE=/app/runtime-secrets/hermes_api_key
fi

# Drop privileges and run the application
exec gosu appuser "$@"
