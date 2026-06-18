import os from 'os';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'itops-agent-platform-vitest-secret';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.DATABASE_PATH = process.env.DATABASE_PATH
  || path.join(os.tmpdir(), `itops-agent-platform-vitest-${process.pid}.db`);
