#!/usr/bin/env node
// === scripts/t498-ack-timeout.js — 인계가 **실패한** 쪽의 저장(T498 ②의 나머지 반 · 러너 밖) ====================
//
// ★T498 팔을 켜면 떠나는 존은 central 저장을 기다리지 않고 **떠나는 순간의 행을 쥐고만** 있다가,
//   ACK 가 3초 안에 안 오면(클라가 도착 존에 끝내 안 붙음) 그 행을 보낸다 — 끔 판이 떠나기 **전에** 써 두던 그 행이다.
//   이 자는 그 길을 **실제로 밟는다**: 게스트(영속)에게 도구를 쥐여 경계를 넘기고, `handoff` 를 받으면 도착 존에 **안 붙는다**.
//   4초 뒤 central 행(`GET /player/:id` · 안 문 — 이 상자는 되돌이 주소라 통과)을 두 팔(끔/켬)이 **같게** 남기나 · 몸(도구)이 있나.
//   ⚠실측으로 안 것: 시한이 터지면 떠나는 존이 소켓을 닫고, 그 **닫힘 처리의 저장**(`last_zone` 은 떠나는 존)이 마지막에 내려앉는다 —
//     끔 판도 그렇다(떠나기 전 써 둔 `last_zone=nippon` 행을 그 저장이 덮는다). 그러니 판정은 "두 팔의 최종 행이 같다"다.
//   대조: 켬 판에서 ACK 전 행에는 아직 `last_zone` 이 도착 존이 아니다(기다리지 않았다는 증거 · 자명 통과 방지).
// 실행: node scripts/t498-ack-timeout.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020, NPORT = 3021, EDGE_PAD = 400, LAT_STEP = 2048;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const procs = [];
function boot(file, env, log) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(log, { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg); procs.push(p); return p;
}
const killAll = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; };
process.on('exit', killAll);
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(5000) })).json());
async function waitHttp(u) { for (let i = 0; i < 300; i++) { try { if ((await fetch(u, { signal: AbortSignal.timeout(3000) })).ok) return true; } catch (e) {} await sleep(1000); } return false; }
function open(url, onMsg) {
  return new Promise((res, rej) => { const ws = new WebSocket(url); const st = { ws, welcome: null };
    ws.on('error', rej); ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome' && !st.welcome) { st.welcome = m; res(st); } if (onMsg) onMsg(m); }); });
}
async function arm(on) {
  const DDIR = `/tmp/t498-ack-${on}`; fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  const env0 = { T498_HANDOFF_PAYLOAD: on ? '1' : '0' };
  boot('central.js', Object.assign({ PORT: String(CPORT), DB_PATH: `${DDIR}/c.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' }, env0), `${DDIR}/central.log`);
  await waitHttp(`http://localhost:${CPORT}/health`);
  const common = Object.assign({ CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' }, env0);
  boot('zone.js', Object.assign({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/h.db` }, common), `${DDIR}/hanbando.log`);
  boot('zone.js', Object.assign({ PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/n.db` }, common), `${DDIR}/nippon.log`);
  await waitHttp(`http://localhost:${HPORT}/health`); await waitHttp(`http://localhost:${NPORT}/health`);
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones, han = Z.hanbando;
  let handoff = null, handoffAt = 0;
  const a = await open(`${han.wsUrl}/?username=&name=ackT${on}&color=%23ffffff`, (m) => { if (m.type === 'handoff' && !handoff) { handoff = m; handoffAt = Date.now(); } });
  const pid = a.welcome.playerId || a.welcome.pid;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3 }, tools: ['axe', 'pickaxe'], quiet: true }));
  await sleep(900);
  const walk = setInterval(() => { try { a.ws.send(JSON.stringify({ type: 'input', vx: 1, vy: 0 })); } catch (e) {} }, 33);
  for (let i = 0; i < 40 && !handoff; i++) { a.ws.send(JSON.stringify({ type: 'teleport_debug', x: han.zoneWidth - EDGE_PAD, y: LAT_STEP + ((3 + i) % 60) * LAT_STEP })); for (let k = 0; k < 16 && !handoff; k++) await sleep(500); }
  clearInterval(walk);
  const acct = a.welcome.playerId || (await jget(`http://localhost:${HPORT}/bodydbg`).then((o) => Object.keys((o && o.bodies) || {}).slice(-1)[0]).catch(() => null));
  const rowNow = async () => { try { return await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(acct)}`); } catch (e) { return null; } };
  const r0 = handoff ? await rowNow() : null;               // ACK 전(도착 존에 안 붙었다)
  await sleep(4200);                                        // ACK 시한 3초 + 여유
  const r1 = handoff ? await rowNow() : null;
  const pick = (r) => { const p = r && (r.player || r); if (!p) return null; let tools = 0; try { tools = (JSON.parse(p.tools_json || '{}').toolItems || []).length; } catch (e) {} return { last_zone: p.last_zone || null, tools }; };
  const hlog = fs.readFileSync(`${DDIR}/hanbando.log`, 'utf8');
  try { a.ws.close(); } catch (e) {}
  killAll(); await sleep(500);
  return { crossed: !!handoff, acct, before: pick(r0), after: pick(r1), timeoutLine: /ACK timeout/.test(hlog), heldLine: /\[T498\] ACK 없음/.test(hlog) };
}
(async () => {
  console.log('\n=== T498 — 인계가 실패한 쪽의 저장(ACK 시한) ===');
  const off = await arm(false), on = await arm(true);
  for (const [tag, r] of [['끔', off], ['켬', on]]) {
    ok(r.crossed && r.timeoutLine, `[${tag}] ★[상황] 경계를 넘었고 도착 존에 안 붙어 ACK 시한이 터졌다`, `계정 ${r.acct}`);
    ok(r.after && r.after.tools === 2, `[${tag}] ★시한 뒤 central 행에 몸(도구 2)이 있다`, JSON.stringify(r.after));
  }
  ok(off.before && off.before.last_zone === 'nippon', '[끔] ACK 전에 이미 행이 써져 있다(떠나기 전 await 저장)', JSON.stringify(off.before));
  ok(on.before && on.before.last_zone !== 'nippon', '[켬] ★ACK 전 행은 아직 옛 행이다(= 기다리지 않았다 · 자명 통과 방지)', JSON.stringify(on.before));
  ok(on.heldLine, '[켬] 쥔 행을 시한에서 보냈다(로그 한 줄)');
  ok(JSON.stringify(off.after) === JSON.stringify(on.after), '★두 팔의 최종 행이 같다', `${JSON.stringify(off.after)} = ${JSON.stringify(on.after)}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); killAll(); process.exit(1); });
