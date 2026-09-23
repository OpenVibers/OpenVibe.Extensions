# OpenVibe.Extensions

> OpenVibe's first-party client surfaces: today, the **OpenVibe Coupons Helper** browser extension.

**Status:** alpha (roadmap Wave 18, client part). The extension builds, its tests pass, and headless
Chrome 150 loads the packed build. A development build of it looked up codes and sent a report
against a local OpenVibe.Coupons. It is **not published** to any store, and it hasn't been verified
in Firefox yet. OpenVibe.Coupons itself isn't deployed yet, so the release build has nothing to
talk to until it is.
**Decision record:** [ADR-023](https://github.com/OpenVibers/OpenVibe.Contracts/blob/main/docs/adr/ADR-023-client-surfaces.md) (first-party client surfaces and their home). Roadmap §4.2 D.
**License:** MIT.

## Purpose

Client code ships on a different schedule from servers: store review, browser updates and
per-install permissions. ADR-023 gives clients their own repository.

| Surface | Directory | State |
|---|---|---|
| OpenVibe Coupons Helper (Chromium and Firefox, Manifest V3) | `browser/` | alpha, described below |
| Kiosk companion (Firefox) and the hardware/Raspberry Pi companions | not yet here | Planned by ADR-023: move them from OpenVibe.Live's `browser-extension/` and `hardware/`, leaving a redirect README in Live. That move isn't part of this change. |
| Desktop client | — | Planned by ADR-023 for the long term. Nothing exists. |

## The OpenVibe Coupons Helper (`browser/`)

Open it on a shop's website and it shows the codes
[OpenVibe.Coupons](https://github.com/OpenVibers/OpenVibe.Coupons) knows for that shop:

- the code, with a Copy button
- its status (validity unknown, reported working, reported not working)
- its confidence, or "no reports", and its expiry, or "Expiry unknown"
- its restrictions, or "No restrictions stated"
- how to apply it

If you connected the extension, you can report whether a code worked.

### What it can see, and what it sends

| | |
|---|---|
| **Permissions** | `activeTab` and `storage`. The host permission is `https://openvibe.coupons/*` only. |
| **Not requested** | `<all_urls>`, `tabs`, `cookies`, `scripting`, `webRequest`, `history`, optional permissions, content scripts, a background worker, web-accessible resources, `externally_connectable`. |
| **Read from the page** | The **hostname** of the active tab's URL, when you open the popup (that's what `activeTab` grants). `lib/host.js` drops the path, query, fragment, port and credentials before anything else sees the URL. Browser pages, files, IP addresses and local names are "not a shop", and nothing is sent for them. |
| **Sent** | To `https://openvibe.coupons` only: the hostname (`GET /api/v1/merchants/resolve?host=`), the merchant id (`GET /api/v1/merchants/:id/coupons`), and, when you report, the code id plus `worked` or `failed` with an optional reason. Every request goes with `credentials: 'omit'` (no cookies), `referrerPolicy: 'no-referrer'` and `redirect: 'error'`. |
| **Stored** | Only the optional install token, in `storage.local`. It is never synced to other devices. |
| **CSP** | `default-src 'none'; script-src 'self'; connect-src https://openvibe.coupons; object-src 'none'`. There is no inline script, no remote code, no `eval`, and no `innerHTML`: the popup builds DOM nodes and sets text. |

### The credential: an install token, never a session

The extension works without any credential, with the API's tighter anonymous rate limits. To
report:

1. On [openvibe.coupons/connect-extension](https://openvibe.coupons/connect-extension), sign in and
   create a token for this browser. It is shown once.
2. Paste it into the extension's settings. The extension checks that the API accepts it before
   saving it.

A `cpx_` token has two scopes, `coupons.lookup` and optionally `coupons.report`. It can't submit
codes, moderate, or read anything private, and it isn't an OpenVibe Network session. The extension
refuses to store anything that isn't a `cpx_` token, so a Network JWT can't be pasted in by
mistake. Revoking the token on the site takes effect on its next request, and the popup then says
the browser was disconnected. "Disconnect" in the settings removes the token from the browser.

Because the extension exposes nothing to web pages (no content scripts, no
`externally_connectable`, no web-accessible resources) and holds no first-party credential, a
malicious shop page can't use it to reach anyone's data. The server side of the same guarantee is
covered in Coupons' own tests: lookups are identical for every caller, and the API ignores cookies.

### Layout

```
browser/
  manifest.json          MV3; Chromium (minimum_chrome_version 111) and Firefox (gecko id, strict_min_version 128)
  popup.html / popup.js  DOM wiring only
  options.html / .js     connect (save a checked token), disconnect, grant the API host permission
  lib/config.js          API_ORIGIN — the one origin the extension talks to
  lib/host.js            URL → hostname (everything else dropped)
  lib/api.js             the only code that makes requests
  lib/controller.js      popup logic without the DOM (tested in Node)
  lib/platform.js        chrome.* / browser.*: tabs.query, storage.local, permissions
  lib/format.js          wording ("Expiry unknown", "No restrictions stated", …)
  icons/                 generated by scripts/icons.js
scripts/
  audit.js               the permission audit (manifest, CSP, pages)
  pack.js                zip for loading or store review (runs the audit first)
  icons.js               draws the icons (no dependencies)
```

## Tests (Node 22, no browser, no dependencies)

```bash
npm test
```

| Requirement | Test |
|---|---|
| The manifest permission audit fails if anything widens: extra permissions, `<all_urls>` or broader hosts, content scripts, a background worker, web-accessible resources, `externally_connectable`, optional permissions, `unsafe-eval`, remote script or connect sources, MV2. The API origin agrees across config, host permission and CSP. Pages have no inline or remote script. The code never uses cookies, scripting, dynamic code, HTML injection or `storage.sync`, and only `lib/api.js` fetches. | `test/manifest.test.js` |
| API client against a stub: routes; no `Authorization` without a token; never cookies, referrers or redirects; errors as codes (revoked, scope, 429, 503); timeouts; refused input. | `test/api-client.test.js` |
| The extension never sends page content or URLs beyond the hostname. The popup controller runs on checkout URLs full of personal data, and every request the stub receives is inspected. Non-shop pages send nothing. Only `tabs.query` and `storage.local` are touched. Only `cpx_` tokens are stored. | `test/privacy.test.js` |
| `scripts/pack.js`: the zip is exactly `browser/`, audited and reproducible. A development build rewrites the origin in all three places. Remote `http` origins are refused. | `test/pack.test.js` |

Beyond the automated tests, this was checked by hand on 2026-09-22:

- Headless Chrome 150, loaded through CDP `Extensions.loadUnpacked`, accepted the manifest and
  rendered both pages with no console errors or CSP violations.
- A development build then called a local OpenVibe.Coupons (its test harness) with no CORS
  configured. It resolved a shop, listed its code, and posted a report with a `cpx_` token. The
  report was stored with channel `extension`.

That check is not in CI. Firefox hasn't been tried.

## Packing (never published from here)

```bash
npm run pack                        # dist/openvibe-coupons-helper-<version>.zip  (API https://openvibe.coupons)
node scripts/pack.js --api http://localhost:4850   # dist/…-dev.zip for a local Coupons (localhost/127.0.0.1 or https only)
```

To load it:

- **Chromium:** `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and pick the
  unzipped folder.
- **Firefox:** `about:debugging`, "This Firefox", "Load Temporary Add-on", and pick
  `manifest.json`.

In Firefox, host permissions for MV3 extensions can be withheld. If they are, the settings page
shows "Allow access to openvibe.coupons".

## Before a store release (for the lead)

1. **Deploy OpenVibe.Coupons** (see its README). The release build only talks to
   `https://openvibe.coupons`.
2. **Store listings:** submit the zip to the Chrome Web Store and addons.mozilla.org. The privacy
   disclosure is the table above: the hostname of the active tab, only on open, sent to
   openvibe.coupons. `browser_specific_settings.gecko.data_collection_permissions` declares
   `browsingActivity`. Check it against AMO's requirements at submission time.
3. **CORS (optional):** set `COUPONS_EXTENSION_ORIGINS` on Coupons to the Chrome Web Store id
   (`chrome-extension://<id>`) and, if wanted, `moz-extension://*`. The extension doesn't need it,
   because its host permission covers the API. CORS only helps when a browser withholds that
   permission, and only for lookups.
4. **Version:** bump `browser/manifest.json` for every store upload. Stores refuse a version
   they've already seen.

## Depends on

- [OpenVibe.Coupons](https://github.com/OpenVibers/OpenVibe.Coupons) public API:
  - `GET /api/v1/merchants/resolve?host=`
  - `GET /api/v1/merchants/:id/coupons`
  - `POST /api/v1/coupons/:id/report`
  - `cpx_` install tokens from `/connect-extension`
- No npm dependencies. Tests and scripts use Node's standard library.

---

Part of the [OpenVibe network](https://openvibe.network). Built in the open by [OpenVibers](https://github.com/OpenVibers).
