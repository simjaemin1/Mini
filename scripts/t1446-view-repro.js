#!/usr/bin/env node
// === scripts/t1446-view-repro.js — T1446 재현 틀(계측 자 · @regress 없음) ===========================
//
// ★무엇을 재나 — 카드 T1446 할 일 1 · 2 · 7: 라이브 크기 목록(길 456,479칸 · 건물 5,806 — `t1446-synth.js`)을 **welcome 에 실어**
//   클라를 띄우고(존 소켓을 Playwright `routeWebSocket` 으로 받아 welcome 글자에 길 · 건물을 넣는다 — 클라는 진짜 welcome 입구로 받는다)
//   마을 한가운데(촘촘 — 화면 상자 길 3,700칸 남짓) · 교역로 가(성김 — 300칸 남짓)에 서서 `__lagReport(초)` 를 잰다.
//   팔 = 브라우저(WebKit = Safari 엔진 · Chromium) × 손잡이 `T1446_VIEW_INDEX`(끔 = 주소 `?t1446=0` · 켬 = 기본) × `t1193`(끔 · 켬 — 화면 배율 2).
//   판마다: 렉 보고 글 · 값(프레임 · 층 · 그 밖 렌더 쪼갬) · 첫 접속 표(`__loadReport` — welcome 풀기 · 처리 ms) · 접속 뒤 10초 핑 표본(`lastRttMs`) · 색인 크기.
// ⚠헤드리스는 GPU 가 없다(그리기 · 물 셰이더가 소프트웨어) — 프레임 dt 의 "브라우저 몫" · 물 층은 재민 맥보다 크다.
//   그래서 비교는 **같은 팔끼리 끔 ↔ 켬** 이고 길 훑기 · 건물 훑기(CPU)는 절대값으로도 읽는다. `--water off` 는 물 층을 꺼 GL 소음을 걷은 판.
//
// 실행: node scripts/t1446-view-repro.js [--browsers webkit,chromium] [--sec 20] [--spots dense,sparse] [--t1193 0,1] [--water on|off] [--vil 0|1] [--out 계측/T1446_<날짜>]
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const SY = require('./t1446-synth');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BROWSERS = arg('--browsers', 'webkit,chromium').split(',');
const SEC = +arg('--sec', 20);
const SPOTS = arg('--spots', 'dense,sparse').split(',');
const T1193S = arg('--t1193', '0,1').split(',').map(Number);
const KNOBS = arg('--knobs', '0,1').split(',').map(Number);
const WATER = arg('--water', 'on');
const VIL = arg('--vil', '0');
const OUT = path.resolve(ROOT, arg('--out', '계측/T1446_' + new Date().toISOString().slice(0, 10)));
const VIEW = { width: +arg('--w', 1580), height: +arg('--h', 790) };   // 재민 렉 보고: 뒤판 4.99M 화소 × 배율 2 ⇒ CSS 1,580 × 790 남짓
fs.mkdirSync(OUT, { recursive: true });

const say = (s) => { console.log(s); fs.appendFileSync(path.join(OUT, 'repro-log.txt'), s + '\n'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
function killAll() { for (const p of procs) { try { p.kill(); } catch (e) {} } procs.length = 0; }

// ── 목록 ───────────────────────────────────────────────────────────────────────────
const V = SY.villageCenters();
const AT = V.vils.find((v) => v.name === '농촌22') || V.vils[0];   // 새 세계의 첫 자리 마을(스폰) — 촘촘 자리
const RD = SY.synthRoads({});
const BD = SY.synthBuildings({ at: AT });
//   성김 자리 — 교역로 가 · 화면 상자(±47칸) 안 길이 300칸에 가장 가까운 곳(PM 재기 "화면 안 300칸")
function sparseSpot() {
  const cells = new Set(); for (let i = 0; i < RD.flat.length; i += 3) cells.add(RD.flat[i + 1] * RD.W + RD.flat[i]);
  const inBox = (cx, cy) => { let n = 0; for (let y = cy - 47; y <= cy + 47; y++) for (let x = cx - 47; x <= cx + 47; x++) if (cells.has(y * RD.W + x)) n++; return n; };
  let best = null;
  const near = V.vils.slice().sort((a, b) => Math.hypot(a.cx - AT.cx, a.cy - AT.cy) - Math.hypot(b.cx - AT.cx, b.cy - AT.cy)).slice(1, 4);
  for (const u of near) for (let t = 0.15; t <= 0.85; t += 0.05) {
    const cx = Math.round(AT.cx + (u.cx - AT.cx) * t), cy = Math.round(AT.cy + (u.cy - AT.cy) * t), n = inBox(cx, cy);
    if (!best || Math.abs(n - 300) < Math.abs(best.n - 300)) best = { cx, cy, n, via: u.name, t: +t.toFixed(2) };
  }
  return best;
}
const SPOT = { dense: { cx: AT.cx, cy: AT.cy, name: AT.name + ' 가운데' }, sparse: (() => { const s = sparseSpot(); return { cx: s.cx, cy: s.cy, name: `${AT.name} → ${s.via} 교역로 ${s.t}`, n: s.n }; })() };

async function bootWorld() {
  killAll(); await sleep(1000);
  const db = `/tmp/t1446-repro-${process.pid}.db`; try { fs.unlinkSync(db); } catch (e) {}
  const c = boot(path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' }); if (!cu.ok) throw new Error(cu.why);
  const z = boot(path.join(ROOT, 'server', 'zone.js'), { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: db, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: VIL, ENABLE_BANDITS: '0' });
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 }); if (!zu.ok) throw new Error(zu.why);
  if (VIL === '1') await sleep(15000);
}

// welcome 에 길 · 건물을 싣는다 — 클라는 진짜 welcome 입구(30-n-net)로 받는다
function injectWelcome(m) {
  if (typeof m !== 'string' || m.lastIndexOf('{"type":"welcome"', 0) !== 0) return m;
  const o = JSON.parse(m);
  o.roads = RD.flat;
  o.buildings = (o.buildings || []).concat(BD);
  return JSON.stringify(o);
}

async function runArm(PW, bn, spotKey, t1193, knob) {
  const browser = await PW[bn].launch();
  try { return await runArm1(browser, spotKey, t1193, knob); } finally { await browser.close().catch(() => {}); }
}
async function runArm1(browser, spotKey, t1193, knob) {
  const sp = SPOT[spotKey];
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.routeWebSocket(new RegExp(':' + ZPORT), (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(injectWelcome(m)));
  });
  await page.addInitScript(() => {   // 접속 뒤 핑 표본(화면 핑 숫자 = `lastRttMs`)
    window.__t1446Ping = [];
    const iv = setInterval(() => { try { if (typeof lastRttMs !== 'undefined' && window.__t1446Ping.length < 400) window.__t1446Ping.push([performance.now(), lastRttMs]); } catch (e) {} }, 100);
    setTimeout(() => clearInterval(iv), 120000);
  });
  const q = [`t1193=${t1193}`, `t1446=${knob}`].join('&');
  await page.goto(`http://localhost:${CPORT}/?${q}`);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
  try { await page.click('#enter'); } catch (e) {}
  const entered = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId()), null, { timeout: 120000 }).then(() => true).catch(() => false);
  if (!entered) return { err: '입장 못 함', errs };
  const load = await page.evaluate(() => window.__loadReport().then((x) => x && { stages: x.stages, welcome: x.welcome, long: x.long, total: x.total, settled: x.settled, at: x.at, text: x.text }));
  await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });
  if (WATER === 'off') await page.evaluate(() => { if (window.__terrain19) window.__terrain19.waterOff = true; });
  // 자리로 — 서버 권위로 도착을 잰다(T392 족보)
  const goal = { x: sp.cx * 32 + 16, y: sp.cy * 32 + 16 };
  let arrived = false;
  for (let tries = 0; tries < 4 && !arrived; tries++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [goal.x, goal.y]);
    arrived = await page.waitForFunction(([x, y]) => { const c = conns.get(window.__getPrimaryZoneId()); const m = window.__getSrvAbs ? window.__getSrvAbs() : null;
      return !!(c && c.meta && m) && Math.abs(m.x - c.meta.worldOffsetX - x) < 64 && Math.abs(m.y - (c.meta.worldOffsetY || 0) - y) < 64; }, [goal.x, goal.y], { timeout: 30000, polling: 250 }).then(() => true).catch(() => false);
  }
  await sleep(8000);   // 지면 타일 · 자연물 청크가 구워질 때까지(가라앉음)
  const stat = await page.evaluate(() => window.__t1446.stat());
  const rep = await page.evaluate((s) => window.__lagReport(s).then((x) => x && { text: x.text, split: x.split, table: x.table, frames: x.frame.frames, parts: x.frame.parts, pong: x.frame.pong.rtt }), SEC);
  const ping = await page.evaluate(() => { const w = (window.__loadReportResult && window.__loadReportResult.at) || {}; return { welcomeRx: w.welcomeRx, s: window.__t1446Ping }; });
  const inView = await page.evaluate(() => { let n = 0; const c = conns.get(window.__getPrimaryZoneId()); const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0, O = window.__fogOrigin;   // 안개 원점 = 카메라(`_camAbs`)
    for (const k of c.roads.keys()) { const i = k.indexOf(','); const ax = ox + +k.slice(0, i) * 32 + 16, ay = oy + +k.slice(i + 1) * 32 + 16; if (Math.abs(ax - O.x) <= 1500 && Math.abs(ay - O.y) <= 1500) n++; }
    let b = 0; for (const x of c.buildings.values()) if (Math.abs(ox + x.x - O.x) <= 1500 && Math.abs(oy + x.y - O.y) <= 1500) b++;
    return { roads: n, blds: b, hidpi: window.__hidpiDbg ? window.__hidpiDbg() : null }; });
  return { arrived, load, stat, rep, ping, inView, errs: errs.slice(0, 5) };
}

(async () => {
  fs.writeFileSync(path.join(OUT, 'repro-log.txt'), '');
  say(`=== T1446 재현 틀 — 길 ${RD.flat.length / 3}칸 · 건물 ${BD.length}개 · 자리 촘촘 ${SPOT.dense.name}(${SPOT.dense.cx},${SPOT.dense.cy}) · 성김 ${SPOT.sparse.name}(${SPOT.sparse.cx},${SPOT.sparse.cy} · 상자 안 ${SPOT.sparse.n}칸) ===`);
  say(`  팔: ${BROWSERS.join('·')} × ${SPOTS.join('·')} × t1193 ${T1193S.join('·')} × 손잡이 ${KNOBS.join('·')} · ${SEC}초 · 물 ${WATER} · 마을 ${VIL} · 화면 ${VIEW.width}×${VIEW.height} ×2`);
  await bootWorld();
  const PW = require('playwright');
  const rows = [];
  for (const bn of BROWSERS) for (const spot of SPOTS) for (const t1193 of T1193S) for (const knob of KNOBS) {
    const tag = `${bn}-${spot}-t1193${t1193}-idx${knob}`;
    let r = null;
    try { r = await runArm(PW, bn, spot, t1193, knob); } catch (e) { r = { err: String(e && e.message || e) }; }
    rows.push({ tag, bn, spot, t1193, knob, ...r });
    fs.writeFileSync(path.join(OUT, 'repro.json'), JSON.stringify({ at: new Date().toISOString(), synth: { roads: RD.flat.length / 3, built: RD.built, buildings: BD.length, spot: SPOT }, view: VIEW, water: WATER, vil: VIL, sec: SEC, rows }, null, 1));
    if (r.err) { say(`  ✗ ${tag}: ${r.err}`); continue; }
    const S = Object.fromEntries((r.rep.split || []).map((x) => [x['층'], x['프레임당 ms']]));
    const st = r.load && r.load.stages ? Object.fromEntries(r.load.stages.map((x) => [x['갈래'], x.ms])) : {};
    say(`  ${tag}: 프레임 p50 ${r.rep.frames.p50} · p95 ${r.rep.frames.p95} · fps ${r.rep.frames.fps} · 렌더 p50 ${r.rep.frames.per ? r.rep.frames.per.r : '-'} · 길 훑기 ${S['길 훑기']} · 건물 훑기 ${S['건물 훑기']} · 그 밖 목록 ${S['그 밖 목록']} · 안개 ${S['안개']} · `
      + `welcome 풀기 ${st['welcome 풀기(JSON)']} · 처리 ${st['welcome 처리']} · 화면 안 길 ${r.inView.roads} · 건물 ${r.inView.blds} · 도착 ${r.arrived} · 오류 ${r.errs.length}`);
    say('    ' + r.rep.text.split('\n').slice(1, 5).join('\n    '));
  }
  killAll();
  say('끝');
  process.exit(0);
})().catch((e) => { say('실패: ' + (e && e.stack)); killAll(); process.exit(1); });
