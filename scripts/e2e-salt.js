#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/e2e-salt.js — 자염(煮鹽) **실클라** E2E ==============================
//
// ★★이 배치는 **클라를 한 줄도 안 고쳤다.** 그래서 이 하네스는 단순한 회귀가 아니라
//   그 조건의 **증명**이다: 서버에 데이터만 얹었는데 화면에 저절로 나타나는가?
//     · 건축 목록에 **소금가마**가 뜨는가(서버 `buildingRecipes` 페이로드로)
//     · 화덕 창에 **물병**이 뜨는가(서버 `COOK_RECIPES` 로 — 죽어 있던 품목이다)
//     · 갯벌에서 E 를 누르면 **짠물**이 손에 오는가
//     · 소금가마 앞에 서면 **자염**이 뜨고, 걸고, 기다리고, 받는가
//     · 그 소금이 **절임**에 그대로 들어가는가
//   ⇒ 하나라도 안 되면 그건 "서버는 맞는데 화면에서 도달 못 하는 층"이고, 보고에 그렇게 적는다.
//
// ★★시간 모드 [머리 주석 규약]:
//   · **게임일은 안 건드린다**(기본 24분). · **가공 소요일만** env 로 줄인다(`SALT_BOIL_DAYS`).
//   · 채수 쿨다운은 채집 쿨다운 그것이다(`FORAGE_COOLDOWN_MS`) — 자염 전용 손잡이를 안 만들었다.
//   · 염도·수율·땔감·무게에는 **손대지 않는다**.
//
// ★★자리는 **찾는다, 고르지 않는다**(족보 73): 갯벌은 실서버 술어(`salt.isTidalFlat` +
//   존의 해안선 타일)로 훑어서 찾는다. 여기서 좌표를 손으로 박으면 지도가 바뀌는 날 조용히 죽는다.
//
// 실행: node scripts/e2e-salt.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-salt-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-sl-c-${process.pid}.db`, ZDB = `/tmp/e2e-sl-z-${process.pid}.db`;
const DAY_MS = 24 * 60 * 1000;          // 게임일 기본값(안 건드린다)
const BOIL_DAYS = 0.004;                // ≈ 5.8초 — **시간 손잡이만** 줄인다
const BOIL_MS = Math.round(BOIL_DAYS * DAY_MS);

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
  console.log('\n=== 자염 실클라 E2E (Chromium) ===');
  const Salt = require(path.join(ROOT, 'server', 'salt.js'));
  const Chunk = require(path.join(ROOT, 'server', 'chunk.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const Z = ZONES.hanbando;
  const WOX = Z.worldOffsetX || 0, WOY = Z.worldOffsetY || 0;

  // ── 갯벌을 **실서버와 같은 술어로** 찾는다 ─────────────────────────────────
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
  const blocked = (x, y) => {
    if (T.isRockCellLocal('hanbando', x, y)) return true;
    if (T.isWaterCellLocal('hanbando', x, y)) return true;
    return isSea(x, y);
  };
  // 갯벌 **곁에 빈터가 있는** 자리(가마·화덕을 지어야 한다)
  let flat = null;
  for (let y = 118000; y < 130000 && !flat; y += 32) {
    for (let x = 20000; x < 60000; x += 32) {
      if (!Salt.isTidalFlat(x, y, SEA_CTX) || blocked(x, y)) continue;
      let room = true;
      for (let dx = -96; dx <= 96 && room; dx += 32) for (let dy = -96; dy <= 0 && room; dy += 32)
        if (blocked(x + dx, y + dy)) room = false;
      if (room) { flat = { x, y }; break; }
    }
  }
  pre(!!flat, '★실서버 술어로 **찾은** 갯벌(곁에 빈터가 있는)', JSON.stringify(flat));
  if (!flat) { console.log(`\n=== 결과: ${pass} PASS / ${++fail} FAIL ===`); process.exit(1); }
  const NEED = Salt.brinePerPot(), WOOD = Salt.CFG.WOOD_PER_POT;
  console.log(`    갯벌: ${flat.x},${flat.y} · 한 솥 = 짠물 ${NEED}되 + 땔감 ${WOOD} → 소금 ${Salt.potYield('boil_salt')}`
            + ` · 자염 ${BOIL_DAYS}일 = ${BOIL_MS}ms`);

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    SALT_BOIL_DAYS: String(BOIL_DAYS), FORAGE_COOLDOWN_MS: '0' });
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
  const fac = () => page.evaluate(() => window.__getFacility());
  const ptxt = () => page.evaluate(() => window.__panelText());
  const me = () => page.evaluate(() => window.__getMyAbs());
  const send = (m) => page.evaluate((x) => window.__sendPrimary(x), m);

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  const enter = await page.$('#enter');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2200);
  ok(!!(await me()), '존 입장');
  const warp = async (x, y) => { for (let i = 0; i < 20; i++) {
    await send({ type: 'teleport_debug', x, y }); await sleep(800);
    const c = (await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await me());
    if (c && Math.hypot(c.x - (x + WOX), c.y - (y + WOY)) <= 200) return c; } return null; };

  // ══ ① 클라를 안 고쳤는데 화면에 나타나는가 — 건축 목록 · 화덕 창 ═══════════
  console.log('\n① 서버 데이터만 얹었는데 화면에 나타나는가');
  await warp(flat.x, flat.y - 64);
  const bcat = await page.evaluate(() => {
    window.__openSide ? window.__openSide('craft') : null;
    return null;
  });
  void bcat;
  await page.evaluate(() => { const el = document.querySelector('.sb-icon[data-side="craft"]'); if (el) el.click(); });
  await sleep(700);
  await page.evaluate(() => { const el = [...document.querySelectorAll('.craft-cat')].find((c) => /건축물/.test(c.textContent)); if (el) el.click(); });
  await sleep(700);
  const craftTxt = await ptxt();
  ok(/소금가마/.test(craftTxt), '★★① **건축 목록에 소금가마가 저절로 떴다** — 클라 무수정',
     (craftTxt.match(/[^\n]{0,26}소금가마[^\n]{0,26}/) || [''])[0].trim());
  await snap('sl-01-build-menu');

  // ── 박으로 물병을 만든다(죽어 있던 품목) ─────────────────────────────────
  //   ★박은 **농사 70일**짜리라 여기서 기르지 않는다 — 농사 사슬은 `test-crops`·`e2e-*` 의 몫이고
  //     이 하네스가 잴 것은 **자염 사슬**이다. 박은 픽스처로 준다(도달 가능성은 `test-salt` 가
  //     구조로 못 박는다: 카탈로그에 있고 · 심을 수 있고 · 카탈로그가 스스로 "그릇"이라 적었다).
  await page.evaluate(() => { const el = [...document.querySelectorAll('.craft-cat')].find((c) => /가공/.test(c.textContent)); if (el) el.click(); });
  await sleep(700);
  const itemTxt = await ptxt();
  ok(/물병/.test(itemTxt), '★★① **가공 목록에 물병이 저절로 떴다** — 여태 만들 길이 없던 죽은 품목이다',
     (itemTxt.match(/[^\n]{0,26}물병[^\n]{0,26}/) || [''])[0].trim());
  const invA = await inv();
  pre(!(invA.water_bottle > 0), '★자명 통과 금지 — 아직 물병이 하나도 없다', String(invA.water_bottle || 0));
  await give({ items: { wood: 40, stone: 40, gourd: NEED + 2 } });
  for (let i = 0; i < NEED; i++) { await send({ type: 'craft_item', recipe: 'water_bottle' }); await sleep(220); }
  await sleep(1400);
  const invB = await inv();
  ok((invB.water_bottle || 0) >= NEED, `★① 박으로 물병 ${NEED}개를 만들었다`, `물병 ${invB.water_bottle || 0}`);
  ok((invB.gourd || 0) === (NEED + 2) - NEED, '★① 박 하나로 병 하나', `박 ${invB.gourd}`);
  await snap('sl-02-bottles');

  // ══ ② 갯벌에서 E — 짠물이 손에 온다 ══════════════════════════════════════
  console.log('\n② 갯벌 — E 를 누르면 짠물이 온다');
  await warp(flat.x, flat.y);
  const pos = await me();
  pre(!!pos, '갯벌 위에 섰다', pos ? `${Math.round(pos.x - WOX)},${Math.round(pos.y - WOY)}` : '');
  const b0 = (await inv()).brine || 0;
  const v0 = (await inv()).water_bottle || 0;
  pre(v0 >= NEED, '★손에 병이 있다(없으면 짠물 갈래가 안 열린다 = 자명 실패)', `${v0}개`);
  for (let i = 0; i < NEED + 2; i++) { await send({ type: 'gather' }); await sleep(320); }
  await sleep(1200);
  const invC = await inv();
  ok((invC.brine || 0) >= NEED, `★★② **갯벌에서 짠물 ${NEED}되를 떴다**`, `짠물 ${invC.brine || 0}되`);
  ok((invC.water_bottle || 0) === v0 - (invC.brine - b0),
     '★★② 병이 정확히 그만큼 줄었다 — 병 하나가 짠물 한 되로 **바뀐다**',
     `물병 ${v0} → ${invC.water_bottle || 0}`);
  await snap('sl-03-brine');

  // ── 대조: 내륙에선 안 나온다 ──────────────────────────────────────────────
  await warp(30848, 59872);                     // 시작 광장(농촌22)
  const bIn0 = (await inv()).brine || 0;
  for (let i = 0; i < 4; i++) { await send({ type: 'gather' }); await sleep(320); }
  await sleep(900);
  ok(((await inv()).brine || 0) === bIn0, '★② 내륙에선 병이 있어도 짠물이 안 나온다(대조군)', `짠물 ${bIn0}되 그대로`);

  // ══ ③ 소금가마 — 짓고 · 걸고 · 기다리고 · 받는다 ═════════════════════════
  console.log('\n③ 소금가마 — 짓고 · 걸고 · 받는다');
  await warp(flat.x, flat.y - 64);
  await give({ items: { wood: 20, stone: 20 } });
  await send({ type: 'craft_building', recipe: 'item_salt_kiln' });
  await sleep(1000);
  const invK = await inv();
  ok((invK.item_salt_kiln || 0) >= 1, '★③ 소금가마를 만들었다(석재 4 + 통나무 3 · 망치 없이)',
     `item_salt_kiln ${invK.item_salt_kiln || 0}`);
  await send({ type: 'build', buildType: 'salt_kiln', floor: 0 });
  await sleep(1600);
  const built = await page.evaluate(() => (window.__getAllBuildings ? window.__getAllBuildings() : []).filter((b) => b.type === 'salt_kiln'));
  ok(built.length > 0, '★★③ **소금가마가 세워졌다**', `${built.length}채`);
  await snap('sl-04-kiln');
  let f3 = null;
  for (let i = 0; i < 20 && !(f3 && f3.near && f3.near.kind === 'boil'); i++) { await sleep(700); f3 = await fac(); }
  ok(f3 && f3.near && f3.near.kind === 'boil', '★★③ 가마 앞 — **자염 창**이 온다', f3 && f3.near ? f3.near.ko : '안 옴');
  const side = await page.evaluate(() => window.__getActiveSide());
  ok(side === 'facility', '★③ 패널이 저절로 열린다(맥락 창 — 새 패널 0)', String(side));
  const kt = await ptxt();
  ok(/자염/.test(kt), '★★③ 목록에 **자염**이 있다', (kt.match(/[^\n]{0,30}자염[^\n]{0,30}/) || [''])[0].trim());
  ok(!/말리기|훈제|절임|도구/.test(kt), '★★③ 그리고 말리기·훈제·절임은 안 섞인다 — 시설의 창이지 대목록이 아니다');
  ok(/소금/.test(kt), '★③ 산출(소금)이 화면에 보인다', (kt.match(/[^\n]{0,40}소금[^\n]{0,24}/) || [''])[0].trim());
  // ★★**클라 무접촉의 값을 여기서 정직하게 잰다.** `brine` 은 클라의 아이콘·이름표 표에 없어서
  //   비용 칸에 **영문 키 그대로** 뜬다(`itemIconHtml(k,18,k)` 의 폴백). 서버만으로는 못 고친다.
  //   ⇒ 이 하네스는 그 사실을 **숨기지 않고 못 박는다**(회부 D-1 · 클라 한 줄이면 끝난다).
  const brineRaw = /brine/.test(kt), brineKo = /짠물/.test(kt);
  ok(brineRaw || brineKo, '★③ 재료가 화면에 있긴 하다', brineKo ? '짠물(이름표 있음)' : 'brine(영문 키 — 회부 D-1)');
  console.log(`  · [실측] 짠물 표시 = ${brineKo ? '한글' : '영문 키 brine'} · 보관 칸 = ${/보관 ∞/.test(kt) ? '∞(뜻대로)' : '수치'}`);

  const inv3 = await inv();
  pre((inv3.brine || 0) >= NEED && (inv3.wood || 0) >= WOOD, '재료가 다 있다',
      `짠물 ${inv3.brine} · 나무 ${inv3.wood}`);
  await page.evaluate(() => { const b = document.querySelector('[data-fmake="boil_salt"]'); if (b) b.click(); });
  await sleep(1500);
  const inv4 = await inv();
  ok((inv4.brine || 0) === (inv3.brine || 0) - NEED, '★③ 짠물이 한 솥어치 나갔다',
     `${inv3.brine} → ${inv4.brine}`);
  ok((inv4.wood || 0) === (inv3.wood || 0) - WOOD, '★③ 땔감도 정확히 나갔다', `${inv3.wood} → ${inv4.wood}`);
  ok(!(inv4.salt > 0), '★★③ 그리고 **즉석이 아니다** — 아직 소금이 없다', String(inv4.salt || 0));
  const qt = await ptxt();
  ok(/초 남음|걸어 둔 것/.test(qt), '★★③ 대기열에 걸렸다(가마는 밤새 탄다)', (qt.match(/[^\n]{0,20}초 남음/) || [''])[0].trim());
  await sleep(BOIL_MS + 2500);
  const dt = await ptxt();
  ok(/다 됐다|받기/.test(dt), '★★③ 다 되면 화면이 그렇게 말한다', (dt.match(/[^\n]{0,24}다 됐다[^\n]{0,12}/) || [''])[0].trim());
  await page.evaluate(() => { const b = document.querySelector('[data-fcollect]'); if (b) b.click(); });
  await sleep(1600);
  const inv5 = await inv();
  ok((inv5.salt || 0) >= 1, '★★★③ **소금을 받았다 — 이 세계에 소금이 생겼다**', `소금 ${inv5.salt || 0}`);
  ok((inv5.water_bottle || 0) === (inv4.water_bottle || 0) + NEED,
     '★★③ 빈 병도 같이 돌아왔다 — 병은 소모품이 아니라 그릇이다',
     `물병 ${inv4.water_bottle || 0} → ${inv5.water_bottle || 0}`);
  await snap('sl-05-salt');

  // ══ ④ 그 소금으로 절임 한 통 ═════════════════════════════════════════════
  console.log('\n④ 절임 — 부패 배치가 만들어 둔 기계에 꽂힌다');
  await give({ items: { wood: 20, stone: 20 }, lots: { vegetable: [[0, 3]] } });
  await send({ type: 'craft_building', recipe: 'item_workbench' });
  await sleep(900);
  await warp(flat.x + 160, flat.y - 64);
  await send({ type: 'build', buildType: 'workbench', floor: 0 });
  await sleep(1600);
  let f4 = null;
  for (let i = 0; i < 20 && !(f4 && f4.near && f4.near.kind === 'tool'); i++) { await sleep(700); f4 = await fac(); }
  ok(f4 && f4.near && f4.near.kind === 'tool', '(상황) 작업대 앞이다', f4 && f4.near ? f4.near.ko : '안 옴');
  const wt = await ptxt();
  ok(/절임/.test(wt), '(상황) 절임이 목록에 있다');
  const inv6 = await inv();
  pre((inv6.salt || 0) >= 1, '★손에 **자염으로 만든** 소금이 있다', `소금 ${inv6.salt}`);
  const pickBtn = await page.evaluate(() => {
    const b = document.querySelector('[data-fmake="pickle_veg"]');
    return b ? { found: true, disabled: b.disabled } : { found: false };
  });
  ok(pickBtn.found && !pickBtn.disabled,
     '★★④ **절임 버튼이 켜져 있다** — 소금이 생겼으니(여태 이 버튼은 영영 꺼져 있었다)',
     JSON.stringify(pickBtn));
  await page.evaluate(() => { const b = document.querySelector('[data-fmake="pickle_veg"]'); if (b) b.click(); });
  await sleep(1500);
  const inv7 = await inv();
  ok((inv7.salt || 0) === (inv6.salt || 0) - 1, '★★★④ **소금이 절임에 들어갔다 — 사슬이 닫혔다**',
     `소금 ${inv6.salt} → ${inv7.salt || 0}`);
  const wq = await ptxt();
  ok(/걸어 둔 것|초 남음/.test(wq), '★④ 작업대에 절임이 걸렸다');
  await snap('sl-06-pickle');

  // ══ ⑤ 자산 404 — 새 키가 이모지 폴백으로 가는가 ═══════════════════════════
  console.log('\n⑤ 새 품목의 아이콘 — 404 를 내지 않는가');
  const bad = missing.filter((u) => !/favicon/.test(u));
  ok(bad.length === 0, '★⑤ 자산 요청 404 0건(새 키가 이모지 폴백으로 간다)', bad.slice(0, 4).join(' ') || '없음');
  // ★404 는 위 `missing` 이 URL 까지 정확히 센다 — 여기서 또 세면 같은 사실을 두 번 실패로 잡는다
  //   (그리고 `/favicon.ico` 404 는 **깨끗한 main 에서도 난다** — 남의 빚을 자기 실패로 세지 마라).
  const realErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(realErrs.length === 0, '★⑤ 클라 콘솔 오류 0건(자산 404 제외 — 위에서 따로 센다)',
     realErrs.slice(0, 2).join(' | ') || '없음');

  await browser.close();
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  console.log(`\n  스크린샷: ${shots.length}장 → ${SHOTS}`);
  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
