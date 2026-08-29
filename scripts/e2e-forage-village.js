#!/usr/bin/env node
// === scripts/e2e-forage-village.js — 옛 채집 사막 마을에서 **걸어서** 첫 도끼까지 ============
//
// ★[재민 확정 2026-08-29] 감사 표가 51/51 이 됐다고 끝이 아니다 — 이 레포가 배치마다 배운 것은
//   **표는 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다**는 것이다.
//   그래서 **옛 사막 마을 하나**(기본 농촌10 — 수리 전 잔가지 0 · 자갈 0 · 풀 0 · 식수 960px 밖,
//   51곳 중 가장 순수한 사막)에 진짜 Chromium 을 떨어뜨리고 **직접 걸어서** 밟는다:
//     마을 중심 → 걸어서 세 재료 채집 → 조잡한 돌도끼 자작 → 둠벙에서 물 마시기.
//
// ★★거리로 적는다(족보 60) — "몇 초 걸었다"가 아니라 "마을 중심에서 몇 px 안이었다".
//   걸음 배율은 짐 무게·신체로 바뀐다. 감사 기준도 **거리**(960px)지 초가 아니다.
//   실제 소요 시간은 **재되, 판정하지 않는다**(기계·경로 의존).
//
// ★자리는 정본에게 묻는다 — 지형은 `server/forage.js`, 개체는 `server/chunk.js`,
//   개체가 무엇을 주는지는 `zone.__testBind().lootOfResource`. 하네스가 규칙을 다시 짜지 않는다.
//
// 실행: node scripts/e2e-forage-village.js [--village 농촌10] [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const VILNAME = val('--village', '농촌10');
const HEADED = argv.includes('--headed');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-forage-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-fv-central-${process.pid}.db`, ZDB = `/tmp/e2e-fv-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩 완료/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 90)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

// ── 자리 찾기 — 전부 정본에게 ───────────────────────────────────────────────
function plan() {
  process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const F = require(path.join(ROOT, 'server', 'forage'));
  const CH = require(path.join(ROOT, 'server', 'chunk'));
  const v = (T.getZoneVillages('hanbando') || []).find((a) => a.name === VILNAME);
  if (!v) throw new Error(`마을 ${VILNAME} 없음`);
  const ctx = { forestMult: (x, y) => T.getForestMultiplier('hanbando', x, y),
                isRock: (x, y) => T.isRockCellLocal('hanbando', x, y),
                isWater: (x, y) => T.isWaterCellLocal('hanbando', x, y) };
  // 개체가 무엇을 주는지 — zone 정본(조용한 적재)
  const _l = console.log, _w = console.warn, _e = console.error;
  process.env.PORT = String(36800 + (process.pid % 100)); process.env.DB_PATH = `/tmp/e2e-fv-inproc-${process.pid}.db`;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const lootOf = require(path.join(ROOT, 'server', 'zone.js')).__testBind().lootOfResource;
  console.log = _l; console.warn = _w; console.error = _e;

  const R = 960, CS = CH.CHUNK_SIZE;
  // ★자리를 **여럿** 모은다 — 파괴형 채집(덤불·나무·바위)은 한 번 캐면 사라진다.
  //   한 자리만 잡아 두면 "재료 하나 더"가 영영 안 온다(1차 실행이 fiber 1/2 로 그렇게 멈췄다).
  const cand = { twig: [], pebble: [], fiber: [] }, pool = { d: Infinity, x: 0, y: 0 };
  const put = (k, x, y, how) => { const d = Math.hypot(x - v.x, y - v.y); if (d <= R) cand[k].push({ x, y, d, how }); };
  for (let cy = Math.floor((v.y - R) / CS); cy <= Math.floor((v.y + R) / CS); cy++)
    for (let cx = Math.floor((v.x - R) / CS); cx <= Math.floor((v.x + R) / CS); cx++)
      for (const e of (CH.generateChunkResources('hanbando', ZONES.hanbando.biome, cx, cy, CS, null) || [])) {
        if (e.type === 'water_pool') { const d = Math.hypot(e.x - v.x, e.y - v.y);
          if (d <= R && d < pool.d) { pool.d = d; pool.x = e.x; pool.y = e.y; } continue; }
        const l = lootOf({ type: e.type, r: e.r });
        for (const k of ['twig', 'pebble', 'fiber']) if ((l[k] || 0) > 0) put(k, e.x, e.y, `${e.type} 개체`);
      }
  for (let dy = -R; dy <= R; dy += 32) for (let dx = -R; dx <= R; dx += 32) {
    if (Math.hypot(dx, dy) > R) continue;
    const x = v.x + dx, y = v.y + dy;
    if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;
    const s = F.sourceAt(x, y, ctx);
    if (s) put(s.kind, x, y, `지형(${s.where})`);
  }
  const ZM = ZONES.hanbando;
  const best = {};
  for (const k of ['twig', 'pebble', 'fiber']) {
    cand[k].sort((a, b) => a.d - b.d);
    // 같은 자리 중복 제거(개체와 지형이 겹칠 수 있다)
    const seen = [];
    cand[k] = cand[k].filter((c) => { if (seen.some((s2) => Math.hypot(s2.x - c.x, s2.y - c.y) < 40)) return false; seen.push(c); return true; }).slice(0, 8);
    best[k] = cand[k][0] || null;
  }
  return { v, best, cand, pool, WOX: ZM.worldOffsetX || 0, WOY: ZM.worldOffsetY || 0 };
}

(async () => {
  console.log(`\n=== 옛 채집 사막 마을 실클라 E2E — ${VILNAME} (Chromium) ===`);
  const P = plan();
  const { v, best, cand, pool, WOX, WOY } = P;
  console.log(`    마을 ${v.name}(${v.x},${v.y}) · 자리: ` +
    ['twig', 'pebble', 'fiber'].map((k) => `${k} ${best[k] ? Math.round(best[k].d) + 'px[' + best[k].how + ']' : '없음'}`).join(' · ') +
    ` · 둠벙 ${Number.isFinite(pool.d) ? Math.round(pool.d) + 'px' : '없음'}`);
  console.log(`    후보 수: ` + ['twig', 'pebble', 'fiber'].map((k) => `${k} ${cand[k].length}곳`).join(' · '));
  ok(['twig', 'pebble', 'fiber'].every((k) => best[k]), '★전제 — 감사 반경(960px) 안에 세 재료가 다 있다');

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const inv = () => page.evaluate(() => window.__getInv());
  const me = () => page.evaluate(() => window.__getMyAbs());

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('button:has-text("월드 입장")');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2000);
  ok(!!(await me()), '존 입장 — 내 좌표 수신');

  // ⚠좌표계: `teleport_debug` 는 **존 로컬**, `__getMyAbs()` 는 **월드 절대**(족보 64).
  const warp = async (x, y, tol = 200) => {
    let cur = null;
    for (let i = 0; i < 20; i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
      await sleep(800);
      cur = await me();
      if (cur && Math.hypot(cur.x - (x + WOX), cur.y - (y + WOY)) <= tol) return cur;
    }
    return cur;
  };
  // ★진짜 걷는다 — 서버가 권위인 입력 스트림으로. 도착은 **거리**로 판정한다(족보 60).
  //   ⚠걸음 루프는 **페이지 안에서** 돈다. 1차 실장은 입력 한 개마다 `page.evaluate` 왕복을 해서
  //     초당 ~17개밖에 못 보냈고(넷코드는 입력 1개 = 1스텝), 그래서 **하네스가 절반 속도로 걸었다**
  //     — 실측 26px/s vs 정본 64px/s. 그건 세계의 사실이 아니라 **계측기의 사실**이다.
  //     지금은 33ms 간격 루프를 브라우저 안에서 돌려 왕복을 없앴다.
  const walkTo = async (x, y, capMs = 60000) => {
    const t0 = Date.now();
    const r = await page.evaluate(async ([tx, ty, cap]) => {
      const sl = (ms) => new Promise((z) => setTimeout(z, ms));
      const t1 = Date.now(); let moved = 0, prev = null;
      while (Date.now() - t1 < cap) {
        const cur = window.__getMyAbs();
        if (!cur || !Number.isFinite(cur.x)) break;
        if (prev) moved += Math.hypot(cur.x - prev.x, cur.y - prev.y);
        prev = { x: cur.x, y: cur.y };
        const dx = tx - cur.x, dy = ty - cur.y, d = Math.hypot(dx, dy);
        if (d <= 40) break;
        window.__sendPrimary({ type: 'input', vx: dx / d, vy: dy / d, seq: (window.__seqE2E = (window.__seqE2E || 1e6) + 1), sprint: false });
        await sl(33);
      }
      window.__sendPrimary({ type: 'input', vx: 0, vy: 0, seq: (window.__seqE2E = (window.__seqE2E || 1e6) + 1), sprint: false });
      const fin = window.__getMyAbs();
      return { moved: Number.isFinite(moved) ? moved : 0, left: fin ? Math.hypot(fin.x - tx, fin.y - ty) : 1e9 };
    }, [x + WOX, y + WOY, capMs]);
    await sleep(400);
    const cur = await me();
    const left = cur ? Math.hypot(cur.x - (x + WOX), cur.y - (y + WOY)) : Infinity;
    return { sec: (Date.now() - t0) / 1000, left, moved: (r && Number.isFinite(r.moved)) ? r.moved : 0 };
  };

  await warp(v.x, v.y);
  const inv0 = await inv();
  const sum0 = Object.entries(inv0 || {}).filter(([k]) => !['floor', 'tribe_id', 'sim', 'kind'].includes(k))
    .reduce((n, [, x]) => n + (Number(x) || 0), 0);
  ok(sum0 === 0, `★★① ${VILNAME} 한복판에 **빈손으로** 섰다`, `합계 ${sum0}`);
  await snap('fv-01-center');

  // ── ② 걸어서 세 재료 ───────────────────────────────────────────────────────
  const legs = [];
  for (const k of ['twig', 'pebble', 'fiber']) {
    const t = best[k];
    const before = { ...(await inv()) };
    const w = await walkTo(t.x, t.y);
    let got = 0;
    for (let i = 0; i < 8 && !got; i++) {
      await page.keyboard.press('KeyE'); await sleep(1000);
      const cur = await inv();
      got = (cur[k] || 0) - (before[k] || 0);
    }
    const spd = w.moved / Math.max(0.01, w.sec);
    legs.push({ k, d: Math.round(t.d), how: t.how, sec: w.sec.toFixed(1), left: Math.round(w.left), got, spd });
    console.log(`    ${k}: 마을 중심에서 ${Math.round(t.d)}px [${t.how}] → 걸어서 ${w.sec.toFixed(1)}초 · 실제 이동 ${Math.round(w.moved)}px(${spd.toFixed(0)}px/s) → +${got}`);
  }
  ok(legs.every((l) => l.d <= 960), '★★② 세 재료가 전부 **감사 기준 반경(960px) 안**이었다',
    legs.map((l) => `${l.k} ${l.d}px`).join(' · '));
  ok(legs.every((l) => l.got > 0), '★★② **걸어가서 실제로 주웠다**(셋 다)',
    legs.map((l) => `${l.k}+${l.got}`).join(' '));
  const spd = legs.reduce((a, l) => a + l.spd, 0) / legs.length;
  console.log(`    ※실측 소요 ${legs.map((l) => l.sec + '초').join(' + ')} · 평균 걸음 ${spd.toFixed(0)}px/s(정본 64px/s의 ${(spd / 64 * 100).toFixed(0)}%) — 판정 아님(기계·경로 의존)`);
  await snap('fv-02-gathered');

  // ── ③ 조잡한 돌도끼 자작 ──────────────────────────────────────────────────
  const invG = await inv();
  console.log(`    손에 든 것: ` + ['twig', 'pebble', 'fiber'].map((k) => `${k} ${invG[k] || 0}`).join(' · '));
  // 모자란 만큼만 더 줍는다(같은 자리를 다시 밟는다 — 픽스처 아님)
  const NEED = { pebble: 2, twig: 1, fiber: 2 };
  for (const k of Object.keys(NEED)) {
    for (const c of cand[k]) {                       // ★다음 자리로 옮겨 간다(캔 자리는 사라졌다)
      if (((await inv())[k] || 0) >= NEED[k]) break;
      await walkTo(c.x, c.y, 40000);
      for (let i = 0; i < 6 && ((await inv())[k] || 0) < NEED[k]; i++) { await page.keyboard.press('KeyE'); await sleep(900); }
    }
    console.log(`    보충 ${k}: ${(await inv())[k] || 0}/${NEED[k]}`);
  }
  const invR = await inv();
  ok(Object.keys(NEED).every((k) => (invR[k] || 0) >= NEED[k]), '★★③ 조잡한 돌도끼 재료를 **이 마을 안에서** 다 모았다',
    Object.keys(NEED).map((k) => `${k} ${invR[k] || 0}/${NEED[k]}`).join(' '));
  await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="craft"]').click());
  await sleep(800);
  const clicked = await page.evaluate(() => {
    const t = [...document.querySelectorAll('button, .cr-item, [data-craft]')].find((b) => /조잡한 돌도끼/.test(b.textContent || ''));
    if (t) { t.click(); return true; } return false;
  });
  if (!clicked) await page.evaluate(() => window.__sendPrimary({ type: 'craft', recipe: 'crude_axe' }));
  await sleep(1400);
  const tools = await page.evaluate(() => window.__getTools());
  ok(tools.some((t) => t.type === 'crude_axe'), '★★③ **조잡한 돌도끼가 만들어졌다** — 옛 사막 마을에서, 걸어서 모은 재료로',
    tools.map((t) => `${t.type} ${t.d}/${t.max}`).join(' ') || '없음');
  await snap('fv-03-axe');

  // ── ④ 식수 — 둠벙에서 물을 마신다 ────────────────────────────────────────
  if (Number.isFinite(pool.d)) {
    await warp(v.x, v.y);
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', thirst: 40 }));
    await sleep(800);
    const w = await walkTo(pool.x, pool.y);
    const th0 = await page.evaluate(() => window.__getGauges().thirst);
    await page.keyboard.press('KeyE'); await sleep(1200);
    const th1 = await page.evaluate(() => window.__getGauges().thirst);
    console.log(`    둠벙: 중심에서 ${Math.round(pool.d)}px → 걸어서 ${w.sec.toFixed(1)}초 · 갈증 ${th0} → ${th1}`);
    ok(pool.d <= 960, '★★④ **식수가 감사 기준 반경 안**에 있다', `${Math.round(pool.d)}px`);
    ok(th1 > th0, '★★④ 그리고 **실제로 마셔진다**(둠벙이 그림이 아니다)', `${th0} → ${th1}`);
    await snap('fv-04-water');
  }

  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 예외:', e); process.exit(1); });
