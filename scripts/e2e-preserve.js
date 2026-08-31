#!/usr/bin/env node
// === scripts/e2e-preserve.js — 부패·보존 **실클라** E2E ===========================
//
// ★★레포 캐논: *"계약도 실행도 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다"*(2026-08-02d).
//   `test-preserve` 58/0 은 곡선·수율·게이트가 **맞는지**를 잰다. 여기서 잴 것은 다르다:
//     방치한 것이 **화면에서 시들어 가는가** · 건조대를 **지어서 말릴 수 있는가** ·
//     다 되면 **받아지는가** · 상한 걸 먹으면 **탈이 났다고 말하는가** ·
//     그리고 상한 재료의 버튼이 **꺼져 있는가**(눌러 보고 거절당하면 화면이 거짓말한 것이다).
//
// ★★시간 모드 [머리 주석 규약]:
//   · **게임일은 안 건드린다**(기본 24분). 나이는 `__e2e_give` 의 `lots:[[나이,개수]]` 픽스처가
//     **취득일만** 과거로 적어서 만든다 — 서버 시계를 우회하지 않는다.
//   · **가공 소요일만** env 로 줄인다(`PRESERVE_DAYS_*`). `e2e-craft` 가 `CRAFT_TOOL_MS` 를
//     줄이는 것과 같은 결이고, 신선도·수율·가격에는 손대지 않는다.
//
// 실행: node scripts/e2e-preserve.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-preserve-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-pv-c-${process.pid}.db`, ZDB = `/tmp/e2e-pv-z-${process.pid}.db`;
const DAY_MS = 24 * 60 * 1000;            // 게임일 기본값(안 건드린다)
const DRY_DAYS = 0.0035;                  // ≈ 5.0초 — **시간 손잡이만** 줄인다
const DRY_MS = Math.round(DRY_DAYS * DAY_MS);

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
  console.log('\n=== 부패·보존 실클라 E2E (Chromium) ===');
  const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const WOX = ZONES.hanbando.worldOffsetX || 0, WOY = ZONES.hanbando.worldOffsetY || 0;
  let site = null;
  for (let i = 0; i < 40000 && !site; i++) {
    const x = 3000 + (i * 977) % 54000, y = 3000 + (i * 1361) % 54000;
    let good = true;
    for (let dx = -160; dx <= 160 && good; dx += 32) for (let dy = -160; dy <= 160 && good; dy += 32)
      if (T.isWaterCellLocal('hanbando', x + dx, y + dy) || T.isRockCellLocal('hanbando', x + dx, y + dy)
        || T.getForestMultiplier('hanbando', x + dx, y + dy) > 1.5) good = false;
    if (good) site = { x, y };
  }
  console.log(`    빈터: ${site.x},${site.y} · 말리기 ${DRY_DAYS}일 = ${DRY_MS}ms · 생선 보관 ${Spoil.shelfOf('fish')}일`);

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    PRESERVE_DAYS_DRY: String(DRY_DAYS) });
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
  const subs = (col, item) => page.evaluate(([c, i]) => window.__ulSubs(c, i), [col, item]);
  const rows = (col) => page.evaluate((c) => window.__ulRows(c), col);
  const lots = () => page.evaluate(() => window.__lots());
  const inv = () => page.evaluate(() => window.__getInv());
  const fac = () => page.evaluate(() => window.__getFacility());
  const body = () => page.evaluate(() => window.__bodyState || null);
  const me = () => page.evaluate(() => window.__getMyAbs());

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('button:has-text("월드 입장")');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2200);
  ok(!!(await me()), '존 입장');
  const warp = async (x, y) => { for (let i = 0; i < 20; i++) {
    await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
    await sleep(800);
    const c = (await page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))) || (await me());
    if (c && Math.hypot(c.x - (x + WOX), c.y - (y + WOY)) <= 200) return c; } return null; };
  await warp(site.x, site.y);

  // ── ① 방치한 것이 화면에서 **시들고 상한다** ────────────────────────────
  console.log('\n① 방치 → 시듦 → 상함이 화면에 보인다');
  const SH = Spoil.shelfOf('fish_cooked');
  const AGE_W = Math.max(1, Math.round(SH * 0.8));          // 시듦
  const AGE_S = Math.ceil(SH) + 1;                           // 상함
  pre(Spoil.stageOfAge('fish_cooked', 0) === 'fresh'
    && Spoil.stageOfAge('fish_cooked', AGE_W) === 'wilt'
    && Spoil.stageOfAge('fish_cooked', AGE_S) === 'spoiled',
    '픽스처 세 나이가 **세 단계에 실제로 떨어진다**(안 그러면 아래가 자명 통과)', `0 / ${AGE_W} / ${AGE_S}일`);
  await give({ lots: { fish_cooked: [[0, 2], [AGE_W, 2], [AGE_S, 2]] } });
  await page.evaluate(() => window.__openInv('ground'));
  await sleep(900);
  const L = await lots();
  ok(!!L.fish_cooked && L.fish_cooked.length === 3, '(상황) 로트 셋이 클라에 왔다', L.fish_cooked ? L.fish_cooked.length : 0);
  ok(L.fish_cooked.every((l) => typeof l.fresh === 'number' && l.stage),
    '★★① **서버가 신선도·단계를 실어 준다**(클라가 곡선을 다시 계산하지 않는다)',
    (L.fish_cooked || []).map((l) => `${l.ageDays}일:${l.stage}`).join(' '));
  const st = new Set((L.fish_cooked || []).map((l) => l.stage));
  ok(st.has('fresh') && st.has('wilt') && st.has('spoiled'), '★① 세 단계가 다 왔다', [...st].join(','));
  // 화면(DOM)에 실제로 글자가 찍혔나 — 내부 변수를 보면 자기 증명이다(통일 목록 규약)
  let sub = await subs('mine', 'fish_cooked');
  if (!sub.length || sub.every((s) => s.hidden)) { await page.evaluate(() => window.__ulToggle('mine', 'fish_cooked')); await sleep(500); sub = await subs('mine', 'fish_cooked'); }
  const txt = sub.map((s) => s.text).join(' | ');
  ok(/신선/.test(txt) && /시듦/.test(txt) && /상함/.test(txt),
    '★★① **펼치면 로트마다 신선도가 글자로 있다**(새 컴포넌트 0 — 파 둔 칸을 채웠다)', txt.slice(0, 110));
  await snap('pv-01-lots');

  // ── ② 건조대를 짓고 → 말리고 → 받는다 ──────────────────────────────────
  console.log('\n② 건조대 — 짓고 · 말리고 · 받는다');
  await give({ items: { wood: 20, fiber: 20, meat_raw: 4 }, lots: { fish: [[0, 6]] } });
  await page.evaluate(() => window.__sendPrimary({ type: 'build', buildType: 'drying_rack', floor: 0 }));
  await sleep(1600);
  const built = await page.evaluate(() => (window.__getAllBuildings ? window.__getAllBuildings() : []).filter((b) => b.type === 'drying_rack'));
  ok(built.length > 0, '★★② **건조대가 세워졌다**(통나무 2 · 풀 4 · 망치 없이)', `${built.length}채`);
  await snap('pv-02-rack');
  let f1 = null;
  for (let i = 0; i < 20 && !(f1 && f1.near && f1.near.kind === 'dry'); i++) { await sleep(700); f1 = await fac(); }
  ok(f1 && f1.near && f1.near.kind === 'dry', '★★② 건조대 앞 — **말리기 창**이 온다', f1 && f1.near ? f1.near.ko : '안 옴');
  const sd = await page.evaluate(() => window.__getActiveSide());
  ok(sd === 'facility', '★② 패널이 저절로 열린다(맥락 창 — 새 패널 0)', String(sd));
  const ptxt = await page.evaluate(() => window.__panelText());
  ok(/말리기/.test(ptxt), '★★② 목록에 **말리기**가 있다', (ptxt.match(/[^\n]{0,30}말리기[^\n]{0,30}/) || [''])[0].trim());
  ok(!/훈제|절임|도구/.test(ptxt), '★★② 그리고 **훈제·절임은 안 섞인다** — 시설의 창이지 대목록이 아니다');
  ok(/수율/.test(ptxt) && /보관/.test(ptxt), '★② 재료 신선도·수율·보관일이 미리 보인다(재료 선택 = 판단)',
    (ptxt.match(/[^\n]{0,40}수율[^\n]{0,24}/) || [''])[0].trim());
  const inv0 = await inv();
  await page.evaluate(() => { const b = document.querySelector('[data-fmake="dry_fish"]'); if (b) b.click(); });
  await sleep(1500);
  const inv1 = await inv();
  ok((inv1.fish || 0) === (inv0.fish || 0) - 1, '★② 입력이 나갔다', `생선 ${inv0.fish} → ${inv1.fish}`);
  ok(!inv1.dried_fish, '★★② 그리고 **즉석이 아니다** — 아직 손에 없다', String(inv1.dried_fish));
  const qtxt = await page.evaluate(() => window.__panelText());
  ok(/초 남음|걸어 둔 것/.test(qtxt), '★★② 대기열에 걸렸다(오프라인에도 마른다)', (qtxt.match(/[^\n]{0,20}초 남음/) || [''])[0].trim());
  await sleep(DRY_MS + 2000);
  const dtxt = await page.evaluate(() => window.__panelText());
  ok(/다 됐다|받기/.test(dtxt), '★★② 다 되면 화면이 그렇게 말한다', (dtxt.match(/[^\n]{0,24}다 됐다[^\n]{0,12}/) || [''])[0].trim());
  await page.evaluate(() => { const b = document.querySelector('[data-fcollect]'); if (b) b.click(); });
  await sleep(1400);
  const inv2 = await inv();
  ok((inv2.dried_fish || 0) >= 1, '★★② **건어물을 받았다**', `건어물 ${inv2.dried_fish}`);
  const L2 = await lots();
  ok(!!L2.dried_fish && L2.dried_fish[0] && L2.dried_fish[0].stage === 'fresh',
    '★★② 그리고 **부패 시계가 리셋됐다** — 갓 만든 건어물은 신선', JSON.stringify(L2.dried_fish && L2.dried_fish[0]));
  await snap('pv-03-dried');

  // ── ③ 상한 재료는 **버튼이 꺼져 있다**(화면이 거짓말하지 않는다) ────────
  console.log('\n③ 상한 재료 — 버튼이 꺼져 있다');
  // ⚠1차 실행이 여기서 **선행 assert 에 걸렸다**: 생선으로 검사했는데 ②에서 준 성한 생선 5마리가
  //   남아 있어 "전부 상함"이 아니었다(성한 게 섞이면 버튼은 당연히 켜져 있다 — 검사가 무의미).
  //   ⇒ **아직 하나도 안 가진 품목**(과실)으로 옮기고, 상한 것만 준다. 선행 assert 가 그걸 못 박는다.
  const invPre = await inv();
  pre(!(invPre.berry > 0), '과실을 **아직 하나도 안 갖고** 있다(성한 게 섞일 여지 0)', String(invPre.berry));
  const AGE_B = Math.ceil(Spoil.shelfOf('berry')) + 2;
  pre(Spoil.freshnessOf('berry', AGE_B) === 0, '줄 과실이 **정말 상함**이다', `f=${Spoil.freshnessOf('berry', AGE_B)}`);
  await give({ lots: { berry: [[AGE_B, 3]] } });
  const Lr = await lots();
  pre((Lr.berry || []).length > 0 && (Lr.berry || []).every((l) => l.stage === 'spoiled'),
    '가진 과실이 **전부 상함**이다', (Lr.berry || []).map((l) => `${l.ageDays}일:${l.stage}`).join(' '));
  await page.evaluate(() => window.__sendPrimary({ type: 'facility_ask' }));
  await sleep(1200);
  const enabledCtl = await page.evaluate(() => { const b = document.querySelector('[data-fmake="dry_fish"]'); return b ? b.disabled : null; });
  ok(enabledCtl === false, '(대조) 성한 생선이 있는 말리기 버튼은 **켜져 있다**(늘 꺼져 있는 게 아니다)', String(enabledCtl));
  const disabled = await page.evaluate(() => { const b = document.querySelector('[data-fmake="dry_fruit"]'); return b ? b.disabled : null; });
  ok(disabled === true, '★★③ 상한 과실뿐이면 **만들기 버튼이 꺼진다**(눌러 보고 거절당하지 않는다)', String(disabled));
  const ftxt = await page.evaluate(() => window.__panelText());
  ok(/성한 것/.test(ftxt), '★③ 그리고 **무엇이 모자란지** 말한다', (ftxt.match(/[^\n]{0,40}성한 것[^\n]{0,16}/) || [''])[0].trim());
  await snap('pv-04-disabled');

  // ── ④ 상한 걸 먹으면 **탈이 난다** ──────────────────────────────────────
  console.log('\n④ 상한 걸 먹으면 탈이 난다 — HP 는 안 깎인다');
  // ★③이 준 상한 과실을 그대로 먹는다(같은 픽스처 재사용 — 중복 지급이 상황을 흐리지 않게).
  // ★HP 는 **화면(DOM)에서** 읽는다 — `__getMyAbs()` 엔 hp 가 없어 1차 실행이 `null → null` 로
  //   **자명 통과**했다(레포가 못 박은 그 함정). HUD 의 `#hpText` 가 진짜 화면 값이다.
  const readHp = () => page.evaluate(() => (document.getElementById('hpText') || {}).textContent || null);
  const b0 = await body();
  const hp0 = await readHp();
  pre(!!hp0 && /\d/.test(hp0), 'HUD 에서 **HP 숫자를 실제로 읽었다**(null 이면 아래가 자명 통과)', String(hp0));
  const n0 = await page.evaluate(() => (window.__notices || []).length);
  await page.evaluate(() => window.__sendPrimary({ type: 'eat', item: 'berry' }));
  await sleep(1500);
  const b1 = await body();
  const said = await page.evaluate((k) => (window.__notices || []).slice(k), n0);
  ok(!!b1 && (b1.injury || 0) > ((b0 && b0.injury) || 0),
    '★★④ **부상 축이 올랐다** — 탈이 났다(새 축 없음)', `${(b0 && b0.injury) || 0} → ${b1 && b1.injury}`);
  ok(said.some((t) => /탈이 났다/.test(t)), '★★④ 그리고 화면이 그렇게 말한다', (said.find((t) => /탈/.test(t)) || '').slice(0, 50));
  ok(said.some((t) => /허기 0/.test(t)), '★④ 회복은 0 이었다', (said.find((t) => /허기/.test(t)) || '').slice(0, 46));
  const hp1 = await readHp();
  ok(!!hp0 && hp1 === hp0, '★★④ **HP 는 안 깎인다**(아사 폐지 캐논과 같은 결) — 화면 HUD 로 확인', `${hp0} → ${hp1}`);
  await snap('pv-05-ill');

  // ── ⑤ 자산·예외 ─────────────────────────────────────────────────────────
  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  const miss = missing.filter((u) => /assets|icons/.test(u));
  ok(miss.length === 0, '★⑤ 자산 404 없음 — **무엇이** 없는지까지 적는다(새 아이콘 7종 포함)', miss.slice(0, 4).join(' '));

  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  await browser.close();
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const f of [CDB, ZDB]) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  ✗ E2E 예외:', e && e.message); process.exit(1); });
