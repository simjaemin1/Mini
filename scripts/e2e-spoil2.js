#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/e2e-spoil2.js — 부패 2차 **실클라** E2E ==============================
//
// ★★이 배치도 **클라를 한 줄도 안 고쳤다.** 그래서 여기서 잴 것은 하나다:
//   부패 배치가 만들어 둔 **신선도 3단계 표시가, 서버가 셈을 바꾼 것만으로 자리 차이를 말하는가.**
//   물고기를 둘로 갈라 하나는 **바닥**에, 하나는 **상자**에 두고 며칠 뒤 화면을 본다.
//   같은 날 잡은 같은 생선인데 **다른 단계**로 보여야 한다 — 그게 저장이 뜻을 가졌다는 증거다.
//
// ★★그리고 §0 이 잡은 결함의 실클라 확인: **상자에 넣었다 빼도 새것이 되지 않는다.**
//   (여태는 됐다 — 넣었다 빼면 신선도가 1.00 으로 돌아왔다. 무한 보존 상자였다.)
//
// ★★시간 모드 [머리 주석 규약]:
//   · **게임일을 짧게** 잡는다(`VILLAGE_DAY_MS`) — 며칠을 실제로 흘려보내야 단계가 갈린다.
//     ⚠그래서 `zoneGameDay` 가 커진다. `| 0` 절단 족보(77)를 밟지 않는지 부패 배치가 이미 고쳤다.
//   · 온도·염도·자리 배율에는 **손대지 않는다**(정본 값 그대로 재는 게 이 하네스의 목적이다).
//
// 실행: node scripts/e2e-spoil2.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-spoil2-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-s2-c-${process.pid}.db`, ZDB = `/tmp/e2e-s2-z-${process.pid}.db`;
const DAY_MS = 1500;                       // ★게임일을 1.5초로 — 며칠을 실제로 흘린다

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
  console.log('\n=== 부패 2차 실클라 E2E (Chromium) ===');
  const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const WOX = ZONES.hanbando.worldOffsetX || 0, WOY = ZONES.hanbando.worldOffsetY || 0;
  // 빈터 — 상자를 지어야 한다
  let site = null;
  for (let i = 0; i < 40000 && !site; i++) {
    const x = 3000 + (i * 977) % 54000, y = 3000 + (i * 1361) % 54000;
    let good = true;
    for (let dx = -160; dx <= 160 && good; dx += 32) for (let dy = -160; dy <= 160 && good; dy += 32)
      if (T.isWaterCellLocal('hanbando', x + dx, y + dy) || T.isRockCellLocal('hanbando', x + dx, y + dy)
        || T.getForestMultiplier('hanbando', x + dx, y + dy) > 1.5) good = false;
    if (good) site = { x, y };
  }
  console.log(`    빈터 ${site.x},${site.y} · 생선 보관 ${Spoil.shelfOf('fish')}일 · 하루 ${DAY_MS}ms`
    + ` · 상자 밀폐 ${Spoil.PLACES.chest.seal}`);

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    VILLAGE_DAY_MS: String(DAY_MS) });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  const missing = [];
  page.on('response', (r) => { if (r.status() === 404) missing.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const give = async (pl) => { await page.evaluate((p) => window.__sendPrimary(Object.assign({ type: '__e2e_give' }, p)), pl); await sleep(900); };
  const inv = () => page.evaluate(() => window.__getInv());
  const lots = () => page.evaluate(() => window.__lots());
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
    await send({ type: 'teleport_debug', x, y }); await sleep(700);
    const c = (await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await me());
    if (c && Math.hypot(c.x - (x + WOX), c.y - (y + WOY)) <= 200) return c; } return null; };
  await warp(site.x, site.y);

  // ══ ① 상자를 짓는다 ══════════════════════════════════════════════════════
  console.log('\n① 상자 — 짓고 넣고 뺀다');
  // ★망치는 **인스턴스**다(인벤 수량이 아니다) — `tools` 로 줘야 `hasToolAlive` 가 산다.
  //   (1차 실행이 `items:{hammer:1}` 로 줬다가 상자를 못 지었다 — 표에 넣는 것과 그 표를 읽는
  //    함수가 무엇을 보는지는 다른 명제다(족보 83). 여기서도 같은 족이 나왔다.)
  await give({ items: { plank: 20, wood: 20 }, tools: ['hammer'] });
  await send({ type: 'craft_building', recipe: 'item_chest' });
  await sleep(900);
  await send({ type: 'build', buildType: 'chest', floor: 0 });
  await sleep(1600);
  const chests = await page.evaluate(() => (window.__getAllBuildings ? window.__getAllBuildings() : []).filter((b) => b.type === 'chest'));
  pre(chests.length > 0, '★상자가 섰다(0채면 아래가 전부 무의미)', `${chests.length}채`);
  if (!chests.length) { console.log(`\n=== 결과: ${pass} PASS / ${++fail} FAIL ===`); process.exit(1); }
  await snap('s2-01-chest');

  // ══ ② §0 결함 — 왕복해도 새것이 되지 않는다 ══════════════════════════════
  console.log('\n② 왕복 — 상자가 부패 시계를 지우지 않는다 (§0 이 잡은 결함)');
  await give({ lots: { fish: [[2, 4]] } });                 // 이틀 된 생선 4
  await sleep(700);
  const L0 = await lots();
  pre(!!L0.fish && L0.fish.length > 0, '(상황) 로트가 왔다', JSON.stringify(L0.fish));
  const f0 = L0.fish[0].fresh;
  pre(f0 < 0.99, '★넣기 전에 이미 안 신선하다(1.00 이면 리셋을 못 잰다)', String(f0));
  const bid = chests[0].id;
  await send({ type: 'chest_put', buildingId: bid, item: 'fish', amount: 4 });
  await sleep(1200);
  const invMid = await inv();
  pre(!(invMid.fish > 0), '★성사: 인벤에서 빠졌다', String(invMid.fish || 0));
  await send({ type: 'chest_take', buildingId: bid, item: 'fish', amount: 4 });
  await sleep(1200);
  const L1 = await lots();
  ok(!!L1.fish && L1.fish.length > 0, '(상황) 도로 왔다', JSON.stringify(L1.fish));
  const f1 = L1.fish[0].fresh;
  ok(f1 <= f0 + 0.02, '★★★상자를 왕복해도 **새것이 되지 않는다**(여태는 1.00 으로 돌아왔다)',
     `${f0} → ${f1}`);
  await snap('s2-02-roundtrip');

  // ══ ③ 자리가 갈린다 — 바닥 vs 상자 ══════════════════════════════════════
  console.log('\n③ 같은 생선, 다른 자리 — 며칠 뒤 화면이 갈린다');
  // 손에 든 것을 전부 비우고 새로 같은 나이 여덟 마리를 받는다
  await send({ type: 'chest_take', buildingId: bid, item: 'fish', amount: 99 });
  await sleep(800);
  const invC = await inv();
  if (invC.fish > 0) { await send({ type: 'drop_item', item: 'fish', amount: invC.fish }); await sleep(900); }
  await give({ lots: { fish: [[0, 8]] } });
  await sleep(700);
  const Lstart = await lots();
  pre(!!Lstart.fish && Lstart.fish.length === 1 && Lstart.fish[0].ageDays === 0,
      '★같은 날 잡은 생선 여덟 마리 한 로트(자리 말고는 조건이 같아야 한다)', JSON.stringify(Lstart.fish));
  ok(Lstart.fish[0].stage === 'fresh', '(상황) 지금은 둘 다 신선', Lstart.fish[0].stage);
  // 넷을 상자에
  await send({ type: 'chest_put', buildingId: bid, item: 'fish', amount: 4 });
  await sleep(1200);
  const invSplit = await inv();
  pre((invSplit.fish || 0) === 4, '★성사: 넷은 손에, 넷은 상자에', String(invSplit.fish || 0));
  // 시간을 흘린다 — 게임일이 실제로 지나야 한다
  // ★시간이 흘렀다는 증거는 **로트의 나이**로 센다 — 클라 전역에 달력이 없을 수도 있고(실제로 null),
  //   나이는 서버가 실어 보내는 값이라 "정말 며칠이 지났나"의 직접 증거다.
  const ageOf = async () => { const L = await lots(); return (L.fish && L.fish[0]) ? L.fish[0].ageDays : null; };
  const d0 = await ageOf();
  const WAIT = Math.ceil(Spoil.shelfOf('fish') * 1.2) * DAY_MS + 3000;
  console.log(`  · 기다린다 ${(WAIT / 1000).toFixed(1)}초 (게임일 ~${Math.ceil(Spoil.shelfOf('fish') * 1.2)}일)`);
  await sleep(WAIT);
  await send({ type: 'chest_take', buildingId: bid, item: 'fish', amount: 4 });   // 상자 몫을 꺼내 본다
  await sleep(1500);
  const d1 = await ageOf();
  pre(d0 !== null && d1 !== null && d1 > d0, '★게임일이 실제로 흘렀다(로트 나이가 늘었다 — 안 늘면 아래가 자명 통과)',
      `나이 ${d0}일 → ${d1}일`);
  const L2 = await lots();
  pre(!!L2.fish && L2.fish.length >= 2, '★로트가 둘로 갈려 왔다(자리가 달랐으므로)',
      JSON.stringify(L2.fish));
  if (L2.fish && L2.fish.length >= 2) {
    const fs2 = L2.fish.map((l) => l.fresh).sort((a, b) => a - b);
    const st = L2.fish.map((l) => l.stage);
    ok(fs2[fs2.length - 1] > fs2[0] + 1e-6,
       '★★★같은 날 잡은 생선인데 **신선도가 갈렸다** — 상자에 둔 쪽이 더 성하다',
       `${fs2.map((v) => v.toFixed(3)).join(' vs ')}`);
    ok(new Set(st).size >= 1, '(상황) 단계 표기', st.join(' / '));
    console.log(`  · [지표] 바닥/손 ${fs2[0].toFixed(3)} · 상자 ${fs2[fs2.length - 1].toFixed(3)}`
      + (fs2[0] > 1e-6 ? ` ⇒ ${(fs2[fs2.length - 1] / fs2[0]).toFixed(2)}배 성하다`
                       : ` ⇒ 바닥 쪽은 이미 **상함**(0), 상자 쪽만 살아남았다`));
    // 화면(DOM)에도 그 차이가 있나 — 내부 변수만 보면 자기 증명이다
    await page.evaluate(() => window.__openInv && window.__openInv('mine'));
    await sleep(700);
    let sub = await page.evaluate(() => window.__ulSubs('mine', 'fish'));
    if (!sub.length || sub.every((s) => s.hidden)) {
      await page.evaluate(() => window.__ulToggle('mine', 'fish')); await sleep(600);
      sub = await page.evaluate(() => window.__ulSubs('mine', 'fish'));
    }
    const txt = sub.map((s) => s.text).join(' | ');
    ok(/신선|시듦|상함/.test(txt), '★★펼치면 화면이 그 차이를 말한다(클라 무수정 — 파 둔 칸이 그대로)',
       txt.slice(0, 120));
    await snap('s2-03-split');
  }

  // ══ ④ 자산·콘솔 ═════════════════════════════════════════════════════════
  console.log('\n④ 화면이 조용한가');
  const bad = missing.filter((u) => !/favicon/.test(u));
  ok(bad.length === 0, '★자산 요청 404 0건', bad.slice(0, 4).join(' ') || '없음');
  const realErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(realErrs.length === 0, '★클라 콘솔 오류 0건', realErrs.slice(0, 2).join(' | ') || '없음');

  await browser.close();
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  console.log(`\n  스크린샷: ${shots.length}장 → ${SHOTS}`);
  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
