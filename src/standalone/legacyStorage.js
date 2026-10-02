/**
 * Side-effect module, imported first by `src/main.js` so it evaluates before
 * any other module can read browser storage: moves state saved under the
 * former product name to its Vantage keys.
 */
import { migrateLegacyBrowserStorage } from '../storageMigration.js';

migrateLegacyBrowserStorage(globalThis);
