#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly B
// === scripts/e2e-respawn-choice.js — 쓰러짐 패널의 "(x, y)에서 부활" 을 **눌러서** 깨어나는가 (실클라 하나) ===
//
// ★★[T563 · 재민 실기 09-30 · 라이브] "사망 뒤 (x, y)에서 부활 을 눌러도 부활이 안 된다."
//   `e2e-downed` 는 구조(업기)·방치(창 소진)를 잰다 — **버튼을 누르는 길**은 한 번도 안 눌렀다.
//   이 하네스는 그 길 하나를 실클라로 잰다: 패널이 뜬다 → 화면의 버튼을 **DOM 클릭** → 서버가
//   `respawn_choice` 를 받는다 → `player_respawn` 이 오고 패널이 닫히고 몸이 그 자리로 간다.
//
// 판 셋:
//   ⓐ **한 번 누르고 기다린다** — 깨어나는가 · 몇 초 뒤인가(서버가 말한 초와 같은가) · 그동안 화면이 무엇을 말하나
//   ⓑ **두 번 누른다**(기다리다 다시 누르는 사람) — 두 번째 누름이 시계를 되감거나 짐을 한 번 더 떨구면 안 된다
//   ⓒ **누른 뒤의 패널** — 버튼이 그대로 살아 있으면 사람은 또 누른다(ⓑ 의 입구) · 기다림을 말해야 한다
//   ⓓ **누른 뒤 다시 붙는다**(새로고침) — 정해진 깨어남이 몸을 따라와야 한다(다시 죽으면 ⓑ 와 같은 구멍)
//
// 시계: 기본은 깨어남 기본값을 줄인다(`DOWN_WAKE_GAMEMIN=20` · 창 60초) — 사슬(선택 → 사망 → 깨어남)과
//   거리 항(`_wakeDelayMs` = 기본 + 거리 ÷ 이속)은 그대로다. `--live` 면 **라이브 시계 그대로**(120 게임분 = 2분 + 거리).
// 실행: node scripts/e2e-respawn-choice.js [--live] [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');

const ROOT = path.join(__dirname, '..');
const HEADED = process.argv.includes('--headed');
const LIVE = process.argv.includes('--live');
const ONLY_D = process.argv.includes('--only-d');   // 디버그 — ⓓ 만
const CPORT = 3010, ZPORT = 3020;   // ★central 이 아는 존 자리(zone-config) — 다른 자리면 로비가 존을 못 봐 입장 버튼이 안 켜진다
const CDB = `/tmp/e2e-respawn-central-${process.pid}.db`, ZDB = `/tmp/e2e-respawn-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

(async () => {
  console.log(`\n=== 쓰러짐 패널의 부활 버튼 — 실클라 하나 (${LIVE ? '라이브 시계' : '줄인 시계'}) ===`);
  const _central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const zenv = { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    DOWN_RESCUE_WINDOW_MS: '60000' };
  if (!LIVE) zenv.DOWN_WAKE_GAMEMIN = '20';
  const _zone = boot('zone', 'zone.js', zenv);
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await _upP).ok, 'central 기동');
  ok((await _zp).ok, 'zone 기동');
  await sleep(4000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const A = await ctx.newPage();
  A.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  //   ★서버에 **무엇이 닿았나**(보낸 것) · **무엇이 왔나**(받은 것)를 소켓에서 직접 센다 — 화면 추측 0
  await A.addInitScript(() => {
    const W = window.WebSocket;
    window.__t563 = { sent: [], got: [], urls: [] };
    window.__t563W = W;
    window.WebSocket = function (u, p) {
      const ws = p ? new W(u, p) : new W(u);
      window.__t563.urls.push(String(u));
      const s = ws.send.bind(ws);
      ws.send = (d) => { try { const m = JSON.parse(d); if (m && m.type !== 'input' && m.type !== 'ping') window.__t563.sent.push([performance.now() | 0, m.type, m.kind || null]); } catch (e) {} return s(d); };
      ws.addEventListener('message', (ev) => { try { const m = JSON.parse(ev.data); if (m && /respawn|down/.test(m.type)) window.__t563.got.push([performance.now() | 0, m.type, m.pid || null, m.isDown === undefined ? null : m.isDown]); } catch (e) {} });
      return ws;
    };
    window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, W);
  });
  await A.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await A.$('#enter'); if (enter) await enter.click();
  await FixClock.waitInWorld(A);
  await sleep(1800);
  ok(await A.evaluate(() => !!(window.__inWorld && window.__inWorld())), '[A] 존 입장');

  const notices = () => A.evaluate(() => (window.__notices || []).slice(-40));
  const clearNotices = () => A.evaluate(() => { window.__notices = []; });
  const panelOpen = () => A.evaluate(() => { const el = document.getElementById('downPanel'); return !!(el && !el.classList.contains('hidden')); });
  const buttons = () => A.evaluate(() => [...document.querySelectorAll('#downOptions button')].map((b) => ({ text: b.textContent.trim(), disabled: !!b.disabled })));
  const panelText = () => A.evaluate(() => { const el = document.getElementById('downPanel'); return el ? el.innerText.replace(/\s+/g, ' ').trim() : ''; });
  const myPid = () => A.evaluate(() => window.__myPid || null);
  const srvAbs = () => A.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs()));
  const warp = async (x, y) => { await A.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a | 0, y: b | 0 }), [Math.round(x), Math.round(y)]); await sleep(1200); };

  //   야생 자리 — 게임이 "완충 0" 이라 답하는 곳(마을 안은 이송 길이라 사망 길을 못 잰다)
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 60; i++) { rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (rows.length) break; await sleep(1000); }
  pre(rows.length > 0, `마을 ${rows.length}곳`);
  const V = rows[0], vx = V.cx * 32 + 16, vy = V.cy * 32 + 16;
  //   ★좌표계 — 서버 로컬 = 월드 절대 − 존 오프셋(정본 `zone-config`). 텔레포트 알림은 좌표를 안 싣는다(초안이 그걸 믿어 0 을 쟀다).
  const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
  const _zc = (ZC.ZONES || ZC).hanbando;
  const OFF = { x: _zc.worldOffsetX || 0, y: _zc.worldOffsetY || 0 };
  pre(OFF.x > 0 || OFF.y > 0, '좌표계(zone-config 오프셋)', `off(${OFF.x},${OFF.y})`);
  const local = async () => { const a = await srvAbs(); return a ? { x: a.x - OFF.x, y: a.y - OFF.y } : null; };
  const farFromVillages = (x, y) => rows.every((v) => Math.hypot(v.cx * 32 + 16 - x, v.cy * 32 + 16 - y) > 2600);
  async function findWild() {
    for (const r of [4000, 9000, 16000]) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1]]) {
      const tx = vx + dx * r, ty = vy + dy * r; if (tx < 400 || ty < 400) continue;
      await warp(tx, ty);
      const w = await A.evaluate(() => (window.__wx ? window.__wx() : null));
      if (!w || (w.shelter || 0) >= 0.01) continue;
      const p = await local(); if (p && farFromVillages(p.x, p.y)) return p;
    }
    return null;
  }
  async function fall() {
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 6, stone: 4, berry: 6 } }));
    await sleep(800);
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 0, thirst: 0, hp: 2, quiet: true }));
    for (let i = 0; i < 240; i++) { await sleep(1000); if (await panelOpen()) return true; }
    return false;
  }
  async function waitWake(capS) {
    const t0 = Date.now();
    for (;;) { if (!(await panelOpen())) return (Date.now() - t0) / 1000; if (Date.now() - t0 > capS * 1000) return null; await sleep(500); }
  }
  const secsIn = (t) => { const m = String(t).match(/(\d+)\s*초/); return m ? +m[1] : null; };

  const wild = await findWild();
  pre(!!wild, '야생 자리(마을 완충 0)', wild ? `(${Math.round(wild.x)},${Math.round(wild.y)})` : '못 찾음');
  //   ★나의 pid — 화면 전역이 아니라 **나에게만 오는** `player_downed` 에서 읽는다(쓰러진 뒤 채운다)
  let pid = await myPid();
  const pidFromGot = async () => { const g = await A.evaluate(() => window.__t563.got.slice()); const d = g.filter((x) => x[1] === 'player_downed'); return d.length ? d[d.length - 1][2] : null; };

  // ═══ ⓐ 한 번 누르고 기다린다 ════════════════════════════════════════════
  console.log('\n=== ⓐ 한 번 누르고 기다린다 ===');
  let aWake = null, aSaid = null, aSpot = null;
  if (!ONLY_D) {
    await warp(wild.x, wild.y);
    ok(await fall(), 'ⓐ 쓰러짐 패널이 뜬다');
    pid = pid || await pidFromGot();
    const bs = await buttons();
    ok(bs.length > 0, 'ⓐ 패널에 부활 버튼이 있다', JSON.stringify(bs.map((b) => b.text)));
    console.log('    패널(누르기 전):', JSON.stringify(await panelText()));
    const m = bs.length ? bs[0].text.match(/\((-?\d+),\s*(-?\d+)\)/) : null;
    aSpot = m ? { x: +m[1], y: +m[2] } : null;
    await clearNotices();
    await A.evaluate(() => { window.__t563.sent.length = 0; window.__t563.got.length = 0; });
    const tClick = Date.now();
    await A.click('#downOptions button');
    await sleep(1500);
    const sent = await A.evaluate(() => window.__t563.sent.slice());
    ok(sent.some((s) => s[1] === 'respawn_choice'), 'ⓐ 클릭이 `respawn_choice` 를 **보낸다**', JSON.stringify(sent));
    const n1 = await notices();
    console.log('    알림(클릭 뒤 1.5초):', JSON.stringify(n1));
    aSaid = n1.map(secsIn).find((x) => x != null) ?? null;
    ok(aSaid != null, 'ⓐ 서버가 **몇 초 뒤 깨어나는지** 말한다', JSON.stringify(n1.slice(-3)));
    const bs2 = await buttons(), pt = await panelText();
    ok(bs2.length === 0 || bs2.every((b) => b.disabled), 'ⓒ 누른 뒤 패널의 버튼이 **더 못 누르게** 된다(기다림을 말한다)', `${JSON.stringify(bs2)} · "${pt.slice(0, 120)}"`);
    const cap = (LIVE ? 900 : 300);
    const w = await waitWake(cap);
    aWake = w == null ? null : +((Date.now() - tClick) / 1000).toFixed(1);
    ok(aWake != null, `ⓐ **깨어난다** — 패널이 닫힌다(상한 ${cap}초)`, aWake == null ? '안 깨어남' : `${aWake}초`);
    const got = await A.evaluate(() => window.__t563.got.slice());
    ok(got.some((g) => g[1] === 'player_respawn' && g[2] === pid), 'ⓐ 서버가 `player_respawn`(나)을 보냈다', JSON.stringify(got.slice(-4)));
    if (aSaid != null && aWake != null) ok(Math.abs(aWake - aSaid) <= 4, 'ⓐ 말한 초와 깨어난 초가 같다(±4초)', `말함 ${aSaid} · 실제 ${aWake}`);
    const at = await local();
    if (aSpot && at) ok(Math.hypot(at.x - aSpot.x, at.y - aSpot.y) < 200, 'ⓐ 몸이 **고른 자리**에 있다(±200px)', `고름 (${aSpot.x},${aSpot.y}) · 지금 (${Math.round(at.x)},${Math.round(at.y)})`);
    console.log('    패널(누른 뒤):', JSON.stringify(pt));
    console.log('    알림(깨어난 뒤):', JSON.stringify((await notices()).slice(-4)));
  }

  // ═══ ⓑ 두 번 누른다 ════════════════════════════════════════════════════
  console.log('\n=== ⓑ 두 번 누른다(기다리다 다시 누르는 사람) ===');
  if (!ONLY_D) {
    await warp(wild.x, wild.y);
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 60, thirst: 60, hp: 80, quiet: true }));
    await sleep(1200);
    ok(await fall(), 'ⓑ 다시 쓰러진다');
    await clearNotices();
    const tClick = Date.now();
    await A.click('#downOptions button');
    await sleep(15000);                                  // ★기다리다 누르는 사람 — 되감김은 두 누름 사이 틈만큼 난다(틈이 짧으면 눈금에 묻힌다)
    const drops1 = (await notices()).filter((t) => /정신을 잃었다/.test(t)).length;
    //   두 번째 누름 — 버튼이 살아 있으면 클릭, 아니면 같은 메시지를 소켓으로(사람이 누를 수 있었던 그 메시지)
    const bs = await buttons();
    if (bs.length && !bs[0].disabled) await A.click('#downOptions button');
    else await A.evaluate(() => window.__sendPrimary({ type: 'respawn_choice', kind: null }));
    await sleep(1500);
    const n2 = await notices();
    const drops2 = n2.filter((t) => /정신을 잃었다/.test(t)).length;
    console.log('    알림(두 번째 누름 뒤):', JSON.stringify(n2.slice(-4)));
    ok(drops2 === drops1 && drops1 === 1, 'ⓑ 두 번째 누름이 **다시 죽이지 않는다**(짐을 두 번 떨구지 않는다)', `정신 잃음 알림 ${drops1} → ${drops2}`);
    const said1 = n2.map(secsIn).filter((x) => x != null);
    const w = await waitWake(LIVE ? 900 : 300);
    const bWake = w == null ? null : +((Date.now() - tClick) / 1000).toFixed(1);
    ok(bWake != null, 'ⓑ 깨어난다', bWake == null ? '안 깨어남' : `${bWake}초`);
    if (aWake != null && bWake != null) ok(bWake <= aWake + 3, 'ⓑ 두 번째 누름이 **시계를 되감지 않는다**(같은 자리 = ⓐ 와 같은 초 · +3초 안 · 되감기면 두 누름 사이 16초만큼 늦다)', `ⓐ ${aWake}초 · ⓑ ${bWake}초 · 말한 초 ${JSON.stringify(said1)}`);
  }

  // ═══ ⓓ 누른 뒤 다시 붙는다(새로고침 · 같은 몸 승계) ═══════════════════════
  //   몸이 존에 서 있는 채 소켓만 바뀌면(`_takeover`) 정해진 깨어남도 따라와야 한다 — 종전엔 `_deadUntil` 이 안 따라와
  //   다음 틱이 창 소진으로 읽고 `resolveDowned` 를 **또** 불렀다(ⓑ 와 같은 구멍의 다른 문).
  console.log('\n=== ⓓ 누른 뒤 다시 붙는다(같은 몸 승계) ===');
  {
    await warp(wild.x, wild.y);
    await A.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 60, thirst: 60, hp: 80, quiet: true }));
    await sleep(1200);
    ok(await fall(), 'ⓓ 다시 쓰러진다');
    await clearNotices();
    const tClick = Date.now();
    await A.click('#downOptions button');
    await sleep(3000);
    const said0 = (await notices()).map(secsIn).find((x) => x != null) ?? null;
    //   ★승계는 **새 소켓이 옛 소켓보다 먼저 닿을 때**의 길이다(`ensurePrimaryConnection` 의 close→connect 경주 · T327).
    //     새로고침은 옛 소켓이 먼저 닫혀 몸이 저장·퇴장한다(재접속 풀피 = 정책 · 이 카드 밖). 그래서 옛 소켓을 **살려 둔 채**
    //     같은 신원 URL 로 소켓 하나를 더 연다 — 서버는 그 몸을 물려받고 옛 소켓에 `kicked` 를 보낸다(사람의 경주와 같은 순서).
    const got2 = await A.evaluate(async () => {
      //   첫 접속(이름·색만)에 서버가 게스트 열쇠를 준다(welcome.guestToken → localStorage) — 그 열쇠를 든 접속이 **같은 사람**이다
      const u0 = new URL(window.__t563.urls.filter((u) => !/observer=1|handoff_token/.test(u)).pop());
      let tok = null; try { tok = localStorage.getItem('durango_guest_token'); } catch (e) {}
      if (tok) u0.searchParams.set('guest_token', tok);
      const url = u0.toString();
      const out = [{ t: 'url', text: window.__t563.urls.map((u) => { try { const x = new URL(u); return x.host + '?' + [...x.searchParams.keys()].join(','); } catch (e) { return '?'; } }).join(' | ') }];
      const ws = new window.__t563W(url);
      window.__t563raw = ws;
      ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.type === 'notice' || /respawn|down|welcome|kicked/.test(m.type)) out.push({ t: m.type, text: m.text || null, pid: m.pid || null, ms: m.wakeInMs == null ? null : m.wakeInMs, isDown: m.isDown }); } catch (e) {} };
      window.__t563rawOut = out;
      const hb = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 3000);
      window.__t563hb = hb;
      await new Promise((r) => setTimeout(r, 5000));
      return out.slice();
    });
    console.log('    소켓들:', (got2.find((m) => m.t === 'url') || {}).text);
    console.log('    새 소켓(승계) 받은 것:', JSON.stringify(got2.filter((m) => m.t !== 'player_down_state').map((m) => m.t === 'notice' ? m.text : m.t + (m.ms != null ? `(${m.ms}ms)` : ''))));
    ok(got2.some((m) => m.t === 'welcome') && got2.some((m) => m.t === 'player_downed'), 'ⓓ 같은 몸을 물려받았다(welcome 뒤 쓰러진 채 `player_downed`)');
    ok(!got2.some((m) => m.t === 'notice' && /정신을 잃었다/.test(m.text || '')), 'ⓓ 물려받아도 **다시 죽지 않는다**(짐을 두 번 떨구지 않는다)');
    const dw = got2.find((m) => m.t === 'down_wake');
    ok(!!dw && said0 != null && dw.ms / 1000 <= said0, 'ⓓ 물려받은 몸도 **남은 초**를 안다(`down_wake` · 처음 말한 초 이하)', `처음 ${said0}초 · 지금 ${dw ? Math.round(dw.ms / 1000) : '—'}초`);
    let dWake = null;
    for (let i = 0; i < (LIVE ? 900 : 300); i++) {
      const o = await A.evaluate(() => window.__t563rawOut.slice());
      if (o.some((m) => m.t === 'player_respawn')) { dWake = +((Date.now() - tClick) / 1000).toFixed(1); break; }
      await sleep(1000);
    }
    //   ★다시 죽는 것은 **창이 끝날 때**다(승계된 몸은 `_deadUntil` 0 · 창은 쓰러진 시각부터) — 5초 창으로는 못 본다 ⇒ 깨어날 때까지 받은 것 전부로 센다
    const allD = await A.evaluate(() => window.__t563rawOut.slice());
    const reDie = allD.filter((m) => m.t === 'notice' && /정신을 잃었다/.test(m.text || '')).length;
    ok(reDie === 0, 'ⓓ 깨어날 때까지 새 소켓에 **"정신을 잃었다" 0번**(창이 끝나도 다시 안 죽는다)', `${reDie}번`);
    const ref = said0 != null ? said0 : aWake;
    ok(dWake != null && ref != null && dWake <= ref + 8, 'ⓓ 처음 정해진 초에 깨어난다(시계가 안 되감긴다 · +8초 안)', `말함 ${said0} · ⓐ ${aWake} · 실제 ${dWake}`);
    await A.evaluate(() => { try { clearInterval(window.__t563hb); window.__t563raw.close(); } catch (e) {} });
  }

  ok(errs.length === 0, '페이지 오류 0', JSON.stringify(errs.slice(0, 3)));
  await browser.close();
  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
