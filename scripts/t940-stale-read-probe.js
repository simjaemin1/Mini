#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T940 ② 탐침 · central + 존 둘 실서버 + 지연 프록시 · `t927-save-race-probe` 꼴)
// === scripts/t940-stale-read-probe.js — 존 A 로그아웃 직후 존 B 로그인: **A 의 닫힐 때 저장이 닿기 전에 B 가 행을 읽나** ==========
//
// 왜(T940 · T927 회부 2): T927 몸 버전은 "늦게 닿은 옛 저장"(버전이 작다)만 거른다. 존 A 에서 끊고 곧바로 존 B 로 붙으면 A 의 닫힐 때 저장(버전 v+1)이
//   닿기 **전에** B 가 행(버전 v)을 읽어 옛 몸으로 시작할 수 있다 — B 의 첫 저장도 v+1(같은 버전 → 쓴다) · 그 뒤 저장은 v+2 라 A 가 마지막에 바꾼 칸이
//   B 의 옛 몸으로 덮여 영구로 사라진다(버전으로는 못 가른다 — "늦게 닿은 저장"이 아니라 "늦게 닿기 **전에** 읽은 접속").
//
// 지연 주입(하네스만 · 서버 코드 0): 존 A(hanbando)의 `CENTRAL_URL` 을 이 탐침의 프록시로 돌린다 — 무장한 사람의 `POST /player/:id` 를 `DELAY_MS` 늦춘다
//   (central-client 시한 5초 안 — A 는 "닿았다"고 안다). 존 B(nippon)는 central 에 바로 붙는다. 두 존 주기 저장 10분(그 사이 다른 쓰기 0).
// 판마다 새 손님 하나 — A 에서 생선 둘 지급(저장 · 무장 전 · 행 = 생선) → A 산 몸에만 숙련 · 어획 기록을 세운다(`__e2e_body` · 저장 안 함 — 행은 아직 모른다 ·
//   상황 선행) → 무장 → A 소켓을 닫는다(닫힐 때 저장 = 숙련 · 어획을 실은 유일한 저장 — 늦춘다) → **곧바로** 같은 손님 토큰으로 B 에 붙는다 →
//   B 산 몸이 A 의 마지막 칸을 가졌나(B 가 옛 행을 읽었나) → B 에서 생선 하나 내려놓기(B 행동 저장) → 늦춘 저장이 닿을 때까지 · B 를 닫는다(B 닫힐 때 저장) →
//   행이 A 의 마지막 칸(숙련 · 어획)을 가졌나 = **영구 소실** 판정.
//   길 셋: race(무장 — A 저장 3초 늦춤) · calm(대조 — 늦춤 0: 보통 망에서 B 가 A 저장 뒤에 읽나 · 그 여유 ms = 창 크기 표) ·
//   live(A 를 **안 닫은 채** B 로 붙는다 — 켬이면 A 가 지금 저장하고 그 세션을 내린다 · A 소켓은 판 끝에 닫는다 · 늦춤 0).
//   `--off` = `T940_LOGIN_FLUSH=0`(두 존 — 고침 끔 · 종전 바이트) · `--t927-off` = 거기에 `T927_BODY_VER=0`(central · 두 존)까지 — 고치기 전 판의 두 꼴.
//
// 쓰는 법: node scripts/t940-stale-read-probe.js [판=3] [길,길] [--off]   → 끝에 JSON 한 줄(`== JSON ==` 뒤)
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
const PATHS = ARGS[1] ? ARGS[1].split(',') : ['race', 'calm'];
const DDIR = '/tmp/t940-probe' + (process.argv.includes('--off') ? '-off' : '') + (process.argv.includes('--t927-off') ? '-t927off' : '');
const DELAY_MS = 3000;   // T927 탐침과 같은 지연 — central-client 시한(5초) 안
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
const T927OFF = process.argv.includes('--t927-off');
const KNOB = Object.assign(OFF ? { T940_LOGIN_FLUSH: '0' } : {}, T927OFF ? { T927_BODY_VER: '0' } : {});

// ── 지연 프록시(존 A → central) ── t927 탐침과 같은 꼴
const ARM = new Set(), LOG = [];
const svOf = (tj) => { try { const o = JSON.parse(tj); return Number.isFinite(o && o.sv) ? o.sv : null; } catch (e) { return null; } };
const proxy = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks); let delay = 0, info = null;
    const m = req.method === 'POST' && /^\/player\/([^/?]+)/.exec(req.url || '');
    if (m) {
      let b = {}; try { b = JSON.parse(buf.toString() || '{}'); } catch (e) {}
      info = { pid: decodeURIComponent(m[1]), lz: b.last_zone == null ? null : b.last_zone, sv: svOf(b.tools_json), t: Date.now(), tf: 0, delayed: false, resp: null };
      if (ARM.has(info.pid)) { delay = DELAY_MS; info.delayed = true; }
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
function open(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); const st = { ws, welcome: null, kicked: false };
    const t = setTimeout(() => rej(new Error('welcome timeout')), 30000);
    ws.on('error', (e) => { clearTimeout(t); rej(e); });
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome') { st.welcome = m; st.tW = Date.now(); clearTimeout(t); res(st); } if (m.type === 'kicked') st.kicked = true; });
  });
}
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
const rowBody = (row) => { try { return JSON.parse((row && row.tools_json) || 'null'); } catch (e) { return null; } };
const bodyOf = async (port, name) => { const o = await jget(`http://localhost:${port}/bodydbg${name ? '?name=' + encodeURIComponent(name) : ''}`); const v = Object.values((o && o.bodies) || {}); return (name && o.bodies && o.bodies[name]) || v[v.length - 1] || null; };
// A 산 몸에만 세울 칸(저장 안 함) — 빈 칸이 아닌 값(T890 · T916 탐침과 같은 값)
const LIVE = { craftSkill: { toolmaking: 7, mining: 3 }, fishStats: { caught: 4, maxKg: 2.0, lostMaxKg: 1.5 } };
const KEYS = Object.keys(LIVE);
const hasLive = (b) => !!b && KEYS.every((k) => J(b[k]) === J(LIVE[k]));

let K = 0;
async function trip(P) {
  const k = ++K;
  const a = await open(`ws://localhost:${HPORT}/?username=&name=t940${P}${k}&color=%23ffffff`);
  const pid = a.welcome.playerId, tok = a.welcome.guestToken;
  const name = ((await rowOf(pid)) || {}).name;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: {}, tools: ['axe'], kgs: { fish: [2.0, 0.4] }, quiet: true }));   // 저장한다(무장 전 — 그대로 닿는다)
  await sleep(1200);
  a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', quiet: true }, LIVE)));   // 저장 안 한다(A 산 몸만)
  await sleep(600);
  const liveA = await bodyOf(HPORT, name);
  const row0 = await rowOf(pid);
  const pre = hasLive(liveA) && !hasLive(rowBody(row0));   // 상황 선행 — A 산 몸은 가졌고 · 행은 아직 모른다(닫힐 때 저장이 유일한 길)
  const n0 = LOG.length;
  if (P === 'race') ARM.add(pid);
  const tClose = Date.now();
  if (P !== 'live') { try { a.ws.close(); } catch (e) {} }   // live = A 를 안 닫은 채 B 로 붙는다(A 에 아직 붙어 있는 몸 — `/flush_player` 가 지금 저장하고 내리는 갈래)
  const b = await open(`ws://localhost:${NPORT}/?username=&name=${encodeURIComponent(name || '')}&color=%23ffffff&guest_token=${encodeURIComponent(tok)}`);
  const tB = b.tW;
  await sleep(400);
  const liveB = await bodyOf(NPORT, name);
  const samePid = b.welcome.playerId === pid;
  const aKicked = a.kicked;
  try { b.ws.send(JSON.stringify({ type: 'drop_item', item: 'fish', amount: 1 })); } catch (e) {}   // B 행동 저장
  for (let i = 0; i < 80 && LOG.slice(n0).some((e) => e.pid === pid && !e.tf); i++) await sleep(100);   // A 의 (늦춘) 저장이 다 닿을 때까지
  await sleep(800);
  const row1 = await rowOf(pid);   // = B 가 이 순간 죽으면 남는 행
  ARM.delete(pid);
  try { b.ws.close(); } catch (e) {}
  try { a.ws.close(); } catch (e) {}   // live 판 — 여기서야 A 소켓을 닫는다(켬이면 이미 내려졌다 · 닫힐 때 저장 0)
  await sleep(1500);
  const row2 = await rowOf(pid);   // B 닫힐 때 저장 뒤 — 다음 접속의 몸
  const aSaves = LOG.slice(n0).filter((e) => e.pid === pid);
  const aClose = aSaves.filter((e) => e.t >= tClose);
  const tLand = aClose.length ? Math.max(...aClose.map((e) => e.tf)) : 0;
  return {
    P, k, pid, samePid, pre, joinMs: tB - tClose, aKicked,
    aClose: aClose.map((e) => ({ lz: e.lz, sv: e.sv, sentMs: e.t - tClose, landMs: e.tf - tClose, delayed: e.delayed, resp: e.resp })),
    marginMs: tLand ? tB - tLand : null,   // B welcome − A 닫힐 때 저장이 닿은 때(+ = A 저장이 먼저 닿았다 · − = B 가 그 전에 붙었다)
    bGotA: hasLive(liveB), row1HasA: hasLive(rowBody(row1)), row2HasA: hasLive(rowBody(row2)),
    svB: liveB && liveB.sv, sv1: svOf(row1 && row1.tools_json), sv2: svOf(row2 && row2.tools_json),
    fish2: J(((rowBody(row2) || {}).kgLedger || {}).fish || null),
  };
}

(async () => {
  const t0 = Date.now();
  await new Promise((r) => proxy.listen(XPORT, '127.0.0.1', r));
  const C = boot('central.js', Object.assign({ PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' }, KNOB), 'central');
  if (!(await FB.waitUp(C, /central server up on/, { name: 'central' })).ok) throw new Error('central 기동 실패');
  const common = Object.assign({ ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1', SAVE_INTERVAL_MS: '600000' }, KNOB);
  const H = boot('zone.js', Object.assign({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, CENTRAL_URL: `http://127.0.0.1:${XPORT}` }, common), 'zone-han');
  const hp = FB.waitUp(H, /zone server up on/, { name: 'zone', capMs: 300000 });
  const Nn = boot('zone.js', Object.assign({ PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/w-nip.db`, CENTRAL_URL: `http://localhost:${CPORT}` }, common), 'zone-nip');
  const np = FB.waitUp(Nn, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!(await hp).ok || !(await np).ok) throw new Error('존 기동 실패');
  console.log(`[T940 탐침] ${OFF ? '끔(T940_LOGIN_FLUSH=0)' : '켬(기본)'}${T927OFF ? ' · T927_BODY_VER=0' : ''} · 판 ${N} · 길 ${PATHS.join(',')} · 지연 ${DELAY_MS}ms · 기동 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const out = [];
  for (const P of PATHS) for (let i = 0; i < N; i++) {
    const r = await trip(P); out.push(r);
    console.log(`  ${P}#${r.k} 선행 ${r.pre} · 같은 사람 ${r.samePid} · B 붙음 +${r.joinMs}ms · A 내려짐 ${r.aKicked} · A 닫힐 때 저장 ${J(r.aClose.map((e) => [e.sv, e.landMs, e.resp]))} · 여유 ${r.marginMs}ms · B 가 A 칸 받음 ${r.bGotA} · 행(B 살아 있음) ${r.row1HasA} · 행(B 닫은 뒤) ${r.row2HasA} · 버전 B ${r.svB} 행 ${r.sv1}→${r.sv2}`);
  }
  const sum = {};
  for (const P of PATHS) {
    const rs = out.filter((r) => r.P === P && r.pre && r.samePid);
    const ms = rs.map((r) => r.marginMs).filter((x) => x != null);
    sum[P] = { n: rs.length, bGotA: rs.filter((r) => r.bGotA).length, aKicked: rs.filter((r) => r.aKicked).length, kept: rs.filter((r) => r.row2HasA).length, lost: rs.filter((r) => !r.row2HasA).length,
      marginMs: ms.length ? { min: Math.min(...ms), max: Math.max(...ms) } : null, joinMs: rs.map((r) => r.joinMs) };
  }
  console.log('합:', J(sum));
  console.log('== JSON ==');
  console.log(J({ off: OFF, t927off: T927OFF, delayMs: DELAY_MS, sum, trips: out, sec: Math.round((Date.now() - t0) / 1000) }));
  process.exit(0);
})().catch((e) => { console.error('탐침 실패:', e && e.stack || e); process.exit(2); });
