# AGENTS.md — OpenVibe.Extensions

## Project Overview

OpenVibe.Extensions is the home of OpenVibe's first-party **client surfaces** (ADR-023): the OpenVibe Companion, a
Manifest V3 browser extension for Chromium and Firefox, plus the kiosk companion and the Raspberry Pi hardware
scripts. There is no server, port, domain or database in this repository; the extension talks to first-party
services from the person's browser.

- **Package:** `openvibe-extensions` 0.9.2 (private) · **Runtime:** Node ≥22 for build/test · **License:** MIT
- **Read first:** [README.md](README.md) (authoritative on permissions and privacy), [store/privacy.md](store/privacy.md),
  [store/listing.md](store/listing.md), [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md).

**Network context:** the Companion calls OpenVibe.Coupons (public API; `cpx_` install token), OpenVibe.Network (Dock
state, OAuth), OpenVibe.Chat (Dock Chats), OpenVibe.Codes (Dock agent view), OpenVibe.Mail (masks, with the person's
bearer), OpenVibe.Locker (encrypted logins) and OpenVibe.Live (the agent view's embed). Its hand-off buttons open
OpenVibe.Rent, OpenVibe.Watch, OpenVibe.Food and OpenVibe.Reviews in a new tab. It is a client: it owns no account,
coupon, mail, locker or Dock data.

## Commands

```bash
npm test                       # every test/*.test.js; no browser needed, local stubs
npm test -- manifest           # only files whose name contains the word
npm test -- --strict           # a skipped test fails the run
npm run pack                   # dist/openvibe-companion-<version>.zip (load unpacked; API https://openvibe.coupons)
npm run pack:stores            # dist/…-chrome.zip and …-firefox.zip (store uploads, runs the audit first)
npm run pack:dev               # a local API build (http://localhost:4850, dev only)
npm run lint:firefox           # Mozilla web-ext lint, warnings as errors (CI runs it)
npm run icons                  # regenerate browser/icons/
node scripts/check-panel.js    # the side panel in headless Chrome (also test/panel.test.js)
node scripts/check-autoapply.js # autoapply on fixture checkouts in headless Chrome
node test/locker-browser.js    # optional: Playwright/Chromium (set PLAYWRIGHT_MODULE), 12 screenshots, clipboard
```

No dependencies for the extension or the test runner; tests/scripts use Node's standard library. There is no
build step for the shipped code: the zip is exactly `browser/`.

## Architecture at a Glance

- **`browser/manifest.json`** — MV3 for Chromium (minimum 114) and Firefox (gecko id, strict 128); permissions
  `activeTab`, `identity`, `scripting`, `storage`, `alarms`, `clipboardWrite`, and Chrome-only `offscreen`/`sidePanel`;
  host permissions only for the named OpenVibe origins; the CSP (no remote script, no inline script, frames only Live).
- **`browser/background.js`** — the service worker; wires `lib/mask-service.js` and the Dock/agent/mail/locker modules
  to `browser.*`.
- **`browser/panel.html` + `panel.js` + `panel.css`** — the OpenVibe Dock in the side panel (`shared/` is the released
  OpenVibe.Shared Dock, bundled because the CSP allows no remote script); tabs Vibe/Agents/Chats/Activity; the Agents
  tab reads the person's token from Codes (`GET /api/v1/me/agent-view`) and embeds Live.
- **`browser/popup.html` + `popup.js`** — DOM wiring only; `lib/controller.js` holds the coupon logic (tested in Link);
  `lib/format.js` the wording; `lib/api.js` the only Coupons client.
- **`browser/options.html` + `options.js`** — connect/disconnect a `cpx_` token, grant the API host permission, the
  pasted-token fallback and sign-out.
- **`browser/lib/`** — `config.js` (origins, scopes, keys), `host.js` (URL → hostname, everything else dropped),
  `handoff.js` (cleaned Rent/Watch/Food/Reviews URLs), `autoapply.js` (injected coupon-box runner),
  `rating.js`/`listing.js` (injected, read-only), `platform.js` (`chrome.*`/`browser.*` adapter),
  `auth.js` (PKCE OAuth, refresh, sign-out), `network-api.js` (Dock state), `mail-api.js`/`mask*.js`,
  `locker-*.js` (envelope, vault, fill, clipboard, passwords), `controller.js`, `format.js`.
- **`browser/shared/`** — the vendored Dock/SDK browser bundle (`dock*.js`, `ov-locker-core.js`, `kit.css`, glyphs,
  brands). Treat it as a release: update from the pinned Shared/SDK version, do not hand-edit crypto.
- **`kiosk-companion/`** — the Firefox new-tab/history bridge for OpenVibe.Live's `/kiosk` (moved from Live).
- **`hardware/`** — the Raspberry Pi streamer/controller scripts (moved from Live; `streamer.py`, `controller.py`).
- **`scripts/`** — `audit.js` (the permission audit), `pack.js` (load/store zips, reproducible), `check-panel.js`,
  `check-autoapply.js`, `lint-firefox.js`, `icons.js`; tests in [test/](test/).
- **`store/`** — `listing.md`, `privacy.md`, `screenshots.md`: the exact store fields/disclosures. The owner uploads;
  never upload from CI.

## Permissions, Privacy and Credentials

- **Only four buttons touch a page**, and only after a click (`activeTab`): "Try these codes" (`lib/autoapply.js`),
  "Save its rating" (`lib/rating.js`), "Keep on my Rent board"/"Check the rent" (`lib/listing.js`). No content
  scripts, no `externally_connectable`, no web-accessible resources, no `<all_urls>`, no `tabs`/`cookies`/`webRequest`.
- The Coupons part sends only the **hostname** (`lib/host.js` drops path/query/fragment/port/credentials), with
  `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'`. Never send page content or the full URL.
- A `cpx_` token is an install token with `coupons.lookup` and optionally `coupons.report`; it is not a Network
  session. Refuse to store anything that is not `cpx_`. The Dock's OAuth is a public client (`companion`, PKCE S256,
  no secret) with scopes `dock activity chat.read agent.view mail.mask.manage locker.login.manage run.fill.approve`;
  the access token stays in `storage.session` (memory), the rotating refresh token in `storage.local` (this device,
  never sync). Sign-out revokes at the Network.
- Locker: the popup unlocks with the passphrase/recovery kit (a passkey belongs to openvibe.locker, so it offers
  **Open Locker**); keys live only in `storage.session`/background memory, never local/sync; lock now, account
  change, browser restart and 15 idle minutes clear them. Logins match the exact origin (scheme/host/port); fill
  requires a click, refuses ambiguous forms, re-checks the origin before writing, and never runs on page load.
  Copy clears the clipboard 30 s after the latest copy (does not read it).
- Mail masks: only OpenVibe.Mail's `/api/v1/masks` with the person's bearer and the `mail.mask.manage` scope; a mask is
  never offered on an `openvibe.*` site and none is created until the person presses the button; a site with a mask
  reuses it, never a second one.
- CSP is a guarantee: `default-src 'none'`, `script-src 'self'`, styles only `'unsafe-inline'`, images `'self' blob:`,
  frames only Live, object/base none. No `eval`, no remote code, no `innerHTML` in the extension's own code.
- Host permissions and `connect-src` must agree with `lib/config.js` for every origin; the audit fails if one widens.

## Key Pitfalls

- **Never widen the manifest, host permissions, CSP or page access.** Any extra permission, origin, content script,
  web-accessible resource, `externally_connectable`, optional permission, `unsafe-eval` or remote script is a privacy
  regression and fails [test/manifest.test.js](test/manifest.test.js). Add a feature within the existing surface.
- **Never store a token in `storage.sync`.** Only the `cpx_` install token (local), the Dock access token (session)
  and the rotating refresh token (local) exist; the old pasted `networkToken` is a temporary fallback only.
- **Hand-offs open a visible new tab** on an allow-listed `https://openvibe.<tld>` origin with a cleaned URL (no
  credentials/fragment/tracking); nothing opens when the popup opens, and `tabs.open` refuses any other origin.
- **No page content is sent** except the one read the person asked for; `test/privacy.test.js` inspects every request
  on checkout URLs full of personal data.
- **Vendored `shared/` is a release**, not source: keep the SDK/Shared version and the crypto framing
  (`locker-payload.js`/`locker-passwords.js` from Locker `9c2744e`) compatible; run `npm test -- locker`,
  `npm run pack:stores`, `npm run lint:firefox`.
- **Firefox MV3 background pages are non-persistent:** a clipboard alarm must back up an in-memory timer; Chrome uses
  the documented offscreen clipboard document. Do not assume a long-lived page.
- **The Dock's agent view is behind two server-side gaps:** Codes' session check and Live's `frame-ancestors` do not
  yet accept the extension/Dock credential, so the view is bundled and tested against a stub but hidden in
  production until Codes or Network accepts that token. Do not fake it on.
- **Version:** bump `browser/manifest.json` for every store upload; stores refuse a version they have seen.
- **Never upload from CI.** `pack:stores` builds; the owner uploads with [store/listing.md](store/listing.md),
  [store/privacy.md](store/privacy.md) and [store/screenshots.md](store/screenshots.md).

## Testing

`npm test` runs each file in its own process with local stubs and fake browser APIs: the manifest/permission audit,
API client, privacy on checkout URLs, hand-offs, the popup controller, pack reproducibility, the Dock's network API,
auth (PKCE/refresh/sign-out), messages, mask rules/service/router, Locker payload/vault/passwords/fill, and the
headless-Chrome panel check (skips without Chrome). `scripts/check-autoapply.js` runs the injected coupon runner on
real checkout fixtures; `test/locker-browser.js` is the optional Playwright check (screenshots + clipboard). A skipped
test is not a pass; `--strict` makes one fail. Always `node --check` changed JS.

## Documentation

- [README.md](README.md) — purpose, Companion features, what it can see/send/stores, the install token, Dock in the
  side panel, layout, tests, packing, store release, dependencies, Locker passwords.
- [store/listing.md](store/listing.md), [store/privacy.md](store/privacy.md), [store/screenshots.md](store/screenshots.md).
- [kiosk-companion/README.md](kiosk-companion/README.md), [hardware/README.md](hardware/README.md).
- [CHANGELOG.md](CHANGELOG.md), [SECURITY.md](SECURITY.md).
