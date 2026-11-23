# Astana AR Tour — Release notes, build 0.2.0-pilot

Owner: IT · Prepared 23 Nov 2026 · Final application readiness: 29 Nov 2026 · Project completion: 1 Dec 2026

## Status against the IT delivery cards

### Card 1 — MVP integration (deadline 17 Nov, overdue)

| Completion criterion | Status | Notes |
|---|---|---|
| Recognition of Baiterek, Khan Shatyr and the Main Mosque | **Done (location-based)** | A landmark is recognised when the visitor is within 150 m of its scan spot (GPS accuracy ≤ 75 m) and, on phones with a compass, the camera faces it (±35°). Scan spots are in `js/data.js → recog` and **must be confirmed on site by Tour Operations**. Image-based recognition is not included. |
| Approved English AR scenes | **Blocked (SP-03)** | The app shows draft scene texts. Tester mode marks them `DRAFT (awaiting SP-03)`. When SP-03 arrives: replace the `ar` / `desc` texts and set `CONTENT.arScenesApproved = true`. |
| Navigation | **Done** | Live distance, walking ETA, direction and arrival detection for the next stop. Opens in Google Maps or 2GIS. |
| Saved visit progress | **Done** | Saved on the device. Includes visit times, quests, points and bookings, a state-version migration, and a warning when storage is blocked. Server sync is not included. |
| Usable error and retry states | **Done** | Camera blocked or missing, location blocked / timed out / weak, too far from the scan spot, wrong direction, scan timeout, map tiles offline, booking failure, unexpected screen error. Each one explains the cause and has Retry (and Skip scan in AR). |
| Booking journey testable with Sales | **Done (pending SA-03)** | Includes field validation, the Monday rule for Package 3, a failure state, confirmation with reference, the My bookings list, cancellation, "Copy details for Sales", and TEST-flagged bookings. Bookings stay on the device; there is no backend or payment yet. **SA-03 requirements were not received** — fields and rules may change. |
| CX-03 feedback | **Blocked** | Not received. |

### Card 2 — Stabilisation (deadline 24 Nov)

| Item | Status |
|---|---|
| Critical issues from internal rehearsal (TO-05) | **Blocked** — report not received |
| External usability findings (CX-04, CX-05 prioritised report) | **Blocked** — reports not received |
| Retest affected functions | Automated end-to-end run: **22/22 pass** (see TESTING.md) |
| Publish stable build to the pilot team | **Waiting for decision** — hosting target and go-ahead from the department lead |

### Ownership
The department lead names the individual executor in the shared HR tracker. This was not done in this build.

## How testers use this build
Open the app with `?test=1` (for example `https://<host>/?test=1`), or turn on **Tester mode** on the home screen.
Then pick a simulation (all OK / too far / weak GPS / GPS denied / camera denied / booking fails). This lets you test every state without being in Astana.

## Known limitations
- Coordinates are approximate. The Main Mosque is assumed to be the **Astana Grand Mosque** — confirm this.
- Prices (Finance), guide contacts, the hotline and bus numbers are placeholders.
- Bookings are local to the device. Sales cannot see them centrally — use "Copy details for Sales".
- The compass works only on phones. On desktop the direction check is skipped.
