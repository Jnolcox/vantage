import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVantageEnv } from '../server/providers/common/env.js';

/** Resolve the explicit CLI project directory, defaulting to the tool's repository. */
export function projectRoot(moduleUrl, environment = process.env) {
  return path.resolve(
    readVantageEnv('PROJECT_ROOT', environment) ||
      path.join(path.dirname(fileURLToPath(moduleUrl)), '..'),
  );
}
