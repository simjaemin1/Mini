#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly A
// === scripts/e2e-streams.js — **개울을 화면에서 본다 · 건넌다 · 마신다** 실클라 E2E (T585) =====================
//
//   ① 클라가 존의 개울 래스터(`/streams.bin`)를 받았다 — 셀 수 = 서버 파일
//   ② 개울 옆에 서면 화면에 개울이 그려진다(연한 파랑 · `__streamDrawn`) — 그림 한 장
//   ③ 개울을 **따라** 걸으면 같은 키·같은 시간에 뭍의 절반을 간다(서버 권위 좌표 `__getSrvAbs`) · 클라 예측과 서버가 어긋나지 않는다
//   ④ 개울 칸 우클릭 = 물 메뉴("마시기") → 마신다
//   서버로 직접 쏘는 것은 픽스처뿐이다(자리 옮기기 `teleport_debug` · 목 세우기 `__e2e_body`).
// 실행: node scripts/e2e-streams.js [--headed]    (Chromium /opt/pw-browsers — playwright install 금지)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.E2E_SHOTS || '/tmp/e2e-streams-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2est-central-${process.pid}.db`, ZDB = `/tmp/e2est-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|개울/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 140)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

(async () => {
  console.log('\n=== 개울 — 화면에서 본다 · 건넌다 · 마신다 (T585) ===');
  const S = require(path.join(ROOT, 'server', 'streams.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const Z = ZONES.hanbando, st = S.stats('hanbando');
  ok(!!st && st.cells > 10000, '[상황] 한반도 개울 래스터', st ? `${st.cells}셀` : '없음');
  // 곧은 가로 개울 줄기 — 개울 칸 7개가 가로로 이어지고 위·아래는 뭍(바위·물 아님)인 자리 · 그 옆 뭍 줄(같은 길이)
  const land = (cx, cy) => !T.isWaterCellLocal('hanbando', cx * 32 + 16, cy * 32 + 16) && !T.isRockCellLocal('hanbando', cx * 32 + 16, cy * 32 + 16);
  let run = null;
  for (let cy = 200; cy < 3800 && !run; cy += 1) for (let cx = 200; cx < 2000 && !run; cx++) {
    let okRun = true;
    for (let k = -1; k <= 8 && okRun; k++) { if (!S.isStreamCell('hanbando', cx + k, cy)) okRun = false; }
    if (!okRun) continue;
    for (let k = -2; k <= 10 && okRun; k++) { for (const dy of [-3, -4, -5]) if (S.isStreamCell('hanbando', cx + k, cy + dy) || !land(cx + k, cy + dy)) okRun = false; }
    if (okRun) run = { cx, cy, landY: cy - 4 };
  }
  ok(!!run, '[상황] 곧은 개울 줄기(가로 10칸) + 네 칸 위 뭍 줄을 정본 래스터에서 골랐다', run ? `(${run.cx},${run.cy}) · 뭍 줄 y=${run.landY}` : '없음');

  const _c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _cu = FB.waitUp(_c, /central server up on/, { name: 'central' });
  const _z = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', E2E_GIVE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  const _zu = FB.waitUp(_z, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await _cu).ok, 'central 기동'); ok((await _zu).ok, 'zone 기동');
  for (let i = 0; i < 120; i++) { try { const z = await (await fetch(`http://localhost:${CPORT}/zones`, { signal: AbortSignal.timeout(4000) })).json(); const hz = (z.zones || {}).hanbando || {}; if (hz.cap) break; } catch (e) {} await sleep(1000); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const btn = await page.$('#enter');
  for (let i = 0; i < 120 && btn && (await btn.isDisabled()); i++) await sleep(1000);
  if (btn) await btn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1500);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '게스트 입장');
  const snap = async (n) => { try { await page.screenshot({ path: `${SHOTS}/${n}.png` }); } catch (e) {} };
  const send = (m) => page.evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  const srv = () => page.evaluate(() => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; return a ? { x: a.x, y: a.y } : null; });
  const pred = () => page.evaluate(() => { const a = window.__getMyAbs(); return { x: a.x, y: a.y }; });
  const notices = () => page.evaluate(() => (window.__notices || []).slice(-3).join(' / '));
  const toScreen = (wx, wy) => page.evaluate(([x, y]) => { const s = window.__w2s(x, y); const cv = document.getElementById('canvas'); const r = cv.getBoundingClientRect(); return { x: r.left + s.px * (r.width / cv.width), y: r.top + s.py * (r.height / cv.height) }; }, [wx, wy]);

  // ── ① 래스터 ──
  let dbg = null;
  for (let i = 0; i < 40; i++) { dbg = await page.evaluate(() => (window.__streamDbg ? window.__streamDbg() : null)); if (dbg && dbg.hanbando && dbg.hanbando.st === 'ok') break; await sleep(500); }
  ok(!!dbg && dbg.hanbando && dbg.hanbando.st === 'ok' && dbg.hanbando.n === st.cells, '★① 클라가 개울 래스터를 받았다 — 셀 수 = 서버 파일', JSON.stringify(dbg && dbg.hanbando));
  if (!run) { await browser.close(); shutdown(); console.log(`\n=== 개울 E2E: ${pass} 통과 / ${fail} 실패 ✗ ===`); process.exit(1); }

  const WX = (cx) => Z.worldOffsetX + cx * 32 + 16, WY = (cy) => Z.worldOffsetY + cy * 32 + 16;
  const tp = async (cx, cy) => { await send({ type: 'teleport_debug', x: cx * 32 + 16, y: cy * 32 + 16 }); for (let i = 0; i < 20; i++) { await sleep(250); const a = await srv(); if (a && Math.abs(a.x - WX(cx)) < 20 && Math.abs(a.y - WY(cy)) < 20) break; } await sleep(700); };
  // ── ② 그림 ──
  await tp(run.cx + 3, run.landY);
  await sleep(1200);
  const drawn = await page.evaluate(() => window.__streamDrawn || 0);
  ok(drawn > 5, '★② 개울 옆 — 화면에 개울이 그려진다(연한 파랑 · 큰 물과 다른 얕은 물)', `그린 칸 ${drawn}`);
  await snap('01-stream');

  // ── ③ 걷기 — 같은 키 같은 시간 · 개울 줄기 위 vs 네 칸 위 뭍 줄 ──
  const walk = async (cx, cy) => {
    await tp(cx, cy);
    const a = await srv();
    await page.keyboard.down('d'); await sleep(900); await page.keyboard.up('d');
    await sleep(900);
    const b = await srv(), p = await pred();
    return { dx: b.x - a.x, dy: b.y - a.y, gap: Math.hypot(p.x - b.x, p.y - b.y) };
  };
  //   ⚠iso 화면이라 'd' 는 월드 대각(+x, −y)이다 — 'd'+'s' = 월드 +x(개울 줄기를 따라간다).
  //   ⚠속도는 **정상 구간**에서 잰다: 키를 누르고 0.4초 뒤부터 1.0초 동안 서버 권위 좌표가 간 거리 ÷ 실제 흐른 시간(부하로 틱이 밀려도 같은 자).
  const walkDir = async (cx, cy) => {
    await tp(cx, cy);
    await page.keyboard.down('d'); await page.keyboard.down('s');
    await sleep(400);
    const seq = () => page.evaluate(() => (typeof inputSeq !== 'undefined' ? inputSeq : null));
    const a = await pred(), q0 = await seq(), t0 = Date.now();
    await sleep(1000);
    const b = await pred(), q1 = await seq(), t1 = Date.now();
    await page.keyboard.up('d'); await page.keyboard.up('s');
    await sleep(900);
    const c = await srv(), p = await pred();
    //   ★한 걸음(입력 하나 = 존 한 틱 · moveDt)마다 간 거리 — 부하로 프레임이 줄어도 걸음당 거리는 이동 모델만이 정한다(같은 자)
    const steps = (q0 != null && q1 != null) ? (q1 - q0) : 0;
    return { dx: b.x - a.x, dy: b.y - a.y, v: steps > 0 ? (b.x - a.x) / steps : (b.x - a.x) / ((t1 - t0) / 1000), steps, gap: Math.hypot(p.x - c.x, p.y - c.y), x0: a.x - Z.worldOffsetX, x1: b.x - Z.worldOffsetX };
  };
  void walk;
  const L = await walkDir(run.cx, run.landY), W = await walkDir(run.cx, run.cy);
  const ratio = L.v > 0 ? W.v / L.v : 0;
  const onRun = Math.floor(W.x1 / 32) <= run.cx + 8;   // 재는 동안 줄기를 안 벗어났나(가로 10칸)
  ok(L.dx > 20 && Math.abs(L.dy) < 12, '[상황] 뭍 줄 — 월드 가로로 걸었다', `dx ${L.dx.toFixed(1)} · dy ${L.dy.toFixed(1)}`);
  ok(Math.abs(W.dy) < 12 && onRun, '[상황] 개울 줄기 위 — 월드 가로로 걸었다(줄기를 안 벗어남)', `dx ${W.dx.toFixed(1)} · dy ${W.dy.toFixed(1)} · 칸 ${Math.floor(W.x0 / 32)}→${Math.floor(W.x1 / 32)}`);
  ok(ratio > 0.47 && ratio < 0.53, '★★③ 같은 키 — 개울 줄기 위 한 걸음 = 뭍의 절반(걸음당 거리 · 예측 = 서버 좌표)', `뭍 ${L.v.toFixed(3)}px/걸음(${L.steps}) · 개울 ${W.v.toFixed(3)}px/걸음(${W.steps}) · ×${ratio.toFixed(3)}`);
  ok(W.gap < 6 && L.gap < 6, '★③ 클라 예측 = 서버(개울에서도 러버밴딩 없음)', `뭍 ${L.gap.toFixed(2)}px · 개울 ${W.gap.toFixed(2)}px`);
  await snap('02-walk');

  // ── ④ 개울 칸 우클릭 → 마시기 ──
  await tp(run.cx + 3, run.cy - 1);
  await send({ type: '__e2e_body', thirst: 40, quiet: true }); await sleep(700);
  let menu = null;
  { const p = await toScreen(WX(run.cx + 4), WY(run.cy));
    await page.mouse.move(p.x, p.y); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
    for (let i = 0; i < 12 && !menu; i++) { await sleep(250); menu = await page.evaluate(() => { const m = document.getElementById('ctxMenu'); return m && m.children.length ? [...m.children].map((e) => (e.textContent || '').trim()) : null; }); } }
  ok(!!menu && menu.includes('마시기'), '★④ 개울 칸 우클릭 = 물 메뉴("마시기") — 서버 `look` 이 "개울 — 민물"', JSON.stringify(menu));
  if (menu && menu.includes('마시기')) await page.evaluate(() => { const m = document.getElementById('ctxMenu'); for (const e of m.children) if ((e.textContent || '').trim() === '마시기') { e.click(); break; } });
  let drank = false;
  for (let i = 0; i < 40 && !drank; i++) { await sleep(400); if (/물 마심/.test(await notices())) drank = true; }
  ok(drank, '★④ "마시기" — 개울가에서 마셨다', `알림: ${await notices()}`);
  await snap('03-drink');

  // ── ⑤ 그림 — 개울이 큰 강에 드는 어귀(얕은 물 · 큰 물이 한 화면에 · 보고 그림용) ──
  {
    let mouth = null;
    const open = (cx, cy) => { let f = 0; for (let dy = -8; dy <= 8; dy += 4) for (let dx = -8; dx <= 8; dx += 4) f += T.getForestMultiplier('hanbando', (cx + dx) * 32 + 16, (cy + dy) * 32 + 16) > 1.5 ? 1 : 0; return f === 0; };   // 숲이 시야를 가리지 않는 들판
    for (let cy = 900; cy < 3600 && !mouth; cy += 3) for (let cx = 300; cx < 1900 && !mouth; cx += 1) {
      if (!S.isStreamCell('hanbando', cx, cy) || !open(cx, cy)) continue;
      let riv = 0; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (T.isWaterCellLocal('hanbando', (cx + dx) * 32 + 16, (cy + dy) * 32 + 16)) riv++;
      if (riv > 20 && riv < 90 && land(cx - 3, cy - 3)) mouth = { cx, cy };
    }
    if (mouth) { await tp(mouth.cx - 3, mouth.cy - 3); await sleep(1500); }
    const d2 = await page.evaluate(() => window.__streamDrawn || 0);
    ok(!!mouth && d2 > 3, '⑤ 어귀 — 개울(연한 파랑)과 큰 강(진한 파랑 · 물결)이 한 화면에 다르게 보인다', mouth ? `(${mouth.cx},${mouth.cy}) · 그린 칸 ${d2}` : '없음');
    await snap('04-mouth');
  }

  await browser.close();
  console.log(`\n=== 개울 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '✗' : '✅'} ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('E2E 실패:', e && e.message); shutdown(); process.exit(1); });
