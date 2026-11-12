#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1125-welcome.js — 큰 welcome 은 압축하고 앞에 머리 한 줄 · 작은 줄은 그대로 (T1125 ② ③) ===========
//
// ★왜 [T1125 · ★재민 11-03 실기 "한반도 → 닛폰 넘긴 뒤 약 40초 먹통"] 넘긴 직후 welcome(라이브 약 1.7 MB)이 느린 길에서 10초 안에 못 갔고,
//   클라 감시견(틱 10초 · pong 15초)이 받는 중인 소켓을 끊었다(다시 붙으면 같은 바이트를 처음부터). 고침 둘(서버 손잡이 · 켬 기본 후보):
//   · `T1125_WS_DEFLATE` — 존 WebSocket permessage-deflate · **큰 메시지만**(`T1125_BIG` 64 KB) · 서버 문맥 이어 쓰기 끔(ws 는 그때만 문턱을 본다)
//   · `T1125_WEL_HEAD` — 큰 welcome 바로 앞에 `{ type: 'welcome_head', bytes, waitMs }`(waitMs = bytes ÷ 42.5 KB/s = 1.7 MB ÷ 40초) — 클라가 "받는 중"을 안다(`_t1125Hold`)
// ★재는 것(central + 닛폰 · 하네스 꼴 · 날 소켓으로 프레임 머리(RSV1 = 압축 표시)를 직접 읽는다 — ws 클라 라이브러리는 그 비트를 안 보여 준다):
//   ⓐ 켬 · 압축 내놓음: 응답 확장 = permessage-deflate + server_no_context_takeover · 머리(압축 0 · 작음) 바로 다음이 welcome(압축 1) ·
//      머리 bytes = 푼 welcome 바이트 · waitMs = ⌈bytes ÷ (42.5 × 1024) × 1000⌉ · 문턱 밑 프레임은 다 압축 0 · 문턱 위는 다 압축 1
//   ⓑ 켬 · 압축 안 내놓음(옛 브라우저 꼴): 확장 0 · welcome 날 글자(압축 0) · 머리는 그대로 선다(머리는 압축과 따로)
//   ⓒ 켬 · 관측 welcome · 승격 welcome(그 존 /handoff_prepare 토큰 → 관측 소켓 promote_to_primary) — 64 KB 이상이면 머리 바로 다음이 그 welcome(승격은 ⑥ 로 작아져 머리 0)
//   ⓓ 끔(넷 다 `=0`) · 압축 내놓음: 확장 0(협상 안 됨) · 머리 0 · welcome 압축 0 · welcome 칸 이름 = 켬과 같다(글자 · 칸 · 차례 종전 그대로)
//   ⓔ 켬 · ★추신 ⑥ 승격 welcome 가볍게(`T1125_LEAN_PROMOTE`): 첫 접속 · 관측 welcome 에 판 서명(`sig.ht` 지형 · `sig.tb` 표 일곱) · 관측 소켓 승격 welcome 엔 지형 0(그 소켓이 받았다) ·
//      클라가 `have.tb` 로 표 서명을 알리면 표 일곱도 0(몸 · 짐 · 자리 · 시계만) · 모르는 서명이면 종전대로 싣는다 · uiCfg `keepPred`(⑧)
//   ⓢ 소스: 서버 `sendWelcome` 네 자리(첫 접속 · 관측 · 승격 · T1092 되돌림) · ws 옵션 · 클라 `_t1125Hold` 감시 셋(pong · 틱 · 탭 복귀) · `welcome_head` 갈래
// 실행: node scripts/test-t1125-welcome.js   (존 기동 둘 · 약 30초)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const Z = ZONES.nippon;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BIG = 64 * 1024, KBPS = 1700 / 40;   // 서버 기본 `T1125_WEL_KBPS`(1.7 MB ÷ 40초)

// 날 소켓 — 업그레이드 응답 머리 · 서버 프레임(FIN · RSV1 · opcode · 몸)을 그대로 적는다. 압축 프레임은 풀어서 JSON 으로.
function rawWs(pathQ, offerDeflate, untilFn, ms) {
  return new Promise((res) => {
    const s = net.connect(Z.port, '127.0.0.1');
    const out = { ext: null, frames: [], err: null }; let buf = Buffer.alloc(0), hdr = false; let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(t); try { s.destroy(); } catch (e) {} res(out); };
    const t = setTimeout(() => { out.err = 'timeout'; fin(); }, ms || 30000);
    s.on('connect', () => {
      s.write(`GET ${pathQ} HTTP/1.1\r\nHost: 127.0.0.1:${Z.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n`
        + (offerDeflate ? 'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n' : '') + '\r\n');
    });
    s.on('data', (b) => {
      buf = Buffer.concat([buf, b]);
      if (!hdr) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; const h = buf.slice(0, i).toString(); hdr = true; buf = buf.slice(i + 4);
        const m = h.match(/sec-websocket-extensions:\s*([^\r\n]*)/i); out.ext = m ? m[1] : ''; out.status = +(h.split(' ')[1] || 0); }
      for (;;) {
        if (buf.length < 2) return;
        const b0 = buf[0], b1 = buf[1]; let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const body = buf.slice(off, off + len); buf = buf.slice(off + len);
        const f = { fin: !!(b0 & 0x80), rsv1: !!(b0 & 0x40), op: b0 & 0x0f, wire: len, len, type: null, json: null };
        if (f.op === 1) { let txt = body; if (f.rsv1) { try { txt = zlib.inflateRawSync(Buffer.concat([body, Buffer.from([0, 0, 0xff, 0xff])]), { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch (e) { f.bad = String(e.message); } }
          f.len = txt.length; try { f.json = JSON.parse(txt.toString()); f.type = f.json && f.json.type; } catch (e) {} }
        out.frames.push(f);
        if (untilFn(out)) return fin();
      }
    });
    s.on('error', (e) => { out.err = String(e.message); fin(); });
  });
}
function postJSON(pth, body) {
  return new Promise((res) => { const d = JSON.stringify(body);
    const rq = http.request({ host: '127.0.0.1', port: Z.port, path: pth, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (r) => { let s = ''; r.on('data', (b) => { s += b; }); r.on('end', () => res(r.statusCode)); });
    rq.on('error', () => res(0)); rq.end(d); });
}
// ws 라이브러리 소켓 — 메시지 차례만(관측 · 승격)
function wsOrder(url) { const ws = new WebSocket(url, { perMessageDeflate: false }); const st = { ws, list: [] };
  ws.on('message', (d) => { try { const m = JSON.parse(String(d)); st.list.push({ type: m.type, m: m.type === 'welcome' ? { observer: !!m.observer, promoted: !!m.promoted, bytes: Buffer.byteLength(String(d)), ht: !!m.hardcodedTerrain, tb: !!m.recipes, sig: m.sig || null, keys: Object.keys(m) } : (m.type === 'welcome_head' ? m : null) }); } catch (e) {} });
  ws.on('error', () => {}); return st; }
const welIdx = (fr) => fr.findIndex((f) => f.type === 'welcome' && !(f.json && f.json.observer));

async function boot(env) {
  const D = `/tmp/t1125-tw-${process.pid}-${Math.random().toString(36).slice(2, 6)}`; fs.mkdirSync(D, { recursive: true });
  const procs = [];
  const sp = (name, file, e) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'pipe'] });
    p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };
  const c = sp('central', 'central.js', { PORT: '3010', DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'nippon' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = sp('nippon', 'zone.js', Object.assign({ PORT: String(Z.port), ZONE_ID: 'nippon', DB_PATH: `${D}/w.db`, CENTRAL_URL: 'http://localhost:3010', PUBLIC_HOST: 'localhost',
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' }, env));
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'nippon', capMs: 600000 });
  return { ok: cu.ok && zu.ok, stop: async () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } await sleep(1200); try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {} } };
}
const untilAfterWelcome = (n) => (o) => { const i = welIdx(o.frames); return i >= 0 && o.frames.length >= i + 1 + n; };

(async () => {
  console.log('\n=== 큰 welcome 압축 · 머리 한 줄 · 작은 줄 그대로 (T1125) ===');
  // ⓢ 소스
  { const zs = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'), cs = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8');
    const nCall = (zs.match(/(?<!function )\bsendWelcome\((ws|p\.ws), /g) || []).length;
    ok(nCall === 4 && /function sendWelcome\(ws, obj\)/.test(zs) && !/send\((ws|p\.ws), \{\s*type: 'welcome'/.test(zs) && !/send\((ws|p\.ws), _promoteWelcome\(/.test(zs), 'ⓢ 서버 welcome 네 자리(첫 접속 · 관측 · 승격 · T1092 되돌림)가 `sendWelcome` 한 함수를 부른다(옛 `send` 로 나가는 welcome 0)', `${nCall}`);
    ok(/perMessageDeflate: \{ threshold: T1125_BIG, serverNoContextTakeover: true \}/.test(zs) && /process\.env\.T1125_WS_DEFLATE !== '0'/.test(zs) && /process\.env\.T1125_WEL_HEAD !== '0'/.test(zs), 'ⓢ ws 옵션(문턱 · 이어 쓰기 끔) · 손잡이 둘 `!== \'0\'`(켬 기본 후보)');
    ok((cs.match(/_t1125Hold\(/g) || []).length >= 4 && /msg\.type === 'welcome_head'/.test(cs) && /c\._t1125W = null/.test(cs), 'ⓢ 클라 감시 셋(pong · 틱 · 탭 복귀)이 `_t1125Hold` 를 본다 · `welcome_head` 갈래 · welcome 이 걷는다', `${(cs.match(/_t1125Hold\(/g) || []).length}`);
    //   ③ 문 글자 — 받는 동안 기준 = max(종전 기준, 머리 받은 때) · 창 = 종전 + 머리 몫(pong 첫 15초 · 마지막 7초 · 틱 끊기 창 · 탭 복귀 5초) · 머리 없으면 종전 식 그대로(`_h` null)
    ok(/now - _hRef\(c\.firstPingAt\) - _frz > 15000 \+ _hMs/.test(cs) && /now - _hRef\(c\.lastPongAt\) - _frz > 7000 \+ _hMs/.test(cs) && /_hRef = \(t\) => \(_h \? Math\.max\(t, _h\.at\) : t\)/.test(cs),
      'ⓢ ③ pong 두 문 — 기준 max(종전, 머리) · 창 + 머리 몫(머리 없으면 종전 15초 · 7초 식)');
    ok(/gapCut = _h \? Math\.max\(0, Math\.min\(gap, now - _h\.at\)\) : gap, cutWin = _h \? cutAt \+ _h\.ms : cutAt/.test(cs) && /gapCut > cutWin && !_ghostCutAt/.test(cs) && /now - _h\.at <= 5000 \+ _h\.ms/.test(cs),
      'ⓢ ③ 틱 끊기 문 · 탭 복귀 문 — 같은 꼴(머리 없으면 종전 `gap > cutAt` · 5초)');
    const c0 = fs.readFileSync(path.join(ROOT, 'public', 'client', '00-const.js'), 'utf8');
    ok(/title = '지역 자료를 받는 중입니다\. 잠시 기다리면 들어가집니다\.'/.test(c0) && /state = 'waiting'; hard = false;/.test(c0), 'ⓢ ③ 받는 중 배너 = 노랑 "기다리는 중"(하십시오체 · 새로고침 단추 없음) — 받는 중이 아니면 종전 "연결 끊김"'); }

  // ── 켬(기본) ──
  { const B = await boot({}); ok(B.ok, 'ⓒ 전제: central · 닛폰(켬 기본) 기동');
    try {
      await sleep(1500);
      const a = await rawWs('/?name=t1125a&color=%23aa5533', true, untilAfterWelcome(3), 60000);
      const i = welIdx(a.frames), w = a.frames[i], h = a.frames[i - 1];
      ok(/permessage-deflate/.test(a.ext || '') && /server_no_context_takeover/.test(a.ext || ''), 'ⓐ 압축 협상 — 응답 확장에 permessage-deflate · server_no_context_takeover', JSON.stringify(a.ext));
      ok(!!w && w.rsv1 && w.len >= BIG && w.wire < w.len, 'ⓐ ★welcome 은 압축해 나간다(RSV1 · 선 위 < 글자)', w ? `${(w.len / 1024).toFixed(0)} KB → ${(w.wire / 1024).toFixed(0)} KB` : '(없음)');
      ok(!!h && h.type === 'welcome_head' && !h.rsv1, 'ⓐ ★머리(welcome_head)가 welcome **바로 앞**에 압축 없이 섰다', h ? `${h.type} rsv1 ${h.rsv1}` : '(없음)');
      ok(!!h && !!w && h.json.bytes === w.len && h.json.waitMs === Math.ceil(w.len / (KBPS * 1024) * 1000), 'ⓐ 머리 bytes = 푼 welcome 바이트 · waitMs = ⌈bytes ÷ 42.5 KB/s⌉', h && w ? `${h.json.bytes} · ${h.json.waitMs} ms` : '-');
      const small = a.frames.filter((f) => f.op === 1 && f.len < BIG), big = a.frames.filter((f) => f.op === 1 && f.len >= BIG);
      ok(small.length >= 2 && small.every((f) => !f.rsv1) && big.every((f) => f.rsv1), 'ⓐ ★문턱(64 KB) 밑 프레임은 다 압축 0 · 위는 다 압축 1(틱 같은 작은 줄은 그대로)', `작은 ${small.length}(${[...new Set(small.map((f) => f.type))].join(',')}) · 큰 ${big.length}`);
      ok(a.frames.every((f) => !f.bad), 'ⓐ 압축 프레임은 다 풀린다(문맥 이어 쓰기 끔 — 한 통씩)');
      const b = await rawWs('/?name=t1125b&color=%23aa5533', false, untilAfterWelcome(1), 60000);
      const wb = b.frames[welIdx(b.frames)], hb = b.frames[welIdx(b.frames) - 1];
      ok(!b.ext && !!wb && !wb.rsv1 && wb.len >= BIG && !!hb && hb.type === 'welcome_head', 'ⓑ 압축을 안 내놓으면 날 글자 · 머리는 그대로 선다', `확장 ${JSON.stringify(b.ext)} · welcome rsv1 ${wb && wb.rsv1} · 머리 ${hb && hb.type}`);
      // ⓒ 관측 · 승격
      const vx = Math.round(Z.zoneWidth / 2), vy = Math.round(Z.zoneHeight / 2);
      const ob = wsOrder(`ws://127.0.0.1:${Z.port}/?observer=1&vx=${vx}&vy=${vy}`);
      for (let k = 0; k < 60 && !ob.list.some((x) => x.type === 'welcome'); k++) await sleep(250);
      const oi = ob.list.findIndex((x) => x.type === 'welcome');
      ok(oi >= 1 && ob.list[oi - 1].type === 'welcome_head' && ob.list[oi].m.observer && ob.list[oi - 1].m.bytes === ob.list[oi].m.bytes, 'ⓒ 관측 welcome — 바로 앞 머리 · bytes 같음', oi >= 1 ? `${ob.list[oi - 1].type} ${ob.list[oi - 1].m && ob.list[oi - 1].m.bytes} = ${ob.list[oi].m.bytes}` : '(없음)');
      const token = `t1125-${Date.now()}`;
      const st = await postJSON('/handoff_prepare', { token, source_zone: null, player_id: 'anon_t1125prom', name: 't1125', x: vx, y: vy, inventory: { wood: 0, stone: 0 }, proto: 1 });
      const n0 = ob.list.length; ob.ws.send(JSON.stringify({ type: 'promote_to_primary', token }));
      for (let k = 0; k < 80 && !ob.list.slice(n0).some((x) => x.type === 'welcome'); k++) await sleep(250);
      const L2 = ob.list.slice(n0), pi = L2.findIndex((x) => x.type === 'welcome');
      const pBig = pi >= 0 && L2[pi].m.bytes >= BIG, pHead = pi >= 1 && L2[pi - 1].type === 'welcome_head';
      ok(st === 200 && pi >= 0 && L2[pi].m.promoted && (pBig ? (pHead && L2[pi - 1].m.bytes === L2[pi].m.bytes) : !pHead), 'ⓒ ★승격 welcome — 64 KB 이상이면 바로 앞 머리(bytes 같음) · 밑이면 머리 0(⑥ 가볍게 — 지형이 빠졌다)',
        `prepare ${st} · ${pi >= 0 ? (L2[pi].m.bytes / 1024).toFixed(1) + ' KB' : '-'} · 머리 ${pHead}`);
      // ⓔ 추신 ⑥ — 관측 소켓 승격(have 없음): 지형 0(그 소켓이 관측 welcome 으로 받았다) · 표 일곱은 실림(클라가 가졌는지 모른다)
      const P1 = pi >= 0 ? L2[pi].m : null, O1 = oi >= 0 ? ob.list[oi].m : null;
      ok(!!w && !!w.json && !!w.json.sig && /^[0-9a-f]{40}$/.test(w.json.sig.ht || '') && /^[0-9a-f]{40}$/.test(w.json.sig.tb || '') && !!O1 && !!O1.sig && O1.sig.ht === w.json.sig.ht,
        'ⓔ 첫 접속 · 관측 welcome 에 판 서명(지형 · 표 일곱 — sha1) · 같은 존이면 지형 서명이 같다', w && w.json && w.json.sig ? `ht ${w.json.sig.ht.slice(0, 8)} · tb ${w.json.sig.tb.slice(0, 8)}` : '-');
      ok(!!P1 && !P1.ht && P1.tb && !!P1.sig, 'ⓔ ★승격 welcome — 지형 0(같은 소켓이 이미 받았다) · 표는 실림(클라가 알리지 않았다 — 모르면 종전대로)', P1 ? `${(P1.bytes / 1024).toFixed(1)} KB · 지형 ${P1.ht} · 표 ${P1.tb}` : '-');
      // 둘째 관측 소켓 — 이번엔 클라가 표 서명(첫 접속 welcome 의 sig.tb)을 알린다 → 표 일곱도 0
      const ob2 = wsOrder(`ws://127.0.0.1:${Z.port}/?observer=1&vx=${vx}&vy=${vy}`);
      for (let k = 0; k < 60 && !ob2.list.some((x) => x.type === 'welcome'); k++) await sleep(250);
      const token2 = `t1125b-${Date.now()}`;
      const st2 = await postJSON('/handoff_prepare', { token: token2, source_zone: null, player_id: 'anon_t1125prom2', name: 't1125b', x: vx, y: vy, inventory: { wood: 0, stone: 0 }, proto: 1 });
      const n2 = ob2.list.length; ob2.ws.send(JSON.stringify({ type: 'promote_to_primary', token: token2, have: { ht: null, tb: w && w.json && w.json.sig ? w.json.sig.tb : null } }));
      for (let k = 0; k < 80 && !ob2.list.slice(n2).some((x) => x.type === 'welcome'); k++) await sleep(250);
      const P2 = (ob2.list.slice(n2).find((x) => x.type === 'welcome') || {}).m || null;
      const h2 = ob2.list.slice(n2).some((x) => x.type === 'welcome_head');
      ok(st2 === 200 && !!P2 && P2.promoted && !P2.ht && !P2.tb && P2.bytes < BIG && !h2, 'ⓔ ★★클라가 표 서명을 알리면 승격 welcome 은 몸 · 짐 · 자리 · 시계만 — 문턱 밑이라 머리도 0', P2 ? `${(P2.bytes / 1024).toFixed(1)} KB · 칸 ${P2.keys.length}` : '-');
      try { ob2.ws.close(); } catch (e) {}
      // 셋째 — 엉뚱한 서명을 알리면 종전대로 싣는다(모르면 싣기)
      const ob3 = wsOrder(`ws://127.0.0.1:${Z.port}/?observer=1&vx=${vx}&vy=${vy}`);
      for (let k = 0; k < 60 && !ob3.list.some((x) => x.type === 'welcome'); k++) await sleep(250);
      const token3 = `t1125c-${Date.now()}`;
      await postJSON('/handoff_prepare', { token: token3, source_zone: null, player_id: 'anon_t1125prom3', name: 't1125c', x: vx, y: vy, inventory: { wood: 0, stone: 0 }, proto: 1 });
      const n3 = ob3.list.length; ob3.ws.send(JSON.stringify({ type: 'promote_to_primary', token: token3, have: { tb: 'f'.repeat(40) } }));
      for (let k = 0; k < 80 && !ob3.list.slice(n3).some((x) => x.type === 'welcome'); k++) await sleep(250);
      const P3 = (ob3.list.slice(n3).find((x) => x.type === 'welcome') || {}).m || null;
      ok(!!P3 && P3.tb && !P3.ht, 'ⓔ 다른 서명을 알리면 표 일곱을 종전대로 싣는다(사본 0 · 모르면 싣기)', P3 ? `표 ${P3.tb} · 지형 ${P3.ht}` : '-');
      try { ob3.ws.close(); } catch (e) {}
      ok(!!w && !!w.json && !!w.json.uiCfg && w.json.uiCfg.keepPred === true, 'ⓔ ⑧ 첫 접속 welcome uiCfg.keepPred(예측 유지 — 클라 몫)');
      try { ob.ws.close(); } catch (e) {}
      B.keysOn = w && w.json ? Object.keys(w.json).filter((k) => k !== 'sig').sort().join(',') : '';
    } finally { await B.stop(); }
    // ── 끔 ──
    const C = await boot({ T1125_WS_DEFLATE: '0', T1125_WEL_HEAD: '0', T1125_LEAN_PROMOTE: '0', T1125_KEEP_PRED: '0' }); ok(C.ok, 'ⓒ 전제: central · 닛폰(손잡이 넷 끔) 기동');
    try {
      await sleep(1500);
      const d = await rawWs('/?name=t1125d&color=%23aa5533', true, untilAfterWelcome(1), 60000);
      const i = welIdx(d.frames), w = d.frames[i];
      ok(!d.ext && !!w && !w.rsv1, 'ⓓ 끔 — 압축을 내놓아도 협상 0 · welcome 날 글자(종전)', `확장 ${JSON.stringify(d.ext)} · rsv1 ${w && w.rsv1}`);
      ok(!d.frames.some((f) => f.type === 'welcome_head'), 'ⓓ 끔 — 머리 0(종전 차례 그대로)');
      ok(!!w && !!w.json && Object.keys(w.json).sort().join(',') === B.keysOn && !w.json.sig && !(w.json.uiCfg && w.json.uiCfg.keepPred), 'ⓓ welcome 칸 이름 = 켬과 같다(켬이 더하는 `sig` 하나 빼고) · 끔이면 서명 0 · keepPred 0', w && w.json ? `${Object.keys(w.json).length}칸` : '-');
      // ⓓ 끔 — 승격 welcome 은 종전대로 지형 · 표를 다 싣는다(서명 0)
      const vx = Math.round(Z.zoneWidth / 2), vy = Math.round(Z.zoneHeight / 2);
      const obo = wsOrder(`ws://127.0.0.1:${Z.port}/?observer=1&vx=${vx}&vy=${vy}`);
      for (let k = 0; k < 60 && !obo.list.some((x) => x.type === 'welcome'); k++) await sleep(250);
      const tok = `t1125o-${Date.now()}`;
      await postJSON('/handoff_prepare', { token: tok, source_zone: null, player_id: 'anon_t1125promo', name: 't1125o', x: vx, y: vy, inventory: { wood: 0, stone: 0 }, proto: 1 });
      const no = obo.list.length; obo.ws.send(JSON.stringify({ type: 'promote_to_primary', token: tok, have: { tb: 'f'.repeat(40) } }));
      for (let k = 0; k < 80 && !obo.list.slice(no).some((x) => x.type === 'welcome'); k++) await sleep(250);
      const PO = (obo.list.slice(no).find((x) => x.type === 'welcome') || {}).m || null;
      ok(!!PO && PO.promoted && PO.ht && PO.tb && !PO.sig, 'ⓓ 끔 — 승격 welcome 은 종전대로 지형 · 표를 다 싣는다(서명 0)', PO ? `${(PO.bytes / 1024).toFixed(0)} KB` : '-');
      try { obo.ws.close(); } catch (e) {}
    } finally { await C.stop(); }
  }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); process.exit(1); });
