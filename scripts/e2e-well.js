#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/e2e-well.js — **우물을 화면에서 짓고 마신다** 실클라 E2E (T557 · 재민 #88) =====================
//
//   게스트가 **버튼·클릭·우클릭만으로**: 우물 마을(임업4) 땅에 2×2 사유지 → `우물 터 잡기` 버튼(배치 모드) → 캔버스 클릭(착공)
//   → 터 좌클릭(1단 · 쌓는 중 `stage 2`) → 터 우클릭 "시공"(2단 · 완공) → 우물 칸 우클릭 → 물 메뉴 "마시기" → 목 +30.
//   서버로 직접 쏘는 것은 픽스처뿐이다(재료·곡괭이 지급 `__e2e_give` · 목 세우기 `__e2e_body` · 자리 옮기기 `teleport_debug` · 사유지 `claim`).
//   ★손잡이는 **안 준다**(`T509_WELL` 기본 켬 — 기본값이 켬인지를 이 판이 잰다).
// 실행: node scripts/e2e-well.js [--headed]    (Chromium /opt/pw-browsers — playwright install 금지)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-well-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;   // ★존 포트는 존 설정의 그 수(hanbando 3020)여야 로비가 붙는다
const CDB = `/tmp/e2ewell-central-${process.pid}.db`, ZDB = `/tmp/e2ewell-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|우물/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 140)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

(async () => {
  console.log('\n=== 우물 — 화면에서 짓고 마신다 (T557) ===');
  // 우물 마을 후보 자리(존 로컬 px) — 정본 `terrain.siteCandidates`(서버 `_wellGroundAt` 이 읽는 그 문)
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const WS = require(path.join(ROOT, 'server', 'well-stages'));
  const home = (T.siteCandidates('hanbando') || []).find((v) => v.name === WS.WELL_VILLAGES[0]);
  ok(!!home, `[상황] 우물 마을 후보 자리 — ${WS.WELL_VILLAGES[0]}`, home ? `${Math.round(home.x)},${Math.round(home.y)}` : '없음');

  const _c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _cu = FB.waitUp(_c, /central server up on/, { name: 'central' });
  const _z = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', VILLAGE_MAX: '1', VILLAGE_DAY_MS: '2000', E2E_GIVE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' });
  const _zu = FB.waitUp(_z, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await _cu).ok, 'central 기동'); ok((await _zu).ok, 'zone 기동');
  for (let i = 0; i < 180; i++) { try { const z = await (await fetch(`http://localhost:${CPORT}/zones`, { signal: AbortSignal.timeout(4000) })).json(); const hz = (z.zones || {}).hanbando || {}; if (hz.cap && hz.population !== null && hz.population !== undefined) break; } catch (e) {} await sleep(1000); }

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
  const absOf = () => page.evaluate(() => { const a = window.__getMyAbs(); return { x: a.x, y: a.y }; });
  const notices = () => page.evaluate(() => (window.__notices || []).slice(-3).join(' / '));
  const buildings = () => page.evaluate(() => (window.__getAllBuildings ? window.__getAllBuildings() : []));
  const claimCells = () => page.evaluate(() => { const o = []; for (const c of (window.__getClaims ? window.__getClaims() : [])) if (c.kind === 'temporary') o.push(`${Math.floor(c.wx / 32)},${Math.floor(c.wy / 32)}`); return o; });
  const toScreen = (wx, wy) => page.evaluate(([x, y]) => { const s = window.__w2s(x, y); const cv = document.getElementById('canvas'); const r = cv.getBoundingClientRect(); return { x: r.left + s.px * (r.width / cv.width), y: r.top + s.py * (r.height / cv.height) }; }, [wx, wy]);
  const pulse = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(130); };
  const gotoCell = async (tx, ty) => {
    for (let i = 0; i < 80; i++) { const a = await absOf(); const dx = tx * 32 + 16 - a.x, dy = ty * 32 + 16 - a.y;
      if (Math.abs(dx) <= 11 && Math.abs(dy) <= 11) return true;
      const ms = (d) => Math.max(45, Math.min(90, Math.round(Math.abs(d) * 1.2)));
      if (Math.abs(dx) > Math.abs(dy)) await pulse(dx > 0 ? 'd' : 'a', ms(dx)); else await pulse(dy > 0 ? 's' : 'w', ms(dy)); }
    return false;
  };

  // ── 픽스처 — 재료·곡괭이·물병 · 우물 마을 땅으로 ──
  await send({ type: '__e2e_give', items: { pebble: 60, water_bottle: 1, wood: 40, stone: 40 }, tools: ['pickaxe'] });
  await sleep(800);
  const a0 = await absOf();
  let moved = false;
  for (const [ox, oy] of [[0, 0], [96, 0], [-96, 0], [0, 96], [0, -96], [160, 160], [-160, 160], [160, -160], [-160, -160], [256, 0], [0, 256]]) {
    await send({ type: 'teleport_debug', x: Math.round(home.x + ox), y: Math.round(home.y + oy) }); await sleep(900);
    const a = await absOf(); if (Math.hypot(a.x - a0.x, a.y - a0.y) > 200) { moved = true; break; }
  }
  ok(moved, `[상황] ${WS.WELL_VILLAGES[0]} 마을 땅으로 옮겼다`, JSON.stringify(await absOf()));
  const btnState = await page.evaluate(() => { const b = document.querySelector('[data-action="well_start"]'); return b ? b.style.display : 'none-el'; });
  ok(btnState === '', '★버튼 `우물 터 잡기`가 보인다(서버 손잡이 기본 켬 → welcome `uiCfg.wellAct`)', `display='${btnState}'`);

  // ── 2×2 임시 사유지 ──
  let spot = null;
  for (let r = 0; r < 14 && !spot; r++) {
    const cells = await claimCells();
    const set = new Set(cells);
    for (const k of cells) { const [x, y] = k.split(',').map(Number); if ([[1, 0], [0, 1], [1, 1]].every(([dx, dy]) => set.has(`${x + dx},${y + dy}`))) { spot = [x, y]; break; } }
    if (spot) break;
    if (!cells.length) { await send({ type: 'claim', kind: 'temporary' }); await sleep(700); continue; }
    const [x, y] = cells[0].split(',').map(Number);
    const need = [[1, 0], [0, 1], [1, 1]].map(([dx, dy]) => [x + dx, y + dy]).find(([cx, cy]) => !set.has(`${cx},${cy}`));
    if (need) { await gotoCell(need[0], need[1]); await sleep(400); await send({ type: 'claim', kind: 'temporary' }); await sleep(700); }
  }
  ok(!!spot, '[상황] 2×2 임시 사유지', spot ? spot.join(',') : '실패');
  if (spot) await gotoCell(spot[0] - 1, spot[1]);

  // ── ① 버튼 → 배치 모드 → 캔버스 클릭 = 착공 ──
  await page.evaluate(() => document.querySelector('[data-action="well_start"]').click());
  await sleep(300);
  const pm = await page.evaluate(() => (typeof placementMode !== 'undefined' && placementMode) ? placementMode.special : null);
  ok(pm === 'well_site', '① 버튼 → 배치 모드(`well_site`)', String(pm));
  if (spot) { const p = await toScreen(spot[0] * 32 + 16, spot[1] * 32 + 16); await page.mouse.click(p.x, p.y); }
  let site = null;
  for (let i = 0; i < 20 && !site; i++) { await sleep(300); site = (await buildings()).find((b) => b.type === 'well_site'); }
  ok(!!site && site.stage === 1, '① 캔버스 클릭 = 착공 — 우물 터 stage 1', site ? `stage ${site.stage}` : `알림: ${await notices()}`);
  await snap('01-site');

  // ── ② 터 좌클릭 = 1단(쌓는 중) ──
  if (site) { const p = await toScreen(site.wx, site.wy); await page.mouse.click(p.x, p.y); }
  let s2 = null;
  for (let i = 0; i < 20; i++) { await sleep(300); s2 = (await buildings()).find((b) => b.type === 'well_site'); if (s2 && s2.stage === 2) break; }
  ok(!!s2 && s2.stage === 2, '② 터 좌클릭 = `well_advance` — 벽 1단 · 쌓는 중(stage 2)', s2 ? `stage ${s2.stage}` : `알림: ${await notices()}`);
  await snap('02-tier1');

  // ── ③ 터 우클릭 → "시공" = 2단 · 완공 ──
  let menu = null;
  if (s2 && spot) {
    //   ⚠터 중심(`wx,wy`)은 임업 마을이라 나무 그림이 겹친다 — 고르기 사슬은 자연물이 터보다 앞이다(종전 규약 · 이 카드 무접촉).
    //     그래서 터의 **북서 칸**(사유지 첫 칸)을 짚는다 — 그 칸도 터 고르기 상자(±34) 안이다.
    const p = await toScreen(spot[0] * 32 + 16, spot[1] * 32 + 16);
    await page.mouse.move(p.x, p.y); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
    for (let i = 0; i < 10 && !menu; i++) { await sleep(200); menu = await page.evaluate(() => { const m = document.getElementById('ctxMenu'); return m && m.children.length ? [...m.children].map((e) => (e.textContent || '').trim()) : null; }); }
  }
  ok(!!menu && menu.includes('시공'), '③ 터 우클릭 — 메뉴에 "시공"', JSON.stringify(menu));
  if (menu && menu.includes('시공')) await page.evaluate(() => { const m = document.getElementById('ctxMenu'); for (const e of m.children) if ((e.textContent || '').trim() === '시공') { e.click(); break; } });
  let well = null;
  for (let i = 0; i < 20 && !well; i++) { await sleep(300); well = (await buildings()).find((b) => b.type === 'well'); }
  ok(!!well, '③ "시공" = 벽 2단 — 우물 완공', well ? '' : `알림: ${await notices()}`);
  const inv = await page.evaluate(() => window.__getInv && window.__getInv());
  ok(inv && inv.pebble === 20, '③ 자갈 60 → 20(두 단 20 · 20)', `pebble ${inv && inv.pebble}`);
  await snap('03-well');

  // ── ④ 우물 칸 우클릭 → 물 메뉴 "마시기" ──
  await send({ type: '__e2e_body', thirst: 40, quiet: true }); await sleep(600);
  const th0 = await page.evaluate(() => (typeof myThirst !== 'undefined') ? myThirst : (window.__getGauges ? window.__getGauges().thirst : null));
  let wmenu = null;
  if (spot) {
    const p = await toScreen(spot[0] * 32 + 16, spot[1] * 32 + 16);
    await page.mouse.move(p.x, p.y); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
    for (let i = 0; i < 12 && !wmenu; i++) { await sleep(250); wmenu = await page.evaluate(() => { const m = document.getElementById('ctxMenu'); return m && m.children.length ? [...m.children].map((e) => (e.textContent || '').trim()) : null; }); }
  }
  ok(!!wmenu && wmenu.includes('마시기') && wmenu.some((l) => /^병에 담기/.test(l)), '④ 우물 칸 우클릭 = 물 메뉴(마시기 · 병에 담기) — 서버 `look` 이 "우물 — 민물"', JSON.stringify(wmenu));
  if (wmenu && wmenu.includes('마시기')) await page.evaluate(() => { const m = document.getElementById('ctxMenu'); for (const e of m.children) if ((e.textContent || '').trim() === '마시기') { e.click(); break; } });
  let th1 = null, drank = false;
  for (let i = 0; i < 40 && !drank; i++) { await sleep(400); const t = await notices(); if (/물 마심/.test(t)) drank = true; }
  th1 = await page.evaluate(() => (typeof myThirst !== 'undefined') ? myThirst : null);
  ok(drank, '④ ★"마시기" — 걸어가 우물가에서 마셨다(물 마심 +30)', `알림: ${await notices()} · 목 ${th0} → ${th1}`);
  await snap('04-drink');

  await browser.close();
  console.log(`\n=== 우물 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '✗' : '✅'} ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('E2E 실패:', e && e.message); shutdown(); process.exit(1); });
