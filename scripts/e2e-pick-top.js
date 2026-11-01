#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 세 밤 분할(T238) · 넣을 때 A 22 · B 23 · C 26 — 적은 쪽(넣은 뒤 A 23 · 실서버 판 하나 · 실클라 셋 · 판당 2 ~ 3분 · 단위가 아니다)
// === scripts/e2e-pick-top.js — T1059 겹친 두 사람 위 누름 → 그림에서 위에 그려진 사람 (실클라 셋) ==========
//
// ★왜 [PM 판정 2026-11-01 = 제품 결함 · 보고/T1035 회부 1]
//   우클릭은 `pickAt`(46-h-verbs)이 낸 사람의 메뉴를 연다. 종전 사람 층은 `others` 차례로 ±18 상자 안 **첫** 사람을 냈다 —
//   사람이 겹친 자리에서 누른(위에 그려진) 사람이 아니라 명부 앞쪽 사람에게 동사가 갔다.
//   고침(손잡이 `T1059_PICK_TOP` · 켬 기본 후보): 상자(±18 · 명부 자리 — 종전 그대로) 안 사람 중 그 프레임 렌더 정렬 키가 가장 큰(위에 그려진) 사람.
//
// ★이 하네스가 재는 것 — 진짜 Chromium 셋(R 누르는 사람 · 쓰러진 둘 X · Y)으로 **누름 → 먹이기 → 누가 먹었나**:
//   ① 자리 — 쓰러진 둘을 겹쳐 눕힌다: R 명부 차례 **뒤** 사람을 앞 사람 위(남동 12px — 아이소에서 아래 = 위에 그려진다)에 둔다
//   ② 전제 — R 의 화면이 둘 다 **그렸고**(렌더 목록 `_lastPeopleDrawn` · 위 사람 z 가 크다) · 둘 다 누를 점의 상자(±18 · 명부 자리) 안 · 위 사람 ≠ 명부 첫 사람
//   ③ 켬 — 그 점 우클릭 → 먹이기 → 고기 → **위에 그려진 사람**이 먹는다(명부 첫 사람은 안 먹는다)
//   ④ 끔(같은 판 · R 의 `uiCfg.pickTop` 을 걷는다 = `T1059_PICK_TOP=0` 의 welcome) — 같은 점 · 같은 동사 → **명부 첫 사람**이 먹는다(종전)
// ★자명 통과 금지: ② 가 서야 ③④ 가 뜻이 있다 — 위 사람과 첫 사람이 같으면(재접속으로 차례가 뒤집혔다) 다시 눕혀 세운다.
//   ③④ 의 반대쪽("안 먹었다")이 같이 서야 초록이다(둘 다 먹으면 지목이 아니라 근처 먹이기다).
//
// 실행: node scripts/e2e-pick-top.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');            // ★T349 기동 기다리기 정본
const FixClock = require('./fixture-clock.js');  // ★[T214] 입장 기다리기 정본

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-pick-top-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-pick-top-central-${process.pid}.db`, ZDB = `/tmp/e2e-pick-top-zone-${process.pid}.db`;
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

const HALF = 18;   // 제품 `PICK_PLAYER_HALF`(46-h-verbs) — 상자 전제를 세울 때만 쓴다(test-t1059-pick-top ③ 이 제품 글자와 같은지 잰다)

(async () => {
  console.log('\n=== 겹친 두 사람 위 누름 → 위에 그려진 사람 (실클라 셋 · T1059) ===');
  const _central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });   // ★듣기는 띄운 그 틱에(T349)
  const _zone = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',
    // 창은 넉넉히 · 깨어남은 멀리 — 둘이 **동시에 쓰러져 있는 동안** 두 번 누른다(e2e-verbs 와 같은 규약 · 이 하네스는 창 길이를 안 잰다)
    DOWN_RESCUE_WINDOW_MS: '600000', DOWN_RESCUE_HOLD_MS: '600000', DOWN_WAKE_GAMEMIN: '600',
  });
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const _up = await _upP;
  ok(_up.ok, 'central 기동', _up.ok ? `${_up.ms}ms` : _up.why);
  ok(await (await _zp).ok, 'zone 기동');
  await sleep(6000);

  const browser = await require('./e2e-browser').launch({ headless: !HEADED });
  const allErrs = [];
  async function newClient(tag) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => allErrs.push(`[${tag}] ` + String(e.message).slice(0, 160)));
    for (let round = 0; round < 4; round++) {
      await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
      await sleep(1200);
      for (let i = 0; i < 40; i++) {
        const n = await page.evaluate(() => { const s = document.getElementById('startZone'); return s ? s.options.length : 0; });
        if (n > 0) break;
        await sleep(500);
      }
      const enter = await page.$('#enter');
      if (enter) await enter.click();
      if ((await FixClock.waitInWorld(page)).ok) { await sleep(1800); return page; }
      console.log(`  · [상황] [${tag}] 입장이 늦다 — 판을 새로 깔고 다시 든다(시도 ${round + 1})`);
    }
    return page;
  }
  const R = await newClient('R');   // 누르는 사람
  const X = await newClient('X');   // 쓰러질 사람 하나
  const Y = await newClient('Y');   // 쓰러질 사람 둘
  const inWorld = async (pg, secs) => (await FixClock.waitInWorld(pg, { timeoutMs: (secs || 90) * 1000 })).ok;
  ok(await inWorld(R, 180), '[R] 존 입장');
  ok(await inWorld(X, 180), '[X] 존 입장');
  ok(await inWorld(Y, 180), '[Y] 존 입장');

  const snap = async (n) => { await R.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const notices = (pg) => pg.evaluate(() => (window.__notices || []).slice(-40));
  const clearNotices = (pg) => pg.evaluate(() => { window.__notices = []; });
  const rawAbs = (pg) => pg.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs()));
  const pidOf = (pg) => pg.evaluate(() => (typeof myPid !== 'undefined' ? myPid : null));
  const bodyOf = (pg) => pg.evaluate(() => (window.__bodyState || null));
  const downPanelOpen = (pg) => pg.evaluate(() => { const el = document.getElementById('downPanel'); return !!(el && !el.classList.contains('hidden')); });
  let OFF = { x: 0, y: 0 };   // 훅은 월드 절대 · `teleport_debug` 는 존 로컬 — 오프셋은 한 번 실측해서 뺀다(e2e-verbs 규약)
  const absOf = async (pg) => { const a = await rawAbs(pg); return a ? { x: a.x - OFF.x, y: a.y - OFF.y } : a; };
  const warp = async (pg, x, y, tries, tol) => {
    const T = tol || 24;
    for (let i = 0; i < (tries || 15); i++) {
      await pg.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: (a | 0), y: (b | 0) }), [Math.round(x), Math.round(y)]);
      await sleep(900);
      const p = await absOf(pg);
      if (p && Math.hypot(p.x - x, p.y - y) <= T) return p;
    }
    return await absOf(pg);
  };

  // ── 좌표계 · 야생 자리(마을 완충 0) — e2e-verbs 와 같은 규약으로 게임에 묻는다 ─────────────
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 180; i++) {
    rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
    if (rows.length) break;
    await sleep(1000);
  }
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`);
  if (!rows.length) {
    console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
    await browser.close(); shutdown(); process.exit(1);
  }
  const V0 = rows[0], vx = V0.cx * 32 + 16, vy = V0.cy * 32 + 16;
  {
    await clearNotices(R);
    await R.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [vx, vy]);
    let m = null, a0 = null;
    for (let i = 0; i < 15 && !a0; i++) {
      await sleep(i ? 900 : 1500);
      if (m) { a0 = await rawAbs(R); break; }
      const nz = (await R.evaluate(() => (window.__notices || []).slice(-8))).filter((t) => /텔레포트/.test(t));
      m = nz.length ? String(nz[nz.length - 1]).match(/\((-?\d+),\s*(-?\d+)\)/) : null;
    }
    if (m && a0) OFF = { x: a0.x - (+m[1]), y: a0.y - (+m[2]) };
    pre(!!m && !!a0, '좌표계를 실측했다(abs − local = 존 오프셋)', `off(${OFF.x},${OFF.y})`);
  }
  const farFromVillages = (x, y) => rows.every((v) => Math.hypot(v.cx * 32 + 16 - x, v.cy * 32 + 16 - y) > 2600);
  let wild = null;
  outer:
  for (const r of [4000, 9000, 16000, 30000, 60000]) {
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1]]) {
      const tx = vx + dx * r, ty = vy + dy * r;
      if (tx < 400 || ty < 400) continue;
      await warp(R, tx, ty, 3, 400);
      const w = await R.evaluate(() => (window.__wx ? window.__wx() : null));
      if (!w || (w.shelter || 0) >= 0.01) continue;
      const p = await absOf(R);
      if (!farFromVillages(p.x, p.y)) continue;
      wild = { x: p.x, y: p.y }; break outer;
    }
  }
  pre(!!wild, '야생 자리를 게임에 물어 찾았다(마을 완충 0)', wild ? `(${Math.round(wild.x)},${Math.round(wild.y)})` : '못 찾음');

  // ── ① 자리 — 둘을 눕힌다(e2e-verbs ① 과 같은 몸 픽스처 · 쓰러뜨리는 것은 서버 역학) ───────────
  console.log('\n① 자리 — 쓰러진 둘을 R 곁에 겹쳐 눕힌다');
  const rSpot = await warp(R, wild.x, wild.y, 10, 40);
  await warp(X, rSpot.x + 64, rSpot.y, 8, 14);
  await warp(Y, rSpot.x + 76, rSpot.y + 12, 8, 14);
  const hpOf = (pg) => pg.evaluate(() => { const el = document.getElementById('hpText'); const m = el ? String(el.textContent).match(/(\d+)\s*\/\s*(\d+)/) : null; return m ? +m[1] : null; });
  const starve = async (pg) => {
    const hp = await hpOf(pg);
    return pg.evaluate((l) => window.__sendPrimary(l ? { type: '__e2e_body', hunger: 0, thirst: 0, quiet: true } : { type: '__e2e_body', hunger: 0, thirst: 0, hp: 3, quiet: true }), hp != null && hp <= 20);
  };
  let bothDown = false;
  for (let i = 0; i < 240; i++) {
    if (i % 20 === 0) { for (const pg of [X, Y]) await starve(pg); }
    await sleep(1000);
    if (await downPanelOpen(X) && await downPanelOpen(Y)) { bothDown = true; break; }
  }
  ok(bothDown, '★① 둘 다 실제로 쓰러졌다(정본 경로 — 픽스처는 몸만 세운다)');
  await R.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { meat_cooked: 4 } }));
  for (let t0 = Date.now(); Date.now() - t0 < 15000; await sleep(300)) {
    if (await R.evaluate(() => ((typeof inventory !== 'undefined' && inventory && inventory.meat_cooked) || 0) >= 2)) break;
  }
  const xPid = await pidOf(X), yPid = await pidOf(Y);
  pre(!!xPid && !!yPid && xPid !== yPid, '두 사람의 pid 가 갈린다', `${xPid} / ${yPid}`);

  // R 의 화면 — 명부 차례 · 명부 자리(상자를 재는 자리) · 그린 목록(렌더가 그 프레임에 그린 사람 · z = 그리는 차례 키) · 쓰러짐
  const view = () => R.evaluate(([px, py]) => {
    const ord = [], raw = {};
    for (const c of conns.values()) if (c.others) for (const o of c.others.values()) if (o.pid === px || o.pid === py) {
      ord.push(o.pid); raw[o.pid] = { x: ((c.meta && c.meta.worldOffsetX) || 0) + o.x, y: ((c.meta && c.meta.worldOffsetY) || 0) + o.y };
    }
    const dr = (typeof _lastPeopleDrawn !== 'undefined' && _lastPeopleDrawn) ? _lastPeopleDrawn.filter((r) => r.pid === px || r.pid === py).map((r) => ({ pid: r.pid, x: r.wx, y: r.wy, z: r.z })) : null;
    return { ord, raw, dr, down: [!!downStates.get(px), !!downStates.get(py)], pickTop: !!(uiCfg && uiCfg.pickTop === true) };
  }, [xPid, yPid]);
  const pgOf = (pid) => (pid === xPid ? X : Y);
  // ★자리를 **R 의 명부 차례로** 짓는다 — 차례 뒤 사람을 앞 사람의 남동 12px(아이소 화면 아래 = 위에 그려진다)에 눕힌다.
  //   재접속으로 차례가 뒤집히면(새 pid 가 뒤로 붙는다) 다시 짓는다 — 위 사람 ≠ 첫 사람이어야 켬 · 끔이 갈린다(자명 통과 금지).
  const arrange = async () => {
    let v = null;
    for (let k = 0; k < 4; k++) {
      v = await view();
      if (v.ord.length !== 2) { await sleep(1000); continue; }
      const [first, second] = v.ord;
      const f = await absOf(pgOf(first));
      await warp(pgOf(second), f.x + 12, f.y + 12, 8, 6);
      for (let t0 = Date.now(); Date.now() - t0 < 8000; await sleep(300)) {
        v = await view();
        if (v.dr && v.dr.length === 2 && v.ord.length === 2) {
          const da = v.dr.find((r) => r.pid === v.ord[0]), db = v.dr.find((r) => r.pid === v.ord[1]);
          const a = v.raw[v.ord[0]], b = v.raw[v.ord[1]];   // 상자는 명부 자리로 잰다(제품 상자 그대로) · 누가 위인가는 그린 목록의 z
          if (da && db && a && b && db.z > da.z && Math.abs(b.x - a.x) <= 2 * HALF - 4 && Math.abs(b.y - a.y) <= 2 * HALF - 4) return { v, first: v.ord[0], top: v.ord[1], a, b };
        }
      }
    }
    return { v, first: null, top: null };
  };
  const pointOf = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const clientPtAbs = (wx, wy) => R.evaluate(([x, y]) => {
    const s = window.__w2s(x, y), cv = document.getElementById('canvas'), r = cv.getBoundingClientRect();
    return { x: r.left + s.px * (r.width / cv.width), y: r.top + s.py * (r.height / cv.height) };
  }, [wx, wy]);
  const rightTap = async (pt) => { await R.mouse.move(pt.x, pt.y); await R.mouse.down({ button: 'right' }); await R.mouse.up({ button: 'right' }); };
  const menuLabels = () => R.evaluate(() => {
    const m = document.getElementById('ctxMenu'); if (!m) return null;
    const l = [...m.children].map((el) => (el.textContent || '').trim());
    if (l.includes('걷기') && l.includes('살피기') && l.every((x) => /^(걷기|살피기|심기 — )/.test(x))) { if (typeof hideContextMenu === 'function') hideContextMenu(); return null; }   // 땅 메뉴 = 못 짚었다
    return l;
  });
  const menuWithin = async (ms) => { for (let i = 0; i < Math.ceil((ms || 3000) / 100); i++) { const l = await menuLabels(); if (l) return l; await sleep(100); } return null; };
  // 탭이 탭으로 읽힐 때까지 누른다(e2e-verbs T214 규약 — 2코어에 실클라 셋이면 옳은 탭이 홀드로 읽히는 판이 있다 · 상한은 안전망)
  const tapUntilMenu = async (pt, capMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (capMs || 30000)) {
      await rightTap(pt);
      const l = await menuWithin(2000);
      if (l) return l;
      await sleep(200);
    }
    return null;
  };
  // 그 점을 누르고 먹이기 → 고기 → 두 몸의 허기 오름을 잰다(서버가 먹였다고 답할 때까지 기다린다 · 상한 15초)
  const pressFeed = async (pt, tag) => {
    const h0 = { [xPid]: ((await bodyOf(X)) || {}).hunger, [yPid]: ((await bodyOf(Y)) || {}).hunger };
    await clearNotices(R);
    const labels = await tapUntilMenu(await clientPtAbs(pt.x, pt.y));
    const fi = (labels || []).findIndex((t) => /먹이기/.test(t));
    if (fi >= 0) await R.evaluate((i) => { const m = document.getElementById('ctxMenu'); if (m && m.children[i]) m.children[i].click(); }, fi);
    const sub = fi >= 0 ? await menuWithin(3000) : null;
    if (sub && sub.length) await R.evaluate(() => { const m = document.getElementById('ctxMenu'); if (m && m.children[0]) m.children[0].click(); });
    for (let t0 = Date.now(); Date.now() - t0 < 15000; await sleep(300)) {
      if ((await notices(R)).some((t) => /먹였다/.test(t))) break;
    }
    await sleep(800);
    const h1 = { [xPid]: ((await bodyOf(X)) || {}).hunger, [yPid]: ((await bodyOf(Y)) || {}).hunger };
    const up = (pid) => (h0[pid] != null && h1[pid] != null) ? h1[pid] - h0[pid] : 0;
    const fed = (await notices(R)).some((t) => /먹였다/.test(t));
    console.log(`  · [상황] ${tag} 누름 — 메뉴 ${JSON.stringify(labels)} · 하위 ${JSON.stringify(sub)} · 먹였다 ${fed} · 허기 ${xPid} +${up(xPid).toFixed(1)} · ${yPid} +${up(yPid).toFixed(1)}`);
    return { labels, sub, fed, up };
  };

  // ── ② 전제 — R 이 둘 다 그렸고 · 둘 다 상자 안 · 위 사람 ≠ 첫 사람 ────────────────────────
  console.log('\n② 전제 — R 의 화면');
  let S = await arrange();
  const v0 = S.v || {};
  pre(v0.pickTop === true, 'R 의 welcome 에 손잡이가 실렸다(`uiCfg.pickTop` · 켬 기본 후보)', JSON.stringify(v0.pickTop));
  pre(!!(v0.down && v0.down[0] && v0.down[1]), 'R 의 화면이 둘 다 쓰러진 것으로 본다', JSON.stringify(v0.down));
  let P = S.a && S.b ? pointOf(S.a, S.b) : null;
  const inBox = (r) => !!P && Math.abs(r.x - P.x) <= HALF && Math.abs(r.y - P.y) <= HALF;
  pre(!!S.top && S.top !== S.first && inBox(S.a) && inBox(S.b),
      '★둘 다 **그렸고**(렌더 목록 · 위 사람 z 가 크다) · 둘 다 누를 점의 상자(±18 · 명부 자리) 안 · 위에 그려진 사람 ≠ 명부 첫 사람',
      JSON.stringify({ ord: v0.ord, dr: v0.dr, P: P && [Math.round(P.x), Math.round(P.y)] }));
  await snap('pick-top-01-overlap');

  // ── ③ 켬 — 위에 그려진 사람이 먹는다 ───────────────────────────────────────────────
  console.log('\n③ 켬 — 겹친 두 사람 위 누름 → 먹이기 → 위에 그려진 사람이 먹는다');
  if (P) {
    const r = await pressFeed(P, '켬');
    ok(!!r.labels && r.labels.some((t) => /먹이기/.test(t)) && !!r.sub && r.sub.length > 0 && r.fed, '★③ 메뉴(먹이기) · 하위 목록 · 서버가 먹였다고 답했다', JSON.stringify(r.labels));
    ok(r.up(S.top) > 1, `★★③ **위에 그려진 사람(${S.top})이 먹었다**`, `+${r.up(S.top).toFixed(1)}`);
    ok(r.up(S.first) <= 1, `★★③ 명부 첫 사람(${S.first})은 안 먹었다(종전이면 이 사람이 먹는다)`, `+${r.up(S.first).toFixed(1)}`);
  } else ok(false, '★③ 누를 자리를 못 세웠다 — 위 전제가 빨갛다');
  await snap('pick-top-02-on');

  // ── ④ 끔 — 같은 판에서 R 의 손잡이를 걷는다(welcome 에 `pickTop` 이 없는 것과 같다) ────────────
  console.log('\n④ 끔 — 손잡이를 걷으면 종전 그대로 명부 첫 사람');
  S = await arrange();   // 재접속으로 차례가 바뀌었으면 다시 짓는다(위 사람 ≠ 첫 사람)
  P = S.a && S.b ? pointOf(S.a, S.b) : null;
  pre(!!S.top && S.top !== S.first && !!P && inBox(S.a) && inBox(S.b), '끔 판 전제 — 같은 꼴(둘 다 상자 안 · 위 ≠ 첫)', JSON.stringify({ ord: S.v && S.v.ord }));
  await R.evaluate(() => { uiCfg.pickTop = false; });
  if (P) {
    const r = await pressFeed(P, '끔');
    const stillOff = await R.evaluate(() => uiCfg.pickTop !== true);
    pre(stillOff, '누르는 동안 손잡이가 꺼진 채였다(재접속 welcome 이 되켜지 않았다)');
    ok(!!r.labels && r.labels.some((t) => /먹이기/.test(t)) && r.fed, '④ 메뉴(먹이기) · 서버가 먹였다고 답했다', JSON.stringify(r.labels));
    ok(r.up(S.first) > 1, `★★④ 끔 — **명부 첫 사람(${S.first})이 먹었다**(종전 · 보고/T1035 의 그 결함)`, `+${r.up(S.first).toFixed(1)}`);
    ok(r.up(S.top) <= 1, `★④ 끔 — 위에 그려진 사람(${S.top})은 안 먹었다`, `+${r.up(S.top).toFixed(1)}`);
  } else ok(false, '★④ 누를 자리를 못 세웠다 — 위 전제가 빨갛다');
  await R.evaluate(() => { uiCfg.pickTop = true; });
  await snap('pick-top-03-off');

  ok(allErrs.length === 0, '페이지 오류 0', JSON.stringify(allErrs.slice(0, 3)));
  console.log(`\n  스크린샷: ${fs.readdirSync(SHOTS).map((f) => path.join(SHOTS, f)).join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  try { db.close(); } catch (e) {}
  await browser.close(); shutdown(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ 하네스 예외: ' + (e && e.stack || e)); console.log(`\n=== ${pass + fail + 1}건 중 PASS ${pass} · FAIL ${fail + 1} ===`); shutdown(); process.exit(1); });
