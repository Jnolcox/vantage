/**
 * Puppeteer drives only the qa:* scripts and tools/, so a plain `npm install`
 * does not download Chrome for Testing from Google. To fetch it for QA, run
 * `VANTAGE_QA_BROWSER=1 npm install` or `npx puppeteer browsers install chrome`.
 * A browser already in the Puppeteer cache keeps working either way.
 */
module.exports = {
  skipDownload: process.env.VANTAGE_QA_BROWSER !== '1',
};
