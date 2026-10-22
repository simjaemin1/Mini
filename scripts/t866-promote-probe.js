#!/usr/bin/env node
// === scripts/t866-promote-probe.js — 승격 경로(`promote_to_primary`) 접속 저장 탐침 (T866 · T831 회부 3) ==========
//
//   계측 자(러너 밖 · `@regress` 없음). 2존(hanbando → nippon) 실서버 · 등록 계정 · ★클라가 넘기 전에 도착 존 **관측 소켓**을 미리 연다
//   (보통 클라 경로 — `30-n-net.js` "promote existing observer ws") → 넘기 메시지의 토큰으로 그 소켓을 `promote_to_primary` 로 올린다.
//   읽음(central 행 `GET /player/:id` · 로비가 실제로 묻는 `POST /auth`):
//     C  승격 + 1.5초 — 아무 일도 없을 때 행 자리(로비가 다시 접속을 어디로 보내나)
//     A  그 뒤 승격 소켓을 닫는다(클라 끊김) + 1.2초 — 닫힐 때 저장(`attachPlayerHandlers` close)
//     B  (따로 판) 승격 + 1.5초에 도착 존을 SIGKILL(존이 죽음 · 배포 kill -9 · 충돌) + 1.2초 — 주기 저장 전에 도착 존이 사라지면
//   몸(정보): 넘기 전 출발 존 몸 `toolItems` 수 · 승격 뒤 도착 존 살아 있는 몸 `toolItems` 수 · hp.
//   손잡이: 두 존 모두 `T498_HANDOFF_PAYLOAD`(인자 `--t498 0|1` · 기본 1 — 카드의 조건) · 도착 존 `T866_PROMOTE_SAVE`(인자 `--knob 0|1`).
//   도착 존 주기 저장은 10분(`SAVE_INTERVAL_MS` — 이미 있는 손잡이) — 0~30초 창을 판 안에서 열어 둔다(창 안의 일을 재는 것 · 창 길이는 재지 않는다).
// 실행: node scripts/t866-promote-probe.js [--knob 0|1] [--t498 0|1] [--runs N] [--kills M]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020, NPORT = 3021;
const EDGE_PAD = 400, LAT_STEP = 2048;
const DDIR = '/tmp/t866-2zone';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const KNOB = arg('--knob', '0'), T498 = arg('--t498', '1'), RUNS = +arg('--runs', '10'), KILLS = +arg('--kills', '3');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(5000) })).json());
const procs = {};
function boot(key, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`/tmp/t866-${key}.log`, { flags: 'a' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  procs[key] = p; return p;
}
function killAll() { for (const p of Object.values(procs)) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', killAll);
const common = { CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T498_HANDOFF_PAYLOAD: T498 };
const bootNip = () => { const z = boot('nip', 'zone.js', Object.assign({ PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/w-nip.db`, E2E_GIVE: '1', SAVE_INTERVAL_MS: '600000', T866_PROMOTE_SAVE: KNOB }, common)); return FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 }); };
async function startAll() {
  fs.mkdirSync(DDIR, { recursive: true });
  for (const f of fs.readdirSync(DDIR)) { try { fs.unlinkSync(path.join(DDIR, f)); } catch (e) {} }
  const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  if (!cu.ok) { console.log('central', cu.why); return false; }
  const h = boot('han', 'zone.js', Object.assign({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, E2E_GIVE: '1' }, common));
  const hp = FB.waitUp(h, /zone server up on/, { name: 'zone', capMs: 300000 });
  const np = bootNip();
  return (await hp).ok && (await np).ok;
}
function openWs(url, onMsg) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); const st = { ws, welcome: null };
    ws.on('error', rej); ws.on('open', () => res(st));
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome') st.welcome = m; if (onMsg) onMsg(m, st); });
  });
}
const pick0 = (o) => { const v = Object.values((o && o.bodies) || {}); return v[v.length - 1]; };
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
const authOf = async (u, p) => { try { return await (await fetch(`http://localhost:${CPORT}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }), signal: AbortSignal.timeout(5000) })).json(); } catch (e) { return null; } };
const at = (r) => r ? `${r.last_zone}(${Math.round(r.last_x)},${Math.round(r.last_y)})` : '(행 없음)';
const lobby = (a) => a && a.player ? a.player.last_zone : '?';

async function one(tag, kill) {
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones;
  const han = Z.hanbando, nip = Z.nippon;
  const NAME = 't866' + tag, PW = 'pw866' + tag;
  let handoffMsg = null;
  const a = await openWs(`${han.wsUrl}/?username=${NAME}&password=${PW}&color=%23ffffff`, (m) => { if (m.type === 'handoff' && !handoffMsg) handoffMsg = m; });
  for (let i = 0; i < 50 && !a.welcome; i++) await sleep(100);
  const pid = (a.welcome || {}).playerId;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: {}, tools: ['axe', 'pickaxe'], quiet: true }));
  await sleep(900);
  const before = pick0(await jget(`http://localhost:${HPORT}/bodydbg?name=${encodeURIComponent(NAME)}`));
  // 관측 소켓 — 도착 존 서쪽 끝을 본다(클라가 이웃 존을 미리 보는 그 꼴)
  let promoted = null;
  const o = await openWs(`${nip.wsUrl}/?observer=1&vx=200&vy=${nip.zoneHeight / 2 | 0}`, (m) => { if (m.type === 'welcome' && m.promoted) promoted = m; });
  // 동쪽 끝으로 옮겨 걷는다(test-handoff-body `crossEast` 와 같은 차례)
  const walk = setInterval(() => { try { a.ws.send(JSON.stringify({ type: 'input', vx: 1, vy: 0 })); } catch (e) {} }, 33);
  for (let i = 0; i < 40 && !handoffMsg; i++) {
    a.ws.send(JSON.stringify({ type: 'teleport_debug', x: han.zoneWidth - EDGE_PAD, y: LAT_STEP + ((3 + i) % 60) * LAT_STEP }));
    for (let k = 0; k < 160 && !handoffMsg; k++) await sleep(100);
  }
  clearInterval(walk);
  if (!handoffMsg) { try { a.ws.close(); o.ws.close(); } catch (e) {} return { tag, crossed: false }; }
  const r0 = await rowOf(pid);   // 넘기 메시지 순간의 행(T498 켬 = 넘기기 전 저장을 안 보냈다)
  o.ws.send(JSON.stringify({ type: 'promote_to_primary', token: handoffMsg.token }));
  const tP = Date.now();
  for (let i = 0; i < 40 && !promoted; i++) await sleep(50);
  try { a.ws.close(); } catch (e) {}   // 클라는 옛 주 소켓을 관측으로 내린다 — 이 판은 닫는다(출발 존 껍데기는 ACK 로 닫힌다)
  await sleep(Math.max(0, tP + 1500 - Date.now()));
  const live = pick0(await jget(`http://localhost:${NPORT}/bodydbg?name=${encodeURIComponent(NAME)}`).catch(() => null));
  const rC = await rowOf(pid), aC = await authOf(NAME, PW);
  let rX = null, aX = null;
  if (kill) {
    try { procs.nip.kill('SIGKILL'); } catch (e) {}
    await sleep(1200);
    rX = await rowOf(pid); aX = await authOf(NAME, PW);
  } else {
    try { o.ws.close(); } catch (e) {}
    await sleep(1200);
    rX = await rowOf(pid); aX = await authOf(NAME, PW);
  }
  return { tag, crossed: true, promoted: !!promoted, r0: at(r0), rC: at(rC), lobbyC: lobby(aC), rX: at(rX), lobbyX: lobby(aX),
    toolsBefore: ((before || {}).toolItems || []).length, toolsLive: live ? (live.toolItems || []).length : null,
    toolsRowX: (() => { try { return (JSON.parse((rX && rX.tools_json) || '{}').toolItems || []).length; } catch (e) { return null; } })() };
}

(async () => {
  console.log(`\n=== T866 승격 경로 접속 저장 탐침 — T498_HANDOFF_PAYLOAD=${T498} · T866_PROMOTE_SAVE=${KNOB} · 판 ${RUNS} + 존 죽임 ${KILLS} ===`);
  if (!(await startAll())) { console.log('기동 실패'); process.exit(1); }
  const out = [];
  for (let i = 0; i < RUNS; i++) { const r = await one(`c${KNOB}${T498}${i}`, false); out.push(Object.assign({ kind: 'C·A' }, r)); console.log('  ' + JSON.stringify(r)); }
  for (let i = 0; i < KILLS; i++) {
    const r = await one(`k${KNOB}${T498}${i}`, true); out.push(Object.assign({ kind: 'C·B' }, r)); console.log('  ' + JSON.stringify(r));
    const up = await bootNip(); if (!up.ok) { console.log('  nippon 다시 기동 실패'); break; }
  }
  const nip = (s) => /^nippon/.test(s || '');
  const ca = out.filter((r) => r.kind === 'C·A' && r.crossed), cb = out.filter((r) => r.kind === 'C·B' && r.crossed);
  console.log(`\n  넘김 ${ca.length + cb.length}/${out.length} · 승격 welcome ${out.filter((r) => r.promoted).length}`);
  console.log(`  C(승격 +1.5초) 행 nippon ${[...ca, ...cb].filter((r) => nip(r.rC)).length}/${ca.length + cb.length} · 로비 nippon ${[...ca, ...cb].filter((r) => r.lobbyC === 'nippon').length}`);
  console.log(`  A(클라 끊김 +1.2초) 행 nippon ${ca.filter((r) => nip(r.rX)).length}/${ca.length} · 로비 nippon ${ca.filter((r) => r.lobbyX === 'nippon').length}`);
  console.log(`  B(도착 존 SIGKILL +1.2초) 행 nippon ${cb.filter((r) => nip(r.rX)).length}/${cb.length} · 로비 nippon ${cb.filter((r) => r.lobbyX === 'nippon').length}`);
  fs.writeFileSync(`/tmp/t866-probe-k${KNOB}-t${T498}.json`, JSON.stringify(out, null, 1));
  killAll(); process.exit(0);
})().catch((e) => { console.log('탐침 실패:', e && e.stack); killAll(); process.exit(1); });
