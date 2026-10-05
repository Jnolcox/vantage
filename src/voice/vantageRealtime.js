import { toFunctionOutput } from '../tools/functions.js';
import { VANTAGE_ACTION_NAMES } from './actionNames.js';
import { createVantageActionRunner } from './vantageActions.js';
import { createVoiceCommands } from './commands.js';
export * from './realtimeController.js';

const ACTION_NAMES = new Set(VANTAGE_ACTION_NAMES);

/**
 * Run app actions through `runner` and every other tool the catalog has
 * through the catalog. `loadCatalog` resolves the catalog when first needed.
 */
export function withToolCatalog(runner, loadCatalog) {
  if (typeof loadCatalog !== 'function') return runner;
  return async function runVantageTool(name, args, options = {}) {
    if (ACTION_NAMES.has(name)) return runner(name, args, options);
    const catalog = await loadCatalog();
    if (!catalog?.get(name)) return runner(name, args, options);
    const result = await catalog.call(name, args ?? {}, {
      signal: options.signal,
    });
    return toFunctionOutput(name, result);
  };
}

/** Compose the standalone action runner with the voice controls. */
export function initVantageVoiceCommands(options) {
  return createVoiceCommands({
    ...options,
    runner: withToolCatalog(
      createVantageActionRunner(options),
      options.toolCatalog,
    ),
  });
}
