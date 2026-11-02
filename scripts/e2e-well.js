#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly C   ← 야간 세 밤 분할(T238) — C 가 20·20·19 로 한 칸 가볍다(약 2분)
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
  // ★★[T824] 자리 옮기기는 **걸음이 아니라 `teleport_debug`(픽스처 문 · 존 로컬 px)** 로만 한다 · 도착은 **서버 권위**(`__getSrvAbs`)로 잰다.
  //   종전 두 흔들림(T809 회부 4 — "이미 같은 종류의 사유지" 7/8):
  //   ⓐ 마을 땅 옮기기가 "예측 자리(`__getMyAbs`)가 200px 넘게 움직였나"로 끝났다 — 예측이 0.9초 안에 못 따라오면 **다음 후보**로 또 쏴서
  //      설 자리가 판마다 갈렸다(10,325 ↔ 10,517 · 존 로컬 x).
  //   ⓑ 2×2 의 다음 칸은 **키 누름 걸음**(`gotoCell`)으로 갔다 — 10,517 쪽에서는 남쪽 칸(abs 13140,2866)으로 못 들어가 **내 사유지 c2 위에 선 채**
  //      또 `claim` 을 쏴서 열네 번 "이미 같은 종류"(서버 로그로 확인 · 남은 사유지 · 앞 판 DB · 벽시계와 무관).
  //   ⇒ 이 하네스가 재는 건 **우물 UI**(버튼 · 캔버스 클릭 · 좌클릭 · 우클릭 · 마시기)다. 걷기는 재지 않는다 — 자리는 셀로 정하고 서버가 섰다고 할 때까지 기다린다.
  const zoneOff = async () => page.evaluate(() => { const z = (window.__getZonesMeta()[window.__getPrimaryZoneId()] || {}); return { x: z.worldOffsetX || 0, y: z.worldOffsetY || 0 }; });
  const warpLocal = async (lx, ly) => {
    const o = await zoneOff(); lx = Math.round(lx); ly = Math.round(ly);
    await send({ type: 'teleport_debug', x: lx, y: ly });
    for (let i = 0; i < 24; i++) {
      await sleep(250);
      const s2 = await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null));
      if (s2 && Math.hypot(s2.x - (o.x + lx), s2.y - (o.y + ly)) < 4) return true;
    }
    return false;   // 물 위면 서버가 거절한다(자리 그대로)
  };
  const gotoCell = async (tx, ty) => { const o = await zoneOff(); return warpLocal(tx * 32 + 16 - o.x, ty * 32 + 16 - o.y); };   // abs 셀 → 그 셀 한가운데

  // ── 픽스처 — 재료·곡괭이·물병 · 우물 마을 땅으로 ──
  await send({ type: '__e2e_give', items: { pebble: 60, water_bottle: 1, wood: 40, stone: 40 }, tools: ['pickaxe'] });
  await sleep(800);
  let moved = false;
  //   ★[T824] 넘어가는 건 **서버가 거절했을 때(물)** 뿐이다 — 그래서 늘 같은 후보에 선다.
  //     맨 앞은 **(−96,0)** — 종전 초록 판(15/0)이 전부 실제로 선 자리다(앞 두 후보는 예측이 못 따라와 지나쳤다). 아래 ③ 의 "북서 칸을 짚는다"
  //     (나무 그림이 터 중심에 겹친다)도 그 자리를 보고 쓴 것이다 — 후보 (0,0) 에 서면 북서 칸도 나무가 앞서 ③ 메뉴가 "벌목"이 된다(이 카드가 쟀다).
  for (const [ox, oy] of [[-96, 0], [0, 0], [96, 0], [0, 96], [0, -96], [160, 160], [-160, 160], [160, -160], [-160, -160], [256, 0], [0, 256]]) {
    if (await warpLocal(home.x + ox, home.y + oy)) { moved = true; console.log(`    섰다 — 후보 (${ox},${oy})`); break; }
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
    if (need) { if (!(await gotoCell(need[0], need[1]))) break; await sleep(400); await send({ type: 'claim', kind: 'temporary' }); await sleep(700); }   // ★[T824] 그 칸에 못 섰으면 또 쏘지 않는다(내 땅 위 `claim` = "이미 같은 종류")
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
  //   ★[T824] 착공 뒤에도 **건축 모드는 켜져 있다**(`well_start` 가 `buildMode = true` · 배치 뒤 `placementMode` 만 걷힌다 — 노 · 숯가마와 같은 계약).
  //     건축 모드에서 커서 밑에 건물이 잡히면(`hoverBuildingId`) 좌클릭은 **3초 분해**가 먼저다(14.51 · `30-n-net.js`).
  //     종전 초록 판은 그 자리(후보 −96,0)에서 마침 터가 커서에 안 잡혀 `pickAt` → `well_advance` 로 흘렀다 — 자리가 바뀌면(후보 0,0) "well_site 분해".
  //   ⇒ 사람이 하듯 **B 로 건축 모드를 끈 뒤** 터를 누른다(배치 알림의 "B=취소" 그 키). 끈 것을 단정으로 확인한다.
  //   ★[T839 · ★T850 켬 기본] 손잡이 `T839_SITE_EXIT`(기본 켬 · 되돌림 `=0`)가 켜져 있으면 **제품이 착공 순간 건축 모드를 끈다** — 그때는 B 를 누르지 않는다(누르면 도로 켜진다).
  //     안내("다음: ② … (우물 터 클릭)") 그대로 터만 누르는 사람의 손짓이 시공으로 이어지는지를 기본 판이 잰다(되돌림 `=0` 판은 아래 B 갈래).
  if (await page.evaluate(() => !!(uiCfg && uiCfg.siteExit))) {
    ok(await page.evaluate(() => (typeof buildMode !== 'undefined') && buildMode === false), '[상황] ★[T839 켬] 착공하자 건축 모드가 **저절로** 꺼졌다 — B 없이 터를 누른다');
  } else {
    await page.keyboard.press('b'); await sleep(200);
    ok(await page.evaluate(() => (typeof buildMode !== 'undefined') && buildMode === false), '[상황] B — 건축 모드를 껐다(터 좌클릭이 분해로 안 샌다)');
  }
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
  for (let i = 0; i < 40 && !drank; i++) { await sleep(400); const t = await notices(); if (/물을 마셨습니다/.test(t)) drank = true; }
  th1 = await page.evaluate(() => (typeof myThirst !== 'undefined') ? myThirst : null);
  ok(drank, '④ ★"마시기" — 걸어가 우물가에서 마셨다(물 마심 +30)', `알림: ${await notices()} · 목 ${th0} → ${th1}`);
  await snap('04-drink');

  await browser.close();
  console.log(`\n=== 우물 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '✗' : '✅'} ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('E2E 실패:', e && e.message); shutdown(); process.exit(1); });
