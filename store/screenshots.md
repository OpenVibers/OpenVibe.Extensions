# Screenshot plan: OpenVibe Companion

Chrome Web Store: 1 to 5 screenshots, 1280×800 (or 640×400), PNG or JPEG, no alpha; a 440×280
small promo tile. AMO: any size up to 2400×1800, ideally the same 1280×800 shots. Take them from
the release build (`npm run pack:stores`, loaded unpacked) on real pages, with no personal data
in the address bar or the page.

| # | Shows | Page | Caption |
|---|---|---|---|
| 1 | The popup open on a shop with codes listed | a shop OpenVibe Coupons lists | Coupon codes for the shop you are on |
| 2 | "Try these codes on this page" finished: which code lowered the total | the same shop's cart, coupon box visible | Tried in the coupon box when you ask |
| 3 | The popup on a review site, the "Save its rating to OpenVibe Reviews" button | a Trustpilot or Yelp business page | Save a review site's rating |
| 4 | The popup on a rental listing, "Keep on my Rent board" and "Check the rent" | a rental listing page | Keep a listing, check the rent |
| 5 | The settings page with the token field empty | `options.html` | No account needed; connect only to report |

Small promo tile (440×280): the 128 px icon on the OpenVibe blue, the name, and "Coupon codes,
tried when you ask".

Headless capture works for the popup and settings pages only (a popup can't be opened over a
real tab headless, so shots 1 to 4 are a person's screen captures, cropped to 1280×800).
