/**
 * How this project identifies itself to the third-party services it calls.
 *
 * Several upstream usage policies (OSM/Overpass, Nominatim, CelesTrak, OVapi)
 * ask every client for a User-Agent that names the application and gives a
 * way back to its maintainer; stock library agents and browser look-alikes do
 * not qualify. Every server-side request that sets a User-Agent builds it
 * here, so the name, version and contact point change in one place. The one
 * deliberate exception is the Live Traffic NSW image host, which only serves
 * frames to browsers (NSW_IMAGE_USER_AGENT in server/providers/cctv/).
 */

import { PACKAGE_VERSION } from './version.js';

export const PROJECT_NAME = 'vantage';

/** Application version announced to upstreams: the package.json version. */
export const PROJECT_VERSION = PACKAGE_VERSION;

/** Public home of this fork: the contact point every upstream is given. */
export const PROJECT_URL = 'https://github.com/Jnolcox/vantage';

/** Version of a single proxy client's request shape, independent of the app. */
const CLIENT_VERSION = '1.0';

/** Application-level User-Agent, e.g. `vantage/1.2.3 (+<PROJECT_URL>)`. */
export const PROJECT_USER_AGENT = `${PROJECT_NAME}/${PROJECT_VERSION} (+${PROJECT_URL})`;

/**
 * User-Agent for one named proxy client, so an upstream operator can tell
 * which part of the application is calling them.
 *
 * @param {string} client Short kebab-case client label, e.g. `cctv-proxy`.
 * @returns {string} e.g. `vantage-cctv-proxy/1.0 (+<PROJECT_URL>)`.
 */
export function clientUserAgent(client) {
  return `${PROJECT_NAME}-${client}/${CLIENT_VERSION} (+${PROJECT_URL})`;
}
