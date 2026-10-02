import { createVantageActionRunner } from './vantageActions.js';
import { createVoiceCommands } from './commands.js';
export * from './realtimeController.js';

/** Compose the standalone action runner with the voice controls. */
export function initVantageVoiceCommands(options) {
  return createVoiceCommands({
    ...options,
    runner: createVantageActionRunner(options),
  });
}
