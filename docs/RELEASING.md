# Releasing Vantage

Vantage follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
and records every release in [`CHANGELOG.md`](../CHANGELOG.md) using
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).

The version lives in one place: `"version"` in `package.json`.
`src/sources/version.js` is generated from it by `scripts/sync-version.mjs`
(the npm `version` lifecycle script runs it), and the outbound User-Agent
`vantage/<version> (+https://github.com/Jnolcox/vantage)` reads that module.
Unit tests fail when the generated module drifts from `package.json` or when
`CHANGELOG.md` has no dated section and link reference for the current
version. Never edit the version by hand in any other file.

## What counts as major, minor and patch

Vantage is an application, not a published library, so its public contract is
everything an existing install, a saved file or an integration depends on:

- **Persisted user data**: browser storage keys and values, scene documents,
  scene bundles, share links, `.vantage-cache/` and `.vantage-logs/`.
- **Configuration**: environment variables in `.env` and the shell,
  `pinokio/ENVIRONMENT`, and the npm scripts the docs tell people to run.
- **Local HTTP API**: the `/api/*` routes, their methods, parameters and
  response shapes, and the `X-Vantage-*` headers.
- **Package exports**: the `vantage/*` entry points declared in `package.json`.
- **Supported runtimes**: the Node.js range in `package.json` `engines`.
- **Features**: layers, controls, voice actions and data sources users rely on.

**MAJOR**: something that worked stops working without a migration.

- A storage key, saved scene, bundle or share link that is no longer read.
- An environment variable, or a deprecated alias of one, that is removed.
- An `/api` route or package export removed or changed incompatibly.
- A supported Node line dropped, or a feature removed outright.
- A new product baseline, such as the 1.0.0 rename.

**MINOR**: backward-compatible additions.

- New layers, controls, voice actions, data sources, settings, `/api` routes
  or exports.
- A rename that keeps the old name working: an automatic storage migration,
  or a legacy environment variable read with a deprecation warning.
- A new consent or opt-in gate that keeps the feature available.

**PATCH**: backward-compatible fixes.

- Bugs, and security fixes that keep every feature available.
- Upstream endpoint or data fixes, performance work and documentation.
- Dependency updates with no behavior change.

Rules of thumb:

- When unsure between two levels, pick the higher one.
- Deprecate before removing. A renamed setting or key keeps its old name
  working, with a warning, for at least one minor release; removing the old
  name later is a major change.
- Hardening keeps functionality. Prefer consent, opt-in, scoping and
  documentation over removing a feature; if a security fix must remove a
  capability, it is a major release and the changelog says why.
- Pre-releases use a suffix, e.g. `1.1.0-rc.1`, and sort before `1.1.0`.

## Cutting a release

1. **Start clean.** From an up-to-date `main` with a clean tree, branch and
   confirm the gates pass:

   ```sh
   git switch -c release/vX.Y.Z
   npm test
   npm run -s format:check
   npm run -s check:boundaries
   npm run build
   ```

2. **Update the changelog.** In `CHANGELOG.md`, rename the `## [Unreleased]`
   section to `## [X.Y.Z] - YYYY-MM-DD` (today's date), add a fresh empty
   `## [Unreleased]` above it, and update the link references at the bottom:

   ```md
   [Unreleased]: https://github.com/Jnolcox/vantage/compare/vX.Y.Z...HEAD
   [X.Y.Z]: https://github.com/Jnolcox/vantage/compare/vPREVIOUS...vX.Y.Z
   ```

3. **Bump the version.** Let npm update `package.json`, `package-lock.json`
   and the generated `src/sources/version.js` together, then commit:

   ```sh
   npm version X.Y.Z --no-git-tag-version
   git add CHANGELOG.md package.json package-lock.json src/sources/version.js
   git commit -m "chore(release): X.Y.Z"
   ```

   Open a pull request and merge it once CI is green. (When releasing straight
   from `main` without a pull request, run
   `npm version X.Y.Z -m "chore(release): %s"` after step 2 instead: it makes
   the commit and an annotated `vX.Y.Z` tag in one step. Then skip to step 5.)

4. **Tag the merged commit.** Tags are annotated and always `v`-prefixed:

   ```sh
   git switch main && git pull --ff-only
   git tag -a vX.Y.Z -m "Vantage X.Y.Z"
   ```

5. **Publish.** Push the tag, then create the GitHub release from the
   changelog section:

   ```sh
   git push origin vX.Y.Z
   awk -v v="X.Y.Z" 'index($0, "## [" v "]") == 1 { p = 1; next }
     p && /^## / { exit } p' CHANGELOG.md > release-notes.md
   gh release create vX.Y.Z --verify-tag --title "Vantage X.Y.Z" \
     --notes-file release-notes.md
   rm release-notes.md
   ```

   Add `--prerelease` for an `-rc` version.

A tag that was pushed is never moved or reused. If a release is broken, fix it
forward with a new patch release.
