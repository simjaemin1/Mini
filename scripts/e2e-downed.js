#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-downed.js — 쓰러지고, 업히고, 죽고, 짐 찾으러 간다 (실클라 둘) ===
//
// ★★[재민 확정 2026-09-02 · T43 · §12] `test-downed` 는 **규약이 맞는가**를 잰다.
//   이 레포가 배치 5 에서 배운 것은 계약도 역학도 멀쩡한데 **화면에 도달하지 못하는 층**이
//   하나 더 있다는 것이다 — 그때 잡힌 게 "플레이어가 노를 지을 방법이 없다"였다.
//   구조는 **두 사람이 하는 일**이라 그 층이 특히 두껍다: R 키가 낯선 이에게도 걸리는가,
//   업고 걸으면 정말 따라오는가, 죽은 자리에 짐이 남아 **주울 수 있는가**.
//
// 시나리오 둘 — §12 그대로:
//   ⓐ **A 가 쓰러지고 B 가 업어 옮긴다** → 산다(붙들기 N초).
//   ⓑ **방치한다** → 창 소진 → 사망 → 짐꾸러미 → **A 가 걸어가 되찾는다**.
//
// 실행: node scripts/e2e-downed.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-downed-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-downed-central-${process.pid}.db`, ZDB = `/tmp/e2e-downed-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 600) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 쓰러짐·구조·사망 — 실클라 둘 (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',
    // ★시간 손잡이만 줄인다 — 사슬(창→사망→깨어남)은 그대로다.
    // ★창은 **관찰 가능한 만큼** 열어 둔다. 8초로 조였더니 ⓐ 가 통째로 헛것이 됐다 —
    //   패널 감지(폴링) + B 워프에만 10초 넘게 드니 B 가 닿기 전에 창이 지나 A 가 죽고,
    //   그 죽음의 깨어남을 하네스가 "구조 성공"으로 읽었다(족보 ㊻ 자명 통과).
    //   창(60초)·붙들기(20초)는 사슬을 바꾸지 않는다 — 규약은 `test-downed` 가 잰다.
    DOWN_RESCUE_WINDOW_MS: '60000', DOWN_RESCUE_HOLD_MS: '20000', DOWN_WAKE_GAMEMIN: '3',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(6000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const allErrs = [];
  async function newClient(tag) {
    // ★각자 **다른 신원**이어야 한다 — 같은 컨텍스트를 쓰면 게스트 토큰을 공유해 한 몸이 된다.
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => allErrs.push(`[${tag}] ` + String(e.message).slice(0, 160)));
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const enter = await page.$('button:has-text("월드 입장")');
    if (enter) await enter.click();
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__inWorld && window.__inWorld()))); i++) await sleep(500);
    await sleep(1800);
    return page;
  }
  const A = await newClient('A');
  const Bp = await newClient('B');
  ok(await A.evaluate(() => !!(window.__inWorld && window.__inWorld())), '[A] 존 입장');
  ok(await Bp.evaluate(() => !!(window.__inWorld && window.__inWorld())), '[B] 존 입장');

  const snap = async (n) => { await A.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const hpOf = (pg) => pg.evaluate(() => {
    const el = document.getElementById('hpText');
    const m = el ? String(el.textContent).match(/(\d+)\s*\/\s*(\d+)/) : null;
    return m ? +m[1] : null;
  });
  const downPanelOpen = (pg) => pg.evaluate(() => {
    const el = document.getElementById('downPanel');
    return !!(el && !el.classList.contains('hidden'));
  });
  // ★★두 좌표계가 있다 — 클라 훅은 **월드 절대**(`abs = zone.worldOffsetX + local`)를 답하고,
  //   `teleport_debug` 는 **존 로컬**을 받는다(hanbando 오프셋 409984,49984).
  //   초안은 abs 를 그대로 워프에 먹여 존 오른쪽 끝(local 70015)에 A 를 처박았다 —
  //   그러고도 "야생을 찾았다"고 답했다. **좌표계는 하네스가 정하지 않는다. 게임이 정한다.**
  //   ⇒ 오프셋을 지어내지 않고, 서버가 텔레포트 공지에 실어 보내는 **로컬 좌표**와
  //     같은 순간의 abs 를 짝지어 **실측**한다.
  let OFF = { x: 0, y: 0 };
  const rawAbs = (pg) => pg.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs()));
  const absOf = async (pg) => { const a = await rawAbs(pg); return a ? { x: a.x - OFF.x, y: a.y - OFF.y } : a; };
  const pidOf = (pg) => pg.evaluate(() => window.__myPid || null);
  const warp = async (pg, x, y, tries) => {
    for (let i = 0; i < (tries || 12); i++) {
      await pg.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: (a | 0), y: (b | 0) }), [Math.round(x), Math.round(y)]);
      await sleep(1000);
      const p = await absOf(pg);
      if (p && Math.hypot(p.x - x, p.y - y) < 600) return p;
    }
    return await absOf(pg);
  };
  // ★못 간 이유는 **게임이 말해 준다**(`teleport_debug` 는 도착·거절을 공지로 답한다).
  //   추측으로 좌표를 흔드는 대신 그 공지를 찍는다.
  const warpWhy = async (pg) => (await pg.evaluate(
    () => (window.__notices || []).filter((t) => /텔레포트|강·바다/.test(t)).slice(-2)));
  const notices = (pg) => pg.evaluate(() => (window.__notices || []).slice(-6));
  const clearNotices = (pg) => pg.evaluate(() => { window.__notices = []; });

  // ★야생 자리를 **서버가 답하는 값**으로 찾는다(마을 완충 0)
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  // ★시딩은 기동 직후 **몇 초 걸린다** — 한 번 찍고 0 이면 "마을 없는 세계"라고 답하는 건 계측기 잘못이다.
  let rows = [];
  for (let i = 0; i < 60; i++) {
    rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
    if (rows.length) break;
    await sleep(1000);
  }
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`);
  if (!rows.length) { console.log('\n마을 0 — 중단'); await browser.close(); shutdown(); process.exit(1); }
  const V = rows[0], vx = V.cx * 32 + 16, vy = V.cy * 32 + 16;
  {
    await clearNotices(A);
    await A.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [vx, vy]);
    await sleep(1500);
    const nz = (await A.evaluate(() => (window.__notices || []).slice(-8))).filter((t) => /🌀 텔레포트/.test(t));
    const m = nz.length ? String(nz[nz.length - 1]).match(/\((-?\d+),\s*(-?\d+)\)/) : null;
    const a0 = await rawAbs(A);
    if (m && a0) OFF = { x: a0.x - (+m[1]), y: a0.y - (+m[2]) };
    pre(!!m && !!a0, '좌표계를 실측했다(abs − local = 존 오프셋)', `off(${OFF.x},${OFF.y})`);
  }
  //   ★"몇 px 갔다"가 아니라 **"게임이 완충 0 이라고 답한다"** 로 찾는다(`e2e-cold ②` 와 같은 규약).
  //     텔레포트는 막힌 칸에서 clamp 되므로 **거리로 판정하면 자리를 못 찾는다**(초안이 그랬다).
  //     쓸 자리는 "요청한 좌표"가 아니라 **서버가 답한 내 위치**다.
  let wild = null;
  outer:
  for (const r of [4000, 9000, 16000, 30000, 60000]) {
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1]]) {
      const tx = vx + dx * r, ty = vy + dy * r;
      if (tx < 400 || ty < 400) continue;
      await warp(A, tx, ty, 3);
      const w = await A.evaluate(() => (window.__wx ? window.__wx() : null));
      if (w && (w.shelter || 0) < 0.01) { const p = await absOf(A); wild = { x: p.x, y: p.y }; break outer; }
    }
  }
  pre(!!wild, '야생 자리를 찾았다(마을 완충 0)', wild ? `(${Math.round(wild.x)},${Math.round(wild.y)})` : '못 찾음');

  // ═══ ⓐ 시나리오 1 — 쓰러지고, 업히고, 산다 ══════════════════════════════════
  console.log('\n=== ⓐ A 가 쓰러지고 B 가 업어 살린다 ===');
  {
    // ★순서가 규약이다 — **먼저 둘을 나란히 세우고, 그 다음에 쓰러뜨린다.**
    //   쓰러진 뒤에 B 를 부르면 창(수십 초)이 워프 왕복에 다 먹혀 A 가 죽어 버린다.
    const aSpot = await warp(A, wild.x, wild.y, 8);
    const bSpot = await warp(Bp, aSpot.x + 48, aSpot.y, 12);
    const gap0 = Math.hypot(bSpot.x - aSpot.x, bSpot.y - aSpot.y);
    pre(gap0 < 120, 'B 가 A 옆에 섰다(쓰러지기 전)', `${Math.round(gap0)}px · A(${Math.round(aSpot.x)},${Math.round(aSpot.y)}) B(${Math.round(bSpot.x)},${Math.round(bSpot.y)}) · ${JSON.stringify(await warpWhy(Bp))}`);

    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 4, stone: 3 } }));
    await sleep(900);
    // 쓰러뜨린다 — **정본 경로**(굶주림·갈증 극단 → T44 감소 → HP 0 → `player_downed`).
    //   ★픽스처는 **몸 상태만** 세운다 — 쓰러뜨리는 것은 서버의 역학이다.
    //     hp 를 3 으로 낮춰 두는 이유: T44 의 감소율은 고증대로 **느리다**(허기+갈증 합
    //     ≈0.069 HP/실초 — 풀피 100 이면 24분). 하네스가 재는 것은 "얼마나 걸리나"가 아니라
    //     **"극단이 이어지면 정말 쓰러지나"** 라서 상처 입은 몸에서 출발시킨다.
    //     hp 0 은 픽스처로 못 준다(서버가 1 로 clamp 한다) — 마지막 3 은 **서버가 깎는다**.
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 0, thirst: 0, hp: 3, quiet: true }));
    await sleep(1000);
    let downed = false;
    for (let i = 0; i < 180; i++) { await sleep(1000); if (await downPanelOpen(A)) { downed = true; break; } }
    ok(downed, '★★ⓐ 굶어서 **실제로 쓰러진다** — 화면에 쓰러짐 패널이 뜬다(T44 → T43 사슬)');
    await snap('downed-01-fall');

    const ap = await absOf(A), bp = await absOf(Bp);
    pre(Math.hypot(bp.x - ap.x, bp.y - ap.y) < 120, 'B 가 구조 거리 안에 그대로 있다',
      `${Math.round(Math.hypot(bp.x - ap.x, bp.y - ap.y))}px`);
    await clearNotices(Bp);
    await Bp.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'r', bubbles: true }); window.dispatchEvent(e); document.dispatchEvent(e); });
    await sleep(1500);
    const bn = await notices(Bp);
    ok(bn.some((t) => /업었다/.test(t)),
      '★★ⓐ **R 한 번으로 낯선 이를 업는다**(클라 판정에서 길드 제한이 빠졌다)', JSON.stringify(bn.slice(-2)));
    ok(bn.some((t) => /상태 —/.test(t)), '★★ⓐ 그리고 **왜 쓰러졌는지 보인다**(§12 · 새 패널 0)',
      JSON.stringify(bn.filter((t) => /상태 —/.test(t))));

    // 업고 걷는다 — 따라오는가
    const before = await absOf(A);
    await warp(Bp, before.x + 700, before.y + 400, 6);
    await sleep(1500);
    const aAfter = await absOf(A), bAfter = await absOf(Bp);
    ok(Math.hypot(aAfter.x - bAfter.x, aAfter.y - bAfter.y) < 120,
      '★★ⓐ **업고 걸으면 따라온다**', `A(${Math.round(aAfter.x)},${Math.round(aAfter.y)}) ↔ B(${Math.round(bAfter.x)},${Math.round(bAfter.y)})`);
    ok(Math.hypot(aAfter.x - before.x, aAfter.y - before.y) > 200, '★ⓐ 자명 통과 금지 — 실제로 옮겨졌다',
      `${Math.round(Math.hypot(aAfter.x - before.x, aAfter.y - before.y))}px`);

    // 붙들기 N초 → 일어난다
    let up = false;
    for (let i = 0; i < 40; i++) { await sleep(1000); if (!(await downPanelOpen(A))) { up = true; break; } }
    ok(up, '★★ⓐ **N초 붙들면 일어난다** — 쓰러짐 패널이 닫힌다');
    const hpUp = await hpOf(A);
    ok(hpUp !== null && hpUp > 0 && hpUp <= 40, '★★ⓐ 일어난 HP 는 **소폭**이다(§12)', `hp ${hpUp}`);
    // ★★자명 통과 금지 — "일어났다"는 **구조**여야 한다. 죽고 깨어나도 패널은 닫히고 HP 도 소폭이라
    //   앞의 두 줄만으로는 사망과 구조를 구별하지 못한다(초안이 실제로 그렇게 통과했다).
    //   구별선은 **짐**이다: 구조는 짐을 안 건드리고, 야생 사망은 전부 떨군다(§12).
    const aInv = await A.evaluate(() => (window.__getInv ? window.__getInv() : null));
    ok(aInv && (aInv.wood || 0) >= 4 && (aInv.stone || 0) >= 3,
      '★★ⓐ **구조지 사망이 아니다** — 짐이 그대로다(사망이면 전부 떨어진다)',
      aInv ? JSON.stringify({ wood: aInv.wood || 0, stone: aInv.stone || 0 }) : '-');
    await snap('downed-02-rescued');
  }

  // ═══ ⓑ 시나리오 2 — 방치 → 사망 → 짐 찾으러 간다 ════════════════════════════
  console.log('\n=== ⓑ 방치하면 죽고, 짐은 그 자리에 남는다 ===');
  {
    // 야생으로 A 를 옮기고 B 는 멀리 보낸다(아무도 안 구한다)
    const spot = await warp(A, wild.x, wild.y, 10);
    await warp(Bp, wild.x + 4000, wild.y + 4000, 6);
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 6 } }));
    await sleep(900);
    const invBefore = await A.evaluate(() => (window.__getInv ? window.__getInv() : null));
    pre(invBefore && (invBefore.wood || 0) > 0, '죽기 전에 짐이 있다', invBefore ? `wood ${invBefore.wood}` : '-');
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 0, thirst: 0, hp: 3, quiet: true }));
    let downed2 = false;
    for (let i = 0; i < 180; i++) { await sleep(1000); if (await downPanelOpen(A)) { downed2 = true; break; } }
    pre(downed2, '다시 쓰러졌다');
    const deathAt = await absOf(A);

    // 아무도 안 온다 — 창(60초)이 지나면 죽고, 게임 시간 뒤 깨어난다
    let woke = false;
    for (let i = 0; i < 150; i++) { await sleep(1000); if (!(await downPanelOpen(A))) { woke = true; break; } }
    ok(woke, '★★ⓑ 방치하면 창이 지나고 **죽었다가 깨어난다**');
    const wakeAt = await absOf(A);
    ok(Math.hypot(wakeAt.x - deathAt.x, wakeAt.y - deathAt.y) > 200,
      '★★ⓑ 깨어난 자리는 **죽은 자리가 아니다**(옮겨졌다 — 텔레포트가 아니라 "옮겨진 것")',
      `${Math.round(Math.hypot(wakeAt.x - deathAt.x, wakeAt.y - deathAt.y))}px`);
    const invAfter = await A.evaluate(() => (window.__getInv ? window.__getInv() : null));
    ok((invAfter && (invAfter.wood || 0)) === 0, '★★ⓑ **짐은 두고 왔다**', invAfter ? `wood ${invAfter.wood || 0}` : '-');
    const an = await notices(A);
    ok(an.some((t) => /짐은 쓰러진 자리|깨어났다/.test(t)), '★ⓑ 화면이 무슨 일이 났는지 말한다', JSON.stringify(an.slice(-2)));
    await snap('downed-03-dead');

    // ── 짐 회수 원정 — 걸어가서 줍는다 ─────────────────────────────────────
    await warp(A, deathAt.x, deathAt.y, 10);
    await sleep(1500);
    // ★새 클라 훅을 만들지 않았다 — **플레이어가 쓰는 그 화면**(인벤 패널의 '바닥' 칸)을 그대로 읽는다.
    //   그래야 "바닥에 있다"가 아니라 **"화면에 보이고 주울 수 있다"** 를 재게 된다(배치 5 의 교훈).
    await A.evaluate(() => { if (window.openInvWithContainer) window.openInvWithContainer(null); });
    await sleep(1500);
    const rows = await A.evaluate(() => [...document.querySelectorAll('[data-drag]')]
      .map((e) => { try { return JSON.parse(e.dataset.drag); } catch (x) { return null; } })
      .filter((d) => d && d.kind === 'ground'));
    ok(rows.length > 0, '★★ⓑ **죽은 자리의 짐이 화면에 보인다**(인벤 패널 "바닥" 칸)',
      rows.map((r) => `${r.item}×${r.n}`).join(' '));
    await clearNotices(A);
    for (const r of rows) {
      await A.evaluate((ids) => window.__sendPrimary({ type: 'pickup_item', giIds: ids }), (r.giIds || []).slice(0, 64));
      await sleep(600);
    }
    await sleep(1200);
    const invBack = await A.evaluate(() => (window.__getInv ? window.__getInv() : null));
    ok(invBack && (invBack.wood || 0) > 0,
      '★★ⓑ **죽은 자리로 돌아가면 짐이 그대로 있다 — 주울 수 있다**(디스폰 금지 · §12)',
      `wood ${invBack && invBack.wood}`);
    await snap('downed-04-recovered');
  }

  // ═══ ⓒ 로그아웃 ≠ 부활 ══════════════════════════════════════════════════════
  console.log('\n=== ⓒ 로그아웃이 부활이 아니다 ===');
  {
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 0, thirst: 0, hp: 3, quiet: true }));
    let d3 = false;
    for (let i = 0; i < 180; i++) { await sleep(1000); if (await downPanelOpen(A)) { d3 = true; break; } }
    pre(d3, '쓰러진 채다');
    await A.reload({ waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const enter = await A.$('button:has-text("월드 입장")');
    if (enter) await enter.click();
    for (let i = 0; i < 60 && !(await A.evaluate(() => !!(window.__inWorld && window.__inWorld()))); i++) await sleep(500);
    await sleep(2500);
    const hpBack = await hpOf(A);
    ok(hpBack !== null && hpBack < 100,
      '★★ⓒ **다시 들어와도 풀피가 아니다** — 로그아웃으로 도망칠 수 없다(§12 · 종전엔 공짜 풀피였다)',
      `hp ${hpBack}`);
    // ★★몸만 이어지고 **화면이 모르면** 그건 "못 움직이는데 멀쩡해 보이는" 상태다(배치 5 의 그 층).
    ok(await downPanelOpen(A), '★★ⓒ 그리고 **화면도 안다** — 다시 들어와도 쓰러짐 패널이 떠 있다');
    await snap('downed-05-relogin');
  }

  ok(allErrs.length === 0, '★ 페이지 에러 0', allErrs.slice(0, 3).join(' | ') || '없음');
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  console.log(`    스크린샷: ${SHOTS}`);
  await browser.close();
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
