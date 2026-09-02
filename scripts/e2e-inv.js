#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-inv.js — 통일 목록·비네트 원인 축·유령 클라 **실클라** E2E ========
//
// ★왜 [재민 확정 2026-08-30 · 정비 배치 §5]
//   `test-ledger` 46/0 은 "원장이 주소를 갖는가"를 잰다. 이 레포가 배운 것은
//   **계약도 실행도 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다**는 것이다.
//   이 배치는 특히 그렇다 — 결함 셋이 전부 **화면에서만 보이는 결함**이었다:
//     ① 인벤·바닥 목록 비대칭(자료구조가 UI 로 새어 나온 것)
//     ② 비네트가 "심각함"만 외치고 원인 축을 안 말한 것
//     ③ 서버 틱 0 인데 화면이 돌아가 판정을 오염시킨 것
//   그래서 진짜 Chromium 을 띄우고 **DOM 을 읽어** 판정한다.
//
// ★★"같은 컴포넌트인가"는 **DOM 구조 지문**으로만 증명한다(내부 변수를 보면 자기 증명이다).
//
// ★★시간 모드: 얼리지 않는다. 판정이 전부 상호작용이고 게임일과 무관하다.
//   로트 나이만 취득일을 **과거로 지정**해 만든다(시간을 흘리지 않는다 — 결정론 유지).
//
// 실행: node scripts/e2e-inv.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-inv-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-inv-central-${process.pid}.db`, ZDB = `/tmp/e2e-inv-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩 완료/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 통일 목록 · 비네트 원인 축 · 유령 클라 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1', GHOST_STALL_MS: '3000', GHOST_RECONNECT_MS: '6000',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  // ★자산 404 는 **무엇이 없는지**를 적는다 — "404 하나 있음"만으론 못 고친다(옛 하네스의 함정).
  const missing = [];
  page.on('response', (r) => { if (r.status() === 404) missing.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const give = async (payload) => { await page.evaluate((pl) => window.__sendPrimary(Object.assign({ type: '__e2e_give' }, pl)), payload); await sleep(1200); };
  const rows = (col) => page.evaluate((c) => window.__ulRows(c), col);
  const subs = (col, item) => page.evaluate(([c, i]) => window.__ulSubs(c, i), [col, item]);
  const ground = () => page.evaluate(() => window.__ground());
  const inv = () => page.evaluate(() => window.__getInv());
  const led = () => page.evaluate(() => window.__ledger());

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enterBtn = await page.$('button:has-text("월드 입장")');
  ok(!!enterBtn, '로비에 "월드 입장" 버튼');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2200);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  // ── ⓪ 손잡이가 서버에서 왔는가 ──────────────────────────────────────────
  const cfg = await page.evaluate(() => window.__uiCfg());
  ok(cfg && cfg.ghostStallMs === 3000 && cfg.ghostReconnectMs === 6000, '★⓪ 클라 손잡이가 **서버 env** 에서 왔다(클라 상수 아님)', JSON.stringify(cfg));

  // ── ① 접힘이 기본 · 개체가 둘 이상이면 ▶ · 벌크는 ▶ 없음 ───────────────
  console.log('\n① 좀보이드 문법 — 기본 접힘 · 펼칠 것이 둘 이상일 때만 ▶');
  await give({ kgs: { fish: [2.0, 0.4, 1.1] }, items: { twig: 8 } });
  await page.evaluate(() => window.__openInv('ground'));
  await sleep(600);
  const L0 = await led();
  ok(!!L0.fish && L0.fish.length === 3, '(상황) 원장이 물고기 3개를 실어 왔다', JSON.stringify(L0.fish));
  ok(!L0.twig, '(상황) 잔가지는 원장이 없다 — 벌크가 맞다');
  let mine = await rows('mine');
  const rFish = mine.find((r) => r.item === 'fish');
  const rTwig = mine.find((r) => r.item === 'twig');
  ok(!!rFish && rFish.text.includes('×3'), '★① 물고기가 **한 줄로 접혀** 나온다', rFish && rFish.text.trim());
  ok(!!rFish && /3\.5kg/.test(rFish.text), '★① 접힌 줄이 **총 무게**를 말한다(2.0+0.4+1.1)', rFish && rFish.text.trim());
  ok(!!rFish && rFish.hasCaret && rFish.kids === 3, '★① 펼칠 것이 셋이라 ▶ 가 있다', rFish && `kids=${rFish.kids}`);
  ok(!!rFish && !rFish.open, '★① 기본은 **접힘**');
  ok(!!rTwig && !rTwig.hasCaret && rTwig.kids === 0, '★① 무기한 벌크는 ▶ 가 **없다**(3층 캐논)', rTwig && rTwig.text.trim());
  const subsHidden = await subs('mine', 'fish');
  ok(subsHidden.length === 3 && subsHidden.every((x) => x.hidden), '★① 하위 줄은 접힌 동안 숨어 있다', `${subsHidden.length}줄`);
  await snap('inv-01-collapsed');

  // ── ② 펼치면 개체별 kg 이 보인다 ────────────────────────────────────────
  console.log('\n② 펼침 — 낱개마다 제 무게');
  ok(await page.evaluate(() => window.__ulToggle('mine', 'fish')), '▶ 클릭');
  await sleep(400);
  const sOpen = await subs('mine', 'fish');
  ok(sOpen.length === 3 && sOpen.every((x) => !x.hidden), '★② 하위 3줄이 펼쳐졌다');
  const kgTexts = sOpen.map((x) => x.text.trim());
  ok(kgTexts.some((t) => /2\.00kg/.test(t)) && kgTexts.some((t) => /0\.40kg/.test(t)) && kgTexts.some((t) => /1\.10kg/.test(t)),
    '★★② 낱개마다 **제 kg** 이 적혀 있다 — 인벤이 더는 스칼라가 아니다', kgTexts.join(' · '));
  ok(sOpen.every((x) => x.drag && Array.isArray(x.drag.ids) && x.drag.ids.length === 1),
    '★② 하위 줄마다 **제 주소(원장 id)** 를 들고 있다', JSON.stringify(sOpen.map((x) => x.drag.ids[0])));
  await snap('inv-02-expanded');

  // ── ③ 하위 줄 개별 드롭 → 바닥에 **그 kg** 로 등장 ─────────────────────
  console.log('\n③ 하위 줄 개별 드롭 — 한 마리만 버린다');
  const g0 = await ground();
  ok(g0.length === 0, '(상황) 바닥이 비어 있다', `${g0.length}덩이`);
  const heavy = sOpen.find((x) => /2\.00kg/.test(x.text));
  ok(!!heavy, '(상황) 2.00kg 줄을 찾았다');
  await page.evaluate((d) => window.__sendPrimary({ type: 'drop_item', item: d.item, ids: d.ids }), heavy.drag);
  await sleep(900);
  const inv3 = await inv(), L3 = await led(), g3 = await ground();
  ok(inv3.fish === 2, '★③ 인벤 물고기 2마리', inv3.fish);
  ok(L3.fish && L3.fish.length === 2 && !L3.fish.some((e) => Math.abs(e.kg - 2.0) < 1e-6),
    '★★③ **그 개체만** 빠졌다 (2.0kg 가 없어지고 0.4·1.1 이 남았다)', JSON.stringify(L3.fish));
  ok(g3.length === 1 && Math.abs(g3[0].kg - 2.0) < 1e-6, '★★③ 바닥에 **그 kg 그대로** 놓였다', g3[0] && `${g3[0].kg}kg`);
  await snap('inv-03-dropped-one');

  // ── ④ 바닥·인벤이 **같은 컴포넌트**인가 — DOM 구조 지문 ──────────────────
  console.log('\n④ 통일 — 바닥과 인벤이 같은 컴포넌트를 쓰는가');
  await page.evaluate((d) => window.__sendPrimary({ type: 'drop_item', item: d.item, ids: d.ids }),
    { item: 'fish', ids: [(await led()).fish[0].id] });
  await sleep(900);
  await page.evaluate(() => { window.__closeInv(); window.__openInv('ground'); });
  await sleep(600);
  const gRows = await rows('ground');
  const gFish = gRows.find((r) => r.item === 'fish');
  ok(!!gFish && gFish.text.includes('×2'), '★④ 바닥도 **한 줄로 접혀** 나온다(옛 화면은 2줄이었다)', gFish && gFish.text.trim());
  ok(!!gFish && gFish.hasCaret && gFish.kids === 2, '★④ 바닥 줄도 ▶ 로 펼쳐진다', gFish && `kids=${gFish.kids}`);
  // ★지문은 **같은 종류의 줄끼리** 견준다(내용이 아니라 구조를 재는 것이다).
  //   컬럼마다 들어 있는 물건이 달라 줄 **개수·종류 구성**은 당연히 다르다 —
  //   두 벌인지 아닌지는 "`ul-row` 는 어디서나 같은 칸 구성인가"로만 갈린다.
  const shapeOf = async (col) => {
    const raw = await page.evaluate((c) => window.__ulShape(c), col);
    const m = {};
    for (const part of String(raw || '').split(' / ')) {
      const i = part.indexOf(':'); if (i < 0) continue;
      m[part.slice(0, i)] = part.slice(i + 1);
    }
    return m;
  };
  const shMine = await shapeOf('mine'), shGround = await shapeOf('ground');
  ok(Object.keys(shMine).length > 0 && Object.keys(shGround).length > 0, '두 컬럼 지문을 읽었다',
    `mine=${Object.keys(shMine).join(',')} ground=${Object.keys(shGround).join(',')}`);
  ok(!!shMine['ul-row'] && !!shGround['ul-row'] && shMine['ul-row'] === shGround['ul-row'],
    '★★④ 접힌 줄(`ul-row`)의 **칸 구성이 같다** — 두 컬럼이 같은 컴포넌트다(두 벌 금지)',
    `mine=[${shMine['ul-row']}] ground=[${shGround['ul-row']}]`);
  // 하위 줄도 같은지 — 양쪽 다 펼쳐 놓고 견준다(펼침 상태는 `ulOpen` 에 남아 재렌더를 넘는다).
  await page.evaluate(() => { window.__ulToggle('ground', 'fish'); });
  await sleep(300);
  const shGround2 = await shapeOf('ground');
  ok(!!shGround2['ul-sub'], '(상황) 바닥 하위 줄이 펼쳐졌다', shGround2['ul-sub'] || '없음');
  ok(shGround2['ul-sub'] === 'it-icon|it-name ul-subname|it-cat|it-action',
    '★④ 하위 줄(`ul-sub`)도 컴포넌트가 정한 한 가지 모양이다', shGround2['ul-sub']);
  await snap('inv-04-ground-grouped');

  // ── ⑤ 접힌 부모 드래그 = 전량 · 재획득 → 인벤 복귀 ────────────────────────
  console.log('\n⑤ 부모 = 전량 · 왕복 보존');
  const gFish2 = (await rows('ground')).find((r) => r.item === 'fish');
  ok(!!gFish2 && Array.isArray(gFish2.drag.giIds) && gFish2.drag.giIds.length === 2,
    '★⑤ 접힌 부모가 **덩이 전부**를 들고 있다', JSON.stringify(gFish2 && gFish2.drag.giIds));
  const kgBefore = (await ground()).reduce((s, g) => s + g.kg, 0);
  await page.evaluate((d) => window.__sendPrimary({ type: 'pickup_item', giIds: d.giIds }), gFish2.drag);
  await sleep(1000);
  const inv5 = await inv(), L5 = await led(), g5 = await ground();
  ok(g5.length === 0, '★⑤ 바닥이 비었다 — 부모 한 번에 전량이 움직였다', `${g5.length}덩이`);
  ok(inv5.fish === 3, '★⑤ 인벤 3마리 복귀', inv5.fish);
  const kgAfter = (L5.fish || []).reduce((s, e) => s + e.kg, 0);
  ok(Math.abs(kgAfter - (kgBefore + 1.1)) < 0.01,
    '★★⑤ **kg 이 왕복해도 그대로** — 2.0 은 2.0 으로 돌아왔다', `바닥 ${kgBefore.toFixed(2)} + 손에 있던 1.10 = ${kgAfter.toFixed(2)}kg`);
  ok((L5.fish || []).some((e) => Math.abs(e.kg - 2.0) < 1e-6), '★⑤ 2.0kg 개체가 원장에 있다', JSON.stringify(L5.fish));

  // ── ⑥ 로트 펼침 — 식품은 취득일로 갈린다 ─────────────────────────────────
  console.log('\n⑥ 로트 — 같은 베리라도 딴 날 딴 몫');
  // ★나이로 준다 — 하네스가 서버 시계를 몰라도 되게(서버가 `zoneGameDay()−나이` 로 바꾼다).
  await give({ lots: { berry: [[6, 3], [1, 2]] } });
  await page.evaluate(() => { window.__closeInv(); window.__openInv('ground'); });
  await sleep(700);
  const mine6 = await rows('mine');
  const rB = mine6.find((r) => r.item === 'berry');
  ok(!!rB && rB.text.includes('×5'), '★⑥ 베리가 한 줄로 접혀 ×5', rB && rB.text.trim());
  ok(!!rB && rB.hasCaret && rB.kids === 2, '★⑥ 로트가 둘이라 ▶ 가 있다', rB && `kids=${rB.kids}`);
  await page.evaluate(() => window.__ulToggle('mine', 'berry'));
  await sleep(400);
  const sB = await subs('mine', 'berry');
  ok(sB.length === 2 && sB.every((x) => !x.hidden), '★⑥ 로트 2줄 펼침');
  ok(sB.some((x) => /6일 전/.test(x.text)) && sB.some((x) => /1일 전/.test(x.text)),
    '★★⑥ 하위 줄이 **취득일(나이)** 를 말한다 — 부패 곡선이 앉을 자리', sB.map((x) => x.text.trim()).join(' · '));
  ok(sB.every((x) => x.drag && Number.isFinite(x.drag.lotDay)), '★⑥ 로트 줄이 제 주소(취득일)를 들고 있다');
  const oldLot = sB.find((x) => /6일 전/.test(x.text));
  await page.evaluate((d) => window.__sendPrimary({ type: 'drop_item', item: d.item, amount: d.n, lotDay: d.lotDay }), oldLot.drag);
  await sleep(900);
  const lots6 = await page.evaluate(() => window.__lots());
  ok((await inv()).berry === 2, '★⑥ 지목한 로트만큼 줄었다', (await inv()).berry);
  ok(lots6.berry && lots6.berry.length === 1 && lots6.berry[0].ageDays === 1,
    '★★⑥ **지목한 그 로트가** 빠졌다 (FIFO 였다면 반대가 나갔다)', JSON.stringify(lots6.berry));
  await snap('inv-06-lots');

  // ── ⑥-b 빈 행 · 도구 · 상자 왕복 · 달력 [튜닝 배치 2026-08-30] ────────────
  console.log('\n⑥-b 인벤 마무리 — 빈 행 · 도구 개체 · 상자 왕복 · 달력');
  {
    // ★빈 행 — 수량 0 은 **페이로드에 아예 없다**(클라 필터에만 맡기지 않는다)
    const inv0 = await inv();
    const zeros = Object.entries(inv0).filter(([, v]) => !(v > 0));
    ok(zeros.length === 0, '★★⑥-b 인벤 페이로드에 **수량 0 품목이 없다**', JSON.stringify(zeros));
    const rowsNow = await rows('mine');
    ok(rowsNow.every((r) => !/×0\b/.test(r.text)), '★⑥-b 화면에도 ×0 줄이 없다',
      rowsNow.map((r) => r.text.trim()).join(' / ').slice(0, 90));

    // ★달력 — HUD 에 연·계절·일이 뜨고, 서버가 준 값과 같다
    const cal = await page.evaluate(() => window.__calendar());
    ok(!!cal, '★⑥-b 달력을 받았다', cal ? `${cal.year}년 ${cal.seasonKo} ${cal.dayOfSeason}일` : '없음');
    const calTxt = await page.evaluate(() => (document.getElementById('calBadge') || {}).textContent || '');
    ok(!!cal && calTxt.includes(`${cal.year}년`) && calTxt.includes(cal.seasonKo),
      '★★⑥-b HUD 배지가 **서버가 준 그대로** 그린다(클라 매핑 사본 없음)', calTxt);
    ok(!!cal && cal.dayOfSeason >= 1 && cal.dayOfSeason <= cal.seasonDays, '★⑥-b 계절 안 날짜가 범위 안', cal && `${cal.dayOfSeason}/${cal.seasonDays}`);

    // ★도구 — 통일 목록에 서고, 버리면 바닥에 개체로 떨어지고, 주우면 내구도가 돌아온다
    await give({ tools: ['axe', 'axe'] });
    await page.evaluate(() => { window.__closeInv(); window.__openInv('ground'); });
    await sleep(600);
    const rAxe = (await rows('mine')).find((r) => r.item === 'axe');
    ok(!!rAxe, '★★⑥-b 도구가 **통일 목록에** 선다(옛 도구 전용 표는 삭제됐다)', rAxe && rAxe.text.trim());
    ok(!!rAxe && rAxe.hasCaret && rAxe.kids === 2, '★⑥-b 도끼 2자루라 ▶ 로 펼쳐진다', rAxe && `kids=${rAxe.kids}`);
    ok(!!rAxe && !!rAxe.drag && !!rAxe.drag.toolId, '★⑥-b 도구 줄이 **인스턴스 id** 를 들고 있다');
    const before = await page.evaluate(() => (window.__getTools ? window.__getTools() : null));
    await page.evaluate((d) => window.__sendPrimary({ type: 'drop_item', item: d.item, toolId: d.toolId }), rAxe.drag);
    await sleep(900);
    // ★바닥엔 앞 절(로트 드롭)이 남긴 베리도 있다 — **도끼만** 골라 본다(전체 개수로 재면 위양성).
    const gAxe = (await ground()).filter((g) => g.item === 'axe');
    ok(gAxe.length === 1, '★★⑥-b 도구가 바닥에 떨어진다(종전엔 버릴 방법이 없었다)', JSON.stringify(gAxe[0] || null));
    ok(!!gAxe[0] && !!gAxe[0].tool, '★★⑥-b 바닥템이 **정체(내구도)** 를 싣고 있다', JSON.stringify(gAxe[0] && gAxe[0].tool));
    const dur0 = gAxe[0] && gAxe[0].tool ? gAxe[0].tool.d : -1;
    await page.evaluate((gid) => window.__sendPrimary({ type: 'pickup_item', giId: gid }), gAxe[0].id);
    await sleep(900);
    const rAxe2 = (await rows('mine')).find((r) => r.item === 'axe');
    ok(!!rAxe2 && rAxe2.kids === 2, '★★⑥-b 주우면 **도구로** 돌아온다(수량이 아니라 개체로)', rAxe2 && `kids=${rAxe2.kids}`);
    const subs2 = await subs('mine', 'axe');
    ok(subs2.some((x) => x.text.includes(`${dur0}/`)), '★★⑥-b **내구도가 그대로** 돌아왔다',
      `버릴 때 ${dur0} · 지금 ${subs2.map((x) => x.text.trim()).join(' / ')}`);
    ok((await ground()).filter((g) => g.item === 'axe').length === 0, '★⑥-b 바닥에서 도끼가 사라졌다');
    ok(!(await inv()).axe, '★★⑥-b 도구가 **인벤 수량으로 새지 않았다**(개체로만 산다)', JSON.stringify((await inv()).axe));
    void before;
  }

  // ── ⑦ 비네트가 **원인 축**을 말하는가 ───────────────────────────────────
  console.log('\n⑦ 비네트 원인 축 — 갈증 3단계');
  const vg0 = await page.evaluate(() => ({ on: window.__vignetteOn(), axes: window.__vgAxes(), axis: window.__vgAxis() }));
  ok(!vg0.on && vg0.axes.length === 0, '(상황) 지금은 비네트가 꺼져 있다', JSON.stringify(vg0));
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', thirst: 1 }));
  await sleep(2500);
  const vg1 = await page.evaluate(() => ({ on: window.__vignetteOn(), axes: window.__vgAxes(), axis: window.__vgAxis(), tint: window.__vgTint(), mo: window.__moodles() }));
  ok(vg1.on, '★⑦ 비네트가 켜졌다', JSON.stringify(vg1.mo));
  ok(vg1.axes.length >= 1 && vg1.axes.some((a) => a.axis === 'thirst'),
    '★★⑦ **원인 축(갈증) 아이콘이 화면에 크게** 떠 있다 — 옛 화면은 붉기만 했다', JSON.stringify(vg1.axes));
  ok(vg1.axis === 'thirst', '★⑦ 비네트가 제 원인을 안다', vg1.axis);
  ok(vg1.tint === '90,150,220', '★⑦ 색조가 **갈증 계열(청)** 이다 — 붉기만 하지 않다', vg1.tint);
  const cfgMax = (await page.evaluate(() => window.__uiCfg())).moodleShowMax;
  ok(vg1.axes.length <= cfgMax, `★⑦ §7 동시 표시 상한(${cfgMax}) 준수`, `${vg1.axes.length}개`);
  await snap('inv-07-vignette-thirst');

  // ── ⑧ 유령 클라 — 틱이 끊기면 화면이 그렇다고 말하는가 ───────────────────
  console.log('\n⑧ 유령 클라 — 서버 틱 스톨');
  const st0 = await page.evaluate(() => window.__netStalled());
  ok(st0 === false, '(상황) 지금은 정상 연결이다');
  // ★★소켓의 **수신만** 막는다 — 그것도 **앞으로 열릴 소켓까지**.
  //   1차 시도는 지금 열려 있는 소켓 하나만 막았는데, `checkOrphan`(내 pid 2초 미수신)이
  //   먼저 재연결해 **새 소켓으로 틱이 돌아왔다** — 자가 치유라 옳은 동작이고, 그래서 못 잡혔다.
  //   실기에서 본 유령은 그런 게 아니다: **재연결을 해도 틱이 안 오는** 상태였다
  //   (실측 `보정 0회` · 초당 틱 0 이 10초 넘게). 그걸 재현하려면 WebSocket 자체를 막아야 한다.
  const injected = await page.evaluate(() => {
    if (window.__stallPatched) return 'already';
    const Real = window.WebSocket;
    const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    if (!desc || !desc.set) return 'no-desc';
    window.__blocked = 0;
    const filt = (fn, self) => (ev) => {
      try { const m = JSON.parse(ev.data); if (m.type === 'tick') { window.__blocked++; return; } } catch (e) {}
      if (fn) fn.call(self, ev);
    };
    class Patched extends Real {
      set onmessage(fn) { desc.set.call(this, filt(fn, this)); }
      get onmessage() { return desc.get.call(this); }
    }
    window.__RealWS = Real; window.WebSocket = Patched; window.__stallPatched = true;
    const ws = window.__primaryWs && window.__primaryWs();       // 이미 열린 소켓도 같이 막는다
    if (ws) { const real = ws.onmessage; ws.onmessage = filt(real, ws); }
    return 'ok';
  });
  ok(injected === 'ok', '(상황) 틱 차단을 주입했다 — 소켓은 살아 있고 틱만 안 온다', injected);

  // ★★스톨 **동안** 을 본다. 재연결이 (로컬호스트라) 1초 안에 끝나므로 나중에 보면
  //   이미 회복해 있어 "감지 못 했다"로 오독한다 — 이 함정에 한 번 빠졌다.
  let sawStall = false, sawBadge = false, stallAtMs = 0;
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) {
    const r = await page.evaluate(() => ({ stalled: window.__netStalled(), badge: !!(document.getElementById('netLost') || {}).classList?.contains('on'), gap: window.__tickGap() }));
    if (r.stalled && !sawStall) { sawStall = true; stallAtMs = Date.now() - t0; await snap('inv-08-netlost'); }
    if (r.stalled) sawBadge = sawBadge || r.badge;
    if (sawStall && r.badge) break;
    if (!sawStall && Date.now() - t0 > 15000) break;
    await sleep(120);
  }
  ok(sawStall, '★★⑧ 클라가 **스스로** 틱 미수신을 알아챘다(옛 감시는 못 잡던 사각지대)', sawStall ? `${(stallAtMs / 1000).toFixed(1)}초 만에` : '15초 동안 못 잡음');
  ok(sawBadge, '★★⑧ 화면에 **"연결 끊김"** 이 떠 있었다 — 판정이 오염되지 않는다');
  ok(sawStall && stallAtMs >= 2500 && stallAtMs <= 12000, '★⑧ 손잡이(`GHOST_STALL_MS=3000`)를 지킨 시점에 잡았다', `${(stallAtMs / 1000).toFixed(1)}초`);
  const blocked = await page.evaluate(() => window.__blocked | 0);
  ok(blocked > 20, '(상황) 틱이 실제로 막혀 있었다 — 안 막혔으면 위 판정이 거짓 통과다', `${blocked}개 차단`);
  // 차단 해제 → 기존 재연결 경로가 새 소켓을 열고 틱이 돌아온다(같은 토큰 = 같은 몸).
  await page.evaluate(() => { if (window.__RealWS) window.WebSocket = window.__RealWS; window.__stallPatched = false; });
  const cur = await page.evaluate(() => { const ws = window.__primaryWs && window.__primaryWs(); if (ws) { try { ws.close(); } catch (e) {} return true; } return false; });
  void cur;
  for (let i = 0; i < 40; i++) { if (!(await page.evaluate(() => window.__netStalled()))) break; await sleep(1000); }
  const st2 = await page.evaluate(() => ({ stalled: window.__netStalled(), badge: !!(document.getElementById('netLost') || {}).classList?.contains('on') }));
  ok(st2.stalled === false, '★★⑧ 재연결로 **스스로 회복**했다 — 표시가 걷혔다');
  ok(st2.badge === false, '★⑧ "연결 끊김" 딱지가 사라졌다');
  const inv8 = await inv();
  ok(inv8 && inv8.fish === 3, '★⑧ 같은 토큰 재접속 = 같은 몸(B-6 규약) — 인벤이 그대로', JSON.stringify(inv8));
  await snap('inv-08b-recovered');

  // ── ⑧-b 지게 — 화면의 상한이 서버를 따라오는가 [T12 2026-09-01] ──────────
  //   ★왜 실클라인가: 서버 하네스(`test-carrier`)는 "상한이 올랐다"까지만 잰다.
  //     이 배치가 뒤집은 전제는 **화면 쪽**에 있었다 — welcome 이 상한의 정적 사본을 실어 보냈고
  //     클라가 그걸 받아 들고 있었다(안 쓰고 있었을 뿐이다). 사본이 살아 있으면 언젠가 읽힌다.
  //   ⇒ HUD 의 `carryCap` 을 **눈으로 읽어** 서버 값과 견준다(내부 변수가 아니라 DOM).
  console.log('\n⑧-b 지게 — HUD 의 용량이 서버 상한을 따라오는가');
  {
    const capText = () => page.evaluate(() => (document.getElementById('carryCap') || {}).textContent || '');
    const capState = () => page.evaluate(() => (window.__carryState && window.__carryState.cap) || null);
    const before = await capText();
    ok(/^\d+(\.\d+)?$/.test(String(before).trim()), '★⑧-b (상황) HUD 에 용량 숫자가 떠 있다', before);
    ok(String(before).trim() === String(await capState()), '★★⑧-b HUD 가 **서버가 보낸 그 수**를 찍는다', `${before} vs ${await capState()}`);
    await give({ equip: [{ type: 'carrier', lvl: 10 }] });
    await sleep(1200);
    const eq = await page.evaluate(() => window.__equipState && window.__equipState());
    ok(!!(eq && eq.slots && eq.slots.back), '★★⑧-b 지게가 **등 슬롯에** 들어갔다', eq && JSON.stringify(eq.slots));
    const load = eq && (eq.equipment.find((x) => x.type === 'carrier') || {}).attrs;
    ok(!!(load && load.load > 0), '★⑧-b 그 지게가 적재 값을 갖고 있다', load && JSON.stringify(load));
    // 서버가 `gauges` 를 다음에 보낼 때까지 기다린다(틱이 보낸다 — 하네스가 시간을 만들지 않는다)
    let after = before, tries = 0;
    while (String(after).trim() === String(before).trim() && tries++ < 40) { await sleep(400); after = await capText(); }
    ok(Number(after) > Number(before), '★★⑧-b **HUD 의 용량이 올랐다** — 사본이면 25 에 멈춰 있었을 자리다',
      `${before} → ${after}kg (지게 +${load && load.load})`);
    ok(Number(after) === Number(before) + Number(load && load.load), '★★⑧-b 오른 만큼이 **화면에 적힌 적재 값 그대로**다',
      `${before} + ${load && load.load} = ${after}`);
    ok(String(after).trim() === String(await capState()), '★⑧-b 그리고 여전히 서버 값과 같다');
    await snap('carrier-hud');
  }

  // ── ⑩ ★[T55] 이름표 정본 — 서버 표 ∖ 클라가 찍는 키 = ∅ ──────────────────
  //   ★왜 여기인가: 이름표가 **실제로 화면에 도달하는가**는 표 대조로는 못 잰다.
  //     `test-itemlabel` 이 표 둘을 소스로 견주지만, 그 표가 **클라까지 실려 갔는지**는
  //     실클라만 안다(welcome 에 안 실으면 표만 맞고 화면은 영문이다 — 그게 T38 이후의 상태였다).
  console.log('\n⑩ 이름표 — 서버 정본이 화면 함수까지 도달했나 (T55)');
  {
    const labels = await page.evaluate(() => window.__itemLabels || null);
    ok(!!labels, '★⑩ (상황) welcome 이 이름표 정본을 실어 보냈다 — `welcome.itemLabels`',
       labels ? `${Object.keys(labels).length}키` : '안 왔다');
    const keys = labels ? Object.keys(labels) : [];
    ok(keys.length >= 100, '★⑩ (상황) 그 표가 실제로 크다(빈 표면 아래가 자명 통과다)', `${keys.length}키`);
    // ★핵심 판정 — 서버가 이름을 아는 키를 클라가 **하나도** 영문으로 안 찍는다.
    const raw = await page.evaluate((ks) => ks.filter((k) => itemKo(k) === k), keys);
    ok(raw.length === 0, '★★⑩ **서버 108키 ∖ 클라가 찍는 키 = ∅** — 화면에 영문 키가 남지 않았다',
       raw.length ? raw.slice(0, 10).join(' ') : `${keys.length}키 전부 한글`);
    // ★표본 — 회부가 지목한 그 품목들(갯벌 셋 · 자염 둘 · 시설 재료 넷)
    const SAMPLE = ['oyster', 'seaweed', 'abalone', 'brine', 'item_salt_kiln',
                    'wood', 'stone', 'meteoric_iron', 'plank'];
    const ko = await page.evaluate((ks) => ks.map((k) => [k, itemKo(k)]), SAMPLE);
    for (const [k, v] of ko) ok(v !== k && /[가-힣]/.test(v), `★⑩ \`${k}\` 가 한글로 뜬다`, v);
    // ★자명 통과 금지 — 서버가 모르는 키는 **그대로 남아야** 한다(모든 것을 한글로 만드는 함수가 아니다)
    const bogus = await page.evaluate(() => itemKo('__t55_no_such_item__'));
    ok(bogus === '__t55_no_such_item__', '★⑩ 자명 통과 금지 — 모르는 키는 그대로 돌아온다(무조건 한글이 아니다)', bogus);
    // ★그리고 **화면에** 실제로 그렇게 뜬다(함수만 고치고 자리를 안 고쳤을 수 있다 — DOM 을 읽는다)
    await give({ items: { oyster: 3, brine: 2 } });   // ★`__e2e_give` 의 인벤 필드는 `items` 다
    await page.evaluate(() => { if (!invOpen) toggleInv(); });
    await sleep(600);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.inv-col tr.ul-row')]
      .map((tr) => ({ item: tr.dataset.item, text: (tr.textContent || '').trim() })));
    const oy = rows.find((r) => r.item === 'oyster'), br = rows.find((r) => r.item === 'brine');
    ok(!!oy, '★⑩ (상황) 인벤에 굴 행이 있다', oy && oy.text.slice(0, 40));
    ok(!!oy && /굴/.test(oy.text) && !/oyster/.test(oy.text), '★★⑩ **인벤 행이 `굴` 이라고 적혀 있다**(영문 키가 아니다)', oy && oy.text.slice(0, 40));
    ok(!!br && !/brine/.test(br.text), '★★⑩ 짠물 행도 영문 키가 아니다', br && br.text.slice(0, 40));
    await snap('t55-itemlabel');
  }

  // ── ⑨ 자산·콘솔 위생 ─────────────────────────────────────────────────────
  console.log('\n⑨ 위생');
  const realErrs = errs.filter((e) => !/favicon|WebSocket is closed|Failed to fetch|404/i.test(e));
  ok(realErrs.length === 0, '★⑨ 페이지 오류 없음', realErrs.slice(0, 3).join(' | '));
  const miss = [...new Set(missing)].filter((u) => !/favicon/.test(u));
  ok(miss.length === 0, '★⑨ 자산 404 없음', miss.slice(0, 5).join(' · '));

  console.log(`\n  스크린샷 ${shots.length}장 → ${SHOTS}`);
  console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
  await browser.close();
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('하네스 크래시:', e); shutdown(); process.exit(1); });
