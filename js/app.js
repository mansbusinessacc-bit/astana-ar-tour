/* =========================================================
   Astana AR Tour — pilot build
   Screens (Product Requirements §4):
   1 Home · 2 Mode · 3 Questionnaire · 4 Recommendations · 5 Selection
   6 Map & Route · 7 Attraction details · 8 AR camera · 9 Guided tour · 10 Summary
   ========================================================= */

const LM = Object.fromEntries(LANDMARKS.map(l => [l.id, l]));
const PK = Object.fromEntries(PACKAGES.map(p => [p.id, p]));
const STORE_KEY = "astanaArTour.v1";
const STATE_VERSION = 2;
const TIME_BUDGET = { "2": 120, "3-4": 240, "full": 480 };
const MAX_STOPS = { "2": 3, "3-4": 5, "full": 8 };
const START_MIN = 10 * 60; // all example routes start at 10:00
const ARRIVE_M = 40;        // navigation: "arrived" radius
const MAX_GPS_ACC_M = 75;   // recognition: worse accuracy than this = weak signal
const SCAN_TIMEOUT_MS = 12000;

/* Tester-mode simulations (lets Sales/QA test every state without being in Astana) */
const SIMS = {
  ok: "Everything works (at the scan spot)",
  far: "Too far from the scan spot",
  weak: "Weak GPS signal",
  gpsDenied: "Location permission denied",
  camDenied: "Camera permission denied",
  bookingFail: "Booking request fails",
};

/* ---------------- State ---------------- */
const freshState = () => ({
  v: STATE_VERSION,
  answers: { time: "3-4", interests: ["All"], transport: "foot" },
  selected: [], route: [], visited: {}, quest: {}, awarded: {},
  points: 0, tour: null, bookings: [],
  settings: { testMode: false, sim: "ok" },
});
let storageOK = true;
let S = loadState();
function loadState() {
  let st = freshState();
  try {
    localStorage.setItem("__probe", "1"); localStorage.removeItem("__probe");
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) st = migrate({ ...freshState(), ...JSON.parse(raw) });
  } catch (e) { storageOK = false; }
  const q = new URLSearchParams(location.search);
  if (q.get("test") === "1") st.settings.testMode = true;
  return st;
}
function migrate(st) {
  // v1 → v2: single booking became a list; visited flags became timestamps-compatible
  if (st.booking && !(st.bookings || []).length) st.bookings = [{ ...st.booking, status: "confirmed", createdAt: Date.now() }];
  delete st.booking;
  st.settings = { testMode: false, sim: "ok", ...(st.settings || {}) };
  st.v = STATE_VERSION;
  return st;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); storageOK = true; }
  catch (e) { if (storageOK) toast("⚠️ Progress can't be saved on this device"); storageOK = false; }
  updatePoints();
}

/* ---------------- Helpers ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const go = (hash) => { location.hash = hash; };
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
const km = (x) => x < 1 ? `${Math.round(x * 1000)} m` : `${x.toFixed(1)} km`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function haversine(a, b) {
  const R = 6371, toR = (d) => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const pathKm = (a, b) => haversine(a, b) * 1.3; // street factor
function bearing(a, b) {
  const toR = d => d * Math.PI / 180, toD = r => r * 180 / Math.PI;
  const y = Math.sin(toR(b.lng - a.lng)) * Math.cos(toR(b.lat));
  const x = Math.cos(toR(a.lat)) * Math.sin(toR(b.lat)) - Math.sin(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.cos(toR(b.lng - a.lng));
  return (toD(Math.atan2(y, x)) + 360) % 360;
}
const compass = (deg) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(deg / 45) % 8];
const mapsLink = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
const gisLink = (p) => `https://2gis.kz/astana/geo/${p.lng},${p.lat}`;

function catColor(l) { return CATEGORIES[l.cats[0]]?.color || "#4338ca"; }
function thumbBg(l) { const c = catColor(l); return `background: linear-gradient(135deg, ${c}22, ${c}55);`; }
function heroBg(l) { const c = catColor(l); return `background: radial-gradient(circle at 70% 30%, ${c}cc, #2d1b8f 75%);`; }
function chips(l, max = 3) {
  return l.cats.slice(0, max).map(c => `<span class="chip" style="background:${CATEGORIES[c].color}18;color:${CATEGORIES[c].color}">${CATEGORIES[c].label}</span>`).join("");
}
function badges(l) {
  let b = "";
  if (l.recog) b += `<span class="chip badge-ok">AR recognition</span>`;
  if (l.indoor) b += `<span class="chip badge-ok">Indoor · warm-up</span>`;
  if (l.viewOnly) b += `<span class="chip">Exterior view</span>`;
  if (l.lesserKnown) b += `<span class="chip badge-warn">Hidden gem +${POINTS.lesserKnown}</span>`;
  if (l.far) b += `<span class="chip badge-warn">Out of town</span>`;
  return b;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function updatePoints() { const el = $("#pointsVal"); if (el) el.textContent = S.points; }
function award(key, pts, label) {
  if (S.awarded[key]) return 0;
  S.awarded[key] = true; S.points += pts; save();
  toast(`+${pts} ★ ${label}`);
  return pts;
}

/* ---------------- Sensors: location & compass (with tester simulation) ---------------- */
let geoWatch = null, orientHandler = null;
const timers = new Set();
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
const every = (fn, ms) => { const id = setInterval(fn, ms); timers.add(id); return id; };
const stopTimer = (id) => { clearTimeout(id); clearInterval(id); timers.delete(id); };

/* Watches position. In tester mode the position is simulated around `target`. */
let simIds = [];
function watchPosition(onPos, onErr, target, approach) {
  stopGeo();
  if (S.settings.testMode) {
    const sim = S.settings.sim;
    const t = (fn, ms) => simIds.push(later(fn, ms));
    if (sim === "gpsDenied") return t(() => onErr({ code: 1 }), 600);
    if (sim === "weak") return t(() => onPos({ ...target, acc: 160 }), 600);
    if (sim === "far" || approach) {
      // start ~600 m south; when "approach" is on, walk towards the target
      let k = 1;
      const step = () => onPos({ lat: target.lat - 0.0054 * k, lng: target.lng, acc: 9 });
      t(step, 500);
      if (approach && sim !== "far") simIds.push(every(() => { k = Math.max(0, k - 0.18); step(); }, 1500));
      return;
    }
    return t(() => onPos({ ...target, acc: 8 }), 600);
  }
  if (!navigator.geolocation) return later(() => onErr({ code: "unsupported" }), 0);
  geoWatch = navigator.geolocation.watchPosition(
    p => onPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
    e => onErr(e),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
}
function stopGeo() {
  simIds.forEach(stopTimer); simIds = [];
  if (geoWatch !== null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
}
function geoErrText(e) {
  if (e.code === 1) return ["Location access is blocked", "Allow location for this site in the browser settings (🔒 in the address bar), then tap Retry."];
  if (e.code === 3) return ["GPS signal timed out", "Move to an open space and tap Retry."];
  if (e.code === "unsupported") return ["Location is not available on this device", "You can still use Skip scan."];
  return ["Location unavailable", "Check that GPS / location services are on, then tap Retry."];
}
/* Compass heading. iOS needs permission from a tap; desktop usually has no compass (→ null). */
async function startHeading(onHeading) {
  stopHeading();
  if (S.settings.testMode) return false;
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      if (await DeviceOrientationEvent.requestPermission() !== "granted") return false;
    }
  } catch (e) { return false; }
  orientHandler = (e) => {
    const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? (360 - e.alpha) % 360 : null);
    if (h != null) onHeading(h);
  };
  window.addEventListener("deviceorientationabsolute", orientHandler);
  window.addEventListener("deviceorientation", orientHandler);
  return true;
}
function stopHeading() {
  if (!orientHandler) return;
  window.removeEventListener("deviceorientationabsolute", orientHandler);
  window.removeEventListener("deviceorientation", orientHandler);
  orientHandler = null;
}

/* ---------------- Recommendation engine (Screen 3 → 4) ---------------- */
function wantedCats(a) { return a.interests.includes("All") ? Object.keys(CATEGORIES) : a.interests; }
function recommend(a) {
  const want = wantedCats(a);
  const scored = LANDMARKS
    .filter(l => a.time === "full" || !l.far)
    .map(l => {
      const match = l.cats.filter(c => want.includes(c) && c !== "All");
      let s = match.length * 2 + (l.cats.includes("All") ? 1.5 : 0) - l.n * 0.02;
      if (l.isLRT) s += (a.transport === "lrt" || a.transport === "mixed") ? 2 : (a.transport === "foot" ? -3 : 0);
      if (a.transport === "foot" && l.zone === null) s -= 1;
      return { l, s, match };
    })
    .filter(x => x.match.length > 0 || x.l.cats.includes("All"))
    .sort((x, y) => y.s - x.s);
  if (!scored.length) return { picked: [], matching: [] };
  const radius = a.transport === "foot" ? 2.2 : a.time === "full" ? 99 : 7;
  const seed = scored[0].l, picked = [];
  for (const x of scored) {
    if (picked.length >= MAX_STOPS[a.time]) break;
    if (haversine(seed, x.l) <= radius) picked.push(x);
  }
  return { picked, matching: scored };
}
function rankPackages(a) {
  const want = wantedCats(a);
  return PACKAGES.map(p => {
    let s = p.cats.filter(c => want.includes(c)).length;
    const fits = p.hours * 60 <= TIME_BUDGET[a.time] + 60;
    if (fits) s += 2;
    if (a.transport === "foot" && p.transport.startsWith("Walk")) s += 1;
    if ((a.transport === "lrt" || a.transport === "mixed") && p.transport.includes("LRT")) s += 1;
    return { p, s, fits };
  }).sort((x, y) => y.s - x.s);
}

/* ---------------- Route generation (§5: basic algorithm) ----------------
   Nearest neighbour from every start point + 2-opt, keep the shortest. */
function routeLength(ids) { let d = 0; for (let i = 1; i < ids.length; i++) d += haversine(LM[ids[i - 1]], LM[ids[i]]); return d; }
function buildRoute(ids) {
  if (ids.length <= 2) return [...ids];
  let best = null, bestLen = Infinity;
  for (const start of ids) {
    const rest = ids.filter(x => x !== start), path = [start];
    while (rest.length) {
      const last = LM[path[path.length - 1]];
      let bi = 0, bd = Infinity;
      rest.forEach((id, i) => { const d = haversine(last, LM[id]); if (d < bd) { bd = d; bi = i; } });
      path.push(rest.splice(bi, 1)[0]);
    }
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < path.length - 1; i++) for (let k = i + 1; k < path.length; k++) {
        const cand = [...path.slice(0, i), ...path.slice(i, k + 1).reverse(), ...path.slice(k + 1)];
        if (routeLength(cand) + 1e-9 < routeLength(path)) { path.splice(0, path.length, ...cand); improved = true; }
      }
    }
    const len = routeLength(path);
    if (len < bestLen) { bestLen = len; best = path; }
  }
  return best;
}
function computeLeg(a, b, transport) {
  const d = pathKm(a, b);
  const walk = { mode: "walk", icon: "🚶", label: "Walk", min: Math.max(2, Math.round(d / 4.5 * 60)) };
  if (d <= 1.3) return { ...walk, d };
  const modes = {
    bus:     { mode: "bus", icon: "🚌", label: "City bus (number to be confirmed by Tour Ops)", min: Math.round(d / 18 * 60 + 8) },
    lrt:     { mode: "lrt", icon: "🚈", label: "LRT Tarlan Astana + short walk", min: Math.round(d / 30 * 60 + 9) },
    minibus: { mode: "minibus", icon: "🚐", label: "Minibus transfer", min: Math.round(d / 28 * 60 + 4) },
    taxi:    { mode: "taxi", icon: "🚕", label: "Taxi (recommended for this distance)", min: Math.round(d / 28 * 60 + 5) },
  };
  let m;
  switch (transport) {
    case "foot": m = d > 3 ? modes.taxi : walk; break;
    case "bus": m = modes.bus; break;
    case "lrt": m = d > 2.5 ? modes.lrt : modes.bus; break;
    case "minibus": m = modes.minibus; break;
    default: m = d > 4 ? modes.lrt : modes.bus;
  }
  return { ...m, d };
}
function nearestZone(l) { return Object.values(LUNCH_ZONES).map(z => ({ z, d: pathKm(l, z) })).sort((a, b) => a.d - b.d)[0]; }
function buildPlan() {
  const items = [];
  const pkg = S.tour?.packageId ? PK[S.tour.packageId] : null;
  let totalKm = 0;
  if (pkg) {
    pkg.timeline.forEach(it => items.push({ ...it, time: it.t }));
    for (let i = 1; i < S.route.length; i++) totalKm += pathKm(LM[S.route[i - 1]], LM[S.route[i]]);
    return { items, totalKm, endMin: null, pkg };
  }
  let t = START_MIN;
  let lunchDone = S.answers.time === "2" || S.route.length < 3;
  S.route.forEach((id, i) => {
    const l = LM[id];
    items.push({ type: "stop", id, time: `${fmt(t)}–${fmt(t + l.visitMin)}` });
    t += l.visitMin;
    const next = S.route[i + 1];
    if (!lunchDone && next && t >= 12 * 60 + 15) {
      const nz = nearestZone(l);
      items.push({ type: "lunch", zone: nz.z.id, dist: nz.d, time: `${fmt(t + 10)}–${fmt(t + 55)}` });
      t += 55; lunchDone = true;
    }
    if (next) {
      const leg = computeLeg(l, LM[next], S.answers.transport);
      totalKm += leg.d; t += leg.min;
      items.push({ type: "leg", ...leg });
    }
  });
  return { items, totalKm, endMin: t, pkg: null };
}

/* ---------------- Visit / quest logic ---------------- */
function markVisited(id, silent) {
  if (S.visited[id]) return;
  S.visited[id] = Date.now();
  const l = LM[id];
  save();
  if (l.lesserKnown) award(`gem:${id}`, POINTS.lesserKnown, "Hidden gem visited");
  else if (!silent) toast(`✓ ${l.name} visited · progress saved`);
  if (l.isLRT) award("lrt", POINTS.lrt, "LRT leg bonus");
  checkFinish();
}
function checkFinish() {
  if (S.route.length && S.route.every(id => S.visited[id])) later(() => award("finish", POINTS.finish, "Full route complete!"), 900);
}
const nextStop = () => S.route.find(id => !S.visited[id]);

/* ---------------- Router ---------------- */
let map = null, camStream = null;
function cleanup() {
  if (map) { map.remove(); map = null; }
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  stopGeo(); stopHeading();
  timers.forEach(id => { clearTimeout(id); clearInterval(id); }); timers.clear();
}

const SCREENS = {
  home:    { n: 1, title: "Astana AR Tour", render: Home, back: false, bar: false },
  mode:    { n: 2, title: "Choose tour mode", render: Mode },
  quiz:    { n: 3, title: "Questionnaire", render: Quiz },
  recs:    { n: 4, title: "Personalized recommendations", render: Recs },
  select:  { n: 5, title: "Select attractions", render: Select },
  map:     { n: 6, title: "Map & route", render: RouteMap },
  place:   { n: 7, title: "Attraction details", render: Place },
  ar:      { n: 8, title: "AR camera", render: AR, bar: false },
  guided:  { n: 9, title: "Guided tours", render: Guided },
  booking: { n: 9, title: "Your booking", render: Booking },
  summary: { n: 10, title: "Route summary", render: Summary },
};

function router() {
  cleanup();
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const scr = SCREENS[name] || SCREENS.home;
  const view = $("#view");
  view.scrollTop = 0;
  document.body.classList.toggle("test-mode", !!S.settings.testMode);
  document.body.dataset.screen = SCREENS[name] ? name : "home";
  document.body.dataset.arg = arg ? "1" : "";
  $$("#siteNav [data-nav]").forEach(a => a.classList.toggle("is-on", a.dataset.nav === (name === "recs" || name === "select" ? "quiz" : name === "booking" ? "guided" : name)));
  $("#topbar").classList.toggle("is-hidden", scr.bar === false);
  $("#backBtn").classList.toggle("is-hidden", scr.back === false);
  $("#screenTag").textContent = `Screen ${scr.n}`;
  $("#screenTitle").textContent = scr.title;
  updatePoints();
  try { scr.render(view, arg && decodeURIComponent(arg)); }
  catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty"><div class="big">😕</div><h2>Something went wrong</h2>
      <p style="margin:8px 0 18px">This screen could not be opened. Your progress is saved.</p>
      <div class="btn-row" style="max-width:320px;margin:0 auto"><button class="btn btn--ghost" id="errHome">Home</button><button class="btn" id="errRetry">Retry</button></div>
      <p class="small muted" style="margin-top:14px">Build ${APP_VERSION} · ${esc(e.message)}</p></div>`;
    $("#errHome").onclick = () => go("#/home");
    $("#errRetry").onclick = router;
  }
}
/* In-app history: Back never leaves the site, even when a page was opened from a direct link */
const navStack = [location.hash || "#/home"];
window.addEventListener("hashchange", () => {
  const h = location.hash;
  if (navStack.length > 1 && navStack[navStack.length - 2] === h) navStack.pop(); else navStack.push(h);
  router();
});
function goBack(fallback = "#/home") { navStack.length > 1 ? history.back() : go(fallback); }
$("#backBtn").addEventListener("click", () => goBack());
window.addEventListener("offline", () => toast("📴 You are offline — saved progress stays on the device"));
window.addEventListener("online", () => toast("🌐 Back online"));

/* =========================================================
   Screen 1 — Homepage (+ tester panel)
   ========================================================= */
function Home(v) {
  const active = S.route.length > 0;
  const done = S.route.filter(id => S.visited[id]).length;
  const tm = S.settings.testMode;
  v.innerHTML = `
    <section class="hero">
      <div class="hero__shapes"><i></i><i></i><i></i></div>
      <div class="hero__kicker">Self-guided · Guided · AR</div>
      <h1>Astana AR Tour</h1>
      <p class="hero__lead">Explore the capital on your own schedule or with a guide: a personal route, an interactive map and an AR quest with points.</p>
      <div class="hero__dialog">
        <div class="bubble"><b>You</b>Tell us how much time you have and what you like.</div>
        <div class="bubble"><b>We</b>Build a safe, walkable route — with transport, a lunch break and warm-up stops indoors.</div>
      </div>
    </section>
    <div class="feature-grid">
      <div class="feature"><div class="ic">🧭</div><b>Your route</b><span>3–4 h, auto-built</span></div>
      <div class="feature"><div class="ic">🗺️</div><b>Live map</b><span>${LANDMARKS.length} landmarks</span></div>
      <div class="feature"><div class="ic">📷</div><b>AR quests</b><span>Earn points</span></div>
    </div>
    <div class="pad stack" style="padding-top:22px">
      ${!storageOK ? `<div class="alert alert--warn"><span class="ic">⚠️</span><div>This browser blocks local storage (private mode?). Progress will be lost when you close the page.</div></div>` : ""}
      ${active ? `<button class="btn btn--block" id="cont">Continue my tour · ${done}/${S.route.length} visited</button>` : ""}
      ${S.bookings.length ? `<button class="btn btn--block btn--ghost" id="myb">My bookings (${S.bookings.length})</button>` : ""}
      <button class="btn btn--block ${active ? "btn--ghost" : ""}" id="start">Start Tour →</button>
      ${active ? `<button class="btn btn--block btn--outline btn--sm" id="reset">Reset progress</button>` : ""}

      <details class="faq tester" ${tm ? "open" : ""}>
        <summary>🧪 Tester mode ${tm ? "· ON" : ""}</summary>
        <p>For Sales / QA / pilot rehearsal: location and compass are simulated, so recognition, navigation and booking can be tested anywhere. Test bookings are marked TEST.</p>
        <label class="check-row"><input type="checkbox" id="tmode" ${tm ? "checked" : ""}><span>Enable tester mode</span></label>
        <div class="field" style="margin-top:8px"><label>Simulate</label>
          <select id="tsim" ${tm ? "" : "disabled"}>${Object.entries(SIMS).map(([k, t]) => `<option value="${k}" ${S.settings.sim === k ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
      </details>
      <p class="small muted" style="text-align:center">Build ${APP_VERSION} · progress is saved on this device</p>
    </div>`;
  $("#start", v).onclick = () => go("#/mode");
  if (active) {
    $("#cont", v).onclick = () => go("#/map");
    $("#reset", v).onclick = () => {
      if (!confirm("Reset your route and points? Bookings are kept.")) return;
      const keep = { bookings: S.bookings, settings: S.settings };
      S = { ...freshState(), ...keep }; save(); router();
    };
  }
  const mb = $("#myb", v); if (mb) mb.onclick = () => go("#/guided");
  $("#tmode", v).onchange = (e) => { S.settings.testMode = e.target.checked; save(); router(); };
  $("#tsim", v).onchange = (e) => { S.settings.sim = e.target.value; save(); toast(`Simulation: ${SIMS[e.target.value]}`); };
}

/* =========================================================
   Screen 2 — Tour mode selection
   ========================================================= */
function Mode(v) {
  v.innerHTML = `
    <div class="pad stack">
      <div><h2>How do you want to explore?</h2><p class="small" style="margin-top:4px">Prices for both modes are provided by the Finance team and shown before confirmation.</p></div>
      <button class="mode-card" id="indep">
        <span class="arrow">→</span>
        <div class="mode-card__icon" style="background:#efecff">📱</div>
        <h2>Independent Tour</h2>
        <div class="sub">Self-guided AR · no guide</div>
        <p class="small">Answer 3 quick questions, pick places on the map and the app builds a convenient route for you.</p>
        <ul><li>Personal recommendations</li><li>Auto-generated route & lunch stop</li><li>AR scans, mini-quests, progress tracking</li></ul>
      </button>
      <button class="mode-card mode-card--dark" id="dep">
        <span class="arrow">→</span>
        <div class="mode-card__icon" style="background:rgba(255,255,255,.12)">🧑‍🏫</div>
        <h2 style="color:#fff">Dependent Tour</h2>
        <div class="sub">Guided tour · ready-made route</div>
        <p class="small">Choose a ready-made guided tour. No planning — a guide leads the group along a predefined route.</p>
        <ul><li>Guide name, photo and start times</li><li>Predefined stops in a set order</li><li>AR content at every stop</li></ul>
      </button>
    </div>`;
  $("#indep", v).onclick = () => go("#/quiz");
  $("#dep", v).onclick = () => go("#/guided");
}

/* =========================================================
   Screen 3 — Questionnaire
   ========================================================= */
function Quiz(v) {
  const A = S.answers;
  const Q = [
    { key: "time", title: "How much time do you have?", multi: false, opts: [["2", "⏱️ 2 hours"], ["3-4", "🕒 3–4 hours"], ["full", "☀️ Full day"]] },
    { key: "interests", title: "What are you interested in?", multi: true, opts: [["Historical", "🏺 Historical"], ["Cultural", "🎭 Cultural"], ["Youth", "⚡ Youth & modern"], ["Architecture", "📸 Architecture & photography"], ["Family", "👨‍👩‍👧 Family"], ["All", "✨ All"]] },
    { key: "transport", title: "How do you want to move?", multi: false, opts: [["foot", "🚶 On foot"], ["bus", "🚌 Bus"], ["lrt", "🚈 LRT"], ["minibus", "🚐 Minibus transfer"], ["mixed", "🔀 Mixed"]] },
  ];
  v.innerHTML = `
    <div class="pad">
      <p class="small" style="margin-bottom:12px">Three quick questions — we'll match landmarks, suggested routes and transport to your answers.</p>
      ${Q.map((q, i) => `
        <div class="q-block">
          <div class="q-num">QUESTION ${i + 1} / 3</div>
          <div class="q-title">${q.title}</div>
          <div class="options" data-key="${q.key}" data-multi="${q.multi}">
            ${q.opts.map(([val, lab]) => {
              const on = q.multi ? A[q.key].includes(val) : A[q.key] === val;
              return `<button class="opt ${on ? "is-on" : ""}" data-val="${val}">${lab}</button>`;
            }).join("")}
          </div>
          ${q.multi ? `<p class="small muted" style="margin-top:8px">Choose one or more</p>` : ""}
        </div>`).join("")}
    </div>
    <div class="sticky-bottom"><button class="btn btn--block" id="gen">Generate Recommendations ✨</button></div>`;
  $$(".options", v).forEach(group => {
    const key = group.dataset.key, multi = group.dataset.multi === "true";
    group.addEventListener("click", e => {
      const b = e.target.closest(".opt"); if (!b) return;
      const val = b.dataset.val;
      if (!multi) A[key] = val;
      else {
        let arr = A[key];
        if (val === "All") arr = ["All"];
        else {
          arr = arr.filter(x => x !== "All");
          arr = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
          if (!arr.length) arr = ["All"];
        }
        A[key] = arr;
      }
      save();
      $$(".opt", group).forEach(o => o.classList.toggle("is-on", multi ? A[key].includes(o.dataset.val) : A[key] === o.dataset.val));
    });
  });
  $("#gen", v).onclick = () => { S.selected = recommend(S.answers).picked.map(x => x.l.id); save(); go("#/recs"); };
}

/* =========================================================
   Screen 4 — Personalized recommendations
   ========================================================= */
function Recs(v) {
  const A = S.answers;
  const { picked } = recommend(A);
  const pk = rankPackages(A);
  const tLabel = { "2": "2 hours", "3-4": "3–4 hours", "full": "a full day" }[A.time];
  const trLabel = { foot: "on foot", bus: "by bus", lrt: "by LRT", minibus: "by minibus", mixed: "mixed transport" }[A.transport];
  v.innerHTML = `
    <div class="pad">
      <div class="alert alert--info"><span class="ic">🎯</span><div>For <b>${tLabel}</b>, <b>${trLabel}</b>, interests: <b>${A.interests.map(c => CATEGORIES[c].label).join(", ")}</b>.</div></div>
      <div class="section-title">Top places for you</div>
      ${picked.length ? `<div class="grid-list">` + picked.map(({ l, match }) => `
        <button class="place-row" data-id="${l.id}">
          <div class="thumb" style="${thumbBg(l)}">${l.emoji}</div>
          <div class="place-row__body"><b>${l.name}</b><div class="meta">${l.address}</div>
            <div class="chips">${match.length ? match.slice(0, 2).map(c => `<span class="chip">✓ ${CATEGORIES[c].label}</span>`).join("") : `<span class="chip">Must-see</span>`}${l.indoor ? `<span class="chip badge-ok">Indoor</span>` : ""}</div>
          </div><span class="muted">›</span>
        </button>`).join("") + `</div>` : `<p>No matches — try other interests.</p>`}
      <div class="section-title">Suggested routes</div>
      <div class="pkg-grid">${pk.map(({ p, fits }, i) => pkgCard(p, i === 0 ? "Best match" : "", fits ? "" : "Longer than your time")).join("")}</div>
    </div>
    <div class="sticky-bottom btn-row"><button class="btn btn--block" id="custom">Choose my own places →</button></div>`;
  $$(".place-row", v).forEach(b => b.onclick = () => go(`#/place/${b.dataset.id}`));
  $$("[data-use]", v).forEach(b => b.onclick = () => {
    const p = PK[b.dataset.use];
    startTour({ kind: "independent", packageId: p.id }, p.timeline.filter(t => t.type === "stop").map(t => t.id));
  });
  $("#custom", v).onclick = () => go("#/select");
}
const initials = (n) => n.split(" ").map(s => s[0]).join("");
function pkgCard(p, best, warn, guided) {
  const stops = p.timeline.filter(t => t.type === "stop").map(t => LM[t.id].name.replace(/ \(.*\)/, ""));
  const grad = { p1: "linear-gradient(135deg,#3b1fd4,#7b6cff)", p2: "linear-gradient(135deg,#0e7490,#22d3ee)", p3: "linear-gradient(135deg,#92400e,#f59e0b)" }[p.id];
  return `
    <div class="pkg-card">
      <div class="pkg-card__top" style="background:${grad}">
        ${best ? `<span class="best-tag">${best}</span>` : ""}
        <span class="chip">${p.theme}</span><h3>${p.title}</h3>
      </div>
      <div class="pkg-card__body">
        <p class="small">${p.desc}</p>
        <div class="pkg-meta">
          <div><b>${p.duration}</b>Duration</div>
          <div><b>${stops.length} stops</b>${p.area}</div>
          <div><b>${p.transport.split(",")[0]}</b>Transport</div>
        </div>
        ${guided ? `
          <div class="guide" style="margin-bottom:12px">
            <div class="avatar" style="background:${p.guide.color}">${initials(p.guide.name)}</div>
            <div style="flex:1"><b>${p.guide.name}</b><span>Your guide · ${p.guide.lang}</span></div>
            <div style="text-align:right"><b style="font-size:14px">${p.price ? p.price + " ₸" : "Price: TBD"}</b><span class="small muted" style="display:block">from Finance</span></div>
          </div>
          <div class="chips" style="margin-bottom:12px">${p.startTimes.map(t => `<span class="chip">🕙 ${t}</span>`).join("")}${p.noMondays ? `<span class="chip badge-warn">No Mondays</span>` : ""}</div>` : `
          <p class="small muted" style="margin-bottom:12px">${stops.join(" → ")}</p>`}
        ${warn ? `<p class="small" style="color:var(--warn);margin-bottom:10px">⚠️ ${warn}</p>` : ""}
        ${guided === "noBtn" ? "" : guided ? `<button class="btn btn--block" data-open="${p.id}">View tour & book</button>`
                 : `<button class="btn btn--block btn--ghost" data-use="${p.id}">Use this route</button>`}
      </div>
    </div>`;
}
function startTour(tour, ids) {
  // A different tour (mode or package) starts a fresh quest run; editing places keeps progress.
  const same = S.tour && S.tour.kind === tour.kind && S.tour.packageId === tour.packageId && S.tour.bookingRef === tour.bookingRef;
  if (!same) { S.visited = {}; S.quest = {}; S.awarded = {}; S.points = 0; }
  S.tour = tour;
  S.route = tour.packageId ? ids : buildRoute(ids);
  save();
  go("#/map");
}

/* =========================================================
   Screen 5 — Attraction selection (map + list)
   ========================================================= */
function Select(v) {
  let tab = "match";
  const { matching } = recommend(S.answers);
  const matchIds = new Set(matching.map(x => x.l.id));
  const sel = new Set(S.selected);
  v.innerHTML = `
    <div class="map-wrap"><div id="selMap" class="map"></div>
      <div class="map-legend"><span><i style="background:var(--brand)"></i>Selected</span><span><i style="background:#fff;border:1px solid #a6a0c8"></i>Available</span></div>
    </div>
    <div class="pad">
      <div class="tabs"><button data-tab="match" class="is-on">Matching (${matchIds.size})</button><button data-tab="all">All places (${LANDMARKS.length})</button></div>
      <p class="small muted" style="margin:10px 2px">Tap a pin or a row to add it. The route is ordered automatically.</p>
      <div id="list"></div>
    </div>
    <div class="sticky-bottom"><button class="btn btn--block" id="build"></button></div>`;
  const markers = {};
  const drawList = () => {
    const items = LANDMARKS.filter(l => tab === "all" || matchIds.has(l.id) || sel.has(l.id));
    $("#list", v).innerHTML = items.map(l => `
      <button class="place-row ${sel.has(l.id) ? "is-on" : ""}" data-id="${l.id}">
        <div class="thumb" style="${thumbBg(l)}">${l.emoji}</div>
        <div class="place-row__body"><b>${l.name}</b><div class="meta">${l.address}</div><div class="chips">${chips(l, 2)}${badges(l)}</div></div>
        <div class="check">✓</div>
      </button>`).join("");
    const n = sel.size, b = $("#build", v);
    b.textContent = n < 2 ? `Select at least 2 places (${n})` : `Build route with ${n} places →`;
    b.disabled = n < 2;
    Object.entries(markers).forEach(([id, m]) => {
      m.setIcon(pinIcon(sel.has(id) ? "sel" : "idle", sel.has(id) ? "✓" : LM[id].n));
      (tab === "all" || matchIds.has(id) || sel.has(id)) ? m.addTo(map) : m.remove();
    });
  };
  const toggle = (id) => { sel.has(id) ? sel.delete(id) : sel.add(id); S.selected = [...sel]; save(); drawList(); };
  $("#list", v).addEventListener("click", e => { const r = e.target.closest(".place-row"); if (r) toggle(r.dataset.id); });
  $$(".tabs button", v).forEach(b => b.onclick = () => { tab = b.dataset.tab; $$(".tabs button", v).forEach(x => x.classList.toggle("is-on", x === b)); drawList(); });
  $("#build", v).onclick = () => startTour({ kind: "independent" }, [...sel]);
  map = makeMap("selMap");
  if (map) {
    LANDMARKS.forEach(l => {
      const m = L.marker([l.lat, l.lng], { icon: pinIcon("idle", l.n) });
      m.bindPopup(() => {
        const div = document.createElement("div");
        div.innerHTML = `<b>${l.emoji} ${l.name}</b><div class="small muted">${l.cats.map(c => CATEGORIES[c].label).join(" · ")}</div>
          <div class="popup-actions"><button>${sel.has(l.id) ? "Remove" : "Add to route"}</button><button class="alt">Details</button></div>`;
        const [add, det] = div.querySelectorAll("button");
        add.onclick = () => { toggle(l.id); m.closePopup(); };
        det.onclick = () => go(`#/place/${l.id}`);
        return div;
      });
      markers[l.id] = m;
    });
    fitTo(LANDMARKS.filter(l => matchIds.has(l.id)).map(l => [l.lat, l.lng]));
  }
  drawList();
}

/* ---------------- Leaflet helpers (with offline / tile error states) ---------------- */
function makeMap(elId) {
  const el = $("#" + elId);
  if (typeof L === "undefined") {
    el.innerHTML = `<div class="empty small"><div style="font-size:36px">🗺️</div>The map could not load (no internet?).<br><button class="btn btn--sm" style="margin-top:10px" onclick="location.reload()">Retry</button></div>`;
    return null;
  }
  const m = L.map(elId, { zoomControl: false }).setView([51.12, 71.43], 12);
  const layer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(m);
  let shown = false, errors = 0;
  layer.on("tileerror", () => {
    if (shown || ++errors < 3) return;
    shown = true;
    const box = document.createElement("div");
    box.className = "map-error";
    box.innerHTML = `⚠️ Map tiles failed to load. Check your connection. <button class="btn btn--sm">Retry</button>`;
    el.parentElement.appendChild(box);
    box.querySelector("button").onclick = () => { box.remove(); shown = false; errors = 0; layer.redraw(); };
  });
  L.control.zoom({ position: "topright" }).addTo(m);
  later(() => m.invalidateSize(), 60);
  return m;
}
function pinIcon(kind, text) {
  const size = kind === "idle" ? 22 : 30;
  return L.divIcon({ className: "", html: `<div class="pin pin--${kind}"><span>${text}</span></div>`, iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size] });
}
function fitTo(latlngs) {
  if (!map || !latlngs.length) return;
  if (latlngs.length === 1) map.setView(latlngs[0], 15);
  else map.fitBounds(latlngs, { padding: [34, 34], maxZoom: 15 });
}

/* =========================================================
   Screen 6 — Interactive map & route (+ live navigation)
   ========================================================= */
function RouteMap(v) {
  if (!S.route.length) {
    v.innerHTML = `<div class="empty"><div class="big">🗺️</div><h2>No route yet</h2><p style="margin:8px 0 18px">Choose a mode to build or book a route.</p><button class="btn" onclick="location.hash='#/mode'">Start</button></div>`;
    return;
  }
  const guided = S.tour?.kind === "guided";
  if (guided) $("#screenTitle").textContent = "Guided tour · route";
  const plan = buildPlan();
  const done = S.route.filter(id => S.visited[id]).length;
  const pct = Math.round(done / S.route.length * 100);
  const nxt = nextStop();
  const month = new Date().getMonth();
  const cold = month >= 10 || month <= 2;
  const indoorOnRoute = S.route.filter(id => LM[id].indoor).map(id => LM[id].name);
  const overBudget = !guided && !plan.pkg && plan.endMin && (plan.endMin - START_MIN) > TIME_BUDGET[S.answers.time] + 30;

  let stopNo = 0;
  const tl = plan.items.map(it => {
    if (it.type === "leg") return `<div class="leg">${it.icon} <b>${it.label}</b> · ${km(it.d)} · ~${it.min} min</div>`;
    if (it.type === "lunch") {
      const z = LUNCH_ZONES[it.zone];
      return tlRow(`<div class="tl-dot aux">🍽️</div>`, `
        <div class="lunch-card">
          <div class="tl-time">${it.time} · Lunch break</div>
          <h3>${z.name}</h3>
          ${it.story ? `<p class="small">${it.story}</p>` : `<p class="small">Three choices nearby${it.dist ? ` · ~${km(it.dist)} from the previous stop` : ""}.</p>`}
          ${z.venues.map(ven => `<div class="venue"><b>${ven.name}</b> · <span class="muted">${ven.type}</span><br>${ven.cuisine}<br>💳 ${ven.price} · 🕒 ${ven.hours} · 📍 ${ven.addr}</div>`).join("")}
          ${it.next ? `<div class="leg">➡️ ${it.next}</div>` : ""}
        </div>`);
    }
    if (it.type === "lrt") {
      const doneLrt = S.awarded.lrt;
      return tlRow(`<div class="tl-dot aux">🚈</div>`, `
        <div class="lrt-card">
          <div class="tl-time">${it.time} · LRT ride & story card</div>
          <h3>Tarlan Astana light rail</h3>
          <p class="small">Opened 16 May 2026 · 18 stations · 22.4 km · fully driverless · renamed Tarlan Astana in July 2026.</p>
          <div class="tl-actions"><button class="btn btn--sm ${doneLrt ? "btn--ok" : ""}" data-lrt ${doneLrt ? "disabled" : ""}>${doneLrt ? "✓ LRT bonus earned" : `I took the LRT · +${POINTS.lrt} ★`}</button></div>
          ${it.next ? `<div class="leg">➡️ ${it.next}</div>` : ""}
        </div>`);
    }
    stopNo++;
    const l = LM[it.id], vis = S.visited[it.id], isNext = it.id === nxt;
    return tlRow(`<div class="tl-dot ${vis ? "visited" : isNext ? "next" : ""}">${vis ? "✓" : stopNo}</div>`, `
      <div class="tl-card ${isNext ? "is-next" : ""} ${vis ? "is-visited" : ""}">
        <div class="tl-time">${it.time}${isNext ? " · NEXT STOP" : ""}${vis ? " · visited" : ""}</div>
        <h3>${l.emoji} ${l.name}</h3>
        <div class="chips">${chips(l, 2)}${badges(l)}</div>
        <div class="tl-actions">
          <button class="btn btn--sm btn--ghost" data-card="${l.id}">Details</button>
          <button class="btn btn--sm" data-ar="${l.id}">📷 AR</button>
          ${vis ? `<button class="btn btn--sm btn--ok" disabled>✓ Visited</button>` : `<button class="btn btn--sm btn--outline" data-visit="${l.id}">Mark visited</button>`}
        </div>
        ${it.next && plan.pkg ? `<div class="leg">➡️ ${it.next}</div>` : ""}
      </div>`);
  }).join("");

  v.innerHTML = `<div id="routeRoot">
    <div class="map-wrap"><div id="routeMap" class="map map--tall"></div>
      <button class="map-fab" id="locate" title="Show my location">◎</button>
    </div>
    <div class="progress">
      <div class="progress__row"><span><b>${done}/${S.route.length}</b> stops visited</span><span>${S.route.length - done} remaining · ${km(plan.totalKm)}</span></div>
      <div class="progress__bar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="pad stack">
      ${nxt ? `<div class="nav-card" id="navCard"></div>` : ""}
      ${!storageOK ? `<div class="alert alert--warn"><span class="ic">⚠️</span><div>Progress can't be saved in this browser (private mode?). Keep this tab open.</div></div>` : ""}
      ${guided ? `<div class="alert alert--info"><span class="ic">🧑‍🏫</span><div><b>${plan.pkg.guide.name}</b> leads the route and tells the stories. Use the app for AR scans and mini-tasks (${POINTS.quest} ★ each).</div></div>` : ""}
      ${plan.pkg && !guided ? `<div class="alert alert--info"><span class="ic">🧭</span><div>Ready-made route: <b>${plan.pkg.title}</b> (${plan.pkg.duration}). Stops follow the predefined order.</div></div>` : ""}
      ${cold ? `<div class="alert alert--cold"><span class="ic">❄️</span><div><b>Cold season in Astana.</b> ${indoorOnRoute.length ? `Warm-up stops on your route: ${indoorOnRoute.join(", ")}.` : "No indoor stop on this route — consider adding the National Museum, Nur-Alem or Mega Silk Way."}${plan.pkg?.coldSwap ? ` Cold-day swap: ${plan.pkg.coldSwap}` : ""}</div></div>` : ""}
      ${overBudget ? `<div class="alert alert--warn"><span class="ic">⏳</span><div>This route takes about ${Math.round((plan.endMin - START_MIN) / 60 * 10) / 10} h — longer than your time. Remove a stop or change transport.</div></div>` : ""}
      <div class="alert alert--warn"><span class="ic">🚸</span><div>Cross only at marked crossings or underpasses. No quest task is ever placed on a road.</div></div>
      <div class="section-title" style="margin-top:8px">${plan.pkg ? "Predefined route" : "Your generated route"} · start 10:00${plan.endMin ? ` · end ~${fmt(plan.endMin)}` : ""}</div>
      <div class="timeline">${tl}</div>
      <div class="btn-row">
        ${!guided && !plan.pkg ? `<button class="btn btn--outline" id="edit">Edit places</button>` : ""}
        <button class="btn" id="finish">Finish · summary</button>
      </div>
    </div></div>`;

  map = makeMap("routeMap");
  if (map) {
    const pts = S.route.map(id => [LM[id].lat, LM[id].lng]);
    L.polyline(pts, { color: "#3b1fd4", weight: 4, opacity: .8, dashArray: "8 8" }).addTo(map);
    LANDMARKS.filter(l => !S.route.includes(l.id)).forEach(l => {
      L.marker([l.lat, l.lng], { icon: pinIcon("idle", l.n), opacity: .75 }).addTo(map)
        .bindPopup(`<b>${l.emoji} ${l.name}</b><div class="popup-actions"><button onclick="location.hash='#/place/${l.id}'">Details</button></div>`);
    });
    S.route.forEach((id, i) => {
      const l = LM[id], kind = S.visited[id] ? "visited" : id === nxt ? "next" : "route";
      L.marker([l.lat, l.lng], { icon: pinIcon(kind, S.visited[id] ? "✓" : i + 1), zIndexOffset: 1000 }).addTo(map)
        .bindPopup(`<b>${i + 1}. ${l.emoji} ${l.name}</b><div class="small muted">${S.visited[id] ? "Visited ✓" : "Not visited yet"}</div>
          <div class="popup-actions"><button onclick="location.hash='#/place/${id}'">Open card</button><button class="alt" onclick="location.hash='#/ar/${id}'">AR</button></div>`);
    });
    plan.items.filter(it => it.type === "lunch").forEach(it => {
      const z = LUNCH_ZONES[it.zone];
      L.marker([z.lat, z.lng], { icon: pinIcon("lunch", "🍽") }).addTo(map).bindPopup(`<b>${z.name}</b><div class="small">${z.venues.map(x => x.name).join(" · ")}</div>`);
    });
    fitTo(pts);
  }

  if (nxt) Navigator($("#navCard", v), LM[nxt]);

  $("#routeRoot", v).addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.card) go(`#/place/${t.dataset.card}`);
    else if (t.dataset.ar) go(`#/ar/${t.dataset.ar}`);
    else if (t.dataset.visit) { markVisited(t.dataset.visit); router(); }
    else if (t.hasAttribute("data-lrt")) { award("lrt", POINTS.lrt, "LRT leg bonus"); router(); }
  });
  $("#finish", v).onclick = () => go("#/summary");
  const edit = $("#edit", v); if (edit) edit.onclick = () => { S.selected = [...S.route]; save(); go("#/select"); };
  $("#locate", v).onclick = () => locateMe();
}
function tlRow(dot, body) {
  return `<div class="tl-item"><div class="tl-rail">${dot}<div class="tl-line"></div></div><div class="tl-body">${body}</div></div>`;
}

/* Live navigation to the next stop: distance, ETA, direction, arrival → AR */
let meMarker = null;
function showMe(p) {
  if (!map) return;
  const ll = [p.lat, p.lng];
  if (meMarker && map.hasLayer(meMarker)) meMarker.setLatLng(ll);
  else meMarker = L.marker(ll, { icon: L.divIcon({ className: "", html: `<div class="me-dot"></div>`, iconSize: [16, 16] }), zIndexOffset: 2000 }).addTo(map);
}
function Navigator(box, target) {
  const idle = () => {
    box.innerHTML = `
      <div class="nav-row"><div class="nav-arrow">🧭</div>
        <div style="flex:1"><div class="tl-time">NEXT STOP</div><b>${target.name}</b></div>
        <button class="btn btn--sm" id="navGo">Navigate</button></div>`;
    $("#navGo", box).onclick = start;
  };
  let heading = null;
  const start = () => {
    box.innerHTML = `<div class="nav-row"><div class="nav-arrow spin">◌</div><div style="flex:1"><b>Finding your location…</b><div class="small muted">Allow location access if asked</div></div></div>`;
    startHeading(h => { heading = h; });
    watchPosition(onPos, onErr, target, true);
  };
  const onPos = (p) => {
    showMe(p);
    const d = haversine(p, target) * 1000;
    const br = bearing(p, target);
    const rot = (heading != null ? br - heading : br) - 90; // ➤ glyph points east at 0°
    if (d <= ARRIVE_M) {
      stopGeo();
      box.innerHTML = `<div class="nav-row"><div class="nav-arrow ok">✓</div><div style="flex:1"><b>You've arrived at ${target.name}</b><div class="small muted">Open the AR scan to complete the stop</div></div>
        <button class="btn btn--sm" onclick="location.hash='#/ar/${target.id}'">📷 AR</button></div>`;
      return;
    }
    const eta = Math.max(1, Math.round(d * 1.3 / 1000 / 4.5 * 60));
    box.innerHTML = `
      <div class="nav-row">
        <div class="nav-arrow"><span style="transform:rotate(${rot}deg)">➤</span></div>
        <div style="flex:1"><div class="tl-time">TO ${esc(target.name).toUpperCase()}</div>
          <b>${km(d / 1000)} · ~${eta} min walk</b>
          <div class="small muted">Head ${compass(br)}${heading == null ? " (compass off — arrow points north-up)" : ""}${p.acc > MAX_GPS_ACC_M ? ` · weak GPS ±${Math.round(p.acc)} m` : ""}</div></div>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <a class="btn btn--sm btn--ghost" target="_blank" rel="noopener" href="${mapsLink(target)}">Google Maps</a>
        <a class="btn btn--sm btn--ghost" target="_blank" rel="noopener" href="${gisLink(target)}">2GIS</a>
        <button class="btn btn--sm btn--outline" id="navStop">Stop</button>
      </div>`;
    $("#navStop", box).onclick = () => { stopGeo(); stopHeading(); idle(); };
  };
  const onErr = (e) => {
    const [t, x] = geoErrText(e);
    box.innerHTML = `<div class="nav-row"><div class="nav-arrow warn">!</div><div style="flex:1"><b>${t}</b><div class="small muted">${x}</div></div></div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn--sm" id="navRetry">Retry</button>
        <a class="btn btn--sm btn--ghost" target="_blank" rel="noopener" href="${mapsLink(target)}">Open in Google Maps</a>
      </div>`;
    $("#navRetry", box).onclick = start;
  };
  idle();
}
function locateMe() {
  const target = LM[nextStop()] || LM[S.route[0]];
  watchPosition(p => {
    stopGeo(); showMe(p); if (map) map.setView([p.lat, p.lng], 15);
    const near = LANDMARKS.map(l => ({ l, d: haversine(p, l) })).sort((a, b) => a.d - b.d)[0];
    toast(`Nearest: ${near.l.name} · ${km(near.d)}`);
  }, e => toast(geoErrText(e)[0]), target);
}

/* =========================================================
   Screen 7 — Attraction details
   ========================================================= */
function Place(v, id) {
  const l = LM[id];
  if (!l) return go("#/home");
  $("#screenTitle").textContent = l.name;
  const inRoute = S.route.includes(id), vis = S.visited[id], q = S.quest[id];
  const zone = l.zone ? LUNCH_ZONES[l.zone] : null;
  const c = catColor(l);
  v.innerHTML = `
    <div class="detail-hero" style="${heroBg(l)}">${l.emoji}
      <div class="detail-hero__title"><div class="chips" style="margin-bottom:6px">${l.cats.map(k => `<span class="chip">${CATEGORIES[k].label}</span>`).join("")}</div><h1>${l.name}</h1></div>
    </div>
    <div class="pad">
      <div class="chips">${badges(l)}${vis ? `<span class="chip badge-ok">✓ Visited</span>` : ""}${q ? `<span class="chip">Quest ${q.correct ? "✓" : "tried"}</span>` : ""}</div>
      <div class="section-title">Panoramic photos</div>
      <div class="panos">
        <div class="pano" style="background:linear-gradient(120deg, ${c}, #1c1446)"><span class="big">${l.emoji}</span><span class="tag">🚪 Entrance</span></div>
        <div class="pano" style="background:linear-gradient(120deg, #1c1446, ${c})"><span class="big">📷</span><span class="tag">🎯 AR scan spot${l.recog ? ` — ${l.recog.spot}` : ""}</span></div>
        <div class="pano" style="background:linear-gradient(120deg, #3b1fd4, ${c}88)"><span class="big">🧭</span><span class="tag">360° view (photo to be added)</span></div>
      </div>
      <div class="card card--flat info-grid" style="margin-top:14px">
        <div class="info-row"><span class="ic">📍</span><span>${l.address}</span></div>
        <div class="info-row"><span class="ic">🕒</span><span>${l.hours}</span></div>
        <div class="info-row"><span class="ic">⏱️</span><span>Recommended visit: ~${l.visitMin} min</span></div>
        ${l.recog ? `<div class="info-row"><span class="ic">🎯</span><span>AR scan spot: ${l.recog.spot}</span></div>` : ""}
      </div>
      <div class="section-title">Story</div>
      <p>${l.desc}</p>
      <div class="section-title">Historical facts</div>
      <ul class="facts">${l.facts.map(f => `<li>${f}</li>`).join("")}</ul>
      <div class="section-title">AR content</div>
      <div class="alert alert--info"><span class="ic">✨</span><div>${l.ar}<br><span class="small">Mini-quest: ${POINTS.quest} ★ for a correct answer.</span></div></div>
      ${zone ? `
        <div class="section-title">Lunch nearby · ${zone.name}</div>
        <div class="lunch-card">${zone.venues.map((ven, i) => `<div class="${i ? "venue" : ""}" style="font-size:12.5px"><b>${ven.name}</b> · ${ven.type}<br>${ven.price} · ${ven.hours} · ${km(pathKm(l, zone))} away</div>`).join("")}</div>` : ""}
      <div class="stack" style="margin-top:18px">
        <button class="btn btn--block" id="ar">📷 Open AR camera</button>
        <div class="btn-row">
          ${vis ? `<button class="btn btn--ok" disabled>✓ Visited</button>` : `<button class="btn btn--outline" id="visit">Mark as visited</button>`}
          <a class="btn btn--ghost" target="_blank" rel="noopener" href="${mapsLink(l.recog ? l.recog.scan : l)}">🧭 Directions</a>
        </div>
        ${!inRoute && S.route.length && S.tour?.kind === "independent" && !S.tour.packageId ? `<button class="btn btn--block btn--ghost" id="add">+ Add to my route</button>` : ""}
      </div>
    </div>`;
  $("#ar", v).onclick = () => go(`#/ar/${id}`);
  const vb = $("#visit", v); if (vb) vb.onclick = () => { markVisited(id); router(); };
  const ab = $("#add", v); if (ab) ab.onclick = () => { S.route = buildRoute([...S.route, id]); save(); toast("Added — route re-ordered"); go("#/map"); };
}

/* =========================================================
   Screen 8 — AR camera
   Recognition (Baiterek, Khan Shatyr, Main Mosque): the landmark is
   recognised when the user stands at its approved scan spot (GPS) and,
   if the phone has a compass, points the camera at it. Every failure has
   a reason, a Retry and "Skip scan". Other landmarks: simulated scan.
   ========================================================= */
function AR(v, id) {
  const l = LM[id];
  if (!l) return go("#/home");
  const R = l.recog;
  v.innerHTML = `
    <div class="ar">
      <video id="cam" playsinline muted autoplay style="display:none"></video>
      <div class="ar-fallback" id="fallback" style="${heroBg(l)}">${l.emoji}</div>
      <div class="ar-top">
        <button class="icon-btn" id="close" aria-label="Close">✕</button>
        <b>${l.name}</b><span class="ar-mode" id="arMode">Starting camera…</span>
      </div>
      <div class="ar-banner" id="camBanner" hidden></div>
      <div class="reticle" id="reticle"><i></i><i></i><i></i><i></i><div class="scanline"></div></div>
      <div class="ar-turn" id="arTurn" hidden>➤</div>
      <div class="ar-hint" id="hint">Point your camera at <b>${l.name}</b></div>
      <div class="ar-object" id="arObj">
        <div class="particles">${Array.from({ length: 10 }, (_, i) => `<span style="left:${10 + i * 16}px;top:${60 + (i % 3) * 20}px;animation-delay:${i * .3}s"></span>`).join("")}</div>
        <div class="emoji3d">${l.emoji}</div><div class="ring"></div>
        <div class="ar-label">${l.name}</div>
      </div>
      <div class="ar-bottom" id="arBottom"></div>
    </div>`;

  const video = $("#cam", v), modeEl = $("#arMode", v), hint = $("#hint", v), ret = $("#reticle", v), bottom = $("#arBottom", v);
  let usingCamera = false, pos = null, posErr = null, heading = null, scanTimer = null, revealed = false;

  /* ---- camera with error + retry ---- */
  const camBanner = (msg) => {
    const b = $("#camBanner", v);
    if (!msg) { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = `<span>📷 ${msg}</span><button class="btn btn--sm btn--white" id="camRetry">Retry</button>`;
    $("#camRetry", v).onclick = startCamera;
  };
  async function startCamera() {
    modeEl.textContent = "Starting camera…";
    try {
      if (S.settings.testMode && S.settings.sim === "camDenied") throw Object.assign(new Error("simulated"), { name: "NotAllowedError" });
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no API"), { name: "NotSupportedError" });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!document.body.contains(video)) { stream.getTracks().forEach(t => t.stop()); return; }
      camStream = stream; video.srcObject = stream; video.style.display = "block";
      $("#fallback", v).style.display = "none"; usingCamera = true;
      modeEl.textContent = "Live camera"; camBanner(null);
    } catch (e) {
      if (!document.body.contains(video)) return;
      usingCamera = false; video.style.display = "none"; $("#fallback", v).style.display = "grid";
      modeEl.textContent = "Camera off";
      camBanner(e.name === "NotAllowedError" || e.name === "SecurityError"
        ? "Camera access is blocked. Allow it in the browser settings, then tap Retry."
        : e.name === "NotFoundError" ? "No camera found on this device." : "Camera needs HTTPS or a supported browser.");
    }
  }
  startCamera();

  /* ---- recognition checks ---- */
  function evaluate() {
    if (posErr) { const [t, x] = geoErrText(posErr); return { ok: false, kind: "gps", t, x }; }
    if (!pos) return { ok: false, kind: "wait", t: "Finding your location…", x: "Hold on a few seconds." };
    if (pos.acc > MAX_GPS_ACC_M) return { ok: false, kind: "weak", t: `Weak GPS signal (±${Math.round(pos.acc)} m)`, x: "Move to an open space away from tall buildings, then retry." };
    const d = haversine(pos, R.scan) * 1000;
    if (d > R.radius) return { ok: false, kind: "far", t: `You are ${km(d / 1000)} from the scan spot`, x: `Go to: ${R.spot}.` };
    if (heading != null) {
      const diff = ((bearing(pos, l) - heading + 540) % 360) - 180;
      if (Math.abs(diff) > R.headingTol) return { ok: false, kind: "turn", t: `Turn ${diff > 0 ? "right" : "left"} ~${Math.round(Math.abs(diff))}°`, x: `Point the camera at ${l.name}.`, diff };
    }
    return { ok: true };
  }
  function liveHint() {
    if (revealed || scanTimer) return;
    const r = evaluate(), turn = $("#arTurn", v);
    turn.hidden = r.kind !== "turn";
    if (r.kind === "turn") turn.style.transform = `translate(-50%,-50%) rotate(${r.diff > 0 ? 0 : 180}deg)`;
    hint.innerHTML = r.ok ? `✅ Ready — tap <b>Scan</b>` : `<b>${r.t}</b><br><span class="small">${r.x}</span>`;
  }
  const startLocation = () => {
    posErr = null; pos = null;
    if (R) watchPosition(p => { pos = p; posErr = null; liveHint(); }, e => { posErr = e; liveHint(); }, R.scan);
    if (R) liveHint();
  };
  if (R) startLocation();
  else hint.innerHTML = `Point your camera at <b>${l.name}</b><br><span class="small">Simulated scan — recognition for this stop comes later</span>`;

  /* ---- controls ---- */
  const controls = () => {
    bottom.innerHTML = `<div class="btn-row">
        <button class="btn btn--white" id="skip">Skip scan</button>
        <button class="btn" id="scan" style="flex:2">◉ Scan landmark</button></div>`;
    $("#skip", v).onclick = () => reveal(true);
    $("#scan", v).onclick = scan;
  };
  controls();
  $("#close", v).onclick = () => goBack(S.route.length ? "#/map" : `#/place/${id}`);

  async function scan() {
    if (R && !orientHandler) await startHeading(h => { heading = h; liveHint(); }); // needs the tap on iOS
    ret.classList.remove("found"); ret.classList.add("scanning");
    hint.innerHTML = "Scanning… hold steady";
    bottom.innerHTML = `<div class="btn-row"><button class="btn btn--white" id="cancel">Cancel</button></div>`;
    $("#cancel", v).onclick = () => { stopTimer(scanTimer); scanTimer = null; ret.classList.remove("scanning"); controls(); liveHint(); };
    const t0 = Date.now();
    if (!R) { scanTimer = later(() => { scanTimer = null; toast("Landmark recognised ✓"); reveal(false); }, 1900); return; }
    scanTimer = every(() => {
      const r = evaluate();
      if (r.ok && Date.now() - t0 > 1500) { stopTimer(scanTimer); scanTimer = null; toast("Landmark recognised ✓"); reveal(false); }
      else if (!r.ok && (r.kind === "gps" || Date.now() - t0 > SCAN_TIMEOUT_MS)) { stopTimer(scanTimer); scanTimer = null; fail(r); }
    }, 500);
  }
  function fail(r) {
    ret.classList.remove("scanning");
    hint.innerHTML = "";
    bottom.innerHTML = `
      <div class="ar-sheet">
        <div class="tl-time" style="color:var(--warn)">COULD NOT RECOGNISE ${esc(l.name).toUpperCase()}</div>
        <h3 style="margin:6px 0 4px">${r.kind === "wait" ? "No location signal yet" : r.t}</h3>
        <p class="small">${r.x}</p>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn--ghost" id="skip2">Skip scan</button>
          ${r.kind === "far" ? `<a class="btn btn--ghost" target="_blank" rel="noopener" href="${mapsLink(R.scan)}">Navigate</a>` : ""}
          <button class="btn" id="retry">Retry</button>
        </div>
      </div>`;
    $("#skip2", v).onclick = () => reveal(true);
    $("#retry", v).onclick = () => { if (r.kind === "gps") startLocation(); controls(); scan(); };
  }
  function reveal(skipped) {
    revealed = true; stopGeo();
    $("#arTurn", v).hidden = true;
    ret.classList.remove("scanning"); ret.classList.add("found");
    later(() => { ret.style.display = "none"; hint.style.display = "none"; $("#arObj", v).classList.add("show"); }, skipped ? 0 : 350);
    showStory(skipped);
  }
  function showStory(skipped) {
    bottom.innerHTML = `
      <div class="ar-sheet">
        <div class="tl-time">${skipped ? "Scan skipped — you still get the story and the quest" : "AR content unlocked"}${S.settings.testMode && !CONTENT.arScenesApproved ? " · DRAFT (awaiting SP-03)" : ""}</div>
        <h3 style="margin:4px 0 6px">${l.emoji} ${l.name}</h3>
        <p>${l.ar}</p>
        <p class="small" style="margin-top:8px">${l.desc}</p>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn--ghost" id="photo">📸 AR photo</button>
          <button class="btn" id="quest" style="flex:2">${S.quest[id] ? "Quest done ✓ — continue" : `Start mini-quest · ${POINTS.quest} ★`}</button>
        </div>
      </div>`;
    $("#photo", v).onclick = () => takePhoto(video, usingCamera, l);
    $("#quest", v).onclick = () => S.quest[id] ? finishStop() : showQuest();
  }
  function showQuest() {
    const q = l.quest;
    bottom.innerHTML = `
      <div class="ar-sheet">
        <div class="tl-time">MINI-QUEST · ${l.name}</div>
        <h3 style="margin:6px 0 4px">${q.q}</h3>
        ${q.options.map((o, i) => `<button class="quiz-opt" data-i="${i}">${o}</button>`).join("")}
      </div>`;
    $$(".quiz-opt", v).forEach(b => b.onclick = () => {
      const i = +b.dataset.i, ok = i === q.a;
      $$(".quiz-opt", v).forEach((x, j) => { x.disabled = true; if (j === q.a) x.classList.add("right"); else if (j === i) x.classList.add("wrong"); });
      S.quest[id] = { correct: ok, at: Date.now() }; save();
      ok ? award(`quest:${id}`, POINTS.quest, "Correct answer!") : award(`quest:${id}`, POINTS.questTry, "Nice try");
      later(finishStop, 1300);
    });
  }
  function finishStop() {
    const wasVisited = S.visited[id];
    if (S.route.includes(id)) markVisited(id, true);
    const nx = nextStop();
    bottom.innerHTML = `
      <div class="ar-sheet" style="text-align:center">
        <div style="font-size:42px">${S.quest[id]?.correct ? "🎉" : "👏"}</div>
        <h3>${S.route.includes(id) ? (wasVisited ? "Already visited" : "Stop completed!") : "Quest completed!"}</h3>
        <p class="small" style="margin:4px 0 12px">You have <b>${S.points} ★</b>${nx ? ` · next: ${LM[nx].name}` : S.route.length ? " · route complete!" : ""}<br>${storageOK ? "Progress saved ✓" : "⚠️ Progress not saved (storage blocked)"}</p>
        <div class="btn-row">
          <button class="btn btn--ghost" id="toMap">${S.route.length ? "Back to route" : "Back"}</button>
          ${nx ? `<button class="btn" id="toNext">Next stop →</button>` : S.route.length ? `<button class="btn" id="toSum">See summary</button>` : ""}
        </div>
      </div>`;
    $("#toMap", v).onclick = () => S.route.length ? go("#/map") : goBack(`#/place/${id}`);
    const tn = $("#toNext", v); if (tn) tn.onclick = () => go(`#/place/${nx}`);
    const ts = $("#toSum", v); if (ts) ts.onclick = () => go("#/summary");
  }
}
function takePhoto(video, usingCamera, l) {
  try {
    const c = document.createElement("canvas");
    const w = usingCamera && video.videoWidth ? video.videoWidth : 1080;
    const h = usingCamera && video.videoHeight ? video.videoHeight : 1440;
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    if (usingCamera) g.drawImage(video, 0, 0, w, h);
    else { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, catColor(l)); gr.addColorStop(1, "#2d1b8f"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    g.font = `${Math.round(w * .28)}px serif`; g.textAlign = "center"; g.fillText(l.emoji, w / 2, h * .45);
    g.fillStyle = "rgba(59,31,212,.85)"; g.fillRect(0, h - h * .12, w, h * .12);
    g.fillStyle = "#fff"; g.font = `bold ${Math.round(w * .045)}px Manrope, sans-serif`;
    g.fillText(`${l.name} · Astana AR Tour`, w / 2, h - h * .05);
    const a = document.createElement("a");
    a.download = `astana-ar-${l.id}.png`; a.href = c.toDataURL("image/png"); a.click();
    award(`photo:${l.id}`, 5, "Photo challenge");
  } catch (e) { toast("Could not save the photo — try again"); }
}

/* =========================================================
   Screen 9 — Guided tours (Dependent mode): list, details, booking
   ========================================================= */
const BOOKING_RULES = {
  name: (x) => x.trim().length >= 2 || "Enter the traveller's name",
  phone: (x) => /^(\+?7|8)\d{10}$/.test(x.replace(/[\s()-]/g, "")) || "Enter a Kazakhstan number: +7 7XX XXX XX XX",
  email: (x) => !x.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.trim()) || "Check the email format",
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const statusChip = (b) => b.status === "cancelled" ? `<span class="chip badge-warn">Cancelled</span>` : `<span class="chip badge-ok">Confirmed</span>`;

function Guided(v, pid) {
  if (!pid) {
    const mine = [...S.bookings].reverse();
    v.innerHTML = `
      <div class="pad">
        ${mine.length ? `<div class="section-title" style="margin-top:0">My bookings</div>
          <div class="grid-list">${mine.map(b => `<button class="place-row" data-ref="${b.ref}">
            <div class="thumb" style="background:#efecff">🎫</div>
            <div class="place-row__body"><b>${PK[b.packageId].title}</b><div class="meta">${b.ref} · ${b.date} · ${b.time} · ${b.people} pax</div>
            <div class="chips">${statusChip(b)}${b.test ? `<span class="chip">TEST</span>` : ""}</div></div><span class="muted">›</span></button>`).join("")}</div>
          <div class="section-title">Book a guided tour</div>` : ""}
        <p class="small" style="margin-bottom:12px">Ready-made guided tours. Pick one and confirm — no further planning needed. Groups may use a minibus between distant stops.</p>
        <div class="pkg-grid">${PACKAGES.map(p => pkgCard(p, p.id === "p3" ? "MVP pilot" : "", "", true)).join("")}</div>
      </div>`;
    $$("[data-open]", v).forEach(b => b.onclick = () => go(`#/guided/${b.dataset.open}`));
    $$("[data-ref]", v).forEach(b => b.onclick = () => go(`#/booking/${b.dataset.ref}`));
    return;
  }
  const p = PK[pid]; if (!p) return go("#/guided");
  $("#screenTitle").textContent = p.title;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  v.innerHTML = `
    <div class="pad">
      ${pkgCard(p, "", "", "noBtn")}
      <div class="section-title">Route · start 10:00</div>
      <div class="timeline">
        ${p.timeline.map(it => {
          const name = it.type === "stop" ? `${LM[it.id].emoji} ${LM[it.id].name}` : it.type === "lunch" ? `🍽️ Lunch · ${LUNCH_ZONES[it.zone].name}` : "🚈 LRT ride & story card";
          const sub = it.type === "stop" ? LM[it.id].desc : it.story || "Opened 16 May 2026 · 18 stations · driverless";
          return tlRow(`<div class="tl-dot ${it.type === "stop" ? "" : "aux"}">${it.type === "stop" ? "●" : it.type === "lunch" ? "🍽" : "🚈"}</div>`,
            `<div class="tl-card"><div class="tl-time">${it.t}</div><h3>${name}</h3><p class="small">${sub}</p><div class="leg">➡️ ${it.next}</div></div>`);
        }).join("")}
      </div>
      <div class="alert alert--cold"><span class="ic">❄️</span><div><b>Cold-day swap:</b> ${p.coldSwap}</div></div>
      ${p.included ? `<div class="alert alert--info" style="margin-top:8px"><span class="ic">✅</span><div>${p.included} ${p.walking || ""}</div></div>` : ""}

      <div class="section-title">Book this tour</div>
      <form class="card stack" id="bookForm" novalidate>
        <div class="form-grid">
          <div class="field"><label for="date">Date</label><input type="date" id="date" min="${iso(new Date())}" value="${iso(tomorrow)}" required></div>
          <div class="field"><label for="time">Start time</label><select id="time">${p.startTimes.map(t => `<option>${t}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label for="people">Travellers</label><select id="people">${Array.from({ length: 15 }, (_, i) => `<option ${i === 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></div>
        <div class="field"><label for="name">Lead traveller name</label><input id="name" autocomplete="name" placeholder="e.g. Aruzhan Sadykova"><div class="field-err" data-for="name"></div></div>
        <div class="field"><label for="phone">Phone (WhatsApp)</label><input id="phone" type="tel" autocomplete="tel" placeholder="+7 701 123 45 67"><div class="field-err" data-for="phone"></div></div>
        <div class="field"><label for="email">Email (optional)</label><input id="email" type="email" autocomplete="email" placeholder="name@example.com"><div class="field-err" data-for="email"></div></div>
        <div class="info-row small"><span class="ic">📍</span><span>Meeting point: <b>${p.meeting}</b></span></div>
        <div class="info-row small"><span class="ic">💳</span><span>Price: <b>${p.price ? p.price + " ₸ / person" : "provided by Finance (TBD)"}</b></span></div>
        <div id="formMsg"></div>
        <button class="btn btn--block" id="confirm" type="submit">Confirm booking</button>
      </form>
    </div>`;

  const f = $("#bookForm", v);
  const dateProblem = () => {
    const val = $("#date", v).value;
    if (!val) return "Choose a date";
    const d = new Date(val + "T00:00");
    if (val < iso(new Date())) return "This date is in the past";
    if (val === iso(new Date())) {
      const [hh, mm] = ($("#time", v)?.value || p.startTimes[0]).split(":").map(Number);
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() > hh * 60 + mm - 30) return "Today's tour starts too soon to book. Please choose another day.";
    }
    if (p.noMondays && d.getDay() === 1) return "This tour does not run on Mondays (the National Museum is closed). Please choose another day.";
    return null;
  };
  const showDate = () => {
    const prob = dateProblem();
    $("#formMsg", v).innerHTML = prob ? `<div class="alert alert--warn"><span class="ic">⛔</span><div>${prob}</div></div>` : "";
    return !prob;
  };
  const checkField = (k) => {
    const r = BOOKING_RULES[k]($("#" + k, v).value);
    $(`.field-err[data-for="${k}"]`, v).textContent = r === true ? "" : r;
    $("#" + k, v).classList.toggle("is-invalid", r !== true);
    return r === true;
  };
  $("#date", v).onchange = showDate; $("#time", v).onchange = showDate; showDate();
  Object.keys(BOOKING_RULES).forEach(k => $("#" + k, v).addEventListener("blur", () => checkField(k)));

  f.onsubmit = (e) => {
    e.preventDefault();
    const okFields = Object.keys(BOOKING_RULES).map(checkField).every(Boolean);
    if (!showDate() || !okFields) { toast("Please fix the highlighted fields"); return; }
    const btn = $("#confirm", v);
    btn.disabled = true; btn.textContent = "Confirming…";
    later(() => {
      if (S.settings.testMode && S.settings.sim === "bookingFail") {
        btn.disabled = false; btn.textContent = "Retry booking";
        $("#formMsg", v).innerHTML = `<div class="alert alert--warn"><span class="ic">⚠️</span><div><b>Booking could not be completed.</b> Nothing was charged. Check your connection and tap Retry.</div></div>`;
        return;
      }
      const b = {
        ref: "AT-" + Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase(),
        packageId: p.id, date: $("#date", v).value, time: $("#time", v).value, people: +$("#people", v).value,
        name: $("#name", v).value.trim(), phone: $("#phone", v).value.trim(), email: $("#email", v).value.trim(),
        status: "confirmed", createdAt: Date.now(), test: !!S.settings.testMode, checks: {},
      };
      S.bookings.push(b); save();
      go(`#/booking/${b.ref}`);
    }, 800);
  };
}

function Booking(v, ref) {
  const b = S.bookings.find(x => x.ref === ref) || S.bookings[S.bookings.length - 1];
  if (!b) return go("#/guided");
  const p = PK[b.packageId];
  const cancelled = b.status === "cancelled";
  const dateStr = new Date(b.date + "T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  v.innerHTML = `
    <div class="pad stack">
      ${cancelled ? `<div class="alert alert--warn"><span class="ic">✕</span><div>This booking was cancelled.</div></div>` : ""}
      <div class="ticket" ${cancelled ? 'style="opacity:.6"' : ""}>
        <div class="tl-time" style="color:#c9c1ff">${cancelled ? "CANCELLED" : "BOOKING CONFIRMED"} · ${b.ref}${b.test ? " · TEST" : ""}</div>
        <h2 style="color:#fff;margin-top:6px">${p.title}</h2>
        <div class="guide" style="margin-top:14px">
          <div class="avatar" style="background:${p.guide.color}">${initials(p.guide.name)}</div>
          <div><b>${p.guide.name}</b><span style="color:rgba(255,255,255,.7)">Guide · ${p.guide.lang} · phone on tour day</span></div>
        </div>
        <div class="row">
          <div><span>Date</span><b>${dateStr}</b></div>
          <div><span>Start</span><b>${b.time} (arrive 10 min early)</b></div>
          <div><span>Travellers</span><b>${b.people}</b></div>
          <div><span>Price</span><b>${p.price ? p.price + " ₸" : "TBD (Finance)"}</b></div>
        </div>
        <div class="row" style="grid-template-columns:1fr">
          <div><span>Lead traveller</span><b>${esc(b.name || "—")} · ${esc(b.phone || "—")}</b></div>
          <div><span>Meeting point</span><b>${p.meeting}</b></div>
        </div>
      </div>
      ${cancelled ? `<button class="btn btn--block" id="again">Book again</button>` : `<button class="btn btn--block" id="startGuided">▶ Start guided tour</button>`}
      <div class="btn-row">
        <button class="btn btn--ghost btn--sm" id="copy">Copy details for Sales</button>
        ${cancelled ? "" : `<button class="btn btn--outline btn--sm" id="cancel">Cancel booking</button>`}
      </div>

      <div class="section-title">Phone checklist</div>
      <div class="card">${HANDBOOK.phone.map((t, i) => `<label class="check-row"><input type="checkbox" data-ck="${i}" ${b.checks?.[i] ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
      <div class="section-title">What to bring</div>
      <div class="card">${HANDBOOK.bring.map(([k, t]) => `<div class="check-row"><b style="min-width:92px">${k}</b><span class="small">${t}</span></div>`).join("")}</div>
      <div class="section-title">FAQ</div>
      ${HANDBOOK.faq.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join("")}
      <div class="section-title">Emergency (Kazakhstan)</div>
      <div class="sos-grid">${HANDBOOK.emergency.map(([n, t]) => `<a class="sos" href="tel:${n}"><b>${n}</b><span>${t}</span></a>`).join("")}</div>
      <p class="small muted">Guide on duty & Tour Operations hotline: numbers to be added by Tour Operations.</p>
    </div>`;
  $$("[data-ck]", v).forEach(c => c.onchange = () => { b.checks = { ...(b.checks || {}), [c.dataset.ck]: c.checked }; save(); });
  const sg = $("#startGuided", v);
  if (sg) sg.onclick = () => startTour({ kind: "guided", packageId: p.id, bookingRef: b.ref }, p.timeline.filter(t => t.type === "stop").map(t => t.id));
  const ag = $("#again", v); if (ag) ag.onclick = () => go(`#/guided/${p.id}`);
  const cc = $("#cancel", v);
  if (cc) cc.onclick = () => {
    if (!confirm(`Cancel booking ${b.ref}?`)) return;
    b.status = "cancelled"; b.cancelledAt = Date.now();
    if (S.tour?.bookingRef === b.ref) { S.tour = null; S.route = []; }
    save(); toast("Booking cancelled"); router();
  };
  $("#copy", v).onclick = async () => {
    const text = [`Booking ${b.ref}${b.test ? " (TEST)" : ""} — ${b.status}`, `Tour: ${p.title}`, `Date: ${b.date} ${b.time}`,
      `Travellers: ${b.people}`, `Lead: ${b.name} · ${b.phone}${b.email ? " · " + b.email : ""}`, `Meeting point: ${p.meeting}`,
      `Created: ${new Date(b.createdAt).toLocaleString("en-GB")}`, `Build: ${APP_VERSION}`].join("\n");
    try { await navigator.clipboard.writeText(text); toast("Copied — paste it to Sales"); }
    catch (e) { prompt("Copy the booking details:", text); }
  };
}

/* =========================================================
   Screen 10 — Route summary
   ========================================================= */
function Summary(v) {
  if (!S.route.length) {
    v.innerHTML = `<div class="empty"><div class="big">🏆</div><h2>No progress yet</h2><p style="margin:8px 0 18px">Start a tour — visited stops, points and badges will appear here.</p><button class="btn" onclick="location.hash='#/mode'">Start Tour</button></div>`;
    return;
  }
  const plan = buildPlan();
  const done = S.route.filter(id => S.visited[id]);
  const all = done.length === S.route.length;
  const correct = Object.values(S.quest).filter(q => q.correct).length;
  const next = BADGES.find(b => b.pts > S.points);
  v.innerHTML = `
    <div class="summary-hero">
      <div class="big">${all ? "🏆" : "🧭"}</div>
      <h1>${all ? "Route complete!" : "Your progress"}</h1>
      <p>${all ? `You explored ${S.route.length} places in Astana. +${POINTS.finish} ★ bonus for finishing.` : `${S.route.length - done.length} stops still waiting for you.`}</p>
    </div>
    <div class="stats">
      <div class="stat"><b>${done.length}/${S.route.length}</b><span>Stops visited</span></div>
      <div class="stat"><b>${S.points} ★</b><span>Points earned</span></div>
      <div class="stat"><b>${km(plan.totalKm)}</b><span>Route length</span></div>
      <div class="stat"><b>${correct}/${Object.keys(S.quest).length}</b><span>Quests correct</span></div>
    </div>
    <div class="pad">
      <div class="section-title">Badges</div>
      <div class="badges">${BADGES.map(b => `<div class="badge ${S.points >= b.pts ? "" : "locked"}"><span class="e">${b.emoji}</span>${b.name}<div class="muted" style="font-weight:600">${b.pts} ★</div></div>`).join("")}</div>
      ${next ? `<p class="small muted" style="margin-top:8px">${next.pts - S.points} ★ to unlock “${next.name}”. Partner discounts — to be agreed with Finance.</p>` : ""}
      <div class="section-title">Completed & remaining stops</div>
      ${S.route.map((id, i) => {
        const l = LM[id], vis = S.visited[id];
        const when = typeof vis === "number" ? ` · ${new Date(vis).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "";
        return `<button class="place-row ${vis ? "is-on" : ""}" data-id="${id}">
          <div class="thumb" style="${thumbBg(l)}">${l.emoji}</div>
          <div class="place-row__body"><b>${i + 1}. ${l.name}</b><div class="meta">${vis ? "Visited" + when : "Remaining"}${S.quest[id] ? ` · quest ${S.quest[id].correct ? "✓" : "✗"}` : ""}</div></div>
          <div class="check">✓</div></button>`;
      }).join("")}
      <div class="stack" style="margin-top:18px">
        ${!all ? `<button class="btn btn--block" id="back">Continue route</button>` : ""}
        <button class="btn btn--block btn--ghost" id="share">Share my result</button>
        <button class="btn btn--block btn--outline" id="new">Start a new tour</button>
      </div>
    </div>`;
  $$(".place-row", v).forEach(r => r.onclick = () => go(`#/place/${r.dataset.id}`));
  const bk = $("#back", v); if (bk) bk.onclick = () => go("#/map");
  $("#share", v).onclick = async () => {
    const text = `I explored ${done.length} places in Astana with Astana AR Tour and earned ${S.points} ★!`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); } } catch (e) {}
  };
  $("#new", v).onclick = () => {
    const keep = { answers: S.answers, bookings: S.bookings, settings: S.settings };
    S = { ...freshState(), ...keep }; save(); go("#/mode");
  };
}

/* ---------------- Boot ---------------- */
if (!location.hash) location.hash = "#/home";
router();
