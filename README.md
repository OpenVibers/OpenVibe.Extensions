# OpenVibe.Extensions

> OpenVibe's first-party client surfaces: today, the **OpenVibe Companion** browser extension.

**Status:** alpha (roadmap Wave 18, client part). The extension builds, its tests pass, and Chromium
loads the unpacked 0.3.0 build with no console or CSP errors (2026-10-15, Playwright's Chromium: branded Chrome no
longer loads unpacked extensions from the command line). A development build of
the coupon part looked up codes and sent a report against a local OpenVibe.Coupons. Mozilla's
`web-ext lint` (what addons.mozilla.org runs on upload) passes with no errors, warnings or notices
and runs in CI; it hasn't been loaded in a running Firefox yet. It is **not published** to any
store yet: the store zips, listing text and privacy answers are ready (`npm run pack:stores`,
[store/](store/)), and only the owner's developer-account step is left. OpenVibe.Coupons is
public at `https://openvibe.coupons` since 2026-10-09, so the release build talks to the live
Coupons API. On 2026-10-22 Coupons held 169 codes for 16 of its 37 merchants, all from the DealNews feed through
OpenVibe.Sources; it had issued no install token and received no code report.
**Decision record:** [ADR-023](https://github.com/OpenVibers/OpenVibe.Contracts/blob/main/docs/adr/ADR-023-client-surfaces.md) (first-party client surfaces and their home). Roadmap §4.2 D.
**License:** MIT.

## Purpose

Client code ships on a different schedule from servers: store review, browser updates and
per-install permissions. ADR-023 gives clients their own repository.

| Surface | Directory | State |
|---|---|---|
| OpenVibe Companion (Chromium and Firefox, Manifest V3) | `browser/` | alpha, described below (it was the OpenVibe Coupons Helper until 0.2.0) |
| Kiosk companion (Firefox, new-tab and history bridge for the /kiosk page) | `kiosk-companion/` | Moved from OpenVibe.Live `browser-extension/openvibe-kiosk-companion/` (ADR-023, Live 9c5aa64); Live keeps a redirect README |
| Hardware / Raspberry Pi companions (streamer and controller scripts) | `hardware/` | Moved from OpenVibe.Live `hardware/` (ADR-023, Live 9c5aa64); Live keeps a redirect README |
| Desktop client | — | Planned by ADR-023 for the long term. Nothing exists. |

## The OpenVibe Companion (`browser/`)

One button in the browser for the OpenVibe sites that work with the page you are on:

- **Keep on my Rent board.** On a rental listing (Craigslist, Facebook Marketplace, Zillow,
  Apartments.com, Zumper, Airbnb and the rest) or any page, it opens
  [openvibe.rent/board](https://openvibe.rent/board) with the listing's address and title filled in,
  so every listing from every site sits in one list with your notes and how far you got. On a rental
  site this is the main button.
- **Check the rent.** On a rental listing it opens [openvibe.rent/fair](https://openvibe.rent/fair) with the listing's
  address and title: Rent reads the monthly rent, the bedrooms and the city from them (and says which it read), and
  compares the rent with the city's median for that size from the Census Bureau. Nothing is read from the page itself.
- **Watch this page.** It opens a new watch on [OpenVibe.Watch](https://openvibe.watch) for the page,
  which tells you (or runs your agent) when it changes.
- **Compare delivery apps.** On DoorDash, Uber Eats, Grubhub, Seamless, Caviar or Instacart it opens
  [openvibe.food/delivery](https://openvibe.food/delivery) with the restaurant or store's name (read from the page
  title, never the address or the cart), and every app's own search for it opens from there.
- **Save its rating to OpenVibe Reviews.** On Glassdoor, Indeed, Yelp, the BBB, Trustpilot, Google Maps or
  Tripadvisor, it reads the rating the page states (the structured data the site publishes for search engines, else
  the stars' own label, like "4.5 star rating") and opens [openvibe.reviews/save](https://openvibe.reviews/save) with
  the page's address, its name and the numbers. You check them against the page there and save; the rating then shows
  beside that site's link on the OpenVibe.Reviews page, with the date. On a review site this is the main button.
- **Try these codes on this page.** At a shop's cart or checkout, one button types the codes OpenVibe.Coupons knows
  into the page's own coupon box, presses that box's Apply button, and reads the order total before and after. It
  stops at the first code that lowers the total and leaves it applied. Codes reported working go first, codes
  reported not working are never tried, and at most ten are tried. It never presses checkout, pay, order, cart or
  remove buttons, never submits a form and never presses Enter. With no Apply button next to the box it presses
  nothing. If you connected the extension, you can send what happened to OpenVibe.Coupons in one click.
- **Coupon codes.** On a shop's website it shows the codes
  [OpenVibe.Coupons](https://github.com/OpenVibers/OpenVibe.Coupons) knows for that shop:

- the code, with a Copy button
- its status (validity unknown, reported working, reported not working)
- its confidence, or "no reports", and its expiry, or "Expiry unknown"
- its restrictions, or "No restrictions stated"
- how to apply it

If you connected the extension, you can report whether a code worked. The codes are shown to copy;
the Companion never rewrites links or adds referral tags.

### What it can see, and what it sends

| | |
|---|---|
| **Permissions** | `activeTab`, `scripting` and `storage`. The host permission is `https://openvibe.coupons/*` only. `scripting` is used for two buttons: "Try these codes on this page" injects the packaged `lib/autoapply.js`, and "Save its rating to OpenVibe Reviews" injects `lib/rating.js`, into the active tab (the access `activeTab` gives after you press the button), in its top frame and the extension's isolated world. |
| **Not requested** | `<all_urls>`, `tabs`, `cookies`, `webRequest`, `history`, optional permissions, content scripts, a background worker, web-accessible resources, `externally_connectable`. |
| **Read from the page** | The active tab's **URL and title**, when you open the popup (that's what `activeTab` grants). The page's content only when you press "Try these codes on this page": `lib/autoapply.js` finds the coupon box, its Apply button and the order total, types the codes in, and returns to the popup which codes changed the total. It makes no request, reads no cookies or storage, and sends nothing anywhere; `test/manifest.test.js` scans it for that. On a review site, "Save its rating to OpenVibe Reviews" runs `lib/rating.js`, which only reads: the page's name, its rating, the scale, how many ratings, and the city from its structured data. Browser pages, files, IP addresses and local names are "not a site", and nothing is sent or offered for them. |
| **Sent by the extension** | To `https://openvibe.coupons` only, and only the **hostname** (`lib/host.js` drops the path, query, fragment, port and credentials first): `GET /api/v1/merchants/resolve?host=`, the merchant id (`GET /api/v1/merchants/:id/coupons`), and, when you report, the code id plus `worked` or `failed` with an optional reason. Every request goes with `credentials: 'omit'` (no cookies), `referrerPolicy: 'no-referrer'` and `redirect: 'error'`. |
| **Hand-offs (only when you press the button)** | "Keep on my Rent board", "Check the rent", "Watch this page", "Compare delivery apps" and "Save its rating to OpenVibe Reviews" open **a new tab you see** on `https://openvibe.rent/board`, `https://openvibe.rent/fair`, `https://openvibe.watch/watches/new`, `https://openvibe.food/delivery` or `https://openvibe.reviews/save`, with the page's address and title (and, for Reviews, the rating read from it) in that tab's address. `lib/handoff.js` removes the credentials, the fragment and tracking parameters (`utm_*`, `fbclid`, `gclid`, …) first. The extension makes no request for it, nothing opens on its own, and nothing is saved until you save it on that site. `platform.tabs.open()` refuses any other origin, and the permission audit allows only `https://openvibe.<tld>` hand-off origins. |
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
  lib/config.js          API_ORIGIN (the one origin it sends requests to); HANDOFF_ORIGINS (Rent, Watch, Food, Reviews)
  lib/host.js            URL → hostname (everything else dropped)
  lib/handoff.js         the Rent board, Watch, Food delivery and Reviews addresses, built from a cleaned URL; which sites are rentals and review sites
  lib/autoapply.js       "Try these codes on this page": injected into the active tab only when you press it
  lib/rating.js          "Save its rating to OpenVibe Reviews": reads a review site's rating, injected only when you press it
  lib/api.js             the only code that makes requests
  lib/controller.js      popup logic without the DOM (tested in Node)
  lib/platform.js        chrome.* / browser.*: tabs.query, tabs.create (hand-off pages only), storage.local, permissions
  lib/format.js          wording ("Expiry unknown", "No restrictions stated", …)
  icons/                 generated by scripts/icons.js
scripts/
  audit.js               the permission audit (manifest, CSP, pages)
  pack.js                zip for loading, or --stores: the Chrome and Firefox store zips (runs the audit first)
  check-autoapply.js     lib/autoapply.js on test/fixtures/checkout-*.html in headless Chrome (CDP, no dependencies)
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
| The hand-offs: nothing opens when the popup opens; a button opens one tab on openvibe.rent or openvibe.watch with the cleaned address (no credentials, fragment or tracking parameters); the Coupons API still gets the hostname only; `tabs.open` refuses other origins; rental sites lead with the board. | `test/handoff.test.js` |
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
npm run pack                        # dist/openvibe-companion-<version>.zip  (API https://openvibe.coupons)
npm run pack:stores                 # dist/openvibe-companion-<version>-chrome.zip and -firefox.zip (store uploads)
npm run lint:firefox                # Mozilla web-ext lint, warnings as errors (CI runs it)
node scripts/pack.js --api http://localhost:4850   # dist/…-dev.zip for a local Coupons (localhost/127.0.0.1 or https only)
```

Each version's zip is attached to its [GitHub release](https://github.com/OpenVibers/OpenVibe.Extensions/releases/latest).
To load it:

- **Chromium:** `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and pick the
  unzipped folder.
- **Firefox:** `about:debugging`, "This Firefox", "Load Temporary Add-on", and pick
  `manifest.json`.

In Firefox, host permissions for MV3 extensions can be withheld. If they are, the settings page
shows "Allow access to openvibe.coupons".

## Before a store release (for the lead)

1. **OpenVibe.Coupons is already public** (see its README; live at `https://openvibe.coupons` since
   2026-10-09). The release build only talks to `https://openvibe.coupons`.
2. **Store listings:** `npm run pack:stores` builds `dist/openvibe-companion-<version>-chrome.zip`
   (no `browser_specific_settings`) and `-firefox.zip` (no `minimum_chrome_version`), byte for byte
   reproducible. Upload them with the fields in [store/listing.md](store/listing.md), the single
   purpose, permission justifications and data disclosures in [store/privacy.md](store/privacy.md)
   (written from the code; `browser_specific_settings.gecko.data_collection_permissions` declares
   `authenticationInfo`, `browsingActivity` and `websiteContent` to match), and the shots in
   [store/screenshots.md](store/screenshots.md). Never upload from CI.
3. **CORS (optional):** set `COUPONS_EXTENSION_ORIGINS` on Coupons to the Chrome Web Store id
   (`chrome-extension://<id>`) and, if wanted, `moz-extension://*`. The extension doesn't need it,
   because its host permission covers the API. CORS only helps when a browser withholds that
   permission, and only for lookups.
4. **Version:** bump `browser/manifest.json` for every store upload. Stores refuse a version
   they've already seen.

## Depends on

- [OpenVibe.Rent](https://github.com/OpenVibers/OpenVibe.Rent) `/board?url=&title=` and
  [OpenVibe.Watch](https://github.com/OpenVibers/OpenVibe.Watch) `/watches/new?template=page&url=&name=`
  (pages, not APIs: the person signs in there as usual).
- [OpenVibe.Coupons](https://github.com/OpenVibers/OpenVibe.Coupons) public API:
  - `GET /api/v1/merchants/resolve?host=`
  - `GET /api/v1/merchants/:id/coupons`
  - `POST /api/v1/coupons/:id/report`
  - `cpx_` install tokens from `/connect-extension`
- No npm dependencies. Tests and scripts use Node's standard library.

---

Part of the [OpenVibe network](https://openvibe.network). Built in the open by [OpenVibers](https://github.com/OpenVibers).
