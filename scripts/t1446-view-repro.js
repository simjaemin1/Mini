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
//   `--scan-table` — 카드 할 일 5 · 6 전수 표: 같은 페이지(켬)에서 렌더 모으기 목록마다 프레임당 ms(라이브 크기 · 종전 고리 꼴 — 화면 밖도 도는 몫) ·
//     프레임 밖 통째 훑기(자연물 막음 · 벽지도 · 계단 · 경작지 · 문 · 우물 · 곳간 · 온보딩 · 안개 벽 모으기)의 한 번 ms 를 잰다 → `scan.json`.
// 실행: node scripts/t1446-view-repro.js [--browsers webkit,chromium] [--sec 20] [--spots dense,sparse] [--t1193 0,1] [--water on|off] [--vil 0|1] [--scan-table] [--out 계측/T1446_<날짜>]
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
const VIEW = { width: +arg('--w', 1580), height: +arg('--h', 790) };
const SCAN = process.argv.includes('--scan-table');   // 재민 렉 보고: 뒤판 4.99M 화소 × 배율 2 ⇒ CSS 1,580 × 790 남짓
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
// 전수 표 — 페이지 안에서 잰다(라이브 크기: 길 · 건물은 실은 목록 그대로 · 그 밖은 라이브 · 새 세계 수로 지은 목록을 종전 고리 꼴 그대로 돈다)
function scanInPage(L) {
  const c = conns.get(window.__getPrimaryZoneId()), O = window.__fogOrigin, R = 1500, ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
  const worldCx = O.x, worldCy = O.y, VIEW_RADIUS = R, renderT = performance.now() - 100;
  //   WebKit 의 performance.now() 는 1ms 눈금이다 — 한 표본을 20ms 넘게 되풀이해 재고 나눈다(Chromium 도 같은 자)
  const med = (fn, reps) => { let k = 1; for (;;) { const t = performance.now(); for (let i = 0; i < k; i++) fn(); if (performance.now() - t >= 20 || k >= 4096) break; k *= 2; }
    const a = []; for (let i = 0; i < (reps || 11); i++) { const t = performance.now(); for (let j = 0; j < k; j++) fn(); a.push((performance.now() - t) / k); } a.sort((x, y) => x - y); return +a[a.length >> 1].toFixed(4); };
  const keys = [...c.roads.keys()], pick = (n, off) => { const out = []; for (let i = 0; i < n; i++) out.push(keys[(off + Math.floor(i * keys.length / n)) % keys.length]); return out; };
  const P = (k) => { const i = k.indexOf(','); return [+k.slice(0, i), +k.slice(i + 1)]; };
  const bridges = new Set(pick(L.bridges, 7)), ditches = new Set(pick(L.ditches, 13)), gran = new Map(pick(L.granStock, 17).map((k) => [k, 3]));
  const claims = pick(L.claims, 19).map((k, i) => { const [x, y] = P(k); return { id: i, x: x * 32, y: y * 32, w: 256, h: 256, kind: 'private' }; });
  const sims = pick(L.simVillages, 23).map((k, i) => { const [x, y] = P(k); return { id: i, cx: x, cy: y, r: 1500 }; });
  const camps = pick(L.banditCamps, 29).map((k) => { const [x, y] = P(k); return { x: x * 32, y: y * 32 }; });
  const objs = (n, off) => pick(n, off).map((k, i) => { const [x, y] = P(k); return { id: i, x: x * 32 + 16, y: y * 32 + 16, buf: [] }; });
  const mobs = objs(L.mobs, 31), corpses = objs(L.corpses, 37), items = objs(L.groundItems, 41);
  const out = [], sink = [];
  const row = (list, n, src, fn, note) => out.push({ list, n, src, ms: med(fn), note: note || '' });
  // ── 렌더 모으기 목록(:712 ~ :1043 · 종전 고리 꼴 · 화면 밖도 돈다)
  row('resources', c.resources.size, '이 판 존(라이브 103)', () => { sink.length = 0; for (const r of c.resources.values()) { const ax = ox + r.x, ay = oy + r.y; if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue; sink.push(w2i(ax, ay)); } });
  row('groundItems', items.length, L.src, () => { sink.length = 0; for (const gi of items) { const ax = ox + gi.x, ay = oy + gi.y; if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue; sink.push(w2i(ax, ay)); } });
  row('claims', claims.length, L.src, () => { sink.length = 0; for (const cl of claims) { const cax = ox + cl.x + cl.w / 2, cay = oy + cl.y + cl.h / 2; if (Math.abs(cax - worldCx) > VIEW_RADIUS + 200 || Math.abs(cay - worldCy) > VIEW_RADIUS + 200) continue; sink.push(w2i(cax, cay)); } });
  row('roads(종전 고리)', c.roads.size, '실은 목록(라이브 456,479)', () => { sink.length = 0; for (const [rk, lv] of c.roads) { const ci = rk.indexOf(','); const rcx = +rk.slice(0, ci), rcy = +rk.slice(ci + 1); const rax = ox + rcx * 32 + 16, ray = oy + rcy * 32 + 16; if (Math.abs(rax - worldCx) > VIEW_RADIUS || Math.abs(ray - worldCy) > VIEW_RADIUS) continue; sink.push({ z: w2i(rax, ray).y - 950, lv }); } }, '화면 밖도 돈다(칸마다 글자 쪼개기)');
  row('roads(색인 · 켬)', c.roads.size, '실은 목록', () => { sink.length = 0; const Q = _t1446Cells(c.roads, ox, oy, worldCx, worldCy, VIEW_RADIUS); for (let i = 0; i < Q.n; i++) { const j = Q.sk[i] % 16384; const rax = ox + Q.cx[j] * 32 + 16, ray = oy + Q.cy[j] * 32 + 16; sink.push({ z: w2i(rax, ray).y - 950, lv: Q.lv[j] }); } }, '화면 상자만');
  row('bridges', bridges.size, L.src, () => { sink.length = 0; for (const bk of bridges) { const ci = bk.indexOf(','); const bcx = +bk.slice(0, ci), bcy = +bk.slice(ci + 1); const bax = ox + bcx * 32 + 16, bay = oy + bcy * 32 + 16; if (Math.abs(bax - worldCx) > VIEW_RADIUS || Math.abs(bay - worldCy) > VIEW_RADIUS) continue; sink.push(bridges.has((bcx + 1) + ',' + bcy)); } });
  row('ditches', ditches.size, L.src, () => { sink.length = 0; for (const dk of ditches) { const ci = dk.indexOf(','); const dcx = +dk.slice(0, ci), dcy = +dk.slice(ci + 1); const dax = ox + dcx * 32 + 16, day2 = oy + dcy * 32 + 16; if (Math.abs(dax - worldCx) > VIEW_RADIUS || Math.abs(day2 - worldCy) > VIEW_RADIUS) continue; sink.push(ditches.has((dcx + 1) + ',' + dcy)); } });
  row('granStock', gran.size, L.src, () => { sink.length = 0; for (const [gk, st] of gran) { if (!(st > 0)) continue; const ci = gk.indexOf(','); const gcx = +gk.slice(0, ci), gcy = +gk.slice(ci + 1) + 2; const gax = ox + gcx * 32 + 16, gay = oy + gcy * 32 + 16; if (Math.abs(gax - worldCx) > VIEW_RADIUS || Math.abs(gay - worldCy) > VIEW_RADIUS) continue; sink.push(st); } });
  row('simVillages', sims.length, L.src, () => { sink.length = 0; for (const v of sims) { const vcx = ox + v.cx * 32 + 16, vcy = oy + v.cy * 32 + 16; const cullR = (v.r || 1200); if (Math.abs(vcx - worldCx) > VIEW_RADIUS + cullR || Math.abs(vcy - worldCy) > VIEW_RADIUS + cullR) continue; sink.push(v); } });
  row('banditCamps', camps.length, L.src, () => { sink.length = 0; for (const bc of camps) { const bx = ox + bc.x, by = oy + bc.y; if (Math.abs(bx - worldCx) > VIEW_RADIUS + 200 || Math.abs(by - worldCy) > VIEW_RADIUS + 200) continue; sink.push(bc); } });
  row('buildings(종전 고리 · 컬링만)', c.buildings.size, '실은 목록(라이브 5,806)', () => { sink.length = 0; for (const b of c.buildings.values()) { const ax = ox + b.x, ay = oy + b.y; if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue; sink.push(b); } }, '몸통의 태그 · 움집 렉트 몫은 프레임 캡처 "건물 훑기"');
  row('buildings(색인 · 켬)', c.buildings.size, '실은 목록', () => { sink.length = 0; const B = _t1446Blds(c.buildings, ox, oy, worldCx - 1900, worldCx + 1900, worldCy - 1900, worldCy + 1900); for (const b of B) sink.push(b); }, '화면 상자 + 400px');
  row('mobs', mobs.length, L.src, () => { sink.length = 0; for (const m of mobs) { const pos = sampleAt(m.buf, renderT, m.x, m.y); const ax = ox + pos.x, ay = oy + pos.y; if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue; sink.push(w2i(ax, ay)); } });
  row('corpses', corpses.length, L.src, () => { sink.length = 0; for (const co of corpses) { const ax = ox + co.x, ay = oy + co.y; if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue; sink.push(w2i(ax, ay)); } });
  row('others', c.others.size, '이 판 존(라이브 1)', () => { sink.length = 0; for (const o of c.others.values()) { const pos = sampleAt(o.buf, renderT, o.x, o.y); const ax = ox + pos.x, ay = oy + pos.y; if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue; sink.push(o); } });
  row('rooms(srvRooms)', srvRooms.size, '이 판(라이브 미상 — 플레이어가 지은 방)', () => { sink.length = 0; for (const room of srvRooms.values()) for (const r of roomRects(room)) sink.push(r); });
  // ── 프레임 밖 통째 훑기(grep 전수 — 부르는 때가 다르다)
  const once = (list, n, when, fn) => out.push({ list, n, when, ms: med(fn, 5), once: true });
  once('자연물 막음 다시 굽기(_natBlocked · 길 + 건물 3×3)', c.roads.size + c.buildings.size, '길 · 건물 수가 바뀔 때(road_cells 날마다 · buildings_*)', () => { _natBlockSig = 'x'; _natBlocked(worldCx, worldCy); });
  once('벽지도 다시 굽기(clRebuildWallCellMap)', c.buildings.size, '5초마다 + 건물 바뀜(ensureWallMap · 안개 블록)', () => clRebuildWallCellMap());
  once('계단 칸 다시 굽기(clRebuildStairCellCache)', c.buildings.size, '0.5초마다(clFindStairForCell 을 부를 때 — 걸음 예측)', () => clRebuildStairCellCache());
  once('경작지 칸(_tsFarmSet)', c.buildings.size, '건물 수가 바뀔 때(지면 타일 굽기)', () => { _farmCells = null; _tsFarmSet(c); });
  once('안개 벽 모으기(clWallCellMap 전부 split)', clWallCellMap.size, '내 칸 · 층이 바뀔 때마다(달리면 0.25 ~ 0.5초마다) + 벽지도 5초', () => { let n = 0; for (const key of clWallCellMap.keys()) { const [cxs, cys, side, fs] = key.split('_'); if (+fs === 0 && Math.abs(+cxs) >= 0 && side) n++; } return n; });
  once('가까운 문(findNearestDoor)', c.buildings.size, '문 여닫기 키', () => findNearestDoor(worldCx, worldCy, 0));
  once('우물(isWellAtAbs)', c.buildings.size, '우클릭', () => isWellAtAbs(worldCx, worldCy));
  once('곳간 · 상자(nearbyContainers)', c.buildings.size, '짐 창 그릴 때', () => nearbyContainers());
  once('온보딩 내 집(onbMyHome)', c.buildings.size, '온보딩 판 상태를 만들 때', () => onbMyHome(c));
  return out;
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

async function scanTable(PW) {
  const L = { bridges: 850, ditches: 698, granStock: 100, claims: 40, simVillages: 51, banditCamps: 10, mobs: 300, corpses: 10, groundItems: 20,
    src: '로컬 새 세계(마을 켬 · 11-22 이 가지) 수 · 라이브 미상' };
  const res = {};
  for (const bn of BROWSERS) {
    const browser = await PW[bn].launch();
    try {
      const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.routeWebSocket(new RegExp(':' + ZPORT), (ws) => { const server = ws.connectToServer(); ws.onMessage((m) => server.send(m)); server.onMessage((m) => ws.send(injectWelcome(m))); });
      await page.goto(`http://localhost:${CPORT}/`);
      await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
      try { await page.click('#enter'); } catch (e) {}
      await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId()), null, { timeout: 120000 });
      const goal = { x: SPOT.dense.cx * 32 + 16, y: SPOT.dense.cy * 32 + 16 };
      await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [goal.x, goal.y]);
      await sleep(10000);
      res[bn] = await page.evaluate(scanInPage, L);
      say(`  [전수 표 · ${bn}] ` + res[bn].map((r) => `${r.list} ${r.n} → ${r.ms}ms`).join(' · '));
    } finally { await browser.close().catch(() => {}); }
  }
  fs.writeFileSync(path.join(OUT, 'scan.json'), JSON.stringify({ at: new Date().toISOString(), L, res }, null, 1));
}

(async () => {
  fs.writeFileSync(path.join(OUT, 'repro-log.txt'), '');
  say(`=== T1446 재현 틀 — 길 ${RD.flat.length / 3}칸 · 건물 ${BD.length}개 · 자리 촘촘 ${SPOT.dense.name}(${SPOT.dense.cx},${SPOT.dense.cy}) · 성김 ${SPOT.sparse.name}(${SPOT.sparse.cx},${SPOT.sparse.cy} · 상자 안 ${SPOT.sparse.n}칸) ===`);
  say(`  팔: ${BROWSERS.join('·')} × ${SPOTS.join('·')} × t1193 ${T1193S.join('·')} × 손잡이 ${KNOBS.join('·')} · ${SEC}초 · 물 ${WATER} · 마을 ${VIL} · 화면 ${VIEW.width}×${VIEW.height} ×2`);
  await bootWorld();
  const PW = require('playwright');
  if (SCAN) { await scanTable(PW); killAll(); say('끝'); process.exit(0); }
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
