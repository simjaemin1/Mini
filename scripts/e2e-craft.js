#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-craft.js — 시설 제작창 **실클라** E2E ===========================
//
// ★[재민 확정 2026-08-29 · §8.5] 계약이 지켜져도 **화면에서 도달 못 하는 층**이 하나 더 있다.
//   `test-craft` 37/0 은 "시설 게이트·대기열·품질"이 맞는지를 잰다. 여기서 잴 것은 다르다:
//     작업대 앞에 서면 **창이 저절로 열리는가** · 재료를 **골라서** 걸 수 있는가 ·
//     다 되면 **알려 주고 받아지는가** · 받은 것이 **장착되는가** · 나가면 **닫히는가**.
//
// ★★시간 모드: `CRAFT_TOOL_MS` 를 짧게 준다(하네스 env). 게임일은 안 얼린다 —
//   제작 시간은 **벽시계**라 게임일과 무관하다(오프라인에도 도는 것이 그 뜻이다).
//
// 실행: node scripts/e2e-craft.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-craft-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-cr-c-${process.pid}.db`, ZDB = `/tmp/e2e-cr-z-${process.pid}.db`;
const CRAFT_MS = 4000;

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
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
  console.log('\n=== 시설 제작창 실클라 E2E (Chromium) ===');
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const WOX = ZONES.hanbando.worldOffsetX || 0, WOY = ZONES.hanbando.worldOffsetY || 0;
  // 탁 트인 자리 — 건물을 놓을 수 있어야 한다
  let site = null;
  for (let i = 0; i < 40000 && !site; i++) {
    const x = 3000 + (i * 977) % 54000, y = 3000 + (i * 1361) % 54000;
    let good = true;
    for (let dx = -160; dx <= 160 && good; dx += 32) for (let dy = -160; dy <= 160 && good; dy += 32)
      if (T.isWaterCellLocal('hanbando', x + dx, y + dy) || T.isRockCellLocal('hanbando', x + dx, y + dy)
        || T.getForestMultiplier('hanbando', x + dx, y + dy) > 1.5) good = false;
    if (good) site = { x, y };
  }
  console.log(`    빈터: ${site.x},${site.y} · 제작 시간 ${CRAFT_MS}ms`);

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    CRAFT_TOOL_MS: String(CRAFT_MS) });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const me = () => page.evaluate(() => window.__getMyAbs());
  const fac = () => page.evaluate(() => window.__getFacility());
  const side = () => page.evaluate(() => window.__getActiveSide());

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('button:has-text("월드 입장")');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2000);
  ok(!!(await me()), '존 입장');
  // ⚠좌표계: teleport_debug 는 존 로컬 · __getMyAbs 는 월드 절대(족보 64)
  const warp = async (x, y) => { for (let i = 0; i < 20; i++) {
    await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
    await sleep(800);
    // ★[핫픽스 2026-08-31 · 족보 ㊹] 도착은 **서버 권위**로 — 예측은 재접속 뒤 낡을 수 있다.
    const c = (await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await me());
    if (c && Math.hypot(c.x - (x + WOX), c.y - (y + WOY)) <= 200) return c; } return null; };
  await warp(site.x, site.y);

  // ── ① 시설이 없으면 창이 안 열린다 ────────────────────────────────────────
  await page.evaluate(() => window.__sendPrimary({ type: 'facility_ask' }));
  await sleep(900);
  const f0 = await fac();
  ok(f0 && f0.near == null, '★★① 시설이 없으면 **창이 안 열린다**(대목록도 없다)', f0 ? String(f0.near) : '안 옴');
  ok((await side()) !== 'facility', '★① 패널도 안 떠 있다', String(await side()));

  // ── ② 작업대를 짓는다 ────────────────────────────────────────────────────
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 20, stone: 20, meat_raw: 3 } }));
  await sleep(900);
  await page.evaluate(() => window.__sendPrimary({ type: 'build', buildType: 'workbench', floor: 0 }));
  await sleep(1400);
  const built = await page.evaluate(() => (window.__getAllBuildings ? window.__getAllBuildings() : []).filter((b) => b.type === 'workbench'));
  ok(built.length > 0, '★★② **작업대가 세워졌다**(통나무 4 · 석재 2 · 망치 없이)', `${built.length}채`);
  await snap('cr-01-bench');

  // ── ③ 앞에 서면 창이 **저절로** 열린다 ──────────────────────────────────
  let f1 = null;
  for (let i = 0; i < 20 && !(f1 && f1.near); i++) { await sleep(700); f1 = await fac(); }
  ok(f1 && f1.near && f1.near.kind === 'tool', '★★③ 작업대 앞 — **도구 창**이 온다', f1 && f1.near ? f1.near.ko : '안 옴');
  let sd = null;
  for (let i = 0; i < 15 && sd !== 'facility'; i++) { sd = await side(); if (sd !== 'facility') await sleep(500); }
  ok(sd === 'facility', '★★③ **패널이 저절로 열린다**(§8.2 의 유일한 예외 — 맥락 창)', String(sd));
  const ptxt = await page.evaluate(() => window.__panelText());
  ok(/작업대/.test(ptxt), '★③ 제목이 그 시설 이름이다', (ptxt.match(/[^\n]{0,24}작업대[^\n]{0,10}/) || [''])[0].trim());
  ok(!/구운 고기|베리잼/.test(ptxt), '★★③ **요리 레시피가 안 섞인다** — 시설의 창이지 대목록이 아니다');
  ok(/도구/.test(ptxt), '★③ 만들 수 있는 것이 화면에 있다');
  await snap('cr-02-panel');

  // ── ④ 재료를 고른다 → 판단이 화면에 있다 ────────────────────────────────
  const opts = await page.evaluate(() => [...document.querySelectorAll('[data-fpick="tool"]')].map((b) => b.textContent.trim()));
  ok(opts.length > 1, '★★④ **재료 선택지가 여럿**이다(무엇으로 만들지가 판단이다)', opts.slice(0, 5).join(' | '));
  ok(opts.some((t) => /%/.test(t)), '★④ 재료마다 **예상 품질이 숫자로** 뜬다', opts.find((t) => /%/.test(t)) || '');
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-fpick="tool"]')].find((x) => /stone/.test(x.dataset.fmat)); if (b) b.click(); });
  await sleep(400);

  // ── ⑤ 걸어 둔다 → 시간이 흐른다 → 받는다 ────────────────────────────────
  const eq0 = await page.evaluate(() => window.__getEquipment().length);
  await page.evaluate(() => { const b = document.querySelector('[data-fmake="tool"]'); if (b) b.click(); });
  await sleep(1500);
  const qtxt = await page.evaluate(() => window.__panelText());
  ok(/초 남음|걸어 둔 것/.test(qtxt), '★★⑤ **대기열에 걸렸다**(즉석이 아니다)', (qtxt.match(/[^\n]{0,20}초 남음/) || [''])[0].trim());
  const eqMid = await page.evaluate(() => window.__getEquipment().length);
  ok(eqMid === eq0, '★★⑤ 아직 손에 안 들어왔다', `장비 ${eqMid}`);
  await page.evaluate(() => { const b = document.querySelector('[data-fcollect]'); if (b) b.click(); });
  await sleep(700);
  ok((await page.evaluate(() => window.__getEquipment().length)) === eq0, '★⑤ 다 되기 전엔 못 받는다');
  await sleep(CRAFT_MS + 1500);
  const dtxt = await page.evaluate(() => window.__panelText());
  ok(/다 됐다|받기/.test(dtxt), '★★⑤ 다 되면 **화면이 그렇게 말한다**', (dtxt.match(/[^\n]{0,24}다 됐다[^\n]{0,12}/) || [''])[0].trim());
  await page.evaluate(() => { const b = document.querySelector('[data-fcollect]'); if (b) b.click(); });
  await sleep(1200);
  const eq1 = await page.evaluate(() => window.__getEquipment());
  ok(eq1.length === eq0 + 1, '★★⑤ **받아졌다**', `장비 ${eq0} → ${eq1.length}`);
  const tool = eq1.find((e) => e.type === 'tool');
  ok(!!tool && tool.durMax > 0, '★⑤ 정품 도구다(내구가 있다)', tool ? `내구 ${tool.dura}/${tool.durMax}` : '없음');
  await snap('cr-03-collected');

  // ── ⑥ 장착 ──────────────────────────────────────────────────────────────
  if (tool) {
    await page.evaluate((id) => window.__sendPrimary({ type: 'equip_item', id }), tool.id);
    await sleep(900);
    const eqp = await page.evaluate(() => window.__getEquipped ? window.__getEquipment() : []);
    ok(eqp.some((e) => e.id === tool.id), '★★⑥ 자작 정품이 **장비로 들어와 있다**', tool.id);
  }

  // ── ⑦ 나가면 닫힌다 ──────────────────────────────────────────────────────
  await warp(site.x + 1200, site.y);
  let f2 = null, sd2 = null;
  for (let i = 0; i < 20; i++) { await sleep(700); f2 = await fac(); sd2 = await side(); if (f2 && f2.near == null) break; }
  ok(f2 && f2.near == null, '★★⑦ 시설에서 멀어지면 **창이 닫힌다**(맥락 창이니까)', f2 ? String(f2.near) : '안 옴');
  ok(sd2 !== 'facility', '★⑦ 패널도 내려간다', String(sd2));
  // 멀리서 제작 요청 — 서버가 게이트다
  const n0 = await page.evaluate(() => (window.__notices || []).length);
  await page.evaluate(() => window.__sendPrimary({ type: 'craft_equipment', itemType: 'tool', material: 'stone' }));
  await sleep(1200);
  const said = await page.evaluate((k) => (window.__notices || []).slice(k), n0);
  ok(said.some((t) => /작업대/.test(t)), '★★⑦ **서버가 게이트다** — 멀리서 직접 요청해도 거절된다', (said.slice(-1)[0] || '').slice(0, 40));
  const eqEnd = await page.evaluate(() => window.__getEquipment().length);
  ok(eqEnd === eq1.length, '★⑦ 그리고 장비도 안 늘었다', `${eqEnd}`);
  await snap('cr-04-away');

  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 예외:', e); process.exit(1); });
