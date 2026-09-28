#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T486 ② 대조 자)
// =============================================================================
// T486 ② — pong 셋의 **끔 동일**과 **켬 모양**을 실서버로 잰다.
//   central + 한반도 존(마을 층 끔 — 빨리 뜬다)을 손잡이 끔/켬 두 번 띄워, **플레이어**(`?name=`)와 **관측자**(`?observer=1`)
//   두 소켓에서 같은 ping(`t` 고정)을 보내고 받은 pong 의 **원문 바이트**를 적는다.
//   ⓐ 끔: 두 소켓의 pong 원문 = `{"type":"pong","t":<t>}`(손잡이 도입 전 코드가 보내던 그 문자열) — 바이트 비교
//   ⓑ 켬: 필드 셋(`srvIn`·`srvOut`·`loopP95`) · srvOut ≥ srvIn · 서버 체류 ms · 5초 뒤 loopP95 가 선다
// 쓰는 법: node scripts/t486-pong-check.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 123456.789;   // 클라 `performance.now()` 흉내 — 소수점까지 그대로 돌아와야 한다
const LEGACY = JSON.stringify({ type: 'pong', t: T });   // 손잡이 도입 전 `send(ws, { type: 'pong', t: msg.t })` 의 원문

async function run(on, CP) {
  const ZP = CP + 10, TMP = `/tmp/t486-pong-${process.pid}-${on ? 'on' : 'off'}`;
  for (const s of ['', '-wal', '-shm']) { for (const f of [`${TMP}-c.db`, `${TMP}-z.db`]) { try { fs.unlinkSync(f + s); } catch (e) {} } }
  const env = Object.assign({}, process.env); delete env.T486_PONG_SPLIT; if (on) env.T486_PONG_SPLIT = '1';
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, env, { PORT: String(CP), DB_PATH: `${TMP}-c.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, env, { PORT: String(ZP), ZONE_ID: 'hanbando', DB_PATH: `${TMP}-z.db`, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' }) });
  const kill = () => { try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} };
  try {
    for (let i = 0; i < 600; i++) { try { if ((await fetch(`http://localhost:${ZP}/health`)).ok) break; } catch (e) {} await sleep(500); }
    const one = (qs, ready) => new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${ZP}/?${qs}`); const got = [];
      const to = setTimeout(() => { try { ws.close(); } catch (e) {} resolve(got); }, 20000);
      let pinged = 0;
      ws.on('message', async (raw) => {
        const s = String(raw); let m = null; try { m = JSON.parse(s); } catch (e) {}
        if (m && m.type === 'pong' && m.t === T && !m.stage) { got.push(s); if (got.length >= 2) { clearTimeout(to); try { ws.close(); } catch (e) {} resolve(got); } return; }
        if (!pinged && m && m.type === ready) { pinged = 1; ws.send(JSON.stringify({ type: 'ping', t: T })); await sleep(6000); ws.send(JSON.stringify({ type: 'ping', t: T })); }
      });
      ws.on('error', () => {});
    });
    const player = await one('name=pongcheck', 'welcome');
    const observer = await one('observer=1', 'welcome');
    return { player, observer };
  } finally { kill(); await sleep(500); }
}

(async () => {
  const off = await run(false, 4960), on = await run(true, 4980);
  let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
  console.log(`\n[T486 ②] pong 원문 — 끔`);
  for (const k of ['player', 'observer']) for (const s of off[k]) console.log(`  ${k}: ${s}`);
  for (const k of ['player', 'observer']) ok(off[k].length === 2 && off[k].every((s) => s === LEGACY), `끔 · ${k} pong 원문 = ${LEGACY} (${off[k].length}번)`);
  console.log(`\n[T486 ②] pong 원문 — 켬`);
  for (const k of ['player', 'observer']) for (const s of on[k]) console.log(`  ${k}: ${s}`);
  for (const k of ['player', 'observer']) {
    const ms = on[k].map((s) => JSON.parse(s));
    ok(ms.length === 2 && ms.every((m) => Object.keys(m).join(',') === 'type,t,srvIn,srvOut,loopP95'), `켬 · ${k} 필드 = type,t,srvIn,srvOut,loopP95`);
    ok(ms.every((m) => m.t === T && m.srvOut >= m.srvIn), `켬 · ${k} t 그대로 · srvOut ≥ srvIn (체류 ${ms.map((m) => (m.srvOut - m.srvIn).toFixed(3)).join(' / ')} ms)`);
    ok(ms[1] && typeof ms[1].loopP95 === 'number', `켬 · ${k} 5초 뒤 loopP95 = ${ms[1] && ms[1].loopP95} ms(첫 pong 은 ${ms[0] && ms[0].loopP95} — 창이 아직 안 닫혔다)`);
  }
  console.log(`\n=== T486 pong 대조: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})();
