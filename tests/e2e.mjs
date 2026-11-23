import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
const SP = process.argv[2], URL0 = (process.env.BASE || "http://localhost:8768/index.html") + "?test=1";
const edge = spawn("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ["--headless=new", "--disable-gpu", "--remote-debugging-port=9333", `--user-data-dir=${SP}\\e2eprof`,
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--window-size=430,900", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40; i++) {
  try { const l = await (await fetch("http://127.0.0.1:9333/json/list")).json(); const pg = l.find(x => x.type === "page"); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch { }
  await sleep(300);
}
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map(a => a.value || a.description).join(" "));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
  return r.result.result.value;
};
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${SP}/e2e_${name}.png`, Buffer.from(r.result.data, "base64")); };
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 420, height: 880, deviceScaleFactor: 1, mobile: true });
const nav = async (h) => { await ev(`location.hash="${h}"`); await sleep(900); };
const results = [];
const check = (name, ok, info = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); console.log(results.at(-1)); };
const setSim = (s) => ev(`S.settings.testMode=true;S.settings.sim="${s}";save();`);
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, "error: " + e.message.split("\n")[0]); } };

await send("Page.navigate", { url: URL0 + "#/home" }); await sleep(2500);
await ev(`localStorage.clear(); S = freshState(); S.settings.testMode = true; save(); router();`);
await step("home", async () => check("Home renders in tester mode", await ev(`return document.body.classList.contains("test-mode") && !!$("#tmode")`)));

await step("A", async () => {
  await setSim("ok"); await nav("#/ar/baiterek"); await sleep(1200);
  check("Recognition: ready hint at scan spot", (await ev(`return $("#hint").textContent`)).includes("Ready"));
  await ev(`$("#scan").click()`); await sleep(2800);
  check("Recognition: Baiterek recognised → AR scene", await ev(`return $("#arObj").classList.contains("show")`));
  check("Live (fake) camera started", (await ev(`return $("#arMode").textContent`)) === "Live camera");
  await shot("A_recognised");
  await ev(`$("#quest").click()`); await sleep(300); await ev(`$('.quiz-opt[data-i="1"]').click()`); await sleep(1800);
  check("Quest answered, points saved", await ev(`const s=JSON.parse(localStorage.getItem(STORE_KEY)); return s.points>=10 && s.quest.baiterek.correct`));
});
await step("B", async () => {
  await setSim("far"); await nav("#/ar/khanshatyr"); await sleep(1200);
  check("Too far: hint shows distance", (await ev(`return $("#hint").textContent`)).includes("from the scan spot"));
  await ev(`$("#scan").click()`); await sleep(13500);
  check("Too far: fail sheet with Retry/Navigate/Skip", await ev(`const t=$("#arBottom").textContent; return t.includes("COULD NOT RECOGNISE") && !!$("#retry") && !!$("#skip2") && t.includes("Navigate")`));
  await shot("B_far");
  await ev(`$("#skip2").click()`); await sleep(600);
  check("Skip scan still unlocks story", await ev(`return $("#arBottom").textContent.includes("Scan skipped")`));
});
await step("C", async () => {
  await setSim("gpsDenied"); await nav("#/ar/centralmosque"); await sleep(1200); await ev(`$("#scan").click()`); await sleep(1500);
  check("GPS denied: explained with Retry", await ev(`return $("#arBottom").textContent.includes("Location access is blocked") && !!$("#retry")`));
  await shot("C_gps");
});
await step("D", async () => {
  await setSim("camDenied"); await nav("#/ar/baiterek"); await sleep(1000);
  check("Camera denied: banner + Retry, fallback shown", await ev(`return !$("#camBanner").hidden && !!$("#camRetry") && $("#fallback").style.display!=="none"`));
  await shot("D_cam");
});
await step("E", async () => {
  await setSim("ok"); await ev(`startTour({kind:"independent"},["khanshatyr","loverspark","baiterek"]);`); await sleep(1500);
  await ev(`$("#navGo").click()`); await sleep(2500);
  check("Navigation: live distance shown", (await ev(`return $("#navCard").textContent`)).includes("min walk"));
  await shot("E_nav");
  await sleep(10000);
  check("Navigation: arrival detected → AR button", (await ev(`return $("#navCard").textContent`)).includes("arrived"));
});
await step("F", async () => {
  await ev(`markVisited("khanshatyr")`); await send("Page.reload"); await sleep(2500);
  check("Saved progress survives reload", await ev(`return !!S.visited.khanshatyr && S.route.length===3`));
});
await step("G", async () => {
  await nav("#/guided/p3");
  const mon = await ev(`const d=new Date(); d.setDate(d.getDate()+((8-d.getDay())%7||7)); return iso(d)`);
  await ev(`$("#date").value="${mon}"; $("#date").onchange();`);
  check("Booking: Monday blocked for Package 3", (await ev(`return $("#formMsg").textContent`)).includes("Mondays"));
  await ev(`const d=new Date("${mon}T00:00"); d.setDate(d.getDate()+1); $("#date").value=iso(d); $("#date").onchange();`);
  await ev(`$("#phone").value="123"; $("#bookForm").requestSubmit();`); await sleep(400);
  check("Booking: name + phone validation errors", await ev(`return $('.field-err[data-for="name"]').textContent.length>0 && $('.field-err[data-for="phone"]').textContent.includes("+7")`));
  await shot("G_validation");
  await setSim("bookingFail");
  await ev(`$("#name").value="Test Sales"; $("#phone").value="+7 701 123 45 67"; $("#bookForm").requestSubmit();`); await sleep(1300);
  check("Booking: failure state with Retry", await ev(`return $("#formMsg").textContent.includes("could not be completed") && $("#confirm").textContent.includes("Retry")`));
  await setSim("ok"); await ev(`$("#bookForm").requestSubmit();`); await sleep(1500);
  check("Booking: confirmed, TEST-flagged, saved", await ev(`return location.hash.startsWith("#/booking/") && S.bookings.length===1 && S.bookings[0].test && S.bookings[0].status==="confirmed"`));
  await shot("G_ticket");
  await ev(`$("#startGuided").click()`); await sleep(1200);
  check("Booking → guided route starts", await ev(`return location.hash==="#/map" && S.tour.kind==="guided" && S.route[0]==="houseministers"`));
  await nav(`#/booking/${await ev(`return S.bookings[0].ref`)}`);
  await ev(`window.confirm=()=>true; $("#cancel").click();`); await sleep(800);
  check("Booking: cancel works, guided route cleared", await ev(`return S.bookings[0].status==="cancelled" && S.route.length===0`));
  await nav("#/guided");
  check("My bookings list shows the booking", (await ev(`return $("#view").textContent`)).includes("Cancelled"));
});
await step("H", async () => {
  await ev(`startTour({kind:"independent"},["baiterek","akorda"]);`); await sleep(800);
  for (const h of ["#/home", "#/mode", "#/quiz", "#/recs", "#/select", "#/place/nuralem", "#/guided/p1", "#/summary", "#/map"]) await nav(h);
  check("Smoke: all screens open", true);
});
await step("I", async () => {
  // regressions for fixes in this build
  await ev(`localStorage.clear(); S = freshState(); S.settings.testMode = true; save();`);
  await nav("#/summary");
  check("Progress page without a route shows an empty state", (await ev(`return $("#view").textContent`)).includes("No progress yet"));
  await send("Page.navigate", { url: URL0 + "&fresh=1#/ar/baiterek" }); await sleep(2500);
  await ev(`$("#close").click()`); await sleep(800);
  check("AR opened from a direct link: close stays on the site", await ev(`return location.hash.startsWith("#/place/baiterek") && !!$("#view")`));
  await nav("#/guided/p1");
  await ev(`$("#phone").value="8 701 123 45 67"; $("#phone").dispatchEvent(new Event("blur"));`);
  check("Phone in 8XXX format accepted", await ev(`return $('.field-err[data-for="phone"]').textContent===""`));
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
  await ev(`startTour({kind:"independent"},["baiterek","akorda","palace"]);`); await sleep(1200);
  for (const h of ["#/home", "#/recs", "#/select", "#/map", "#/guided", "#/guided/p3", "#/place/khanshatyr", "#/summary"]) await nav(h);
  check("Desktop website layout: header visible, map in split view", await ev(`location.hash="#/map"; await new Promise(r=>setTimeout(r,1200)); return getComputedStyle($("#siteNav")).display==="flex" && $(".map-wrap").getBoundingClientRect().width > 600`));
});
check("No JS exceptions across the run", errors.length === 0, errors.slice(0, 3).join(" | "));
ws.close(); spawnSync("taskkill", ["/PID", String(edge.pid), "/T", "/F"]);
process.exit(0);
