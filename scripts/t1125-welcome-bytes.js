#!/usr/bin/env node
// === scripts/t1125-welcome-bytes.js — 존 welcome 바이트를 칸별로 잰다(T1125 ①) =====================================
//
// ★왜 [T1125 · ★재민 11-03 실기 "한반도 → 닛폰 넘긴 뒤 약 40초 먹통"] 도쿄 diag `sendBuf` 1,683 ~ 1,710 KB — 넘긴 직후 welcome 이 느린 길에서
//   10초 안에 다 못 갔다. 그 바이트가 **어느 칸**인가 · 압축(permessage-deflate · 손잡이 `T1125_WS_DEFLATE`)이면 선 위로 얼마인가를 존마다 잰다.
//
// ★재는 것(central + hanbando + nippon · 기본 = 운영 꼴(마을 · 짐승 · 도적 · 길 켬) · `--light` = 하네스 꼴(넷 끔)):
//   ⓐ 첫 접속 welcome(게스트) · ⓑ 관측 welcome(`observer=1`) · ⓒ 승격 welcome(그 존 `/handoff_prepare` 에 토큰을 걸고 관측 소켓에서 `promote_to_primary`)
//   칸마다 JSON 바이트(UTF-8) · 통째 바이트 · zlib deflateRaw(기본 = ws permessage-deflate 기본 꼴) 바이트 · 그 압축 시간(이 프로세스 · 참고)
//   선 위 바이트 — 같은 welcome 을 압축 협상한 소켓으로 한 번 더 받아 소켓 `bytesRead`(열린 뒤 → welcome 까지 · 머리 줄 포함)
//   ⚠승격 welcome 은 관측 소켓을 다시 쓰므로 그 소켓이 앞서 받은 관측 welcome 을 뺀 몫이다(관측 welcome 받은 뒤 → 승격 welcome 까지).
// 실행: node scripts/t1125-welcome-bytes.js [--light] [--json <파일>]   (존 둘 기동 · 운영 꼴 약 30초 + 잼 수 초)
// 판정 0 — 표 기계(단언 없음). 수는 그 판(로컬 기동 세계)의 수다 — 라이브는 짓고 쌓인 만큼 더 크다(도쿄 약 1.7 MB).
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const ZIDS = ['hanbando', 'nippon'];
const LIGHT = process.argv.includes('--light');
const JI = process.argv.indexOf('--json'), JOUT = JI > 0 ? process.argv[JI + 1] : null;
// ★[T1163] `--hf` = 첫 접속 · 관측 주소에 클라가 로비 `/terrain.json` 으로 가진 그 존 절 서명(`hf` · 정본 public/terrain-sig.js)을 싣는다 — 존 손잡이 `T1163_WELCOME_SIG=1` 이면 지형이 빠진다(바이트 전 → 후 표)
const HFON = process.argv.includes('--hf');
const _HFALL = HFON ? JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')) : null;
const hfQ = (z) => { if (!HFON || !_HFALL || !_HFALL[z]) return ''; return '&hf=' + encodeURIComponent(require(path.join(ROOT, 'public', 'terrain-sig.js')).terrainSig(_HFALL[z])); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
const boot = (name, file, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };

function postJSON(port, pth, body) {
  return new Promise((res) => { const d = JSON.stringify(body);
    const rq = http.request({ host: '127.0.0.1', port, path: pth, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (r) => { let s = ''; r.on('data', (b) => { s += b; }); r.on('end', () => res({ st: r.statusCode, s })); });
    rq.on('error', (e) => res({ st: 0, s: String(e.message) })); rq.end(d); });
}
// 칸별 바이트 · 통째 · 압축
function measure(raw) {
  const m = JSON.parse(raw), fields = {};
  for (const k of Object.keys(m)) fields[k] = Buffer.byteLength(JSON.stringify(m[k]) || '');
  const buf = Buffer.from(raw);
  const t0 = process.hrtime.bigint(); const z = zlib.deflateRawSync(buf); const zMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { bytes: buf.length, zBytes: z.length, zMs: +zMs.toFixed(1), fields, kind: m.observer ? 'observer' : (m.promoted ? 'promote' : 'first') };
}
// 한 소켓 — `want(m)` 이 참인 welcome 까지 · deflate = 압축 협상(선 위 바이트) · 끔 = 날 JSON
function openWs(url, deflate) {
  const ws = new WebSocket(url, { perMessageDeflate: !!deflate });
  const st = { ws, msgs: [], open: 0, read0: 0, wait: null };
  ws.on('open', () => { st.open = Date.now(); st.read0 = ws._socket ? ws._socket.bytesRead : 0; });
  ws.on('message', (d) => { const s = String(d); let m = null; try { m = JSON.parse(s); } catch (e) {}
    st.msgs.push({ type: m && m.type, len: Buffer.byteLength(s), at: Date.now(), read: ws._socket ? ws._socket.bytesRead : 0, raw: m && m.type === 'welcome' ? s : null, m: (m && m.type !== 'welcome') ? m : null });
    if (st.wait && st.wait.fn(m)) { const w = st.wait; st.wait = null; w.res(st.msgs[st.msgs.length - 1]); } });
  ws.on('error', () => {});
  return st;
}
function waitMsg(st, fn, ms, from) {   // from = 이 번호 뒤에 온 것만
  const hit = st.msgs.slice(from || 0).find((x) => fn(x.raw ? JSON.parse(x.raw) : x.m));
  if (hit) return Promise.resolve(hit);
  return new Promise((res) => { const t = setTimeout(() => { st.wait = null; res(null); }, ms || 60000); st.wait = { fn: (m) => fn(m), res: (x) => { clearTimeout(t); res(x); } }; });
}
const isWel = (pred) => (m) => !!(m && m.type === 'welcome' && pred(m));

async function oneZone(z) {
  const Z = ZONES[z], port = Z.port, out = {};
  const vx = Math.round(Z.zoneWidth / 2), vy = Math.round(Z.zoneHeight / 2);
  for (const deflate of [false, true]) {
    const tag = deflate ? 'wire' : 'raw';
    // ⓐ 첫 접속(게스트)
    { const st = openWs(`ws://127.0.0.1:${port}/?name=t1125${z.slice(0, 3)}${tag}&color=%23aa5533${hfQ(z)}`, deflate);
      const w = await waitMsg(st, isWel((m) => !m.observer), 120000);
      if (w) { if (!deflate) out.first = measure(w.raw); else out.first.wire = w.read - st.read0; out.first['head_' + tag] = st.msgs.some((x) => x.type === 'welcome_head'); }
      try { st.ws.close(); } catch (e) {} }
    // ⓑ 관측
    const ob = openWs(`ws://127.0.0.1:${port}/?observer=1&vx=${vx}&vy=${vy}${hfQ(z)}`, deflate);
    const wo = await waitMsg(ob, isWel((m) => !!m.observer), 120000);
    if (wo) { if (!deflate) out.observer = measure(wo.raw); else out.observer.wire = wo.read - ob.read0; out.observer['head_' + tag] = ob.msgs.some((x) => x.type === 'welcome_head'); }
    // ⓒ 승격 — 그 존 안 문에 토큰을 걸고 관측 소켓에서 승격(보낸 존 없음 = ACK 0)
    const token = `t1125-${z}-${tag}-${Date.now()}`;
    const pr = await postJSON(port, '/handoff_prepare', { token, source_zone: null, player_id: `anon_t1125${tag}${z.slice(0, 3)}`, name: 't1125', x: vx, y: vy, inventory: { wood: 0, stone: 0 }, proto: 1 });
    if (pr.st === 200 && wo) {
      const r0 = ob.ws._socket ? ob.ws._socket.bytesRead : 0, n0 = ob.msgs.length;
      ob.ws.send(JSON.stringify({ type: 'promote_to_primary', token }));
      const wp = await waitMsg(ob, isWel((m) => !!m.promoted), 60000, n0);
      if (wp) { if (!deflate) out.promote = measure(wp.raw); else out.promote.wire = wp.read - r0; out.promote['head_' + tag] = ob.msgs.slice(n0).some((x) => x.type === 'welcome_head'); }
    } else out['promoteErr_' + tag] = `${pr.st} ${String(pr.s).slice(0, 80)}`;
    try { ob.ws.close(); } catch (e) {}
    await sleep(500);
  }
  return out;
}

(async () => {
  const D = path.join(require('os').tmpdir(), `t1125-wb-${process.pid}`); fs.mkdirSync(D, { recursive: true });   // ★[T1163] 종전 /tmp — 샌드박스 맥에서도 돌게 os 임시 폴더
  const R = { card: 'T1125', made: new Date().toISOString().slice(0, 10), world: LIGHT ? '하네스 꼴(ENABLE_VILLAGES · WILDLIFE · BANDITS · ROADS = 0)' : '운영 꼴(기능 기본)',
    hf: HFON, knobs: { T1163_WELCOME_SIG: process.env.T1163_WELCOME_SIG || '(기본 끔)', T1125_WS_DEFLATE: process.env.T1125_WS_DEFLATE || '(기본)', T1125_WEL_HEAD: process.env.T1125_WEL_HEAD || '(기본)', T1125_BIG: process.env.T1125_BIG || '(기본 65536)' }, zones: {} };
  try {
    const c = boot('central', 'central.js', { PORT: '3010', DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') });
    await FB.waitUp(c, /central server up on/, { name: 'central' });
    const common = Object.assign({ CENTRAL_URL: 'http://localhost:3010', PUBLIC_HOST: 'localhost' }, LIGHT ? { ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' } : {});
    const ups = await Promise.all(ZIDS.map((z) => FB.waitUp(boot(z, 'zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${D}/w-${z}.db` }, common)), /zone server up on/, { name: z, capMs: 900000 })));
    if (!ups.every((u) => u.ok)) { console.log('기동 실패', ups.map((u) => u.why)); process.exitCode = 1; return; }
    await sleep(5000);
    for (const z of ZIDS) R.zones[z] = await oneZone(z);
  } finally {
    for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
    await sleep(800); try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {}
  }
  const KB = (n) => (n / 1024).toFixed(1);
  console.log(`\n=== welcome 바이트(T1125 ①) — ${R.world} ===`);
  for (const [z, o] of Object.entries(R.zones)) for (const k of ['first', 'observer', 'promote']) {
    const v = o[k]; if (!v) { console.log(`${z} ${k}: 없음 ${o['promoteErr_raw'] || ''}`); continue; }
    const top = Object.entries(v.fields).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f, n]) => `${f} ${KB(n)}`).join(' · ');
    console.log(`${z} ${k}: ${KB(v.bytes)} KB → 압축 ${KB(v.zBytes)} KB(${(v.bytes / Math.max(1, v.zBytes)).toFixed(1)}배 · ${v.zMs} ms) · 선 위 ${v.wire != null ? KB(v.wire) + ' KB' : '-'} · 머리 ${v.head_raw ? 'O' : 'X'}/${v.head_wire ? 'O' : 'X'} — ${top}`);
  }
  if (JOUT) { fs.mkdirSync(path.dirname(JOUT), { recursive: true }); fs.writeFileSync(JOUT, JSON.stringify(R, null, 1) + '\n'); console.log(`\n→ ${JOUT}`); }
})().catch((e) => { console.error('실패:', e); process.exit(1); });
