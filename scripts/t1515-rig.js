#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · 판 도구 · T1515 · 제품 코드 · 있던 스크립트 손 0)
// =============================================================================
// scripts/t1515-rig.js — 실제 하루(24분) 실시계 판: 중앙 + 존(하나 또는 둘) + ws 봇(브라우저 없는 손님) [T1515 · S14]
//   `t1489-rig.js` 를 본떠 새로 썼다(그 파일은 그대로). 클라(`41-h-bubble.js` · `30-n-net.js`)가 하는 말만 흉내 낸다.
//   모드(env T1515_MODE):
//     boot  — 부팅을 날 경계(그 존의 **꼬리 마감** = 가장 서쪽 마을의 현지 자정 · `_t731Due0`) X초 앞에 맞춘다(T1515_OFF 초).
//             "부팅" = 존이 마을 시뮬을 세운 순간(로그 `마을 시뮬 준비`). 맞추는 법: 벽시계 원점 밀기(`t1515-shift.js` · K = T1515_SHIFT_MS) —
//             K = (고른 경계 − X) − (지금 + 예상 부팅 길이). 예상 부팅 길이는 같은 세계 · 같은 팔의 앞 판(없으면 정찰 판)의 가운데.
//             T1515_NOSHIFT=1 이면 밀지 않고 실제 경계를 기다려 띄운다(밀기 무변 대조).
//             봇 여덟: 걷기 셋(깨끗한 가로 길을 오간다 · 틱마다 자리 · ackSeq) + 요청 다섯(`/인출` · 기부 · 거래 · 채팅 · 마을 화면 번갈아) · 모두 250ms 핑.
//             첫 꼬리 마감이 끝나고 T1515_AFTER(20)초 뒤 끝. 세계가 정찰 기록이 없으면 정찰 판(밀기 0 · 봇 0 · 마을 · 경계 · 부팅 길이만 적고 끝).
//     cross — 중앙 + 한반도 + 닛폰. 손님 한 명씩 T1515_TRIALS 판: 한반도 마을 H 앞(클라 규칙대로 brief) → 경계 길 서쪽 → 동쪽으로 걸어 `handoff` →
//             닛폰에 handoff_token 으로 붙음 → 곧바로 닛폰 마을 N 곳간 앞 → 클라 규칙(700ms 근접 틱 · `evBriefedDay` vid 열쇠 · 비움 없음) → `/인출`.
//             짝수 판 N = H 와 같은 번호(vid)의 닛폰 마을(클라 몫이 설 수 있는 꼴) · 홀수 판 = 오늘 brief 한 번호가 아닌 마을(대조).
//             T1515_TAIL_S = 존이 선 뒤 한반도 꼬리 마감이 오는 초(음수 = 이미 지남 → 판 동안 마감 없음).
//     adj   — 한반도 51마을 · 가장 가까운 두 마을 A · B. 봇 T1515_PAR(4)이 T1515_TRIALS 판을 나눠: B 곳간 앞(brief) → A 문에서 400px 떨어진 깨끗한 자리 →
//             A 문까지 **걸어서**(근접 틱이 A brief 를 보낸다) → 닿고 0.3 ~ 0.9초 뒤 `/인출`. T1515_TAIL_S 로 첫 꼬리 마감이 판 가운데 오게 맞출 수 있다.
//   서버 쪽 귀: `t1489-probe.js`(그대로 · T1489_PROF=0 — 실시계 판에 1ms 샘플러는 안 건다) · T1515_PROBE=0 이면 안 건다(귀 무변 대조).
//   `/perf`(제품 안 문)를 1초마다 읽어 배경 거리 셈(T968 `t968.ready` 등)과 꼬리 마감 기록(`econTick.last`)이 바뀐 때를 적는다(귀와 무관 · 모든 판 같다).
//   env: T1515_RIGOUT · T1515_SRV(서버를 띄울 일터 · T1490 가지면 그 일터) · T1515_ARM · T1515_TAG · T1515_WORLD(정찰 이름) · T1515_ZONE · T1515_CK(체크포인트 폴더) ·
//        T1515_PRESET=lr(긴 판 세계 env) · T1515_BOTS · T1515_TRIALS · T1515_PAR · RAW(정찰 · 앞 판 기록을 찾는 곳)
// =============================================================================
if (require.main === module) require('./lib-port').hold(3010, 3020, 3021);   // [T1288] 제품 고정 포트(central 기본 · 한반도 · 닛폰) — 판은 이름공간 안이지만 린트 ⑯a 대로 쥔다
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const E = process.env;
const SRV = E.T1515_SRV || ROOT;
const RAW = E.RAW || '/var/tmp/t1515w';
const OUT = E.T1515_RIGOUT || '/tmp/t1515rig'; fs.mkdirSync(OUT, { recursive: true });
const MODE = E.T1515_MODE || 'boot', ARM = E.T1515_ARM || 'on', TAG = E.T1515_TAG || 'run';
const DAYMS = 1440000;   // 정본 하루(24분) — `VILLAGE_DAY_MS` 를 안 준다(제품 기본값 그대로)
const Z = require(path.join(SRV, 'server', 'zone-config'));
const ZONES = Z.ZONES;
const PROBE = E.T1515_PROBE !== '0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const now = () => Date.now();
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const procs = [];
const T00 = now();
const log = (s) => console.log(`[rig ${new Date().toISOString().slice(11, 19)}] ${s}`);
const put = (f, o) => { try { fs.appendFileSync(path.join(OUT, f), JSON.stringify(o) + '\n'); } catch (e) { /* */ } };
const META = { tag: TAG, mode: MODE, arm: ARM, srv: SRV === ROOT ? 'main' : SRV, probe: PROBE, started: T00 };
const saveMeta = () => { try { fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(META, null, 1)); } catch (e) { /* */ } };
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { /* */ } } });

// ── 서버 띄우기 ─────────────────────────────────────────────────────────────────────
const ZLOG = /T731\]|마을 시뮬 준비|zone server up|central server up|econ day \d+:|거리행렬|BFS|핸드오프|handoff|Error|오류|실패/;
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(SRV, 'server', file)], { cwd: SRV, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._lines = []; p._waiters = [];
  let buf = '';
  const onData = (b) => {
    buf += String(b); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      const t = now();
      if (ZLOG.test(line)) { try { fs.appendFileSync(path.join(OUT, `zlog-${name}.txt`), `${t}\t${line.slice(0, 600)}\n`); } catch (e) { /* */ } }
      for (const w of p._waiters.slice()) if (w.re.test(line)) { w.res({ t, line }); p._waiters.splice(p._waiters.indexOf(w), 1); }
    }
  };
  p.stdout.on('data', onData); p.stderr.on('data', onData);
  p.on('exit', (c) => { p._exit = c; for (const w of p._waiters.splice(0)) w.res(null); });
  procs.push(p); return p;
}
const waitLine = (p, re, ms) => new Promise((res) => { const w = { re, res }; p._waiters.push(w); setTimeout(() => { const i = p._waiters.indexOf(w); if (i >= 0) { p._waiters.splice(i, 1); res(null); } }, ms); });
const preload = (K, zone) => {
  const a = [];
  if (K) a.push(`--require ${path.join(ROOT, 'scripts', 't1515-shift.js')}`);
  if (zone && PROBE) a.push(`--require ${path.join(ROOT, 'scripts', 't1489-probe.js')}`);
  return a.join(' ');
};
const PRESET_LR = { T1243_FARM_ON: '1', T1316_BODY_CLOCK: '1', T1316_SUBSTEP: '1', T1326_HUNT_CLOCK: '1', T1351_MINE_CLOCK: '1', VILLAGE_NPC_CAP: 'Infinity', T1195_HUNT_REAL: '1', VILLAGE_CARAVAN_MAX: '0' };
async function bootWorld(zids, K) {
  const cenv = { PORT: '3010', DB_PATH: `/tmp/t1515-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: zids.join(',') };
  if (K) { cenv.NODE_OPTIONS = preload(K, false); cenv.T1515_SHIFT_MS = String(K); }
  const central = boot('central', 'central.js', cenv);
  const cu = await waitLine(central, /central server up on/, 60000);
  if (!cu) return null;
  const R = { central, zones: {} };
  for (const z of zids) {
    const db = `/tmp/t1515-z-${z}-${process.pid}.db`;
    if (E.T1515_CK && z === 'hanbando') for (const sfx of ['', '-wal', '-shm']) { const s = path.join(E.T1515_CK, 'w.db' + sfx); if (fs.existsSync(s)) fs.copyFileSync(s, db + sfx); }
    const zenv = Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: db, CENTRAL_URL: 'http://localhost:3010', PUBLIC_HOST: 'localhost',
      ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1', ONB_ENABLE: '1', MEMBER_N: '3' }, E.T1515_PRESET === 'lr' ? PRESET_LR : {});
    zenv.NODE_OPTIONS = preload(K, true);
    if (K) zenv.T1515_SHIFT_MS = String(K);
    if (PROBE) { zenv.T1489_OUT = path.join(OUT, `p-${z}`); zenv.T1489_PROF = '0'; }
    R.zones[z] = { p: null, spawn: now() };
    const p = boot(z, 'zone.js', zenv); R.zones[z].p = p;
    R.zones[z].wSim = waitLine(p, /마을 시뮬 준비/, 900000);
    R.zones[z].wT731 = waitLine(p, /\[T731\] 현지 자정 정산/, 900000);
    R.zones[z].wUp = waitLine(p, /zone server up on/, 900000);
  }
  return R;
}
async function jget(u, ms) { try { const r = await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(ms || 8000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
async function villagesOf(z) {
  for (let i = 0; i < 300; i++) { const j = await jget(`http://localhost:${ZONES[z].port}/startinfo`); if (j && j.ok && j.villages && j.villages.length) return j.villages.map((v) => ({ vid: v.vid, name: v.name, cx: v.cx, cy: v.cy })); await sleep(2000); }
  return null;
}
// T731 줄: "… 닫힌 날 B · 다음 창 B+1: 동 이름 λ HH:MM:SS → 서 이름 λ HH:MM:SS · 퍼짐 S초 · econ 날 E"
function parseT731(line) {
  const m = /닫힌 날 (-?\d+) · 다음 창 (-?\d+): 동 (\S+) (-?[\d.]+) (\d\d:\d\d:\d\d) → 서 (\S+) (-?[\d.]+) (\d\d:\d\d:\d\d) · 퍼짐 ([\d.]+)초 · econ 날 (\S+)/.exec(line || '');
  if (!m) return null;
  return { base: +m[1], next: +m[2], east: [m[3], +m[4], m[5]], west: [m[6], +m[7], m[8]], spreadS: +m[9], econDay: m[10] === 'null' ? null : +m[10] };
}
const tailAt = (D, lonW) => Math.round((D - lonW) * DAYMS);   // 그 존의 꼬리 마감(가장 서쪽 마을이 D 로 넘는 순간) · 벽시계 ms(밀린 축)
// /perf 읽기 — 바뀐 때만 적는다
function perfPoller(zids, K, stopRef) {
  const last = {};
  const S = { tails: {} };
  (async () => {
    while (!stopRef.stop) {
      for (const z of zids) {
        const t0 = now();
        const j = await jget(`http://localhost:${ZONES[z].port}/perf`, 15000);
        if (!j || !j.econTick) continue;
        const pr = (j.econTick.probe || {}).t968 || {};
        const L = j.econTick.last || null;
        const rec = { t968: pr, last: L ? { day: L.day, at: L.at, wall: L.wall, total: L.total, queued: L.queued, frames: L.frames, frameMax: L.frameMax, maxChunk: L.maxChunk, villages: L.villages, dist: L.stages ? (L.stages.dist || 0) : null, opens: L.t731Opens } : null };
        const key = JSON.stringify(rec);
        if (key !== last[z]) { last[z] = key; put('perf.jsonl', Object.assign({ z, at: t0, rt: now() - t0, srvNow: j.now }, rec)); }
        if (L && !S.tails[z]) S.tails[z] = [];
        if (L && !S.tails[z].some((x) => x.at === L.at)) S.tails[z].push({ at: L.at, day: L.day, seen: now() });
      }
      await sleep(1000);
    }
  })();
  return S;
}

// ── 봇 ────────────────────────────────────────────────────────────────────────
function bot(name, port, query, opt) {
  opt = opt || {};
  return new Promise((res) => {
    const ws = new WebSocket(`ws://localhost:${port}/?${query || `username=&name=${encodeURIComponent(name)}&color=%23a0a0a0`}`);
    const B = { name, ws, port, welcome: false, pid: null, notices: [], listeners: [], closed: false, closedAt: null, byUs: false, pos: null, ack: 0, seq: 0, dir: 0, day: 0, samples: opt.samples ? [] : null, tickGapMax: 0, lastTick: 0, ticks: 0 };
    ws.on('message', (d) => {
      let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
      const t = now();
      if (m.type === 'welcome' && !B.welcome && !m.observer) {
        B.welcome = true; B.welAt = t; B.pid = m.pid != null ? m.pid : (m.you && m.you.pid);
        if (!opt.noKeep) B.keep = setInterval(() => { if (!B.dir) { try { ws.send(JSON.stringify({ type: 'input', seq: ++B.seq, vx: 0, vy: 0 })); } catch (e) { /* */ } } }, 500);
        res(B);
      }
      if (m.type === 'tick') {
        if (B.lastTick) B.tickGapMax = Math.max(B.tickGapMax, t - B.lastTick);
        B.lastTick = t; B.ticks++;
        if (Array.isArray(m.players)) for (const pp of m.players) if (pp.pid === B.pid && pp.x != null) { B.pos = { x: pp.x, y: pp.y }; break; }
        B.ack = m.ackSeq || 0;
        if (B.samples && B.pos) B.samples.push([t - T00, Math.round(B.pos.x * 10) / 10, Math.round(B.pos.y * 10) / 10, B.ack, B.dir, B.seq]);
      }
      if (m.type === 'sim_village_day') B.day = m.day | 0;
      if (m.type === 'notice') B.notices.push({ t, text: String(m.text || '') });
      for (const f of B.listeners.slice()) f(m, t);
    });
    ws.on('error', () => res(B));
    ws.on('close', () => { B.closed = true; B.closedAt = now(); clearInterval(B.keep); clearInterval(B.walkIv); clearInterval(B.prox); });
    setTimeout(() => res(B), 30000);
  });
}
const send = (B, m) => { try { B.ws.send(JSON.stringify(m)); } catch (e) { /* */ } };
const bye = (B) => { if (!B) return; B.byUs = true; try { clearInterval(B.keep); clearInterval(B.walkIv); clearInterval(B.prox); B.ws.close(); } catch (e) { /* */ } };
const door = (v) => ({ x: v.cx * 32 + 16, y: v.cy * 32 + 16 });
const closingText = (t) => /장부를 닫는 중/.test(t);
// 클라 근접 틱(41-h-bubble `_evProximityTick`): 700ms 마다 260px 안 가장 가까운 마을 · `evBriefedDay`(vid → 날 · 비움 없음 · 존을 넘어도 그대로) · 날 = `sim_village_day`
function proxTick(B, CL, V) {
  if (!B.pos || !V) return;
  let best = null, bd = 260;
  for (const v of V) { const d = door(v), dd = Math.hypot(d.x - B.pos.x, d.y - B.pos.y); if (dd < bd) { bd = dd; best = v; } }
  CL.near = best ? best.vid : null;
  if (!best) return;
  const day = CL.day | 0;
  if (CL.briefed.get(best.vid) === day) { CL.withheld = (CL.withheld || 0) + 1; CL.lastWithheld = { vid: best.vid, day, at: now() }; return; }
  CL.briefed.set(best.vid, day);
  CL.sent.push({ vid: best.vid, day, at: now(), port: B.port });
  send(B, { type: 'village_brief', vid: best.vid });
}
function startProx(B, CL, V) { clearInterval(B.prox); const ph = rnd(0, 700); setTimeout(() => { if (!B.closed) B.prox = setInterval(() => { CL.day = B.day || CL.day; proxTick(B, CL, V); }, 700); }, ph); }
function classify(ns) {
  const far = ns.some((t) => /마을에서 너무 멉니다/.test(t));
  const stale = ns.some((t) => /마을 한가운데에서 너무 멉니다/.test(t));
  const npc = ns.some((t) => /사람이 열지 않습니다/.test(t));
  const ok = ns.some((t) => /꺼냈|인출했|받았습니다/.test(t));
  const closing = ns.some(closingText);
  return { far, stale, npc, ok, closing, refused: far || stale };
}
async function pressWithdraw(B) {
  const n0 = B.notices.length, t0 = now(); send(B, { type: 'chat', text: '/인출' });
  let first = null;
  for (let w = 0; w < 300; w++) { await sleep(10); const nn = B.notices.slice(n0).filter((n) => !closingText(n.text)); if (nn.length && first == null) { first = nn[0].t - t0; } if (first != null && now() - t0 > first + 600) break; if (now() - t0 > 3000) break; }
  const ns = B.notices.slice(n0).map((n) => n.text);
  return Object.assign({ ms: first == null ? null : Math.round(first), notices: ns.slice(-3).map((t) => t.slice(0, 44)) }, classify(ns));
}
// 깨끗한 가로 길(물 · 바위 · 생성 개체 없음) — e2e-handoff-proto `corridor` 와 같은 길
let TER = null, CH = null;
function terr() {
  if (!TER) { TER = require(path.join(SRV, 'server', 'terrain')); if (TER.setZonesMeta) TER.setZonesMeta(ZONES); CH = require(path.join(SRV, 'server', 'chunk')); }
  return TER;
}
function blockedL(z, lx, ly) { const T = terr(), Zc = ZONES[z]; if (lx < 0 || ly < 0 || lx >= Zc.zoneWidth || ly >= Zc.zoneHeight) return true; return !!(T.isWaterCellLocal(z, lx, ly) || T.isRockCellLocal(z, lx, ly)); }
function entsL(z, x0, y0, x1, y1) {
  terr(); const Zc = ZONES[z], CS = CH.CHUNK_SIZE; let n = 0;
  for (let cy = Math.floor(y0 / CS); cy <= Math.floor(y1 / CS); cy++) for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++) {
    if (cx < 0 || cy < 0 || cx * CS >= Zc.zoneWidth || cy * CS >= Zc.zoneHeight) continue;
    let a = []; try { a = (CH.generateChunkResources(z, Zc.biome, cx, cy, CS, null, 0) || []).concat(CH.overflowInto(z, Zc.biome, cx, cy, CS, null, 0) || []); } catch (e) { /* */ }
    for (const e of a) if (e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) n++;
  }
  return n;
}
function cleanLine(z, ax, ay, bx, by, pad, V) {
  const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 12));
  for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; for (let d = -pad; d <= pad; d += 16) if (blockedL(z, x + (Math.abs(by - ay) > Math.abs(bx - ax) ? d : 0), y + (Math.abs(by - ay) > Math.abs(bx - ax) ? 0 : d))) return false; }
  if (entsL(z, Math.min(ax, bx) - pad - 32, Math.min(ay, by) - pad - 32, Math.max(ax, bx) + pad + 32, Math.max(ay, by) + pad + 32)) return false;
  if (V) for (const v of V) { const d = door(v); if (Math.hypot(d.x - (ax + bx) / 2, d.y - (ay + by) / 2) < 420) return false; }   // 마을 건물 둘레는 피한다(지형 표에 없는 막힘)
  return true;
}
function walkSegment(z, V, k) {
  for (let j = 0; j < V.length; j++) {   // 마을 하나 둘레에 없으면 다음 마을
    const v = V[(k * 7 + 3 + j * 11) % V.length], d = door(v);
    for (let r = 520; r <= 2400; r += 160) for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2 + k, x = d.x + Math.cos(ang) * r, y = d.y + Math.sin(ang) * r;
      if (cleanLine(z, x, y, x + 320, y, 48, V)) return { x: Math.round(x), y: Math.round(y), len: 320, near: v.vid, j };
    }
  }
  return null;
}
// 걷기: 30Hz 입력(seq) · dir = +1/-1(가로) 또는 벡터
function startWalk(B, vx, vy) { clearInterval(B.walkIv); B.dir = vx > 0 ? 1 : vx < 0 ? -1 : (vy ? 2 : 0); B.walkIv = setInterval(() => send(B, { type: 'input', seq: ++B.seq, vx, vy }), 33); }
function stopWalk(B) { clearInterval(B.walkIv); B.dir = 0; send(B, { type: 'input', seq: ++B.seq, vx: 0, vy: 0 }); }
async function teleport(B, x, y, tries) {
  for (let i = 0; i < (tries || 6); i++) { send(B, { type: 'teleport_debug', x: Math.round(x), y: Math.round(y) }); await sleep(600); if (B.pos && Math.hypot(B.pos.x - x, B.pos.y - y) < 64) return true; }
  return false;
}

// ── 모드: boot ────────────────────────────────────────────────────────────────
function prevBootMs(world, arm) {
  const out = [];
  try {
    const sc = JSON.parse(fs.readFileSync(path.join(RAW, 'scout', `${world}.json`), 'utf8'));
    for (const b of sc.bootMs || []) out.push(b);
  } catch (e) { /* */ }
  try {
    for (const d of fs.readdirSync(path.join(RAW, 'raw'))) {
      try { const m = JSON.parse(fs.readFileSync(path.join(RAW, 'raw', d, 'meta.json'), 'utf8')); if (m.world === world && m.arm === arm && m.bootMs > 0 && m.tag !== TAG) out.push(m.bootMs); } catch (e) { /* */ }
    }
  } catch (e) { /* */ }
  return out;
}
async function modeBoot() {
  const z = E.T1515_ZONE || 'hanbando', world = E.T1515_WORLD || `fresh-${z}`, OFF = +(E.T1515_OFF || 10);
  Object.assign(META, { world, zone: z, off: OFF, ck: E.T1515_CK || null, preset: E.T1515_PRESET || null });
  let scout = null; try { scout = JSON.parse(fs.readFileSync(path.join(RAW, 'scout', `${world}.json`), 'utf8')); } catch (e) { scout = null; }
  const isScout = !scout || E.T1515_SCOUT === '1';
  let K = 0, D = null, Tt = null, spawnPlan = null;
  const bms = prevBootMs(world, ARM), bootEst = bms.length ? med(bms) : 30000;
  if (!isScout) {
    const lonW = scout.lonWest;
    const t = now();
    D = Math.ceil((t + bootEst + OFF * 1000 + 5000) / DAYMS + lonW);
    Tt = tailAt(D, lonW);
    if (E.T1515_NOSHIFT === '1') {
      K = 0; spawnPlan = Tt - OFF * 1000 - bootEst;   // 실제 경계를 기다린다
      log(`실제 경계를 기다림 ${(spawnPlan - now()) / 1000 | 0}초`);
      while (now() < spawnPlan) await sleep(Math.min(5000, Math.max(5, spawnPlan - now())));
    } else K = Math.round(Tt - OFF * 1000 - (t + bootEst));
    Object.assign(META, { K, D, tailShift: Tt, tailReal: Tt - K, bootEst, bootSamples: bms.length, lonWestPlan: lonW });
  }
  META.scout = isScout; saveMeta();
  log(`boot ${z} · 세계 ${world} · 팔 ${ARM} · 목표 경계 ${OFF}초 앞 · K ${K} · 예상 부팅 ${bootEst}ms · 정찰 ${isScout}`);
  const W = await bootWorld([z], K);
  if (!W) { log('central 기동 실패'); META.err = 'central'; saveMeta(); process.exit(2); }
  const Zr = W.zones[z]; META.spawn = Zr.spawn;
  const stopRef = { stop: false };
  const up = await Zr.wUp; META.up = up ? up.t : null;
  if (!up) { META.err = 'zone up'; saveMeta(); process.exit(2); }
  const sim = await Promise.race([Zr.wSim, sleep(5000).then(() => null)]); META.simReady = sim ? sim.t : null;
  const t731 = await Promise.race([Zr.wT731, sleep(3000).then(() => null)]);
  META.t731 = t731 ? parseT731(t731.line) : null; META.t731At = t731 ? t731.t : null;
  const readyT = META.simReady || META.up;
  META.bootMs = readyT - Zr.spawn;
  if (META.t731) {
    const tt = tailAt(META.t731.next, META.t731.west[1]);
    META.firstTailShift = tt; META.firstTailReal = tt - K;
    META.offReal = (tt - K - readyT) / 1000;   // 실제로 맞은 자리: 부팅(마을 시뮬 준비) → 첫 꼬리 마감까지 초
  }
  if (!isScout && META.offReal > 300) { META.missed = true; META.missedBy = +(META.offReal - DAYMS / 1000).toFixed(3); }   // 부팅이 경계보다 늦었다 — 첫 꼬리는 하루 뒤(이 판은 기록만 하고 끝)
  saveMeta();
  log(`존 떴다 · 부팅 ${META.bootMs}ms · 첫 꼬리 마감까지 ${META.offReal}초${META.missed ? ' — 경계를 놓침(하루 뒤)' : ''}`);
  if (META.missed) { META.ended = now(); saveMeta(); fs.writeFileSync(path.join(OUT, 'rig.done'), String(now())); process.exit(0); }
  const V = await villagesOf(z); META.villages = V ? V.length : 0; saveMeta();
  if (isScout) {
    fs.mkdirSync(path.join(RAW, 'scout'), { recursive: true });
    const sc = { world, zone: z, lonWest: META.t731 ? META.t731.west[1] : null, lonEast: META.t731 ? META.t731.east[1] : null, spreadS: META.t731 ? META.t731.spreadS : null, villages: V, bootMs: [META.bootMs], econDay: META.t731 ? META.t731.econDay : null };
    if (sc.lonWest != null) fs.writeFileSync(path.join(RAW, 'scout', `${world}.json`), JSON.stringify(sc));
    put('bots.jsonl', { k: 'scout', sc });
    fs.writeFileSync(path.join(OUT, 'rig.done'), String(now())); process.exit(0);
  }
  const perf = perfPoller([z], K, stopRef);
  // 봇 여덟
  const NB = +(E.T1515_BOTS || 8), NW = Math.min(3, NB);
  const bots = [];
  for (let i = 0; i < NB; i++) { bots.push(await bot(`tb${i}`, ZONES[z].port, null, { samples: i < NW })); await sleep(120); }
  META.botsIn = bots.filter((b) => b.welcome).length; META.botsAt = now(); saveMeta();
  log(`봇 ${META.botsIn}/${NB}`);
  const tEndCap = (META.firstTailReal || now()) + 240000;
  let stopAt = null;
  const reqTypes = ['withdraw', 'donate', 'trade', 'chat', 'view'];
  const runReq = async (B, i) => {
    const v = V[(i * 5 + 1) % V.length]; B.v = v; const d = door(v);
    await teleport(B, d.x, d.y);
    send(B, { type: '__e2e_give', items: { wood: 400 } });
    const CL = { briefed: new Map(), sent: [], day: 0 }; startProx(B, CL, V);
    await sleep(rnd(300, 900));
    let k = i;
    while (!B.closed && !(stopAt && now() > stopAt) && now() < tEndCap) {
      const type = reqTypes[k++ % reqTypes.length];
      const sent = now(); let reply = null, rtext = null;
      const n0 = B.notices.length;
      const f = (m, t) => {
        if (reply != null) return;
        if (m.type === 'notice' && closingText(String(m.text || ''))) return;
        if ((type === 'withdraw' || type === 'donate') && m.type === 'notice') { reply = t; rtext = String(m.text || '').slice(0, 40); }
        else if (type === 'trade' && (m.type === 'village_trade' || m.type === 'notice')) { reply = t; rtext = m.type; }
        else if (type === 'view' && (m.type === 'village_view' || m.type === 'notice')) { reply = t; rtext = m.type; }
        else if (type === 'chat' && m.type === 'chat' && m.pid === B.pid) { reply = t; rtext = 'chat'; }
      };
      B.listeners.push(f);
      if (type === 'withdraw') send(B, { type: 'chat', text: '/인출' });
      else if (type === 'donate') send(B, { type: 'village_donate', vid: v.vid, want: { wood: 1 } });
      else if (type === 'trade') send(B, { type: 'village_trade', vid: v.vid });
      else if (type === 'view') send(B, { type: 'village_view', vid: v.vid });
      else send(B, { type: 'chat', text: `안녕 ${k}` });
      while (reply == null && now() - sent < 90000 && !B.closed) await sleep(10);
      B.listeners = B.listeners.filter((x) => x !== f);
      const closing = B.notices.slice(n0).some((n) => closingText(n.text));
      put('bots.jsonl', { k: 'req', bot: i, type, at: sent - T00, ms: reply == null ? null : reply - sent, closing, r: rtext });
      if (type === 'view') send(B, { type: 'village_view_close' });
      await sleep(rnd(400, 900));
    }
  };
  const runWalk = async (B, i) => {
    const s = walkSegment(z, V, i);
    if (!s) { put('bots.jsonl', { k: 'walkseg', bot: i, err: 'no segment' }); return; }
    const ok = await teleport(B, s.x, s.y);
    put('bots.jsonl', { k: 'walkseg', bot: i, seg: s, ok });
    await sleep(800);
    let dir = 1;
    while (!B.closed && !(stopAt && now() > stopAt) && now() < tEndCap) {
      startWalk(B, dir, 0);
      const t0 = now(); while (now() - t0 < 4000 && !B.closed) await sleep(50);
      dir = -dir;
    }
    stopWalk(B);
  };
  const runPing = async (B, i) => {
    const S = [];
    while (!B.closed && !(stopAt && now() > stopAt) && now() < tEndCap) {
      const sent = now(); let got = null;
      const f = (m, t) => { if (m.type === 'pong' && got == null) got = t; };
      B.listeners.push(f); send(B, { type: 'ping', t: Date.now() });
      while (got == null && now() - sent < 60000 && !B.closed) await sleep(10);
      B.listeners = B.listeners.filter((x) => x !== f);
      S.push([sent - T00, got == null ? null : got - sent]);
      await sleep(250);
    }
    put('pings.jsonl', { bot: i, s: S });
  };
  // 끝 감시: 첫 꼬리 마감(/perf econTick.last 가 처음 선 때)이 끝나면 AFTER 초 뒤 멈춘다
  const AFTER = +(E.T1515_AFTER || 20) * 1000;
  const watch = (async () => {
    while (!stopAt) {
      const tl = perf.tails[z];
      if (tl && tl.length) { stopAt = now() + AFTER; META.firstTailSeen = tl[0].seen; META.firstTailAt = tl[0].at; META.firstTailDay = tl[0].day; saveMeta(); break; }
      if (now() > tEndCap) { stopAt = now(); META.err = 'no tail close before cap'; saveMeta(); break; }
      await sleep(500);
    }
  })();
  await Promise.all([watch, ...bots.map((B, i) => (i < NW ? runWalk(B, i) : runReq(B, i))), ...bots.map((B, i) => runPing(B, i))]);
  for (const [i, B] of bots.entries()) {
    put('bots.jsonl', { k: 'bot', bot: i, walker: i < NW, welcome: B.welcome, closed: B.closed && !B.byUs, closedAt: B.closed && !B.byUs ? B.closedAt - T00 : null, tickGapMax: B.tickGapMax, ticks: B.ticks });
    if (B.samples) put('walk.jsonl', { bot: i, s: B.samples });
  }
  // 마지막 /perf 한 번(늦게 선 배경 셈 · 꼬리 기록)
  await sleep(1500); stopRef.stop = true;
  bots.forEach(bye);
}

// ── 모드: cross (진짜 두 존 넘김) ─────────────────────────────────────────────
function seamCorridor() {
  const HB = ZONES.hanbando, NP = ZONES.nippon, seam = HB.worldOffsetX + HB.zoneWidth, WALK = 360;
  for (let k = 0; k < 160; k++) {
    const ly = Math.floor(HB.zoneHeight / 2) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 512, wy = (HB.worldOffsetY || 0) + ly;
    const nly = wy - (NP.worldOffsetY || 0);
    if (nly < 64 || nly > NP.zoneHeight - 64) continue;
    let clean = true;
    for (let x = seam - WALK - 64; x <= seam + WALK + 64 && clean; x += 16) for (let dy = -48; dy <= 48; dy += 16) {
      const zz = x < seam ? 'hanbando' : 'nippon', Zc = ZONES[zz];
      if (blockedL(zz, x - Zc.worldOffsetX, wy + dy - (Zc.worldOffsetY || 0))) { clean = false; break; }
    }
    if (!clean) continue;
    if (entsL('hanbando', HB.zoneWidth - WALK - 96, ly - 80, HB.zoneWidth, ly + 80) || entsL('nippon', 0, nly - 80, WALK + 96, nly + 80)) continue;
    return { seam, wy, ly, nly, fromLx: HB.zoneWidth - WALK };
  }
  return null;
}
async function scoutLonW(world) { try { return JSON.parse(fs.readFileSync(path.join(RAW, 'scout', `${world}.json`), 'utf8')).lonWest; } catch (e) { return null; } }
async function modeCross() {
  const TRIALS = +(E.T1515_TRIALS || 30), TAILS = E.T1515_TAIL_S != null && E.T1515_TAIL_S !== '' ? +E.T1515_TAIL_S : -30;
  const TZ = E.T1515_TAILZONE || 'hanbando';   // 어느 존의 꼬리 마감을 판 가운데로 맞추나(닛폰 = 넘어온 손님이 닿는 쪽이 마감 중)
  const lonW = await scoutLonW(`fresh-${TZ}`);
  const bms = prevBootMs(`fresh-${TZ}`, ARM.replace(/^(main|near)$/, 'on')), bootEst = (bms.length ? med(bms) : 30000) + 8000;   // 두 존이 함께 뜬다(부팅이 조금 길다)
  let K = 0, D = null;
  if (lonW != null) { const t = now(); D = Math.ceil((t + bootEst + TAILS * 1000 + 5000) / DAYMS + lonW); K = Math.round(tailAt(D, lonW) - TAILS * 1000 - (t + bootEst)); if (K < 0) { D++; K += DAYMS; } }
  Object.assign(META, { world: 'fresh-two', zones: ['hanbando', 'nippon'], tailZone: TZ, tailS: TAILS, K, D, bootEst, trials: TRIALS }); saveMeta();
  const C = seamCorridor(); META.corridor = C; saveMeta();
  if (!C) { log('경계 길 없음'); META.err = 'no corridor'; saveMeta(); process.exit(2); }
  const W = await bootWorld(['hanbando', 'nippon'], K);
  if (!W) { META.err = 'central'; saveMeta(); process.exit(2); }
  for (const z of ['hanbando', 'nippon']) {
    const up = await W.zones[z].wUp; if (!up) { META.err = `${z} up`; saveMeta(); process.exit(2); }
    const sim = await Promise.race([W.zones[z].wSim, sleep(5000).then(() => null)]);
    const t731 = await Promise.race([W.zones[z].wT731, sleep(3000).then(() => null)]);
    META[z] = { spawn: W.zones[z].spawn, up: up.t, simReady: sim ? sim.t : null, t731: t731 ? parseT731(t731.line) : null };
    if (META[z].t731) { META[z].firstTailReal = tailAt(META[z].t731.next, META[z].t731.west[1]) - K; META[z].offReal = (META[z].firstTailReal - (META[z].simReady || up.t)) / 1000; }
  }
  const VH = await villagesOf('hanbando'), VN = await villagesOf('nippon');
  META.vh = VH ? VH.length : 0; META.vn = VN ? VN.length : 0;
  const hv = new Set(VH.map((v) => v.vid)), common = VN.filter((v) => hv.has(v.vid)).map((v) => v.vid);
  META.vidOverlap = common.length; META.vidH = VH.map((v) => v.vid); META.vidN = VN.map((v) => v.vid); saveMeta();
  log(`두 존 떴다 · 한반도 ${META.vh} · 닛폰 ${META.vn} · 겹치는 번호 ${common.length} · 한반도 첫 꼬리 마감까지 ${META.hanbando.offReal}초`);
  const stopRef = { stop: false };
  perfPoller(['hanbando', 'nippon'], K, stopRef);
  await sleep(2000);
  for (let k = 0; k < TRIALS; k++) {
    const tr = { k: 'trial', trial: k, arm: ARM, t0: now() - T00 };
    const even = k % 2 === 0;
    const Nv = even ? VN.find((v) => v.vid === common[(k / 2) % common.length]) : null;
    const Hv = even ? VH.find((v) => v.vid === Nv.vid) : VH[(k * 3 + 1) % VH.length];
    const B = await bot(`xc${k}`, ZONES.hanbando.port);
    if (!B.welcome) { put('bots.jsonl', Object.assign(tr, { err: 'no welcome' })); bye(B); continue; }
    const CL = { briefed: new Map(), sent: [], day: 0 };
    // ① 한반도 마을 H 곳간 앞 — 클라 근접 틱이 brief(오늘 처음)
    const dH = door(Hv); await teleport(B, dH.x, dH.y); startProx(B, CL, VH); await sleep(1600);
    tr.h = Hv.vid; tr.briefH = CL.sent.some((s) => s.vid === Hv.vid);
    // ② 경계 길 서쪽 → 동쪽으로 걷는다
    clearInterval(B.prox);
    const okC = await teleport(B, C.fromLx, C.ly); tr.corr = okC;
    await sleep(600);
    let ho = null; const fH = (m, t) => { if (m.type === 'handoff' && !ho) ho = { t, target: m.targetZone, token: m.token, back: m.back }; };
    B.listeners.push(fH);
    const tw = now(); startWalk(B, 1, 0); startProx(B, CL, VH);
    while (!ho && now() - tw < 30000 && !B.closed) await sleep(20);
    tr.walkMs = now() - tw; tr.handoff = !!ho;
    if (!ho) { stopWalk(B); tr.err = 'no handoff'; tr.lastX = B.pos ? B.pos.x : null; put('bots.jsonl', tr); bye(B); continue; }
    // ③ 닛폰에 handoff_token 으로 붙는다(클라 `connect(target, 'primary', {token})` 꼴 — 관측 소켓 없음)
    const tC = now();
    const B2 = await bot(`xc${k}n`, ZONES.nippon.port, `handoff_token=${encodeURIComponent(ho.token)}`, { noKeep: false });
    stopWalk(B); clearInterval(B.prox);
    tr.connMs = B2.welcome ? B2.welAt - tC : null; tr.welcome2 = B2.welcome;
    if (!B2.welcome) { tr.err = 'no welcome nippon'; put('bots.jsonl', tr); bye(B); bye(B2); continue; }
    setTimeout(() => bye(B), 5000);   // 옛 주 소켓은 관측으로 남았다가 닫힌다
    for (let i = 0; i < 40 && !B2.pos; i++) await sleep(50);
    tr.arrive = B2.pos ? { x: Math.round(B2.pos.x), y: Math.round(B2.pos.y) } : null;
    // ④ 곧바로 닛폰 마을 N 곳간 앞 — 클라 근접 틱(존을 넘어도 `evBriefedDay` 그대로) · 1.4 ~ 2.0초 뒤 `/인출`
    const N = Nv || VN.filter((v) => !CL.briefed.has(v.vid))[(k * 5) % Math.max(1, VN.filter((v) => !CL.briefed.has(v.vid)).length)];
    tr.n = N.vid; tr.collide = CL.briefed.has(N.vid);
    const dN = door(N); const tp = now(); send(B2, { type: 'teleport_debug', x: dN.x, y: dN.y });
    CL.withheld = 0; const sent0 = CL.sent.length;
    B2.day = B2.day || CL.day;
    startProx(B2, CL, VN);
    await sleep(Math.max(0, rnd(1400, 2000) - (now() - tp)));
    tr.briefN = CL.sent.slice(sent0).some((s) => s.vid === N.vid); tr.withheld = CL.withheld | 0;
    tr.chatAt = now() - tp; tr.at = now() - T00;
    const r = await pressWithdraw(B2);
    Object.assign(tr, r);
    tr.part = !r.refused ? null : (tr.withheld && !tr.briefN ? 'client' : 'server');
    put('bots.jsonl', tr);
    bye(B2);
    await sleep(rnd(600, 1500));
  }
  stopRef.stop = true; await sleep(1500);
}

// ── 모드: adj (맞닿은 두 마을 사이를 걷는 손님) ───────────────────────────────
async function modeAdj() {
  const z = 'hanbando', TRIALS = +(E.T1515_TRIALS || 40), PAR = +(E.T1515_PAR || 4), TAILS = E.T1515_TAIL_S != null && E.T1515_TAIL_S !== '' ? +E.T1515_TAIL_S : -30;
  const lonW = await scoutLonW('fresh-hanbando');
  const bms = prevBootMs('fresh-hanbando', ARM.replace(/^(main|near)$/, 'on')), bootEst = bms.length ? med(bms) : 30000;
  let K = 0, D = null;
  if (lonW != null) { const t = now(); D = Math.ceil((t + bootEst + TAILS * 1000 + 5000) / DAYMS + lonW); K = Math.round(tailAt(D, lonW) - TAILS * 1000 - (t + bootEst)); if (K < 0) { D++; K += DAYMS; } }
  Object.assign(META, { world: 'fresh-hanbando', zone: z, tailS: TAILS, K, D, bootEst, trials: TRIALS, par: PAR }); saveMeta();
  const W = await bootWorld([z], K);
  if (!W) { META.err = 'central'; saveMeta(); process.exit(2); }
  const up = await W.zones[z].wUp; if (!up) { META.err = 'up'; saveMeta(); process.exit(2); }
  const sim = await Promise.race([W.zones[z].wSim, sleep(5000).then(() => null)]);
  const t731 = await Promise.race([W.zones[z].wT731, sleep(3000).then(() => null)]);
  Object.assign(META, { spawn: W.zones[z].spawn, up: up.t, simReady: sim ? sim.t : null, t731: t731 ? parseT731(t731.line) : null });
  if (META.t731) { META.firstTailReal = tailAt(META.t731.next, META.t731.west[1]) - K; META.offReal = (META.firstTailReal - (META.simReady || up.t)) / 1000; }
  const V = await villagesOf(z);
  let pair = null;
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) { const d = Math.hypot((V[i].cx - V[j].cx) * 32, (V[i].cy - V[j].cy) * 32); if (!pair || d < pair.d) pair = { a: V[i], b: V[j], d }; }
  // A 문에서 400px — B 쪽으로 곧은 길이 깨끗한 자리(아니면 B 쪽에서 가까운 각부터)
  const dA = door(pair.a), dB = door(pair.b), base = Math.atan2(dB.y - dA.y, dB.x - dA.x);
  let P = null;
  for (const da of [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.8, -0.8, 1.1, -1.1, 1.5, -1.5]) {
    const x = dA.x + Math.cos(base + da) * 400, y = dA.y + Math.sin(base + da) * 400;
    let ok = true; const n = 30; for (let i = 0; i <= n && ok; i++) { const px = x + (dA.x - x) * i / n, py = y + (dA.y - y) * i / n; if (i < n - 3 && blockedL(z, px, py)) ok = false; }
    if (ok) { P = { x: Math.round(x), y: Math.round(y), da }; break; }
  }
  Object.assign(META, { pair: { a: pair.a, b: pair.b, d: Math.round(pair.d) }, P, villages: V.length }); saveMeta();
  log(`맞닿은 두 마을 ${pair.a.name}(${pair.a.vid}) · ${pair.b.name}(${pair.b.vid}) ${Math.round(pair.d)}px · 걷는 출발 ${JSON.stringify(P)} · 첫 꼬리 마감까지 ${META.offReal}초`);
  if (!P) { META.err = 'no walk start'; saveMeta(); process.exit(2); }
  const stopRef = { stop: false };
  perfPoller([z], K, stopRef);
  let next = 0;
  const worker = async (w) => {
    await sleep(w * 2500);
    while (next < TRIALS) {
      const k = next++;
      const tr = { k: 'trial', trial: k, arm: ARM, w, t0: now() - T00 };
      const B = await bot(`aw${k}`, ZONES[z].port, null, { samples: true });
      if (!B.welcome) { put('bots.jsonl', Object.assign(tr, { err: 'no welcome' })); bye(B); continue; }
      const CL = { briefed: new Map(), sent: [], day: 0 };
      await teleport(B, dB.x, dB.y); startProx(B, CL, V); await sleep(1600);
      tr.briefB = CL.sent.some((s) => s.vid === pair.b.vid);
      clearInterval(B.prox);
      await teleport(B, P.x, P.y);   // 표시는 B 그대로(서버 표시는 brief · 화면이 바꾼다 — 순간 이동은 안 바꾼다)
      startProx(B, CL, V);
      const tw = now(); let last = { t: now(), d: Infinity };
      while (now() - tw < 25000 && !B.closed) {
        const p = B.pos; if (!p) { await sleep(50); continue; }
        const dx = dA.x - p.x, dy = dA.y - p.y, dd = Math.hypot(dx, dy);
        if (dd < 28) break;
        if (dd < last.d - 4) last = { t: now(), d: dd }; else if (now() - last.t > 2500) { tr.stuck = Math.round(dd); break; }
        const vx = dx / dd, vy = dy / dd;
        send(B, { type: 'input', seq: ++B.seq, vx, vy }); B.dir = 2;
        await sleep(33);
      }
      stopWalk(B);
      tr.walkMs = now() - tw; tr.dDoor = B.pos ? Math.round(Math.hypot(dA.x - B.pos.x, dA.y - B.pos.y)) : null;
      tr.briefA = CL.sent.find((s) => s.vid === pair.a.vid); tr.briefA = tr.briefA ? tr.briefA.at - tw : null;
      await sleep(rnd(300, 900));
      tr.at = now() - T00;
      const r = await pressWithdraw(B);
      Object.assign(tr, r);
      tr.tickGapMax = B.tickGapMax;
      put('bots.jsonl', tr);
      bye(B);
      await sleep(rnd(300, 900));
    }
  };
  await Promise.all(Array.from({ length: PAR }, (_, w) => worker(w)));
  await sleep(3000); stopRef.stop = true; await sleep(1500);
}

(async () => {
  log(`모드 ${MODE} · 팔 ${ARM} · 서버 ${META.srv} · 귀 ${PROBE ? '있음' : '없음'}`);
  if (MODE === 'boot') await modeBoot();
  else if (MODE === 'cross') await modeCross();
  else if (MODE === 'adj') await modeAdj();
  META.ended = now(); saveMeta();
  fs.writeFileSync(path.join(OUT, 'rig.done'), String(now()));
  await sleep(1000);
  process.exit(0);
})().catch((e) => { console.error(e); META.err = String(e && e.stack || e).slice(0, 400); saveMeta(); process.exit(1); });
