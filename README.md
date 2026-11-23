# Astana AR Tour — MVP

Mobile-first web app for exploring Astana in two modes: **Independent** (self-guided AR) and **Dependent** (guided tour).
Built from *Product Requirements*, *TOUR.pdf* (Tour Operations Team) and the *MVP Guided Tour Handbook*.

**Live site:** https://mansbusinessacc-bit.github.io/astana-ar-tour/ · tester mode: `?test=1` · user guide (RU): [INSTRUCTION.md](INSTRUCTION.md)

## Run locally

```bash
cd astana-ar-tour
python -m http.server 8000
# open http://localhost:8000
```

- The camera (AR screen) needs `localhost` or **HTTPS**. To test on a phone, deploy the folder to GitHub Pages / Netlify / Vercel (static hosting, no build step).
- Without a camera, the AR screen switches to demo mode automatically.
- The map needs internet (Leaflet + OpenStreetMap tiles).
- Progress is saved in the browser (localStorage). "Reset progress" is on the home screen.

## Screens (Product Requirements §4)

| # | Screen | What it does |
|---|--------|--------------|
| 1 | Homepage | Intro + **Start Tour** |
| 2 | Tour mode | Independent → Screen 3 · Dependent → Screen 9 |
| 3 | Questionnaire | Time (2 h / 3–4 h / full day), interests, transport |
| 4 | Recommendations | Top places for the answers + the 3 ready-made packages ranked |
| 5 | Attraction selection | Map pins + list, tap to select |
| 6 | Map & route | Generated or predefined route, visited/next/unvisited pins, legs with transport and time, lunch zone, LRT bonus, progress bar |
| 7 | Attraction details | Story, historical facts, hours, panorama slots, nearby lunch, directions |
| 8 | AR camera | Rear camera, scan → AR object + story → mini-quest (points), AR photo, "Skip scan" |
| 9 | Guided tours | Package list (guide, duration, price, start times) → details → booking (no Mondays for Package 3) → handbook (checklist, what to bring, FAQ, 112) → start the guided route |
| 10 | Route summary | Visited/remaining, points, km, quests, badges, share |

## Route algorithm (§5: "basic algorithm")
Nearest neighbour from every possible start + 2-opt improvement, then the shortest path is kept.
Transport per leg follows the questionnaire answer (walk ≤ 1.3 km, otherwise bus/LRT/minibus/taxi with estimated times).
Lunch is inserted after the stop where the plan passes ~12:15, using the nearest of the 3 lunch zones.

## Points
Correct answer 10 ★ (try 3 ★) · hidden gem +15 · LRT leg +20 · AR photo +5 · full route +50. Badges at 10 / 50 / 100 / 200 ★.

## To be filled in by the team (placeholders in `js/data.js`)
- `price` for each package (from Finance), guide names/photos/phones, hotline numbers.
- Real photos and panoramas (currently gradient + emoji placeholders).
- Coordinates are approximate, and hours marked "(verify)" need a check on site. Bus numbers come from Tour Operations.
- Real AR (image/marker recognition, e.g. 8th Wall / MindAR / ARCore) replaces the simulated scan in the next iteration.

## Files
- `index.html` — shell
- `css/style.css` — design
- `js/data.js` — landmarks (32 + Nur-Alem), lunch zones, packages, handbook, points
- `js/app.js` — router, screens, recommendations, route generation, AR

## Pilot build 0.2.0
- **Recognition** of Baiterek, Khan Shatyr and the Main Mosque. It is location-based: the visitor must be at the scan spot, and the compass check applies on phones.
- **Live navigation** to the next stop, **saved progress**, and **error + retry** states everywhere.
- **Booking journey** with validation, My bookings, cancellation and "Copy details for Sales".
- **Tester mode** (`?test=1` or the home screen) simulates location and failures, so the app can be tested outside Astana.
- Status against the IT cards and blocked handoffs: [RELEASE_NOTES.md](RELEASE_NOTES.md). Test plan and results: [TESTING.md](TESTING.md). Automated run: `tests/e2e.mjs`.
