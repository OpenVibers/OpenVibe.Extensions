# Store listing: OpenVibe Companion

Copy these fields into the Chrome Web Store developer dashboard and addons.mozilla.org (AMO).
The upload files come from `npm run pack:stores`: `dist/openvibe-companion-<version>-chrome.zip`
and `dist/openvibe-companion-<version>-firefox.zip`. The privacy and permission answers are in
[privacy.md](privacy.md), the screenshots in [screenshots.md](screenshots.md).

| Field | Value |
|---|---|
| Name | OpenVibe Companion |
| Category | Chrome Web Store: **Shopping**. AMO: **Shopping** |
| Language | English |
| Homepage | https://openvibe.coupons/companion |
| Support URL | https://openvibe.coupons/companion |
| Source code (AMO "source code" question) | Not needed: no minifier, bundler or generated code. The zip is `browser/` as written, and https://github.com/OpenVibers/OpenVibe.Extensions is public (MIT). |
| License (AMO) | MIT |
| Firefox add-on id | `companion@openvibe.network` (from `browser_specific_settings.gecko.id`) |
| Minimum versions | Chrome 111, Firefox 128 |

## Short description

Chrome Web Store "summary" (132 characters at most; this is 125):

> Coupon codes for the shop you are on, tried when you ask, plus one-click hand-offs to OpenVibe Rent, Watch, Food and Reviews.

AMO "summary" (250 at most): the same sentence.

## Long description

> OpenVibe Companion helps on the page you are already looking at, and only when you open it.
>
> **Coupon codes for this shop.** Open the Companion on a shop and it asks OpenVibe Coupons (openvibe.coupons) for codes for that site, by its hostname only: never the full address, never the page. Press "Try these codes on this page" and the Companion types them into the shop's coupon box one at a time and tells you which ones lowered the total. It never rewrites links and never adds referral tags.
>
> **Tell other shoppers what worked.** If you connect the Companion with an install token from openvibe.coupons, one click reports whether a code worked or failed, so the list stays honest.
>
> **The same restaurant on every delivery app.** On a delivery app, "Compare delivery apps" opens OpenVibe Food with the restaurant's name, so you can see its price on the other apps.
>
> **Save a review site's rating.** On Glassdoor, Indeed, Yelp, the BBB, Trustpilot, Google Maps or Tripadvisor, "Save its rating to OpenVibe Reviews" reads the rating the page states and opens openvibe.reviews to check and save it.
>
> **Keep a listing, watch a page.** "Keep on my Rent board" and "Check the rent" open OpenVibe Rent with the listing's address; "Watch this page" opens OpenVibe Watch to tell you when the page changes.
>
> **What it can see.** The Companion asks for no access to your sites until you open it on a tab (the browser's "active tab" permission). It has no background worker, no content scripts, and no access to your history, cookies or other tabs. Every hand-off opens a tab you can see, and nothing is saved until you save it there. The only thing it stores is the optional install token, on this device.
>
> Open source (MIT): https://github.com/OpenVibers/OpenVibe.Extensions

## Notes for the reviewer

AMO "notes to reviewer" and the Chrome Web Store's test instructions:

> No account is needed. To see codes, open the Companion on any shop that OpenVibe Coupons lists (https://openvibe.coupons shows them). "Try these codes on this page" runs only on a page with a coupon box. The settings page takes an optional `cpx_` install token from https://openvibe.coupons; without it, everything except reporting works.
