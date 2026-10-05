/**
 * The cheap checks the main path makes before loading embed mode. Everything
 * that applies views lives in embed.js, which is imported only when one of
 * these says a page needs it, so a normal page load pays nothing for it.
 */

import { annotationsFromParams } from '../view/index.js';

/** Whether this page was opened in embed mode (`?embed=1`). */
export function isEmbedded(location = globalThis.location) {
  return new URLSearchParams(location?.search || '').get('embed') === '1';
}

/** The annotations the opening link carries, or an empty list. */
export function linkedAnnotations(location = globalThis.location) {
  return annotationsFromParams(
    new URLSearchParams(String(location?.hash || '').replace(/^#/, '')),
  );
}

/** Whether this page needs the view-applying code in embed.js. */
export function needsViews(location = globalThis.location) {
  return isEmbedded(location) || linkedAnnotations(location).length > 0;
}
