#!/usr/bin/env node
// === scripts/t868-promote-body-probe.js — 승격 경로가 몸 전부를 잇나 (T868 · T866 회부 1 · T866 탐침 판의 꼴) =================
//
//   계측 자(러너 밖 · `@regress` 없음 — 회귀 지킴은 `test-handoff-body` ① 글자 · ⑦ P/Q 판). 2존(hanbando → nippon) 실서버 · 판마다 등록 계정 하나.
//   ★클라가 넘기 전에 도착 존 **관측 소켓**을 미리 연다(보통 클라 경로 — `30-n-net.js` "promote existing observer ws") → 넘기 메시지의 토큰으로
//   그 소켓을 `promote_to_primary` 로 올린다. 몸의 칸마다 빈 칸이 아닌 값을 앉힌다(도구 둘 · 장비 둘(지게 · 옷 — 입는다) · kg 원장 · 소속 · 숙련 ·
//   제작이력 · 원석장부 · 이월 · 어획) — 빈 칸끼리 같음은 자명 통과다.
//   판마다 읽음(몸 = `/bodydbg` 가 내주는 `serializeBody` 그 자체 · 행 = central `GET /player/:id` 의 `tools_json`):
//     몸  승격 + 0.9초 도착 존 몸 vs 넘기 전 출발 몸 — 내구(도구 · 장비 · 슬롯 · 숙련 · 제작이력 · 원장 · 어획 · kg · 로트 `d·k·n·m·w` · 소속) 비트 같음 ·
//         신체(추위 · 피로 · 부상 ±0.15) · 받은 HP = 넘는 순간 껍데기 HP
//     A   (10판) 그 뒤 클라가 승격 소켓을 닫음 + 1.2초 — 도착 존 닫힐 때 저장이 쓴 행의 몸(내구) vs 넘기 전
//     B   (3판) 승격 + 1.5초에 도착 존 SIGKILL + 1.2초 — 행의 몸(내구) vs 넘기 전 · 판마다 nippon 을 다시 띄운다
//   손잡이: 두 존 `T868_PROMOTE_BODY`(인자 `--knob 0|1` · 기본 1) · `T498_HANDOFF_PAYLOAD`(인자 `--t498 0|1` · 기본 0 — 기본 세계).
//   도착 존 주기 저장 10분(`SAVE_INTERVAL_MS` — 이미 있는 손잡이 · 판 안에서 도착 존 쓰기는 닫힐 때 저장 하나).
// 실행: node scripts/t868-promote-body-probe.js [--knob 0|1] [--t498 0|1] [--runs N] [--kills M]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020, NPORT = 3021;
const EDGE_PAD = 400, LAT_STEP = 2048;
const DDIR = '/tmp/t868-2zone';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const KNOB = arg('--knob', '1'), T498 = arg('--t498', '0'), RUNS = +arg('--runs', '10'), KILLS = +arg('--kills', '3');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(5000) })).json());
const procs = {};
function boot(key, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`/tmp/t868-${key}.log`, { flags: 'a' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  procs[key] = p; return p;
}
function killAll() { for (const p of Object.values(procs)) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', killAll);
const common = { CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
  T498_HANDOFF_PAYLOAD: T498, T868_PROMOTE_BODY: KNOB, E2E_GIVE: '1' };
const bootNip = () => { const z = boot('nip', 'zone.js', Object.assign({ PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/w-nip.db`, SAVE_INTERVAL_MS: '600000' }, common)); return FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 }); };
async function startAll() {
  fs.mkdirSync(DDIR, { recursive: true });
  for (const f of fs.readdirSync(DDIR)) { try { fs.unlinkSync(path.join(DDIR, f)); } catch (e) {} }
  const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  if (!cu.ok) { console.log('central', cu.why); return false; }
  const h = boot('han', 'zone.js', Object.assign({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db` }, common));
  const hp = FB.waitUp(h, /zone server up on/, { name: 'zone', capMs: 300000 });
  const np = bootNip();
  return (await hp).ok && (await np).ok;
}
function openWs(url, onMsg) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); const st = { ws, welcome: null };
    ws.on('error', rej); ws.on('open', () => res(st));
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome' && !st.welcome) st.welcome = m; if (onMsg) onMsg(m, st); });
  });
}
const pick0 = (o) => { const v = Object.values((o && o.bodies) || {}); return v[v.length - 1]; };
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
// 내구 열쇠 — `test-handoff-body` `durableKey` 와 같은 칸 · 같은 뜻(로트는 얻은 순간 쪽 `d·k·n·m·w` 만 — 정산 칸 `e·t` 는 흐른 시간만큼 자란다)
const LOT_DURABLE = ['d', 'k', 'n', 'm', 'w', 'coalesced'];
const lotsKey = (L) => { if (!L) return null; const o = {}; for (const [it, arr] of Object.entries(L)) o[it] = (arr || []).map((l) => { const r = {}; for (const f of LOT_DURABLE) if (l && l[f] !== undefined) r[f] = l[f]; return r; }); return o; };
const durableKey = (b) => b ? JSON.stringify({
  toolItems: (b.toolItems || []).map((t) => `${t.type}/${t.d}/${t.max}`).sort(), equipment: (b.equipment || []).map((e) => `${e.type}/${e.q}`).sort(),
  equipSlots: b.equipSlots || {}, craftSkill: b.craftSkill || {}, craftLog: b.craftLog || {}, oreLedger: b.oreLedger || {}, oreCarry: b.oreCarry || {},
  fishStats: b.fishStats || null, kgLedger: b.kgLedger || null, lots: lotsKey(b.lots), member: b.member || null }) : '(없음)';
// 내구 칸마다 어느 것이 갈렸나(행이 넘기 전과 다를 때 — 진단 · 판정 0)
const durableDiff = (a, b) => { if (!a || !b) return ['(몸 없음)']; const A = JSON.parse(durableKey(a)), B = JSON.parse(durableKey(b)); return Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k])); };
const softOf = (b) => (b && b.body) ? { cold: +(b.body.cold || 0), fatigue: +(b.body.fatigue || 0), injury: +(b.body.injury || 0) } : null;
const softNear = (x, y, tol) => !!x && !!y && Math.abs(x.cold - y.cold) <= tol && Math.abs(x.fatigue - y.fatigue) <= tol && Math.abs(x.injury - y.injury) <= tol;
const MEMBER_FIX = { zone: 'hanbando', vid: 7, name: '검사마을', since: 33, wdDay: 33, wdUsed: 2 };
const LEDGER_FIX = { craftSkill: { toolmaking: 7, mining: 3 }, craftLog: { carrier: { n: 1, q: 5 } }, oreLedger: { iron: 1.25 }, oreCarry: { iron: 0.05 }, fishStats: { caught: 4, maxKg: 2.0, lostMaxKg: 1.5 } };

async function one(tag, kill) {
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones;
  const han = Z.hanbando, nip = Z.nippon;
  const NAME = 't868' + tag, PW = 'pw868' + tag, q = `?name=${encodeURIComponent(NAME)}`;
  let handoffMsg = null, promoted = null;
  const a = await openWs(`${han.wsUrl}/?username=${NAME}&password=${PW}&color=%23ffffff`, (m) => { if (m.type === 'handoff' && !handoffMsg) handoffMsg = m; });
  for (let i = 0; i < 50 && !a.welcome; i++) await sleep(100);
  const pid = (a.welcome || {}).playerId;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3 }, tools: ['axe', 'pickaxe'], kgs: { fish: [2.0, 0.4, 1.1] },
                             equip: [{ type: 'carrier', lvl: 5 }, { type: 'clothes', lvl: 3 }], quiet: true }));
  a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', member: MEMBER_FIX, quiet: true }, LEDGER_FIX)));
  await sleep(900);
  const before = pick0(await jget(`http://localhost:${HPORT}/bodydbg${q}`));
  const o = await openWs(`${nip.wsUrl}/?observer=1&vx=200&vy=${nip.zoneHeight / 2 | 0}`, (m) => { if (m.type === 'welcome' && m.promoted && !promoted) promoted = m; });
  const poke = setInterval(() => { try { a.ws.send(JSON.stringify({ type: '__e2e_body', hp: 42, cold: 0.8, quiet: true })); } catch (e) {} }, 400);
  const walk = setInterval(() => { try { a.ws.send(JSON.stringify({ type: 'input', vx: 1, vy: 0 })); } catch (e) {} }, 33);
  for (let i = 0; i < 40 && !handoffMsg; i++) {
    a.ws.send(JSON.stringify({ type: 'teleport_debug', x: han.zoneWidth - EDGE_PAD, y: LAT_STEP + ((3 + i) % 60) * LAT_STEP }));
    for (let k = 0; k < 160 && !handoffMsg; k++) await sleep(100);
  }
  clearInterval(walk); clearInterval(poke);
  if (!handoffMsg) { try { a.ws.close(); o.ws.close(); } catch (e) {} return { tag, crossed: false }; }
  const shell = pick0(await jget(`http://localhost:${HPORT}/bodydbg${q}`).catch(() => null));
  o.ws.send(JSON.stringify({ type: 'promote_to_primary', token: handoffMsg.token }));
  const tP = Date.now();
  for (let i = 0; i < 60 && !promoted; i++) await sleep(50);
  try { a.ws.close(); } catch (e) {}
  await sleep(900);
  const live = pick0(await jget(`http://localhost:${NPORT}/bodydbg${q}`).catch(() => null));
  let row = null;
  if (kill) {
    await sleep(Math.max(0, tP + 1500 - Date.now()));
    try { procs.nip.kill('SIGKILL'); } catch (e) {}
    await sleep(1200);
  } else {
    await sleep(Math.max(0, tP + 1500 - Date.now()));
    try { o.ws.close(); } catch (e) {}
    await sleep(1200);
  }
  row = await rowOf(pid);
  let rowBody = null; try { rowBody = JSON.parse((row && row.tools_json) || 'null'); } catch (e) {}
  const hpShell = ((shell || {}).vital || {}).hp, hpW = ((promoted || {}).self || {}).hp;
  return { tag, kind: kill ? 'B' : 'A', crossed: true, promoted: !!promoted,
    bodySame: !!live && durableKey(live) === durableKey(before), softSame: softNear(softOf(live), softOf(shell), 0.15), hpSame: Number.isFinite(hpShell) && hpW === hpShell,
    rowSame: !!rowBody && durableKey(rowBody) === durableKey(before), rowDiff: durableDiff(before, rowBody),
    tools: [((before || {}).toolItems || []).length, live ? (live.toolItems || []).length : null, rowBody ? (rowBody.toolItems || []).length : null],
    equip: [((before || {}).equipment || []).length, live ? (live.equipment || []).length : null],
    skill: [JSON.stringify((before || {}).craftSkill || {}), live ? JSON.stringify(live.craftSkill || {}) : null],
    hp: [hpShell, hpW], cold: [softOf(shell) && +softOf(shell).cold.toFixed(3), softOf(live) && +softOf(live).cold.toFixed(3)] };
}

(async () => {
  console.log(`\n=== T868 승격 경로 몸 잇기 탐침 — T868_PROMOTE_BODY=${KNOB} · T498_HANDOFF_PAYLOAD=${T498} · 판 ${RUNS}(A 클라 끊김) + ${KILLS}(B 도착 존 죽음) ===`);
  if (!(await startAll())) { console.log('기동 실패'); process.exit(1); }
  const out = [];
  for (let i = 0; i < RUNS; i++) { const r = await one(`a${KNOB}${T498}${i}`, false); out.push(r); console.log('  ' + JSON.stringify(r)); }
  for (let i = 0; i < KILLS; i++) {
    const r = await one(`b${KNOB}${T498}${i}`, true); out.push(r); console.log('  ' + JSON.stringify(r));
    const up = await bootNip(); if (!up.ok) { console.log('  nippon 다시 기동 실패'); break; }
  }
  const X = out.filter((r) => r.crossed && r.promoted), A = X.filter((r) => r.kind === 'A'), B = X.filter((r) => r.kind === 'B');
  const n = (arr, f) => `${arr.filter(f).length}/${arr.length}`;
  console.log(`\n  넘김 · 승격 ${X.length}/${out.length}`);
  console.log(`  몸(승격 +0.9초) 내구 비트 같음 ${n(X, (r) => r.bodySame)} · 신체 이어짐 ${n(X, (r) => r.softSame)} · 받은 HP = 껍데기 HP ${n(X, (r) => r.hpSame)}`);
  console.log(`  A(클라 끊김) 행 몸 = 넘기 전 ${n(A, (r) => r.rowSame)} · 행 도구 ${A.map((r) => r.tools[2]).join(',')}`);
  console.log(`  B(도착 존 죽음) 행 몸 = 넘기 전 ${n(B, (r) => r.rowSame)} · 행 도구 ${B.map((r) => r.tools[2]).join(',')}`);
  console.log(`  모두(몸 · 신체 · HP · 행) ${n(X, (r) => r.bodySame && r.softSame && r.hpSame && r.rowSame)}`);
  fs.writeFileSync(`/tmp/t868-probe-k${KNOB}-t${T498}.json`, JSON.stringify(out, null, 1));
  killAll(); process.exit(0);
})().catch((e) => { console.log('탐침 실패:', e && e.stack); killAll(); process.exit(1); });
