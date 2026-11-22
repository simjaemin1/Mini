#!/usr/bin/env node
// @regress
// @bait 5
// === scripts/test-t1446-view-index.js — 화면 안 색인(T1446 `T1446_VIEW_INDEX`) =====================================
//
// ★무엇을 재나 — 렌더 모으기가 길 · 건물을 **화면에 걸친 상자만** 훑어도 그리는 것이 종전과 같은가(카드 T1446 할 일 3 · 4 · 9):
//   Ⓐ 전제 — 라이브 크기 목록(길 456,479칸 · 건물 5,806 — `t1446-synth.js`)을 **welcome 에 실어** 들어간다(존 소켓을 `routeWebSocket` 으로 받아
//      welcome 글자에 넣는다 — 클라는 진짜 welcome 입구로 받는다) · 색인이 켜졌고 목록을 그대로 비춘다(`__t1446.check()` — 칸 · 등급 · 차례 · 건물 상자) ·
//      끔 주소(`?t1446=0`)는 맨 Map(종전 글자).
//   Ⓑ 그린 것 같음 — 같은 프레임 자리에서 그리는 길만 끔 ↔ 켬(`__t1446.set`)으로 바꿔 정렬된 목록 서명(`__t1446.cap()` — 종류 · 자리 · z · 등급 · 건물 id)을
//      맞댄다(길 · 건물 · 지붕 · 마당 소품 · 계단 — 움직이는 것 · 서버가 흘리는 것은 뺀다). 자리: 마을 한가운데(촘촘) · 교역로 가(성김) · 상자 경계 ·
//      존 서쪽 끝(이웃 존 `jungwon_n` 관전 접속 — 접속 둘 · 서로 다른 ox) · 확대 1 · 1.5 · 2 · 달리는 중(소수 자리 화면 가운데 70곳 · 화면 끝이 칸 가운데에
//      꼭 닿는 자리 ± 1e-7 — 같은 목록에서 종전 고리와 색인 질의를 칸 · 등급 · 차례로 맞댄다).
//   Ⓒ 길 고침 — 방송 입구(`handleMessage` · `road_cells`)로 화면 안 칸을 지우고 · 새로 넣고 · 등급을 바꾸고 · 지운 칸을 다시 넣은 뒤(다시 넣으면 Map 맨 뒤)
//      같음 · 색인 맞음 · 지운 칸은 안 그린다.
//   Ⓓ 훑기 ms — 같은 판 · 같은 자리에서 프레임 캡처의 "길 훑기"(T1446 쪼갠 층) 프레임당 중앙값: 켬 ≤ 끔 × 0.1.
//   Ⓔ 미끼 다섯(파일 안 · 서버가 내주는 클라 글자를 그 자리에서 바꾼다 — 바꾼 자리 1):
//      ① 화면 밖 길을 그리는 사본(색인 질의의 컬링 줄을 뺌) → Ⓑ 빨강 · ② `road_cells` 지움을 색인이 놓치는 사본 → Ⓒ 빨강 ·
//      ③ 이웃 존 접속의 길을 제 원점(ox · oy)이 아니라 주 존 원점으로 찾는 사본 → Ⓑ 존 끝 빨강 · ④ 확대에서 화면 상자를 확대로 나눠 가장자리 길이 빠지는 사본 → Ⓑ 확대 2 빨강 ·
//      ⑤ 색인은 세웠는데 그리는 길은 여전히 전부 도는 사본 → Ⓓ 빨강(같음은 초록 — 프레임 ms 로만 잡힌다).
// ★자명 통과 금지 — 맞댄 목록에 길 · 건물이 실제로 있다(0 이면 같음은 아무것도 증명 못 한다) · 이웃 존 자리에서 두 존의 길이 다 있다.
//
// 실행: node scripts/test-t1446-view-index.js [--browser chromium|webkit] [--headed]
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3016);   // [T1288] 제품 고정 포트(central · hanbando · jungwon_n)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const LB = require('./lib-bait');
const SY = require('./t1446-synth');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020, NPORT = 3016;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BROWSER = arg('--browser', 'chromium');
const HEADED = process.argv.includes('--headed');

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m, d) => { if (c) { pass++; say(`  ✓ ${m}${d !== undefined && d !== '' ? '  ' + d : ''}`); } else { fail++; say(`  ✗ ${m}${d !== undefined && d !== '' ? '  ' + d : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
function killAll() { for (const p of procs) { try { p.kill(); } catch (e) {} } procs.length = 0; }

// ── 목록 ───────────────────────────────────────────────────────────────────────────
const V = SY.villageCenters();
const AT = V.vils.find((v) => v.name === '농촌22') || V.vils[0];
const WEST = V.vils.slice().sort((a, b) => a.cx - b.cx)[0];                     // 서쪽 끝 마을 — 존 끝 자리(이웃 존이 화면에 든다)
//   존 서쪽 끝 자리 — 그 마을 둘레(±60줄)에서 서쪽 끝에 가장 가까운 뭍(서버 `teleport_debug` 는 물 · 바위를 거절한다 · 이웃 존 관전 접속 문턱 1,500px 안)
const WSPOT = (() => { let best = null; for (let dy = -60; dy <= 60; dy += 2) { const cy = WEST.cy + dy;
  for (let x = 208; x <= 1400; x += 32) { const y = cy * 32 + 16; if (V.blocked(x, y)) continue; if (!best || x < best.x) best = { x, y }; break; } } return best; })();
//   상자 경계 자리 — 화면 상자 왼 · 위 끝이 칸 가운데에 **꼭** 닿는 자리(|칸 가운데 − 화면 가운데| = 1,500 — 종전 식은 넣는다) · 그 칸이 길 상자 경계(32칸)에 선다
const ESPOT = (() => { for (let dk = 0; dk < 6; dk++) for (const [kx, ky] of [[dk, 0], [0, dk], [-dk, 0], [0, -dk], [dk, dk]]) {
  const x = 1024 * (Math.floor(AT.cx / 32) + kx) + 16 + 1500, y = 1024 * (Math.floor(AT.cy / 32) + ky) + 16 + 1500; if (!V.blocked(x, y)) return { x, y }; } return null; })();
const RD = SY.synthRoads({});
const BD = SY.synthBuildings({ at: AT });
//   이웃 존(jungwon_n · 존 로컬 3,125칸 폭) 동쪽 끝 띠 — 존 끝 자리 화면에 드는 길(밀도 40% · 등급 1 · 2)과 마을 한 벌(마당 120칸)
const NB = (() => {
  const rnd = SY.rng(1446016), flat = [], cy0 = WEST.cy;
  for (let cy = cy0 - 60; cy <= cy0 + 60; cy++) for (let cx = 3060; cx <= 3124; cx++) if (rnd() < 0.4) flat.push(cx, cy, rnd() < 0.5 ? 1 : 2);
  return { flat, blds: SY.villageBuildings(3104, cy0, 'jn_', 120) };
})();
const SPOTS = {
  dense: { x: AT.cx * 32 + 16, y: AT.cy * 32 + 16, name: `${AT.name} 가운데` },
  sparse: { x: Math.round((AT.cx * 0.35 + 616 * 0.65)) * 32 + 16, y: Math.round((AT.cy * 0.35 + 1973 * 0.65)) * 32 + 16, name: '교역로 가' },
  edge: { x: ESPOT.x, y: ESPOT.y, name: '상자 경계(화면 끝 = 칸 가운데 · 32칸 줄)' },
  west: { x: WSPOT.x, y: WSPOT.y, name: `존 서쪽 끝(${WEST.name} 옆 x ${WSPOT.x}px · 이웃 존 jungwon_n)` },
};

async function bootWorld() {
  killAll(); await sleep(800);
  const tag = `${process.pid}`;
  const c = boot(path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,jungwon_n' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' }); if (!cu.ok) return cu.why;
  for (const [zid, port] of [['hanbando', ZPORT], ['jungwon_n', NPORT]]) {
    const db = `/tmp/t1446-${zid}-${tag}.db`; try { fs.unlinkSync(db); } catch (e) {}
    const z = boot(path.join(ROOT, 'server', 'zone.js'), { PORT: String(port), ZONE_ID: zid, DB_PATH: db, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0' });
    const zu = await FB.waitUp(z, /zone server up on/, { name: zid, capMs: 300000 }); if (!zu.ok) return zu.why;
  }
  return '';
}
// welcome 에 길 · 건물을 싣는다(주 존 · 이웃 존 각자)
function inject(m, port) {
  if (typeof m !== 'string' || m.lastIndexOf('{"type":"welcome"', 0) !== 0) return m;
  const o = JSON.parse(m);
  if (port === ZPORT) { o.roads = RD.flat; o.buildings = (o.buildings || []).concat(BD); }
  else { o.roads = NB.flat; o.buildings = (o.buildings || []).concat(NB.blds); }
  return JSON.stringify(o);
}

// 페이지 — 미끼면 서버가 내주는 클라 조각 글자를 그 자리에서 바꾼다(파일 무변)
async function openPage(browser, opt) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const port of [ZPORT, NPORT]) await page.routeWebSocket(new RegExp(':' + port + '/'), (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(inject(m, port)));
  });
  if (opt && opt.patch) for (const [file, src] of Object.entries(opt.patch)) {
    await page.route(new RegExp('/client/' + file.replace('.', '\\.') + '(\\?|$)'), (route) => route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: src }));
  }
  await page.goto(`http://localhost:${CPORT}/${(opt && opt.q) || ''}`);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
  try { await page.click('#enter'); } catch (e) {}
  const entered = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId() && window.__t1446), null, { timeout: 120000 }).then(() => true).catch(() => false);
  if (entered) await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); if (window.__terrain19) window.__terrain19.windOff = true; });
  return { ctx, page, errs, entered };
}
// 자리로 — 서버 권위로 도착을 잰다(T392 족보) · 그 뒤 카메라가 멈출 때까지(안개 원점이 두 번 같을 때)
async function goTo(page, sp, needNeighbor) {
  let arrived = false;
  for (let tries = 0; tries < 4 && !arrived; tries++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [sp.x, sp.y]);
    arrived = await page.waitForFunction(([x, y]) => { const c = conns.get(window.__getPrimaryZoneId()); const m = window.__getSrvAbs ? window.__getSrvAbs() : null;
      return !!(c && c.meta && m) && Math.abs(m.x - c.meta.worldOffsetX - x) < 48 && Math.abs(m.y - (c.meta.worldOffsetY || 0) - y) < 48; }, [sp.x, sp.y], { timeout: 30000, polling: 250 }).then(() => true).catch(() => false);
  }
  if (needNeighbor) await page.waitForFunction(() => { const c = conns.get('jungwon_n'); return !!(c && c.meta && c.roads && c.roads.size > 0); }, null, { timeout: 45000, polling: 250 }).catch(() => {});
  await page.waitForFunction(() => new Promise((res) => { const a = window.__fogOrigin && { ...window.__fogOrigin };
    requestAnimationFrame(() => requestAnimationFrame(() => { const b = window.__fogOrigin; res(!!(a && b && a.x === b.x && a.y === b.y)); })); }), null, { timeout: 20000, polling: 200 }).catch(() => {});
  return arrived;
}
// 같은 자리 두 프레임 — 끔 ↔ 켬. 맞대는 것은 길 · 건물 고리가 내는 종류뿐(움직이는 것 · 서버가 흘리는 개체 · 굽는 중인 산은 뺀다)
const KINDS = ['road', 'building', 'hutroof', 'cellprop', 'stair_cell'];
async function capPair(page, zoom) {
  return page.evaluate(async ([kinds, zoom]) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (zoom) { window.__setZoom(zoom); await frame(); }
    const cap = async () => { window.__t1446.cap(); for (let i = 0; i < 40 && !window.__t1446.capOut(); i++) await frame(); return (window.__t1446.capOut() || []).filter((s) => kinds.includes(s.slice(0, s.indexOf('|')))); };
    window.__t1446.set(false); const A = await cap();
    window.__t1446.set(true); const B = await cap();
    if (zoom) { window.__setZoom(1); await frame(); }
    let first = -1; for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) { first = i; break; }
    const cnt = (L, k) => L.filter((s) => s.startsWith(k + '|')).length;
    const zoneSplit = (L) => { let w = 0, e = 0; for (const s of L) { if (!s.startsWith('road|')) continue; const x = +s.split('|')[1]; if (x < 409984) w++; else e++; } return [w, e]; };
    return { same: first < 0, first, a: first >= 0 ? A[first] || null : null, b: first >= 0 ? B[first] || null : null, nA: A.length, nB: B.length,
      roads: cnt(A, 'road'), roadsB: cnt(B, 'road'), blds: cnt(A, 'building'), roofs: cnt(A, 'hutroof'), props: cnt(A, 'cellprop'), zones: zoneSplit(A), zonesB: zoneSplit(B) };
  }, [KINDS, zoom || 0]);
}
// 길 고침 — 방송 입구 그대로(`handleMessage` · road_cells) · 화면 안 칸에서 고른다
async function roadEdit(page, step) {
  return page.evaluate((step) => {
    const zid = window.__getPrimaryZoneId(), c = conns.get(zid), O = window.__fogOrigin, ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
    const inView = []; for (const [k, v] of c.roads) { const i = k.indexOf(','); const cx = +k.slice(0, i), cy = +k.slice(i + 1);
      if (Math.abs(ox + cx * 32 + 16 - O.x) <= 1400 && Math.abs(oy + cy * 32 + 16 - O.y) <= 1400) inView.push([cx, cy, v]); }
    const st = window.__t1446Edit || (window.__t1446Edit = { del: [] });
    const cells = [];
    if (step === 1) {
      const del = inView.filter((_, i) => i % 9 === 0).slice(0, 200), up = inView.filter((_, i) => i % 9 === 4 && _[2] === 1).slice(0, 200);
      for (const [cx, cy] of del) cells.push(cx, cy, 0);
      for (const [cx, cy] of up) cells.push(cx, cy, 2);
      const lcx = Math.floor((O.x - ox) / 32), lcy = Math.floor((O.y - oy) / 32); let n = 0;   // 화면 안 빈 칸에 새 길
      for (let dy = -40; dy <= 40 && n < 200; dy += 3) for (let dx = -40; dx <= 40 && n < 200; dx += 5) if (!c.roads.has((lcx + dx) + ',' + (lcy + dy))) { cells.push(lcx + dx, lcy + dy, 1 + (n & 1)); n++; }
      st.del = del.map(([cx, cy]) => cx * 32 + 16 + ox);
      st.delKeys = del.map(([cx, cy, v]) => [cx, cy, v]);
    } else for (const [cx, cy, v] of st.delKeys) cells.push(cx, cy, v);   // 지운 칸을 다시(Map 맨 뒤로)
    handleMessage(zid, { type: 'road_cells', cells }, c);
    return { n: cells.length / 3, del: step === 1 ? st.delKeys.length : 0, inView: inView.length };
  }, step);
}
async function deletedDrawn(page) {   // 지운 칸이 켬 목록에 그려지나(자리로 센다)
  return page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = conns.get(window.__getPrimaryZoneId()), ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
    const want = new Set(window.__t1446Edit.delKeys.map(([cx, cy]) => (ox + cx * 32 + 16) + '|' + (oy + cy * 32 + 16)));
    window.__t1446.set(true); window.__t1446.cap(); for (let i = 0; i < 40 && !window.__t1446.capOut(); i++) await frame();
    let n = 0; for (const s of window.__t1446.capOut() || []) { if (!s.startsWith('road|')) continue; const p = s.split('|'); if (want.has(p[1] + '|' + p[2])) n++; }
    return n;
  });
}
// 훑기 ms — 같은 자리 · 끔 ↔ 켬 프레임 캡처(쪼갠 층 "길 훑기" 프레임당 중앙값)
async function scanMs(page) {
  return page.evaluate(async () => {
    const one = async (on) => { window.__t1446.set(on); const F = await window.__frameCapture(3, { save: false }); return F ? F.frames.per.rd : null; };
    const off = await one(false), on = await one(true);
    return { off, on };
  });
}

(async () => {
  say(`=== 화면 안 색인 — 같음 · 길 고침 · 이웃 존 · 확대 · 훑기 ms · 미끼 다섯 (T1446 · ${BROWSER}) ===`);
  say(`  목록: 길 ${RD.flat.length / 3}칸 · 건물 ${BD.length}개(주 존) · 이웃 존 길 ${NB.flat.length / 3}칸 · 건물 ${NB.blds.length}개`);
  const why = await bootWorld();
  if (why) { ok(false, '서버 셋을 띄운다', why); killAll(); say(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
  const PW = require('playwright');
  const browser = await PW[BROWSER].launch({ headless: !HEADED });
  const SRC = {
    c: (await (await fetch(`http://localhost:${CPORT}/client/00-const.js`)).text()),
    r: (await (await fetch(`http://localhost:${CPORT}/client/34-m-renderloop.js`)).text()),
  };

  // ══ Ⓐ 전제 ═════════════════════════════════════════════════════════════════
  say('\nⒶ 전제 — welcome 에 실은 목록 · 색인이 목록을 비춘다 · 끔 주소는 맨 Map');
  const M = await openPage(browser, {});
  ok(M.entered, 'Ⓐ1 들어간다(라이브 크기 welcome)');
  if (!M.entered) { await browser.close(); killAll(); say(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
  const arr0 = await goTo(M.page, SPOTS.dense);
  const st0 = await M.page.evaluate(() => window.__t1446.stat());
  const pc0 = st0.conns.find((x) => x.zone === 'hanbando') || {};
  ok(pc0.roads === RD.flat.length / 3 && pc0.blds >= BD.length, 'Ⓐ2 ★전제 — welcome 의 길 · 건물이 클라 목록에 다 들었다(0 이면 아래 같음은 아무것도 증명 못 한다)', `길 ${pc0.roads} · 건물 ${pc0.blds}`);
  ok(st0.on === true && pc0.roadIx && !pc0.roadBad && pc0.bldIx && !pc0.bldBad && pc0.roadBoxes > 100, 'Ⓐ3 손잡이 기본 켬 — 두 목록이 색인 갈래 · 어긋남 0', `상자 길 ${pc0.roadBoxes}(가장 큰 ${pc0.roadBoxMax}칸) · 건물 ${pc0.bldBoxes} · 늘 꺼내는 ${pc0.bldOdd}`);
  const chk0 = await M.page.evaluate(() => window.__t1446.check());
  ok(chk0.length >= 2 && chk0.every((x) => x.ok), 'Ⓐ4 색인이 목록을 그대로 비춘다(길 칸 · 등급 · Map 차례 · 건물 id · 상자 · 차례)', chk0.map((x) => `${x.list} ${x.n} ${x.ok ? 'ok' : x.why}`).join(' · '));
  {
    const O = await openPage(browser, { q: '?t1446=0' });
    const st = O.entered ? await O.page.evaluate(() => window.__t1446.stat()) : null;
    const p = st ? st.conns.find((x) => x.zone === 'hanbando') || {} : {};
    ok(!!st && st.on === false && p.roads === RD.flat.length / 3 && !p.roadIx && !p.bldIx, 'Ⓐ5 끔 주소(`?t1446=0`) — 목록이 맨 Map(종전 글자 · 색인 0)', st ? `on ${st.on} · 길 ${p.roads} · 색인 ${p.roadIx}/${p.bldIx}` : '못 들어감');
    await O.ctx.close();
  }

  // ══ Ⓑ 그린 것 같음 ═════════════════════════════════════════════════════════
  say('\nⒷ 그린 것 같음 — 같은 프레임 자리 · 끔 ↔ 켬 정렬된 목록 서명');
  const capAt = async (key, zoom) => { const r = await capPair(M.page, zoom); return r; };
  {
    const r = await capAt('dense', 0);
    ok(arr0 && r.same && r.roads > 1000 && r.blds > 100 && r.roofs > 0, `Ⓑ1 ${SPOTS.dense.name} — 같다(길 · 건물 · 지붕이 실제로 있다)`, `서명 ${r.nA} · 길 ${r.roads} · 건물 ${r.blds} · 지붕 ${r.roofs} · 마당 소품 ${r.props}${r.same ? '' : ` · 첫 다름 #${r.first} ${r.a} ≠ ${r.b}`}`);
    for (const z of [1.5, 2]) {
      const q = await capAt('dense', z);
      ok(q.same && q.roads === r.roads, `Ⓑ2 확대 ${z} — 같다(확대는 화면 상자를 안 바꾼다 — VIEW_RADIUS 상수)`, `길 ${q.roads}${q.same ? '' : ` · 첫 다름 #${q.first} ${q.a} ≠ ${q.b}`}`);
    }
    //   달리는 중(화면 가운데가 프레임마다 소수 자리로 바뀐다) · 화면 끝이 칸 가운데에 꼭 닿는 자리(±1,500 · ±1,500 ± 1e-7) — 같은 목록에서 종전 고리와 색인 질의를 맞댄다
    const fz = await M.page.evaluate(([sx, sy]) => {
      const c = conns.get(window.__getPrimaryZoneId()), ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0, R = 1500;
      let s = 1446; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
      const old = (wx, wy) => { const out = []; for (const [rk, lv] of c.roads) { const ci = rk.indexOf(','); const rcx = +rk.slice(0, ci), rcy = +rk.slice(ci + 1);
        const rax = ox + rcx * 32 + 16, ray = oy + rcy * 32 + 16; if (Math.abs(rax - wx) > R || Math.abs(ray - wy) > R) continue; out.push(rcx + ',' + rcy + ',' + lv); } return out; };
      const idx = (wx, wy) => { const Q = _t1446Cells(c.roads, ox, oy, wx, wy, R), out = []; for (let i = 0; i < Q.n; i++) { const j = Q.sk[i] % 16384; out.push(Q.cx[j] + ',' + Q.cy[j] + ',' + Q.lv[j]); } return out; };
      const pts = [];
      for (let i = 0; i < 40; i++) pts.push([ox + sx + (rnd() - 0.5) * 4000, oy + sy + (rnd() - 0.5) * 4000]);
      for (let i = 0; i < 10; i++) { const cx = Math.floor((sx + (rnd() - 0.5) * 2000) / 32), cy = Math.floor((sy + (rnd() - 0.5) * 2000) / 32);
        for (const e of [0, 1e-7, -1e-7]) pts.push([ox + cx * 32 + 16 + R + e, oy + cy * 32 + 16 - R - e]); }
      let bad = 0, n = 0, first = null;
      for (const [wx, wy] of pts) { const a = old(wx, wy), b = idx(wx, wy); n += a.length; if (a.length !== b.length || a.some((x, i) => x !== b[i])) { bad++; if (!first) first = [wx, wy, a.length, b.length]; } }
      return { pts: pts.length, bad, n, first };
    }, [SPOTS.dense.x, SPOTS.dense.y]);
    ok(fz.bad === 0 && fz.n > 10000, 'Ⓑ3 달리는 중 · 화면 끝 칸 — 소수 자리 화면 가운데 70곳에서 종전 고리와 색인 질의가 같은 칸 · 같은 등급 · 같은 차례', `자리 ${fz.pts} · 다름 ${fz.bad} · 견준 칸 ${fz.n}${fz.first ? ' · 첫 다름 ' + JSON.stringify(fz.first) : ''}`);
  }
  for (const key of ['sparse', 'edge']) {
    const arr = await goTo(M.page, SPOTS[key]);
    const r = await capAt(key, 0);
    ok(arr && r.same && r.roads > 0, `Ⓑ4 ${SPOTS[key].name} — 같다`, `도착 ${arr} · 서명 ${r.nA} · 길 ${r.roads}${r.same ? '' : ` · 첫 다름 #${r.first} ${r.a} ≠ ${r.b}`}`);
  }
  {
    const arrW = await goTo(M.page, SPOTS.west, true);
    const st = await M.page.evaluate(() => window.__t1446.stat());
    const nb = st.conns.find((x) => x.zone === 'jungwon_n') || {};
    const r = await capAt('west', 0);
    ok(arrW && nb.roads === NB.flat.length / 3 && nb.roadIx && r.zones[0] > 0 && r.zones[1] > 0, 'Ⓑ5 ★전제 — 존 서쪽 끝: 이웃 존(jungwon_n) 관전 접속이 섰고 두 존의 길이 다 화면에 있다', `도착 ${arrW} · 이웃 길 ${nb.roads} · 화면 길 이웃 ${r.zones[0]} · 주 ${r.zones[1]} · 접속 ${st.conns.map((x) => x.zone).join('·')}`);
    ok(r.same, 'Ⓑ6 존 서쪽 끝(접속 둘 · 서로 다른 원점) — 같다', `서명 ${r.nA}${r.same ? '' : ` · 첫 다름 #${r.first} ${r.a} ≠ ${r.b}`}`);
    const chk = await M.page.evaluate(() => window.__t1446.check());
    ok(chk.length >= 4 && chk.every((x) => x.ok), 'Ⓑ7 이웃 존 목록도 색인이 그대로 비춘다', chk.map((x) => `${x.zone}.${x.list} ${x.n} ${x.ok ? 'ok' : x.why}`).join(' · '));
  }

  // ══ Ⓒ 길 고침(road_cells) ══════════════════════════════════════════════════
  say('\nⒸ 길 고침 — 방송 입구(road_cells)로 지움 · 새로 · 등급 · 다시 넣음');
  await goTo(M.page, SPOTS.dense);
  {
    const e1 = await roadEdit(M.page, 1);
    const r1 = await capPair(M.page, 0);
    const dd = await deletedDrawn(M.page);
    const chk = await M.page.evaluate(() => window.__t1446.check());
    ok(e1.del === 200 && r1.same && dd === 0 && chk.every((x) => x.ok), 'Ⓒ1 화면 안 지움 200 · 새 길 · 등급 오름 — 같다 · 지운 칸은 안 그린다 · 색인 맞음',
      `고친 칸 ${e1.n}(화면 안 길 ${e1.inView}) · 지운 칸 그림 ${dd} · 길 ${r1.roads}${r1.same ? '' : ` · 첫 다름 #${r1.first} ${r1.a} ≠ ${r1.b}`} · ${chk.map((x) => x.ok ? 'ok' : x.why).join(' · ')}`);
    const e2 = await roadEdit(M.page, 2);
    const r2 = await capPair(M.page, 0);
    const chk2 = await M.page.evaluate(() => window.__t1446.check());
    ok(e2.n === 200 && r2.same && chk2.every((x) => x.ok), 'Ⓒ2 지운 칸을 다시 넣음(Map 맨 뒤 — 같은 z 끼리 차례까지) — 같다 · 색인 맞음', `길 ${r2.roads}${r2.same ? '' : ` · 첫 다름 #${r2.first} ${r2.a} ≠ ${r2.b}`}`);
  }

  // ══ Ⓓ 훑기 ms ═════════════════════════════════════════════════════════════
  say('\nⒹ 길 훑기 ms — 같은 판 · 같은 자리 · 끔 ↔ 켬(프레임 캡처 쪼갠 층)');
  const ms0 = await scanMs(M.page);
  ok(ms0.off != null && ms0.on != null && ms0.on <= ms0.off * 0.1, 'Ⓓ1 켬의 길 훑기가 끔의 10분의 1 아래(존 전체를 안 돈다)', `프레임당 중앙값 끔 ${ms0.off}ms → 켬 ${ms0.on}ms`);
  ok(M.errs.length === 0, 'Ⓓ2 페이지 오류 0', M.errs.slice(0, 2).join(' | '));
  await M.ctx.close();

  // ══ Ⓔ 미끼 다섯 ═══════════════════════════════════════════════════════════
  say('\nⒺ 미끼 다섯 — 서버가 내주는 클라 글자를 그 자리에서 바꾼 사본');
  const baitRun = async (patch, fn) => { const P = await openPage(browser, { patch }); try { return P.entered ? await fn(P.page) : null; } finally { await P.ctx.close(); } };
  {   // ① 화면 밖 길 — 색인 질의의 컬링 줄을 뺀다(상자에 든 칸을 다 민다)
    const B = LB.swap(SRC.c, '          if (Math.abs(ax - wcx) > R || Math.abs(ay - wcy) > R) continue;\n', '');
    const r = await baitRun({ '00-const.js': B.src }, async (p) => { await goTo(p, SPOTS.dense); return capPair(p, 0); });
    ok(B.n === 1 && !!r && !r.same && r.roadsB > r.roads, '미끼 ① 화면 밖 길을 그리는 사본 → Ⓑ1 빨강(켬이 더 그린다)', `바꾼 자리 ${B.n} · 길 끔 ${r && r.roads} · 켬 ${r && r.roadsB}`);
  }
  {   // ② road_cells 지움을 색인이 놓친다
    const B = LB.swap(SRC.c, 'else { B.k.splice(i, 1); B.s.splice(i, 1); if (!B.k.length) this._ix.delete(bk); }', 'else {}');
    const r = await baitRun({ '00-const.js': B.src }, async (p) => { await goTo(p, SPOTS.dense); await roadEdit(p, 1); return { cap: await capPair(p, 0), dd: await deletedDrawn(p) }; });
    ok(B.n === 1 && !!r && !r.cap.same && r.dd > 0, '미끼 ② road_cells 지움을 색인이 놓치는 사본 → Ⓒ1 빨강(지운 칸을 그린다)', `바꾼 자리 ${B.n} · 지운 칸 그림 ${r && r.dd}`);
  }
  {   // ③ 이웃 존 길을 주 존 원점으로 찾는다
    const B = LB.swap(SRC.r, '_t1446Cells(c.roads, ox, oy, worldCx, worldCy, VIEW_RADIUS)', '_t1446Cells(c.roads, pConn.meta.worldOffsetX, pConn.meta.worldOffsetY || 0, worldCx, worldCy, VIEW_RADIUS)');
    const r = await baitRun({ '34-m-renderloop.js': B.src }, async (p) => { await goTo(p, SPOTS.west, true); return capPair(p, 0); });
    ok(B.n === 1 && !!r && !r.same && r.zones[0] > 0, '미끼 ③ 이웃 존 접속의 길을 주 존 원점으로 찾는 사본 → Ⓑ6 존 끝 빨강', `바꾼 자리 ${B.n} · 이웃 길 끔 ${r && r.zones[0]} · 켬 ${r && r.zonesB[0]}`);
  }
  {   // ④ 확대에서 화면 상자를 확대로 나눈다
    const B = LB.swap(SRC.r, '_t1446Cells(c.roads, ox, oy, worldCx, worldCy, VIEW_RADIUS)', '_t1446Cells(c.roads, ox, oy, worldCx, worldCy, VIEW_RADIUS / ZOOM)');
    const r = await baitRun({ '34-m-renderloop.js': B.src }, async (p) => { await goTo(p, SPOTS.dense); return { z1: await capPair(p, 0), z2: await capPair(p, 2) }; });
    ok(B.n === 1 && !!r && r.z1.same && !r.z2.same, '미끼 ④ 확대에서 가장자리 길이 빠지는 사본 → Ⓑ2 확대 2 빨강(확대 1 은 초록)', `바꾼 자리 ${B.n} · 확대 2 길 끔 ${r && r.z2.roads} · 켬 ${r && r.z2.roadsB}`);
  }
  {   // ⑤ 색인은 세웠는데 그리는 길은 여전히 전부 돈다
    const B = LB.swap(SRC.r, 'const _rQ = (c.roads && c.roads.size && _t1446Use(c.roads))', 'const _rQ = (c.roads && c.roads.size && false && _t1446Use(c.roads))');
    const r = await baitRun({ '34-m-renderloop.js': B.src }, async (p) => { await goTo(p, SPOTS.dense); const st = await p.evaluate(() => window.__t1446.stat()); return { cap: await capPair(p, 0), ms: await scanMs(p), ix: st.conns[0].roadIx }; });
    ok(B.n === 1 && !!r && r.ix && r.cap.same && !(r.ms.on <= r.ms.off * 0.1), '미끼 ⑤ 색인은 세웠는데 여전히 전부 도는 사본 → Ⓓ1 빨강(같음은 초록 — 프레임 ms 로만 잡힌다)', `바꾼 자리 ${B.n} · 색인 ${r && r.ix} · 같음 ${r && r.cap.same} · 길 훑기 끔 ${r && r.ms.off} · 켬 ${r && r.ms.on}ms`);
  }

  await browser.close();
  killAll();
  say(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { say('실패: ' + (e && e.stack)); killAll(); process.exit(1); });
