#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 세 밤 분할(T238) · 지금 A 17 · B 19 · C 17 — 적은 쪽 중 앞 글자
// === scripts/e2e-zone-cross.js — 존 셋이 한 세계로 보이나 · 경계를 걸어서 넘는다 (T428 ②) =====
//
// ★왜 [T428 2026-09-26] — T408 이 "개체는 제 땅에만"을 세웠다. 그 뒤로 선 너머 나무는 **그 땅 주인 존**이 낸다.
//   라이브가 한반도 존만 돌면 선 너머가 빈다(#76 · 배포는 재민). 존이 **떠 있어도** 클라가 이웃 존을 안 엿보면
//   똑같이 빈다 — 클라 이웃 관측(`31-m-move` `PEEK_THRESHOLD`)이 900px 안에서만 이웃에 붙는데 화면은 1,500px 까지
//   그린다(T392 · `VIEW_RADIUS = TILE_RENDER_RADIUS`). 그 600px 띠가 이 자가 재는 첫째다.
//
// ★재는 것(실클라 · 실서버 넷 — central + hanbando·nippon·jungwon_n · zone-config 포트 그대로):
//   ⓐ 시야 — 경계에서 1,200px(900 과 1,500 사이) 안쪽에 서면 **이웃 존 나무가 화면 상자에 들어오나**.
//      기대값은 이웃 존 시더 정본(`chunk.generateChunkResources` + `overflowInto`)이 그 띠에 내는 나무 수(사본 0).
//   ⓑ 넘기 — 한반도 → 닛폰(동) · 한반도 → 중원북(서)을 **키보드로 걸어서** 넘는다(e2e-move 문법 — 소켓을 손으로 안 쏜다).
//      주 존이 바뀌나 · 월드 좌표가 이어지나(표본 사이 가장 큰 걸음 ≤ 청크 반 — 보정 몇십 px 은 튐이 아니다) · 짐이 같나 · 되돌아오나 · 같은 사람인가.
//   ⓒ 자명 통과 금지 — 전제를 먼저 건다: 이웃 띠에 기대 나무가 **실제로 있다**(0 이면 ⓐ 가 공짜다) ·
//      ⓐ 자리는 옛 문턱(900) **밖**이다 · 걸음이 실제로 경계를 건넜다(주 존이 바뀌었다).
//
// 실행: node scripts/e2e-zone-cross.js [--headed] [--shots <dir>]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // 기동 기다리기 정본(사본 0)
const argv = process.argv.slice(2);
const HEADED = argv.includes('--headed');
const SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : '/tmp/e2e-zone-cross-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
const CS = CH.CHUNK_SIZE;
const CPORT = 3010;
const ZIDS = ['hanbando', 'nippon', 'jungwon_n'];
const HB = ZONES.hanbando;

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._out = ''; p._err = '';
  p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._err += String(b); });
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });

// ── 자리 고르기 — 정본 술어·시더에게 묻는다(하드코딩 0) ─────────────────────────────
const W2L = (zid, wx, wy) => { const z = ZONES[zid]; return [wx - z.worldOffsetX, wy - (z.worldOffsetY || 0)]; };
const ownerAt = (wx, wy) => ZIDS.find((z) => { const Z = ZONES[z], x = wx - Z.worldOffsetX, y = wy - (Z.worldOffsetY || 0); return x >= 0 && y >= 0 && x < Z.zoneWidth && y < Z.zoneHeight; });
const blockedW = (wx, wy) => { const z = ownerAt(wx, wy); if (!z) return true; const [x, y] = W2L(z, wx, wy); return !!(T.isWaterCellLocal(z, x, y) || T.isRockCellLocal(z, x, y)); };
const _ent = new Map();
function entsOf(zid, cx, cy) {   // 그 존 시더가 이 청크에 내는 개체(생성 + 넘친 것) — 서버가 활성화 때 내는 그 두 줄
  const k = `${zid}_${cx}_${cy}`; if (_ent.has(k)) return _ent.get(k);
  const Z = ZONES[zid]; let a = [];
  if (cx >= 0 && cy >= 0 && cx * CS < Z.zoneWidth && cy * CS < Z.zoneHeight) {
    try { a = (CH.generateChunkResources(zid, Z.biome, cx, cy, CS, null, 0) || []).concat(CH.overflowInto(zid, Z.biome, cx, cy, CS, null, 0) || []); } catch (e) { a = []; }
  }
  _ent.set(k, a); return a;
}
function entsInWorldBox(zid, x0, y0, x1, y1, type) {   // 월드 상자 안 그 존 개체
  const Z = ZONES[zid], ox = Z.worldOffsetX, oy = Z.worldOffsetY || 0, out = [];
  for (let cy = Math.floor((y0 - oy) / CS); cy <= Math.floor((y1 - oy) / CS); cy++) for (let cx = Math.floor((x0 - ox) / CS); cx <= Math.floor((x1 - ox) / CS); cx++)
    for (const e of entsOf(zid, cx, cy)) { const ax = ox + e.x, ay = oy + e.y; if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1 && (!type || e.type === type)) out.push(e); }
  return out;
}
const PEEK_OLD = 900, VIEW = 1500, STAND = 1200;   // 옛 문턱 · 화면 상자(T392) · 선 자리(둘 사이)
// ⓐ 선 자리 — 경계에서 STAND 안쪽 · 발밑이 열려 있다 · 화면 상자 안 이웃 띠에 이웃 나무가 있다
function viewSpot(dir) {
  const seam = dir > 0 ? HB.worldOffsetX + HB.zoneWidth : HB.worldOffsetX;
  const nb = dir > 0 ? 'nippon' : 'jungwon_n';
  let best = null;
  for (let ly = 4096; ly < HB.zoneHeight - 4096; ly += 1024) {
    const wy = (HB.worldOffsetY || 0) + ly, wx = seam - dir * STAND;
    if (blockedW(wx, wy)) continue;
    const x0 = dir > 0 ? seam : wx - VIEW, x1 = dir > 0 ? wx + VIEW : seam - 1;
    const n = entsInWorldBox(nb, x0, wy - VIEW, x1, wy + VIEW, 'tree').length;
    if (!best || n > best.n) best = { wx, wy, n, seam, nb, box: [x0, wy - VIEW, x1, wy + VIEW] };
  }
  return best;
}
// ⓑ 걸을 길 — 선 양쪽 WALK px 가 물·바위·개체 없이 열린 가로줄
const WALK = 360;
function corridor(dir) {
  const seam = dir > 0 ? HB.worldOffsetX + HB.zoneWidth : HB.worldOffsetX;
  const nb = dir > 0 ? 'nippon' : 'jungwon_n';
  for (let k = 0; k < 120; k++) {
    const ly = Math.floor(HB.zoneHeight / 2) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 512;
    const wy = (HB.worldOffsetY || 0) + ly;
    let clean = true;
    for (let x = seam - WALK - 64; x <= seam + WALK + 64 && clean; x += 16) for (let dy = -48; dy <= 48; dy += 16) if (blockedW(x, wy + dy)) { clean = false; break; }
    if (!clean) continue;
    for (const z of ['hanbando', nb]) if (entsInWorldBox(z, seam - WALK - 96, wy - 80, seam + WALK + 96, wy + 80).length) clean = false;
    if (clean) return { seam, wy, nb, from: seam - dir * WALK, to: seam + dir * WALK };
  }
  return null;
}

(async () => {
  console.log('\n=== 존 셋이 한 세계로 보이나 · 경계를 걸어서 넘는다 (T428) ===');
  // ── 소스 한 줄 — 이웃 관측 문턱이 화면 반경과 같은 상수다 ───────────────────────
  const MV = fs.readFileSync(path.join(ROOT, 'public', 'client', '31-m-move.js'), 'utf8');
  ok(/const PEEK_THRESHOLD = NAT_VIEW_PAD;/.test(MV), 'ⓢ 이웃 관측 문턱 = 렌더 반경 상수(`NAT_VIEW_PAD` 1,500 — 새 수 0)',
    (MV.match(/const PEEK_THRESHOLD = [^;]+;/) || ['(없음)'])[0]);

  const VE = viewSpot(+1), VW = viewSpot(-1), CE = corridor(+1), CW = corridor(-1);
  ok(!!VE && VE.n > 0, 'ⓒ 전제: 동쪽 선 자리 화면 상자의 닛폰 띠에 닛폰 시더 나무가 **있다**(0 이면 ⓐ 가 공짜다)', VE ? `${VE.n}그루 · 한반도 로컬 y ${VE.wy - HB.worldOffsetY}` : '-');
  ok(!!VW && VW.n > 0, 'ⓒ 전제: 서쪽 선 자리 화면 상자의 중원북 띠에 중원북 나무가 있다', VW ? `${VW.n}그루 · y ${VW.wy - HB.worldOffsetY}` : '-');
  ok(STAND > PEEK_OLD && STAND < VIEW, `ⓒ 전제: 선 자리(경계에서 ${STAND}px)는 옛 문턱 ${PEEK_OLD} 밖 · 화면 ${VIEW} 안이다(그 띠를 잰다)`);
  ok(!!CE && !!CW, 'ⓒ 전제: 동·서 경계에 걸을 길(물·바위·개체 없는 가로줄)이 있다', `${CE ? 'E y' + (CE.wy - HB.worldOffsetY) : 'E 없음'} · ${CW ? 'W y' + (CW.wy - HB.worldOffsetY) : 'W 없음'}`);

  // ── 기동 ─────────────────────────────────────────────────────────────────
  for (const port of [CPORT].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { ok(false, `포트 ${port} 가 비어 있다(남의 서버를 잴 수 없다)`); process.exit(1); }
  const DDIR = `/tmp/e2e-zx-${process.pid}`; fs.mkdirSync(DDIR, { recursive: true });
  const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  ok(cu.ok, 'ⓔ0 central 기동', cu.ok ? `${cu.ms}ms` : cu.why);
  const common = { CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' };
  const ups = {};
  for (const z of ZIDS) { const p = boot(z, 'zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${DDIR}/w-${z}.db` }, common)); ups[z] = FB.waitUp(p, /zone server up on/, { name: z, capMs: 600000 }); }
  for (const z of ZIDS) { const r = await ups[z]; ok(r.ok, `ⓔ ${z} 존 기동`, r.ok ? `${(r.ms / 1000).toFixed(1)}s` : r.why); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  const clog = [];
  page.on('console', (m) => { const t = m.text(); if (/handoff|promote|kicked|welcome|neighbor|primary|reconnect|zone|recover|\[ws\]|player_left|orphan|고아|재연결/i.test(t)) clog.push(`${Date.now()} ${t.slice(0, 240)}`); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  const enter = await page.$('#enter'); if (enter) await enter.click();
  for (let i = 0; i < 120 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs() && window.__getPrimaryZoneId && window.__getPrimaryZoneId()))); i++) await sleep(500);
  const pz0 = await page.evaluate(() => window.__getPrimaryZoneId());
  ok(pz0 === 'hanbando', 'ⓔ 한반도에 들어왔다', pz0);
  const srv = () => page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null));
  const warpW = async (wx, wy) => {   // teleport_debug 는 **존 로컬** · 도착은 서버 권위로(족보 ㊹)
    const zid = await page.evaluate(() => window.__getPrimaryZoneId());
    const [lx, ly] = W2L(zid, wx, wy);
    for (let i = 0; i < 20; i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [lx, ly]);
      await sleep(800);
      const s = await srv(); if (s && Math.hypot(s.x - wx, s.y - wy) <= 120) return s;
    }
    return await srv();
  };
  // 화면 상자 안 이웃 존 나무 — 클라가 **실제로 들고 있는** 그 존 개체(conns · 렌더가 도는 그 목록)
  const neighborTrees = (nb, box) => page.evaluate(([nb, box]) => {
    const c = conns.get(nb); if (!c || !c.meta || !c.resources) return { conn: !!c, role: c ? c.role : null, n: 0 };
    const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0; let n = 0;
    for (const r of c.resources.values()) { if (r.type !== 'tree') continue; const ax = ox + r.x, ay = oy + r.y; if (ax >= box[0] && ax <= box[2] && ay >= box[1] && ay <= box[3]) n++; }
    return { conn: true, role: c.role, n };
  }, [nb, box]);

  // ── ⓐ 시야 — 선 자리에 서서 이웃 존 나무를 센다 ─────────────────────────────
  console.log('\n[ⓐ 시야 — 경계에서 1,200px 안쪽에 서면 이웃 존 나무가 화면 상자에 있나]');
  for (const [tag, V] of [['동(닛폰)', VE], ['서(중원북)', VW]]) {
    if (!V) continue;
    await warpW(V.wx - (V.nb === 'nippon' ? 20000 : -20000), V.wy);   // 먼 데서 뛰어와 관측이 새로 붙게(이력 0)
    await sleep(3000);
    const s = await warpW(V.wx, V.wy);
    let got = { n: 0 };
    for (let i = 0; i < 30; i++) { got = await neighborTrees(V.nb, V.box); if (got.n >= V.n) break; await sleep(500); }
    await page.screenshot({ path: path.join(SHOTS, `view-${V.nb}.png`) }).catch(() => {});
    // 그림 재료 — 클라가 **든** 나무(존별)와 시더 기대 나무를 선 자리 둘레 화면 상자로 남긴다(판정엔 안 쓴다)
    try {
      const held = await page.evaluate(([cx, cy, R]) => { const o = {}; for (const [zid, c] of conns) { if (!c.meta || !c.resources) continue; const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0; o[zid] = [];
        for (const r of c.resources.values()) { if (r.type !== 'tree') continue; const ax = ox + r.x, ay = oy + r.y; if (Math.abs(ax - cx) <= R && Math.abs(ay - cy) <= R) o[zid].push([Math.round(ax), Math.round(ay)]); } } return o; }, [V.wx, V.wy, VIEW]);
      const Z = ZONES[V.nb], want = entsInWorldBox(V.nb, V.box[0], V.box[1], V.box[2], V.box[3], 'tree').map((e) => [e.x + Z.worldOffsetX, e.y + (Z.worldOffsetY || 0)]);
      fs.writeFileSync(path.join(SHOTS, `view-${V.nb}.json`), JSON.stringify({ stand: [V.wx, V.wy], seam: V.seam, view: VIEW, peekOld: PEEK_OLD, nb: V.nb, held, want }));
    } catch (e) {}
    const d = s ? Math.abs(V.seam - s.x) : null;
    ok(d != null && d > PEEK_OLD && d < VIEW, `ⓐ0 [${tag}] 선 자리가 경계에서 ${PEEK_OLD}~${VIEW} 사이다(서버 권위)`, `${d != null ? Math.round(d) : '-'}px`);
    ok(got.conn, `ⓐ1 [${tag}] ★클라가 이웃 존에 **붙었다**(관측 연결)`, `role=${got.role}`);
    ok(got.n >= Math.ceil(V.n * 0.9) && got.n > 0, `ⓐ ★★[${tag}] 화면 상자 안 이웃 존 나무가 **보인다** — 클라가 든 것 / 시더 기대`, `${got.n} / ${V.n}`);
  }

  // ── ⓑ 넘기 — 키보드로 걸어서 넘고 되돌아온다 ────────────────────────────────
  console.log('\n[ⓑ 넘기 — 걸어서 넘고 되돌아온다]');
  const inv = () => page.evaluate(() => JSON.stringify(window.__getInv ? window.__getInv() : null));
  const walk = async (keysDown, targetZone, maxMs) => {
    const pts = []; let vmax = 0;
    for (const k of keysDown) await page.keyboard.down(k);
    const t0 = Date.now(); let pz = null;
    while (Date.now() - t0 < maxMs) {
      await sleep(100);
      const a = await page.evaluate(() => { const p = window.__getMyAbs(); const d = window.__moveDbg ? window.__moveDbg() : null; return { x: p.x, y: p.y, t: performance.now(), v: d ? d.speed : 0, z: window.__getPrimaryZoneId() }; });
      pts.push(a); vmax = Math.max(vmax, a.v || 0); pz = a.z;
      if (pz === targetZone && pts.filter((q) => q.z === targetZone).length > 20) break;
    }
    for (const k of keysDown) await page.keyboard.up(k);
    await sleep(800);
    let jump = 0, jd = 0, jat = null; for (let i = 1; i < pts.length; i++) { const dt = (pts[i].t - pts[i - 1].t) / 1000; const dd = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); const v = dt > 0 ? dd / dt : 0; if (v > jump) jump = v; if (dd > jd) { jd = dd; jat = [pts[i - 1], pts[i], pts[i + 1] || null]; } }
    const fmt = (q) => q ? `(${Math.round(q.x)},${Math.round(q.y)})@${q.z}` : '-';
    return { pz, pts, vmax, jumpSpeed: jump, jumpDist: jd, jumpAt: jat ? jat.map(fmt).join(' → ') : '' };
  };
  for (const [tag, C, fwd, back] of [['동 → 닛폰', CE, ['s', 'd'], ['w', 'a']], ['서 → 중원북', CW, ['w', 'a'], ['s', 'd']]]) {
    if (!C) continue;
    await warpW(C.from, C.wy); await sleep(2500);
    const inv0 = await inv();
    const who0 = await page.evaluate(() => (window.__getPlayerId ? window.__getPlayerId() : null));
    const rec0 = clog.filter((l) => /\[recover\]/.test(l)).length;
    const go = await walk(fwd, C.nb, 45000);
    const crossed = go.pz === C.nb;
    ok(crossed, `ⓑ ★★[${tag}] 걸어서 경계를 넘었다 — 주 존이 ${C.nb}`, `주 존 ${go.pz} · 표본 ${go.pts.length}`);
    const xs = go.pts.map((q) => q.x);
    const cross = C.nb === 'nippon' ? xs.some((x) => x > C.seam) : xs.some((x) => x < C.seam);
    ok(cross, `ⓑ1 [${tag}] 월드 좌표가 선(${C.seam})을 실제로 넘었다`, `x ${Math.round(Math.min(...xs))}~${Math.round(Math.max(...xs))}`);
    ok(go.vmax > 0 && go.jumpDist <= CS / 2, `ⓑ2 [${tag}] 좌표가 **이어진다** — 표본 사이 가장 큰 걸음 ≤ 청크 반(${CS / 2}px · 순간이동 0)`, `${go.jumpDist.toFixed(0)}px · 겉보기 ${go.jumpSpeed.toFixed(0)}px/s(최고 걸음 속도 ${go.vmax.toFixed(0)}) · ${go.jumpAt}`);
    const inv1 = await inv();
    ok(inv1 === inv0, `ⓑ3 [${tag}] 짐이 같다(몸 전체는 test-handoff-body 가 잰다)`, inv1 === inv0 ? '' : `${inv0} → ${inv1}`);
    await page.screenshot({ path: path.join(SHOTS, `cross-${C.nb}.png`) }).catch(() => {});
    const bk = await walk(back, 'hanbando', 45000);
    ok(bk.pz === 'hanbando', `ⓑ4 [${tag}] ★되돌아왔다 — 주 존이 다시 hanbando`, `${bk.pz}`);
    ok(bk.vmax > 0 && bk.jumpDist <= CS / 2, `ⓑ5 [${tag}] 되돌아올 때도 좌표가 이어진다(가장 큰 걸음 ≤ ${CS / 2}px)`, `${bk.jumpDist.toFixed(0)}px · ${bk.jumpAt}`);
    await sleep(1500);
    const who1 = await page.evaluate(() => (window.__getPlayerId ? window.__getPlayerId() : null));
    const recs = clog.filter((l) => /\[recover\]/.test(l)).slice(rec0);
    ok(!!who0 && who1 === who0, `ⓑ6 [${tag}] ★되돌아와도 **같은 사람**이다(재연결 0 — 계정 id 같음)`, `${who0} → ${who1}${recs.length ? ' · ' + recs.map((l) => l.replace(/^\d+ /, '')).join(' / ').slice(0, 160) : ''}`);
  }

  // ── 오류 ─────────────────────────────────────────────────────────────────
  const zerr = procs.filter((p) => ZIDS.includes(p._name)).map((p) => [p._name, p._out.split('\n').filter((l) => /(^|\s)(TypeError|ReferenceError)\b|Cannot read|is not a function/.test(l)).length + p._err.split('\n').filter((l) => /^\s+at\s+\S/.test(l)).length]);
  ok(zerr.every(([, n]) => n === 0), 'ⓔ 존 셋 로그에 예외 0', zerr.map(([z, n]) => `${z} ${n}`).join(' · '));
  ok(errs.length === 0, 'ⓔ 클라 pageerror 0', errs.slice(0, 2).join(' | '));
  await browser.close();
  // 로그를 남긴다 — 빨강이 났을 때 "왜"를 다시 띄우지 않고 읽게(하네스 신뢰가 먼저)
  for (const p of procs) { try { fs.writeFileSync(path.join(SHOTS, `${p._name}.log`), p._out + '\n--- stderr ---\n' + p._err); } catch (e) {} }
  try { fs.writeFileSync(path.join(SHOTS, 'client-console.log'), clog.join('\n')); } catch (e) {}
  killAll(); try { fs.rmSync(DDIR, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); killAll(); process.exit(1); });
