#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/e2e-tidal.js — 갯벌 채집(조개·해조) **실클라** E2E ====================
//
// ★★이 배치의 zone.js 접점은 **한 줄**이고 클라는 **한 줄도 안 고쳤다.** 그래서 이 하네스는
//   회귀가 아니라 그 조건의 **증명**이다: 서버에 데이터만 얹었는데 화면에 저절로 나타나는가?
//     · 갯벌에서 E 를 누르면 **굴/해조**가 손에 오는가 (그리고 **한글 이름**으로 보이는가)
//     · 물이 차 있으면 **안 나오는가**(같은 자리 · 대조군)
//     · 그 굴이 **모닥불의 조개탕**으로 이어지는가(요리 인스턴스가 손에 오는가)
//     · 자산 404 가 안 나는가(새 인벤 품목의 아이콘 계약)
//   ★★[T54 2026-09-02] 둘이 더 붙었다:
//     · **강가에서 병에 물을 담고 들판에서 마시면 빈 병이 돌아오는가**(병 개수 보존 — 실화면)
//     · **굴을 건조대에 걸어 건굴을 받고 그걸 먹을 수 있는가**(주입한 효과가 화면까지 닿는가)
//   ⇒ 하나라도 안 되면 그건 "서버는 맞는데 화면에서 도달 못 하는 층"이고, 보고에 그렇게 적는다.
//
// ★★시간 모드: **물때를 못 박는다**(`TIDE_FREEZE_MS`). 안 그러면 "돌린 순간이 썰물일 때만
//   통과하는 검사"가 된다 — 자명 통과다(족보 (56)). 열림/닫힘 **두 상태를 다** 밟는다.
//   게임일·요리 시간은 안 건드린다(요리 20초는 그대로 기다린다).
//
// ★★자리는 **찾는다, 고르지 않는다**(족보 (73)): 갯벌은 실서버 술어로 훑어서 찾는다.
//
// 실행: node scripts/e2e-tidal.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-tidal-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-td-c-${process.pid}.db`, ZDB = `/tmp/e2e-td-z-${process.pid}.db`;

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 80)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
async function waitHttp(u, n = 900) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }

(async () => {
  console.log('\n=== 갯벌 채집 실클라 E2E (Chromium) ===');
  const Salt = require(path.join(ROOT, 'server', 'salt.js'));
  const Tidal = require(path.join(ROOT, 'server', 'tidal.js'));
  const Chunk = require(path.join(ROOT, 'server', 'chunk.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const Z = ZONES.hanbando;
  const WOX = Z.worldOffsetX || 0, WOY = Z.worldOffsetY || 0;
  const OPEN_MS = 0;                                   // 간조(갯벌이 드러난 순간)
  const FLOOD_MS = Math.round(Tidal.CFG.PERIOD_MS / 2); // 만조
  // ★[T54] 말리기는 **사흘**(실시간 72분)이라 실클라로 못 기다린다 — 이미 있는 env 손잡이를 줄인다.
  //   ⚠값만 줄인다: 경로도 문법도 운영과 **똑같은 것**을 탄다(사본 하네스 금지).
  const DRY_DAYS = '0.004';                            // 0.004 게임일 ≈ 5.8초

  const OCEAN = Object.values(ZONES).filter((z) => z.isOcean)
    .map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
  const WT = Chunk.generateCoastlineWaterTiles({ ...Z, id: 'hanbando' }, 32, () => null, OCEAN);
  const isSea = (x, y) => {
    if (x < 0 || y < 0 || x >= Z.zoneWidth || y >= Z.zoneHeight) return false;
    const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
    if (!WT.has(`${tx}_${ty}`)) return false;
    return !T.isWaterCellLocal('hanbando', tx * 32 + 16, ty * 32 + 16);
  };
  const SEA_CTX = { isSea };
  const blocked = (x, y) => T.isRockCellLocal('hanbando', x, y) || T.isWaterCellLocal('hanbando', x, y) || isSea(x, y);
  // 갯벌인데 **굴이 나오는 자리**(해조밭이 아니라)를 찾는다 — 조개탕까지 이어야 하니까.
  let flat = null;
  for (let y = 118000; y < 130000 && !flat; y += 32) {
    for (let x = 20000; x < 60000; x += 32) {
      if (!Salt.isTidalFlat(x, y, SEA_CTX) || blocked(x, y)) continue;
      if (Tidal.pickAt(x, y, OPEN_MS) !== 'oyster') continue;
      let room = true;
      for (let dx = -96; dx <= 96 && room; dx += 32) for (let dy = -96; dy <= 0 && room; dy += 32)
        if (blocked(x + dx, y + dy)) room = false;
      if (room) { flat = { x, y }; break; }
    }
  }
  pre(!!flat, '★실서버 술어로 **찾은** 갯벌(굴이 나오는 자리 · 곁에 빈터)', JSON.stringify(flat));
  if (!flat) { console.log(`\n=== 결과: ${pass} PASS / ${++fail} FAIL ===`); process.exit(1); }
  console.log(`    갯벌: ${flat.x},${flat.y} · 물때 주기 ${(Tidal.CFG.PERIOD_MS / 60000).toFixed(2)}분 · 열림 ${(Tidal.CFG.OPEN_FRAC * 100).toFixed(0)}%`);

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    TIDE_FREEZE_MS: String(OPEN_MS), FORAGE_COOLDOWN_MS: '0', PRESERVE_DAYS_DRY: DRY_DAYS });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  const missing = [];
  page.on('response', (r) => { if (r.status() === 404) missing.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const give = async (pl) => { await page.evaluate((p) => window.__sendPrimary(Object.assign({ type: '__e2e_give' }, p)), pl); await sleep(1200); };
  const inv = () => page.evaluate(() => window.__getInv());
  const ptxt = () => page.evaluate(() => window.__panelText());
  const me = () => page.evaluate(() => window.__getMyAbs());
  const send = (m) => page.evaluate((x) => window.__sendPrimary(x), m);

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('button:has-text("월드 입장")');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2200);
  ok(!!(await me()), '존 입장');
  const warp = async (x, y) => { for (let i = 0; i < 20; i++) {
    await send({ type: 'teleport_debug', x, y }); await sleep(800);
    const c = (await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await me());
    if (c && Math.hypot(c.x - (x + WOX), c.y - (y + WOY)) <= 200) return c; } return null; };

  // ══ ① 갯벌에서 E — 굴이 손에 온다 ═══════════════════════════════════════
  console.log('\n① 갯벌 — 물이 빠졌을 때 E 를 누르면 굴이 온다');
  await warp(flat.x, flat.y);
  pre(!!(await me()), '갯벌 위에 섰다');
  const i0 = await inv();
  pre(!(i0.oyster > 0), '★자명 통과 금지 — 아직 굴이 하나도 없다', String(i0.oyster || 0));
  for (let i = 0; i < 10; i++) { await send({ type: 'gather' }); await sleep(300); }
  await sleep(1200);
  const i1 = await inv();
  ok((i1.oyster || 0) > 0, '★★① **갯벌에서 굴을 캤다** — 서버에 데이터만 얹었는데 동사가 열렸다', `굴 ${i1.oyster || 0}`);
  ok((i1.oyster || 0) <= 6, '★① 한 자리는 곧 마른다(개체별 고갈 · 반독점)', `${i1.oyster || 0}개에서 멈췄다`);

  // 화면에 어떻게 뜨는가 — **통일 목록**(인벤 모달)을 읽는다(사이드 패널이 아니다).
  await page.evaluate(() => { if (window.__openInv) window.__openInv('mine'); });
  await sleep(900);
  const rows = await page.evaluate(() => (window.__ulRows ? window.__ulRows('mine') : []));
  const invTxt = JSON.stringify(rows);
  ok(/굴|oyster/.test(invTxt), '★① 캔 것이 **인벤 화면에 선다**', invTxt.slice(0, 160));
  // ★★[관측 · 판정 아님] 서버는 한글 이름표를 낸다(`ITEM_LABEL_SERVER.oyster = '굴'`).
  //   그런데 **인벤 패널은 클라의 하드코딩 표**(`ITEM_LABEL`)를 읽는다 — 자염의 `brine` 이 선 그 자리다.
  //   이 카드는 클라 무접촉이라 못 고친다. `인계/회부.md` 0-갯 에 한 줄로 남겼다.
  //   ⚠판정으로 두면 **영영 빨간 하네스**가 된다(고칠 수 없는 것을 재는 검사) — 그래서 관측이다.
  pre(true, /굴/.test(invTxt) ? '인벤 화면이 **한글**로 뜬다(클라 표가 채워졌다)'
                             : '⚠인벤 화면이 아직 **영문 키**로 뜬다 — 클라 한 줄(회부 0-갯)', '');
  await page.evaluate(() => { if (window.__openInv) window.__openInv(null); });
  await sleep(300);
  await snap('td-01-oyster');

  // ══ ② 물이 차면 안 나온다 — **같은 자리** 대조군 ═════════════════════════
  console.log('\n② 대조군 — 물이 차면 같은 자리에서 안 나온다');
  procs[1].kill('SIGKILL');                       // zone 을 만조로 다시 띄운다
  await sleep(1500);
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    TIDE_FREEZE_MS: String(FLOOD_MS), FORAGE_COOLDOWN_MS: '0', PRESERVE_DAYS_DRY: DRY_DAYS });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), '만조로 zone 재기동');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter2 = await page.$('button:has-text("월드 입장")');
  if (enter2) await enter2.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2200);
  await warp(flat.x, flat.y);
  const f0 = (await inv()).oyster || 0;
  for (let i = 0; i < 10; i++) { await send({ type: 'gather' }); await sleep(300); }
  await sleep(1200);
  const f1 = (await inv()).oyster || 0;
  ok(f1 === f0, '★★★② **물이 차면 같은 자리에서 굴이 안 나온다** — 자리가 아니라 **물때**가 갈랐다', `굴 ${f0} → ${f1}`);
  await snap('td-02-flood');

  // ══ ③ 조개탕 — 모닥불에 걸고 받는다 ══════════════════════════════════════
  console.log('\n③ 조개탕 — 캔 굴이 요리로 이어진다');
  await give({ items: { wood: 20, oyster: 6 } });
  await send({ type: 'craft_building', recipe: 'item_campfire' });
  await sleep(1000);
  await send({ type: 'build', buildType: 'campfire', floor: 0 });
  await sleep(1600);
  await send({ type: 'facility_ask' });
  await sleep(1200);
  const facTxt = await ptxt();
  ok(/조개탕/.test(facTxt), '★★③ **모닥불 창에 조개탕이 저절로 떴다** — 클라 무수정 · 새 문법 0',
     (facTxt.match(/[^\n]{0,24}조개탕[^\n]{0,24}/) || [''])[0].trim());
  const oyBefore = (await inv()).oyster || 0;
  await send({ type: 'cook', recipe: 'clam_stew' });
  await sleep(1500);
  const oyAfter = (await inv()).oyster || 0;
  ok(oyAfter === oyBefore - 3, '★③ 굴 3개가 들어갔다', `${oyBefore} → ${oyAfter}`);
  // 요리 20초 — **대기열로 센다**(족보 (57): 행동이 실제로 일어났는지 먼저 세라).
  await send({ type: 'facility_ask' }); await sleep(900);
  const q0 = (await page.evaluate(() => ((window.__getFacility() || {}).queue) || [])) || [];
  ok(q0.length > 0, '★★③ 모닥불 **대기열에 걸렸다**(즉석이 아니다)', `${q0.length}건 · ${(q0[0] || {}).label || ''}`);
  let collected = false;
  for (let i = 0; i < 30 && !collected; i++) {
    await sleep(1500);
    await send({ type: 'facility_ask' }); await sleep(400);
    const F = await page.evaluate(() => window.__getFacility());
    await send({ type: 'craft_collect', buildingId: F && F.near && F.near.bid });
    await sleep(500);
    await send({ type: 'facility_ask' }); await sleep(400);
    const q = (await page.evaluate(() => ((window.__getFacility() || {}).queue) || [])) || [];
    if (q.length === 0) collected = true;
  }
  ok(collected, '★★★③ **조개탕을 받았다** — 대기열이 비었다(캔 굴이 요리로 이어졌다)');
  // 그리고 **화면의 "내 요리"** 에 선다 — 제작 패널을 한 번만 연다(토글하면 홀수 번째에 닫힌다).
  //   ⚠"내 요리"는 제작 사이드의 **음식 분류**에서만 그려진다(`craftCat === 'food'`) — 분류를 눌러야 한다.
  await page.evaluate(() => { const el = document.querySelector('.sb-icon[data-side="craft"]'); if (el) el.click(); });
  await sleep(900);
  if (!/만들 수 있는|분류|요리/.test(await ptxt())) {
    await page.evaluate(() => { const el = document.querySelector('.sb-icon[data-side="craft"]'); if (el) el.click(); });
    await sleep(900);
  }
  await page.evaluate(() => { const el = [...document.querySelectorAll('.craft-cat')].find((c) => /음식|요리/.test(c.textContent)); if (el) el.click(); });
  await sleep(900);
  let ctxt = await ptxt();
  ok(/내 요리/.test(ctxt) && /조개탕/.test(ctxt), '★★③ 화면의 **"내 요리"** 에 조개탕이 섰다(신선도·품질 인스턴스)',
     (ctxt.match(/내 요리[^\n]{0,60}/) || ctxt.match(/[^\n]{0,20}조개탕[^\n]{0,26}/) || [''])[0].trim());
  await snap('td-03-stew');

  // ══ ⑤ 민물 — 강가에서 병에 담고, 들판에서 마시고, 빈 병이 남는다 [T54] ══════
  console.log('\n⑤ 민물 — 병에 담아 들고 다닌다');
  {
    // 자리는 **찾는다, 고르지 않는다** — 강·호수(바다 아님) 옆의 설 수 있는 뭍 한 칸.
    let river = null;
    for (let y = 20000; y < 120000 && !river; y += 64) {
      for (let x = 8000; x < 62000; x += 64) {
        if (blocked(x, y)) continue;                     // 내가 설 자리는 뭍이어야 한다
        let near = false;
        for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32]]) {
          const wx = x + dx, wy = y + dy;
          if (T.isWaterCellLocal('hanbando', wx, wy) && !isSea(wx, wy)) { near = true; break; }
        }
        if (!near) continue;
        let room = true;
        for (let dx = -64; dx <= 64 && room; dx += 32) if (blocked(x + dx, y)) room = false;
        if (room) { river = { x, y }; break; }
      }
    }
    pre(!!river, '★실서버 술어로 **찾은** 민물가(강·호수 옆의 뭍)', JSON.stringify(river));
    if (river) {
      await warp(river.x, river.y);
      pre(!!(await me()), '물가에 섰다');
      // ★★★**입력 경로 도달을 먼저 센다**(족보 (94)) — 갈증이 차 있어야 채수 갈래로 내려간다.
      //   T52 가 물린 자리가 정확히 이것이다: 표에 갈래를 넣어도 입력이 못 닿으면 없는 기능이다.
      await give({ items: { water_bottle: 3 } });
      const w0 = await inv();
      pre((w0.water_bottle || 0) >= 3, '★자명 통과 금지 — 빈 병 셋을 들었고 물은 아직 없다',
        `병 ${w0.water_bottle || 0} · 물 ${w0.fresh_water || 0}`);
      for (let i = 0; i < 8; i++) { await send({ type: 'gather' }); await sleep(350); }
      await sleep(1200);
      const w1 = await inv();
      ok((w1.fresh_water || 0) > 0, '★★★⑤ **강가에서 병에 물을 담았다** — 물을 들고 다닐 수 있게 됐다',
        `병 ${w1.water_bottle || 0} · 물 ${w1.fresh_water || 0}`);
      ok((w1.water_bottle || 0) + (w1.fresh_water || 0) === (w0.water_bottle || 0),
        '★★★⑤ **개수가 보존된다** — 병이 사라진 게 아니라 물이 됐다',
        `${w0.water_bottle || 0} → 병 ${w1.water_bottle || 0} + 물 ${w1.fresh_water || 0}`);
      // ★★들판으로 걸어가 **거기서** 마신다 — 이 배치가 연 것이 바로 그 동사다.
      await warp(river.x + 3000, river.y + 3000);
      await send({ type: '__e2e_give', items: {} }); await sleep(300);
      const g0 = await page.evaluate(() => (window.__getGauges ? window.__getGauges() : null));
      await send({ type: 'eat', item: 'fresh_water', amount: 1 });
      await sleep(1200);
      const w2 = await inv();
      ok((w2.water_bottle || 0) === (w1.water_bottle || 0) + 1 && (w2.fresh_water || 0) === (w1.fresh_water || 0) - 1,
        '★★★⑤ **마시니 빈 병이 돌아왔다** — 병은 그릇이지 소모품이 아니다(T3 캐논)',
        `병 ${w1.water_bottle || 0}→${w2.water_bottle || 0} · 물 ${w1.fresh_water || 0}→${w2.fresh_water || 0}`);
      const notice = await page.evaluate(() => ((window.__notices || []).slice(-1)[0] || ''));
      pre(true, '마신 뒤 안내', String(notice || '').slice(0, 60));
      void g0;
      await snap('td-05-water');
    }
  }

  // ══ ⑥ 말리기 — 건조대의 건굴 [T54] ═══════════════════════════════════════
  console.log('\n⑥ 말리기 — 갯벌이 겨울까지 간다');
  {
    await give({ items: { wood: 10, fiber: 10 }, lots: { oyster: [[0, 8]] } });
    await send({ type: 'craft_building', recipe: 'item_drying_rack' });
    await sleep(1200);
    await send({ type: 'build', buildType: 'drying_rack', floor: 0 });
    await sleep(1800);
    await send({ type: 'facility_ask' });
    await sleep(1200);
    const fac = await ptxt();
    ok(/굴 말리기/.test(fac), '★★★⑥ **건조대 창에 "굴 말리기"가 저절로 떴다** — 등록 코드 0 · 클라 무수정',
      (fac.match(/[^\n]{0,20}굴 말리기[^\n]{0,28}/) || [''])[0].trim());
    const oy0 = (await inv()).oyster || 0;
    pre(oy0 >= 3, '★자명 통과 금지 — 말릴 굴이 손에 있다', `굴 ${oy0}`);
    await send({ type: 'preserve', recipe: 'dry_oyster', amount: 3 });
    await sleep(1500);
    const oy1 = (await inv()).oyster || 0;
    ok(oy1 < oy0, '★⑥ 굴이 건조대에 들어갔다', `굴 ${oy0} → ${oy1}`);
    await send({ type: 'facility_ask' }); await sleep(800);
    const dq = (await page.evaluate(() => ((window.__getFacility() || {}).queue) || [])) || [];
    ok(dq.length > 0, '★★⑥ 건조대 **대기열에 걸렸다**(즉석이 아니다 — 말리기는 시간이 든다)',
      `${dq.length}건 · ${(dq[0] || {}).label || ''}`);
    let dried = 0;
    for (let i = 0; i < 25 && !dried; i++) {
      await sleep(1500);
      await send({ type: 'facility_ask' }); await sleep(400);
      const F = await page.evaluate(() => window.__getFacility());
      await send({ type: 'craft_collect', buildingId: F && F.near && F.near.bid });
      await sleep(600);
      dried = ((await inv()).dried_oyster) || 0;
    }
    ok(dried > 0, '★★★⑥ **건굴을 받았다** — 갯벌 산출이 보존식이 됐다', `건굴 ${dried}`);
    // ★★그리고 **먹힌다**(표에 있는 것과 먹히는 것은 다른 명제 — 족보 (83))
    if (dried > 0) {
      const before = (await inv()).dried_oyster || 0;
      await send({ type: 'eat', item: 'dried_oyster', amount: 1 });
      await sleep(1200);
      const after = (await inv()).dried_oyster || 0;
      ok(after === before - 1, '★★★⑥ **건굴을 먹었다** — `PRESERVED_EFFECTS` 주입이 화면까지 닿았다',
        `건굴 ${before} → ${after}`);
      const nt = await page.evaluate(() => ((window.__notices || []).slice(-1)[0] || ''));
      ok(!/먹을 수 없는/.test(String(nt || '')), '★⑥ "먹을 수 없는 아이템"이 아니다', String(nt || '').slice(0, 60));
    }
    await snap('td-06-dried');
  }

  // ══ ④ 위생 ══════════════════════════════════════════════════════════════
  console.log('\n④ 위생');
  const realErrs = errs.filter((e) => !/favicon|WebSocket|Failed to fetch|404/i.test(e));
  ok(realErrs.length === 0, '★④ 클라 JS 예외 0', realErrs.slice(0, 2).join(' | '));
  const miss = [...new Set(missing)].filter((u) => !/favicon/.test(u));
  ok(miss.length === 0, '★④ 자산 404 없음(새 인벤 품목의 아이콘 계약)', miss.slice(0, 4).join(' · '));

  console.log(`\n  스크린샷 ${shots.length}장 → ${SHOTS}`);
  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  await browser.close();
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('하네스 크래시:', e); for (const p of procs) { try { p.kill('SIGKILL'); } catch (x) {} } process.exit(1); });
