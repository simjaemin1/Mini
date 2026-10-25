#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T927 ② 탐침 · central + 존 둘 실서버 + 지연 프록시)
// === scripts/t927-save-race-probe.js — 같은 사람의 저장이 두 존에서 거의 같은 때 central 에 닿으면 **늦게 닿은 옛 값이 새 값을 덮나** ==========
//
// 왜(T927 · T916 다음): 몸 소실 결함 셋(T868 · T890 · T894→T916)은 모두 "저장이 엉뚱한 값으로 행을 덮거나 안 닿음"이었다. 남은 꼴 —
//   넘기는 중 출발 존(hanbando)의 주기 저장이 **넘기기 전에 나갔는데 늦게** 닿는다(망 재전송 · 연결 하나가 밀림). T843 은 넘긴 **뒤**의 껍데기 저장만 거르고
//   T916 의 조건부 쓰기는 줄에서 나온 다시 보내기만 막는다 — 넘기기 전에 이미 날아가던 평시 저장은 둘 다 안 걸린다.
//
// 지연 주입(하네스만 · 서버 코드 0): 출발 존의 `CENTRAL_URL` 을 이 탐침의 프록시로 돌린다. 프록시는 무장한 사람의 `POST /player/:id` 중
//   **넘기기 저장이 아닌 것**(`last_zone !== 'nippon'` — 주기 · 행동 · 순간이동 저장)을 `DELAY_MS` 늦춰 central 에 넘긴다(넘기기 저장 · 다른 문은 그대로).
//   central-client 시한(5초) 안이라 존은 "닿았다"고 안다(T916 줄에 안 선다 — 이 탐침은 평시 저장의 차례만 잰다). 도착 존(nippon)은 central 에 바로 붙는다.
//   출발 존 주기 간격 1초(`SAVE_INTERVAL_MS` — 이미 있는 손잡이 · 걷는 내내 주기 저장이 연다) · 도착 존 10분(두 읽음 사이에 도착 존 주기 저장이 안 끼게).
//
// 판마다 새 손님 하나 — 출발 존에서 생선 셋(kg 2.0 · 0.4 · 1.1 — 행동 저장 · 무장 전) → 무장 → 경계로 걸어 넘긴다 → 도착 존에 붙자마자 생선 하나 내려놓기
//   (도착 존 행동 저장 — 몸 칸이 바뀐다) → 행이 도착 존 몸이 될 때까지 본다(상황 선행 ①) → 늦춘 저장이 **그 뒤에** 닿았나(상황 선행 ② — 아니면 이 판은 순서를 못 잰다)
//   → 늦춘 저장이 다 닿고 잠시 뒤 행을 읽는다 = **도착 존이 그 순간 죽으면 남는 행** → 도착 존 산 몸과 칸마다 견준다(kg 원장 · 도구 · 로트 내구 · `last_zone`).
//   그 뒤 도착 소켓을 닫는다(도착 존 닫힐 때 저장) — 행이 다시 맞나는 정보로 센다(결함 창 = 도착 존 다음 저장까지).
//   길 셋: token(토큰 경로) · promote(승격 경로 — 실제 클라의 보통 넘기) · calm(대조 — 무장 안 함 · 늦춤 0: 이 자가 "같다"를 말할 줄 아나).
//   `--off` = `T927_BODY_VER=0`(central · 두 존 — 종전 바이트) 대조.
//
// 쓰는 법: node scripts/t927-save-race-probe.js [판=3] [길,길,...] [--off]   → 끝에 JSON 한 줄(`== JSON ==` 뒤)
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, XPORT = 3011, HPORT = 3020, NPORT = 3021;
const OFF = process.argv.includes('--off');
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const N = +(ARGS[0] || 3);
const PATHS = ARGS[1] ? ARGS[1].split(',') : ['token', 'promote', 'calm'];
const DDIR = '/tmp/t927-probe' + (OFF ? '-off' : '');
const DELAY_MS = 3000;   // 프록시 지연 — central-client 시한(5초) 안 · 넘기 메시지 → 도착 존 접속 저장 · 행동 저장(1초 안팎)보다 길다
const EDGE_PAD = 400, LAT_STEP = 2048;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x === undefined ? null : x);

fs.mkdirSync(DDIR, { recursive: true });
for (const f of fs.readdirSync(DDIR)) { try { fs.unlinkSync(path.join(DDIR, f)); } catch (e) {} }
const procs = [];
function boot(file, env, tag) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`${DDIR}/${tag}.log`, { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const KNOB = OFF ? { T927_BODY_VER: '0' } : {};

// ── 지연 프록시(출발 존 → central) ──
const ARM = new Set();   // 무장한 playerId
const LOG = [];          // 지나간 `POST /player/:id` — { pid, lz, sv, fish, t, tf, delayed, resp }
const svOf = (tj) => { try { const o = JSON.parse(tj); return Number.isFinite(o && o.sv) ? o.sv : null; } catch (e) { return null; } };
const fishOf = (tj) => { try { const o = JSON.parse(tj); const L = (o && o.kgLedger) || {}; return J(L.fish || L); } catch (e) { return null; } };
const proxy = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks); let delay = 0, info = null;
    const m = req.method === 'POST' && /^\/player\/([^/?]+)/.exec(req.url || '');
    if (m) {
      let b = {}; try { b = JSON.parse(buf.toString() || '{}'); } catch (e) {}
      info = { pid: decodeURIComponent(m[1]), lz: b.last_zone == null ? null : b.last_zone, sv: svOf(b.tools_json), fish: b.tools_json != null ? fishOf(b.tools_json) : null, t: Date.now(), tf: 0, delayed: false, resp: null };
      if (ARM.has(info.pid) && info.lz !== 'nippon') { delay = DELAY_MS; info.delayed = true; }
      LOG.push(info);
    }
    setTimeout(() => {
      const up = http.request({ host: '127.0.0.1', port: CPORT, method: req.method, path: req.url, headers: req.headers }, (ur) => {
        const rc = []; ur.on('data', (c) => rc.push(c));
        ur.on('end', () => { const body = Buffer.concat(rc); if (info) { info.tf = Date.now(); info.resp = body.toString().slice(0, 60); } res.writeHead(ur.statusCode, ur.headers); res.end(body); });
      });
      up.on('error', () => { try { res.writeHead(502); res.end(); } catch (e) {} });
      up.end(buf);
    }, delay);
  });
});

const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json());
function open(url, onMsg) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); const st = { ws, welcome: null };
    const t = setTimeout(() => rej(new Error('welcome timeout')), 30000);
    ws.on('error', (e) => { clearTimeout(t); rej(e); });
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome') { st.welcome = m; clearTimeout(t); res(st); } if (onMsg) onMsg(m, st); });
  });
}
function openObs(url, onMsg) {
  return new Promise((res, rej) => { const ws = new WebSocket(url); const st = { ws }; ws.on('error', rej); ws.on('open', () => res(st));
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (onMsg) onMsg(m, st); }); });
}
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
const rowBody = (row) => { try { return JSON.parse((row && row.tools_json) || 'null'); } catch (e) { return null; } };
const pick0 = (o) => { const v = Object.values((o && o.bodies) || {}); return v[v.length - 1] || null; };
// `test-handoff-body` crossEast 와 같은 걷기(동쪽 끝 순간이동 → 동쪽으로 걷기 · 넘기 메시지까지)
async function crossEast(a, han, crossed, pollMs = 100) {
  const waitNotice = () => new Promise((r) => {
    const h = (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'notice' && (m.kind === 'info' || m.kind === 'fishing') && /텔레포트|물/.test(String(m.text))) { a.ws.off('message', h); r(/텔레포트/.test(String(m.text))); } };
    a.ws.on('message', h);
  });
  const walk = setInterval(() => { try { a.ws.send(JSON.stringify({ type: 'input', vx: 1, vy: 0 })); } catch (e) {} }, 33);
  for (let i = 0; i < 60 && !crossed(); i++) {
    const pr = waitNotice();
    a.ws.send(JSON.stringify({ type: 'teleport_debug', x: han.zoneWidth - EDGE_PAD, y: LAT_STEP + ((3 + i) % 60) * LAT_STEP }));
    if (!await pr) continue;
    for (let k = 0; k < Math.round(16000 / pollMs) && !crossed(); k++) await sleep(pollMs);
  }
  clearInterval(walk);
}
// 칸 견주기 — 내구 칸(시간이 안 바꾼다)과 자리 존
const lotsDur = (L) => J(L == null ? null : Object.fromEntries(Object.entries(L).map(([k, a]) => [k, (Array.isArray(a) ? a : []).map((r) => (r && typeof r === 'object') ? { d: r.d, k: r.k, n: r.n } : r)])));
const fieldsOf = (b, lz) => ({ kgLedger: J((b || {}).kgLedger), tools: J(((b || {}).toolItems || []).map((t) => [t.type, t.d]).sort()), lots: lotsDur((b || {}).lots), last_zone: J(lz) });
const FIELDS = ['kgLedger', 'tools', 'lots', 'last_zone'];
function sameAs(row, live) {
  const A = fieldsOf(rowBody(row), row && row.last_zone), B = fieldsOf(live, 'nippon');
  const o = {}; for (const k of FIELDS) o[k] = A[k] === B[k]; return o;
}

let K = 0;
async function trip(P) {
  const k = ++K;
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones;
  const han = Z.hanbando, nip = Z.nippon;
  let handoffMsg = null, promoted = null;
  const a = await open(`ws://localhost:${HPORT}/?username=&name=t927${P}${k}&color=%23ffffff`, (m) => { if (m.type === 'handoff' && !handoffMsg) handoffMsg = m; });
  const pid = a.welcome.playerId;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: {}, tools: ['axe'], kgs: { fish: [2.0, 0.4, 1.1] }, quiet: true }));   // 행동 저장(무장 전 — 그대로 닿는다)
  await sleep(1200);
  const o = P === 'promote' ? await openObs(`ws://localhost:${NPORT}/?observer=1&vx=200&vy=${nip.zoneHeight / 2 | 0}`, (m) => { if (m.type === 'welcome' && m.promoted && !promoted) promoted = m; }) : null;
  const n0 = LOG.length;
  if (P !== 'calm') ARM.add(pid);
  await crossEast(a, han, () => !!handoffMsg);
  if (!handoffMsg) { try { a.ws.close(); if (o) o.ws.close(); } catch (e) {} ARM.delete(pid); return { P, k, crossed: false }; }
  const tMsg = Date.now();
  let b = null;
  if (P === 'promote') { o.ws.send(JSON.stringify({ type: 'promote_to_primary', token: handoffMsg.token })); for (let i = 0; i < 60 && !promoted; i++) await sleep(50); b = o; }
  else b = await open(`ws://localhost:${NPORT}/?handoff_token=${encodeURIComponent(handoffMsg.token)}`);
  const tJoin = Date.now();
  await sleep(300);
  try { b.ws.send(JSON.stringify({ type: 'drop_item', item: 'fish', amount: 1 })); } catch (e) {}   // 도착 존 행동 저장 — 몸 칸이 바뀐다
  const tDrop = Date.now();
  try { a.ws.close(); } catch (e) {}   // 클라는 옛 주 소켓을 내린다(출발 존 껍데기 — T843 이 그 저장을 거른다)
  await sleep(400);
  const live = pick0(await jget(`http://localhost:${NPORT}/bodydbg`));
  // 상황 선행 ① — 행이 도착 존 몸이 됐다(도착 존 저장이 닿았다)
  let tAt = 0;
  for (let i = 0; i < 40 && !tAt; i++) { const r = await rowOf(pid); const s = sameAs(r, live); if (FIELDS.every((f) => s[f])) tAt = Date.now(); else await sleep(100); }
  // 늦춘 저장이 다 닿을 때까지(+ 여유)
  for (let i = 0; i < 80 && LOG.slice(n0).some((e) => e.pid === pid && e.delayed && !e.tf); i++) await sleep(100);
  await sleep(800);
  const mine = LOG.slice(n0).filter((e) => e.pid === pid);
  const delayed = mine.filter((e) => e.delayed);
  const lateAfterAt = tAt ? delayed.filter((e) => e.tf > tAt).length : 0;   // 상황 선행 ② — 도착 존 저장 뒤에 닿은 늦춘 저장 수
  const row1 = await rowOf(pid);   // = 도착 존이 이 순간 죽으면 남는 행
  const same1 = sameAs(row1, live);
  const live1 = pick0(await jget(`http://localhost:${NPORT}/bodydbg`));   // 그 사이 도착 존 몸이 그대로인가(견준 몸이 움직이지 않았다)
  const liveStill = J(fieldsOf(live)) === J(fieldsOf(live1));
  ARM.delete(pid);
  try { b.ws.close(); } catch (e) {}
  await sleep(1500);
  const row2 = await rowOf(pid);
  const same2 = sameAs(row2, live1);
  const resp = {}; for (const e of delayed) resp[e.resp || '(없음)'] = (resp[e.resp || '(없음)'] || 0) + 1;
  return {
    P, k, crossed: true, pid, promoted: P === 'promote' ? !!promoted : null, joinMs: tJoin - tMsg, dropMs: tDrop - tMsg, atMs: tAt ? tAt - tMsg : null,
    nPosts: mine.length, nDelayed: delayed.length, lateAfterAt, delayedResp: resp,
    delayedSv: delayed.map((e) => e.sv), passSv: mine.filter((e) => !e.delayed).map((e) => [e.lz, e.sv]),
    liveFish: J((live || {}).kgLedger), row1Fish: J((rowBody(row1) || {}).kgLedger), row1Zone: row1 && row1.last_zone, row1Sv: svOf(row1 && row1.tools_json),
    same1, all1: FIELDS.every((f) => same1[f]), liveStill, same2, all2: FIELDS.every((f) => same2[f]),
  };
}

(async () => {
  const t0 = Date.now();
  await new Promise((r) => proxy.listen(XPORT, '127.0.0.1', r));
  const C = boot('central.js', Object.assign({ PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' }, KNOB), 'central');
  if (!(await FB.waitUp(C, /central server up on/, { name: 'central' })).ok) throw new Error('central 기동 실패');
  const common = Object.assign({ ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' }, KNOB);
  const H = boot('zone.js', Object.assign({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, CENTRAL_URL: `http://127.0.0.1:${XPORT}`, SAVE_INTERVAL_MS: '1000' }, common), 'zone-han');
  const hp = FB.waitUp(H, /zone server up on/, { name: 'zone', capMs: 300000 });
  const Nn = boot('zone.js', Object.assign({ PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/w-nip.db`, CENTRAL_URL: `http://localhost:${CPORT}`, SAVE_INTERVAL_MS: '600000' }, common), 'zone-nip');
  const np = FB.waitUp(Nn, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!(await hp).ok || !(await np).ok) throw new Error('존 기동 실패');
  console.log(`[T927 탐침] ${OFF ? '끔(T927_BODY_VER=0)' : '켬(기본)'} · 판 ${N} · 길 ${PATHS.join(',')} · 지연 ${DELAY_MS}ms · 기동 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const out = [];
  for (const P of PATHS) for (let i = 0; i < N; i++) {
    let r = null;
    for (let tries = 0; tries < 3; tries++) { r = await trip(P); r.tries = tries + 1; if (r.crossed && (P === 'calm' || r.lateAfterAt > 0)) break; }
    out.push(r);
    console.log(`  ${P}#${r.k} 넘김 ${r.crossed} · 늦춤 ${r.nDelayed}(뒤에 닿음 ${r.lateAfterAt}) · 응답 ${J(r.delayedResp)} · 행 ${r.row1Zone} 생선 ${r.row1Fish} vs 산 ${r.liveFish} · 칸 같음 ${J(r.same1)} · 닫은 뒤 ${r.all2}`);
  }
  const sum = {};
  for (const P of PATHS) {
    const rs = out.filter((r) => r.P === P && r.crossed && (P === 'calm' || r.lateAfterAt > 0));
    sum[P] = { n: rs.length, same: rs.filter((r) => r.all1).length, sameAfterClose: rs.filter((r) => r.all2).length,
      byField: Object.fromEntries(FIELDS.map((f) => [f, rs.filter((r) => r.same1[f]).length])), liveStill: rs.filter((r) => r.liveStill).length };
  }
  console.log('합:', J(sum));
  console.log('== JSON ==');
  console.log(J({ off: OFF, delayMs: DELAY_MS, sum, trips: out, sec: Math.round((Date.now() - t0) / 1000) }));
  process.exit(0);
})().catch((e) => { console.error('탐침 실패:', e && e.stack || e); process.exit(2); });
