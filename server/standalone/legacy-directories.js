import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';

/**
 * Local working directories renamed with the product. The cache holds the
 * TomTom daily tile-budget counter as well as feed caches, so it is carried
 * over rather than rebuilt; the voice debug log is moved so any transcripts
 * it holds stay in the one place the docs point to.
 */
export const LEGACY_DIRECTORY_RENAMES = Object.freeze([
  ['.gev-cache', '.vantage-cache'],
  ['.gev-logs', '.vantage-logs'],
]);

/**
 * Move each pre-rename directory under `root` to its Vantage name, once. A
 * directory that already exists under the new name is never overwritten, and
 * the legacy one is then left alone. Never throws: a failed move only means a
 * cold cache.
 *
 * @param {string} root Checkout root.
 * @param {(message: string) => void} [log]
 * @returns {string[]} The new names that were created by a move.
 */
export function moveLegacyDirectories(root, log = console.info) {
  const moved = [];
  for (const [legacyName, name] of LEGACY_DIRECTORY_RENAMES) {
    const legacy = path.join(root, legacyName);
    const target = path.join(root, name);
    try {
      if (!existsSync(legacy) || existsSync(target)) continue;
      renameSync(legacy, target);
      moved.push(name);
      log(`[vantage] moved ${legacyName}/ to ${name}/`);
    } catch {
      // Leave the legacy directory in place; the new one starts empty.
    }
  }
  return moved;
}
