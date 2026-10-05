/**
 * The cheap checks the main path makes before loading embed mode. Everything
 * that applies views lives in embed.js, which is imported only when one of
 * these says a page needs it, so a normal page load pays nothing for it.
 */

import { annotationsFromParams } from '../view/index.js';

/**
 * Whether this page shows the app embedded: `?embed=1` when another page
 * frames it, or inline when a panel page loads the app into itself and sets
 * `globalThis.VANTAGE_EMBED_INLINE` first.
 */
export function isEmbedded(location = globalThis.location) {
  return (
    isEmbeddedInline() ||
    new URLSearchParams(location?.search || '').get('embed') === '1'
  );
}

/** Whether a panel page loaded the app into itself. */
export function isEmbeddedInline() {
  return globalThis.VANTAGE_EMBED_INLINE === true;
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
