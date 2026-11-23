# Test plan — build 0.2.0-pilot

## A. Automated end-to-end run (headless Edge, fake camera, tester mode) — 23 Nov 2026: 22/22 PASS

| # | Check | Result |
|---|---|---|
| 1 | Home renders in tester mode | PASS |
| 2 | Recognition: "ready" hint at the scan spot | PASS |
| 3 | Baiterek recognised → AR scene | PASS |
| 4 | Live camera starts | PASS |
| 5 | Quest answered, points saved | PASS |
| 6 | Too far: distance shown | PASS |
| 7 | Too far: fail sheet with Retry / Navigate / Skip | PASS |
| 8 | Skip scan still unlocks story + quest | PASS |
| 9 | GPS denied: explained, Retry | PASS |
| 10 | Camera denied: banner, Retry, fallback | PASS |
| 11 | Navigation: live distance + ETA | PASS |
| 12 | Navigation: arrival detected → AR | PASS |
| 13 | Progress survives page reload | PASS |
| 14 | Booking: Monday blocked (Package 3) | PASS |
| 15 | Booking: name / phone validation | PASS |
| 16 | Booking: failure state with Retry | PASS |
| 17 | Booking: confirmed, TEST-flagged, saved | PASS |
| 18 | Booking → guided route starts | PASS |
| 19 | Booking: cancel clears the guided route | PASS |
| 20 | My bookings list | PASS |
| 21 | Smoke: every screen opens | PASS |
| 22 | No JavaScript exceptions | PASS |

## B. Sales booking script (any phone or laptop, ~10 min)
1. Open the app with `?test=1` → Start Tour → Dependent Tour → *History and Independence* → View tour & book.
2. Pick a **Monday** → the app blocks it. Pick a Tuesday.
3. Tap Confirm with empty fields → name and phone errors appear.
4. Enter a name and `+7 701 123 45 67` → booking confirmed with reference `AT-…` and a TEST label.
5. Tap **Copy details for Sales** → paste the details into the Sales channel.
6. Home → My bookings → open the booking → **Cancel booking** → status becomes Cancelled.
7. Home → Tester mode → Simulate "Booking request fails" → book again → error state + Retry, and no booking is created.
8. Record any field or rule that differs from SA-03.

## C. On-site checks (Tour Operations / IT, in Astana, real phone, no tester mode)
For each of **Baiterek, Khan Shatyr, Main Mosque**:
- Stand at the scan spot → the hint says "Ready" → Scan → recognised within 2–5 s.
- Stand 300 m away → "You are … from the scan spot" → Navigate opens maps.
- Face away from the landmark (phone with a compass) → "Turn left/right".
- Deny location → message + Retry. Deny the camera → banner + Retry.
- Record the GPS accuracy you see. If the scan spot is wrong, send the corrected lat/lng to IT.

## D. Regression after CX-04 / CX-05 / TO-05 fixes
Re-run A: `python -m http.server 8768` in this folder, then `node tests/e2e.mjs <temp folder>` (needs Edge), plus section B or C for the functions each fix touched.

## E. Re-run on the live site (GitHub Pages, HTTPS) — 23 Nov 2026: 26/26 PASS
The 22 checks above plus 4 regression checks for this build:
- the Progress page without a route shows an empty state;
- AR opened from a direct link: Close stays on the site;
- a phone number in `8 7XX…` format is accepted;
- desktop website layout: the header is visible and the map is in split view.

Command: `BASE=https://mansbusinessacc-bit.github.io/astana-ar-tour/index.html node tests/e2e.mjs <temp folder>`
