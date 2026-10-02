/**
 * Click-to-load consent for third-party media embeds.
 *
 * Loading a YouTube, Facebook or X embed connects the browser to that company
 * (IP address, page origin, its cookies) and runs its scripts. Nothing from a
 * provider loads — no preconnect, no hidden warm-up frame, no SDK script —
 * until the viewer allows that provider, either once for this page or always
 * (remembered in localStorage under `vantage.embeddedMedia.allow.<provider>`).
 */

const STORAGE_PREFIX = 'vantage.embeddedMedia.allow.';
const ALLOWED = '1';

/** Who receives the connection when each provider's embed loads. */
export const EMBEDDED_MEDIA_PROVIDER_NAMES = Object.freeze({
  youtube: 'YouTube (Google)',
  facebook: 'Facebook (Meta)',
  x: 'X',
});

/**
 * @param {Storage|null|undefined} storage Where "always allow" is remembered;
 *   unavailable or throwing storage degrades to per-page consent.
 */
export function createEmbeddedMediaConsent(storage) {
  const allowedThisPage = new Set();
  const remembered = (provider) => {
    try {
      return storage?.getItem(STORAGE_PREFIX + provider) === ALLOWED;
    } catch {
      return false;
    }
  };
  return Object.freeze({
    isAllowed: (provider) =>
      allowedThisPage.has(provider) || remembered(provider),
    allow(provider, { remember = false } = {}) {
      allowedThisPage.add(provider);
      if (!remember) return;
      try {
        storage?.setItem(STORAGE_PREFIX + provider, ALLOWED);
      } catch {
        // Consent still holds for this page.
      }
    },
  });
}

/** Read storage defensively: a privacy mode can throw on access. */
export function browserConsentStorage(globalRef = globalThis) {
  try {
    return globalRef.localStorage || null;
  } catch {
    return null;
  }
}
