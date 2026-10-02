/**
 * Read an operator setting by its Vantage name, falling back to the name it
 * had before the rename to Vantage.
 *
 * `VANTAGE_<NAME>` wins whenever it holds a non-blank value. Otherwise a
 * non-blank `GEV_<NAME>` is used, with a one-time console warning naming the
 * new variable, so an existing `.env`, shell profile or Pinokio install keeps
 * working unchanged. Blank counts as unset because launchers such as Pinokio
 * pass an empty string for a field nobody configured.
 */

const PREFIX = 'VANTAGE_';
const LEGACY_PREFIX = 'GEV_';
const warnedLegacyNames = new Set();

/**
 * @param {string} name Setting name without prefix, e.g. 'RATELIMIT_OPENAI_PER_MIN'.
 * @param {Record<string, string|undefined>} [env]
 * @param {(message: string) => void} [warn]
 * @returns {string|undefined} The raw value, or the new variable's own
 *   (blank/undefined) value when neither name is set.
 */
export function readVantageEnv(name, env = process.env, warn = console.warn) {
  const current = env[PREFIX + name];
  if (String(current ?? '').trim() !== '') return current;
  const legacyName = LEGACY_PREFIX + name;
  const legacy = env[legacyName];
  if (String(legacy ?? '').trim() === '') return current;
  if (!warnedLegacyNames.has(legacyName)) {
    warnedLegacyNames.add(legacyName);
    warn(
      `[vantage] ${legacyName} is deprecated and will stop being read in a future major release; rename it to ${PREFIX + name}.`,
    );
  }
  return legacy;
}
