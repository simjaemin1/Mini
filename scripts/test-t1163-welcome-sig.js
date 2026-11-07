#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1163-welcome-sig.js — 첫 접속 · 관측 welcome 의 지형을 서명으로 뺀다 (T1163 · K4 · T1125 ②) ===========
//
// ★왜 [T1163] 클라는 로비에서 `/terrain.json`(T1131 `?v=` immutable)을 이미 받는데 welcome 이 그 존 지형(`hardcodedTerrain`)을 또 싣는다.
//   서버 손잡이 `T1163_WELCOME_SIG`(`=== '1'` 만 켬 · 끔 기본): 클라가 접속 주소 `hf=<가진 절 서명>`(정본 `public/terrain-sig.js` — 서버 · 클라 같은 파일)을
//   실으면 존 파일 절 서명과 같을 때 첫 접속 · 관측 welcome 이 지형을 빼고 `hfHit: 1` 을 싣는다. 모르면 · 다르면 종전.
// ★재는 것(central + 한반도 · 하네스 꼴):
//   ⓐ 끔(기본): `hf` 를 실어도 지형이 온다 · `hfHit` 0 · 칸 차례 = `hf` 없는 welcome 과 같다
//   ⓑ 켬 · 맞는 `hf` — 첫 접속 welcome 지형 0 · `hfHit` 1 · 나머지 칸 차례 = 종전(지형 자리에 hfHit 하나) · 바이트 전 → 후
//   ⓒ 켬 · 틀린 `hf` · `hf` 없음 — 종전대로 지형이 온다
//   ⓓ 켬 · 관측 welcome(맞는 `hf`) 지형 0 → 그 소켓 승격 welcome 도 지형 0(T1125 ⑥ — 소켓이 가진 것으로 적힘)
//   ⓔ 켬 · 재접속(게스트 열쇠 + 맞는 `hf`) 지형 0
//   ⓕ 같은 절인가: 서버가 종전대로 실은 지형 ↔ 파일 절 — 다른 칸은 런타임 칸(`_` 로 시작)뿐(빼도 클라가 가진 것과 뜻이 같다)
//   ⓢ 소스: 99-main 이 setHardcoded **앞**에 센다 · 30-n-net 주소 `hf` · hfHit 갈래 · index.html 이 terrain-sig.js 를 싣는다 · zone.js 가 같은 파일을 require
// 실행: node scripts/test-t1163-welcome-sig.js   (존 기동 둘 · 약 1 ~ 2분)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const TS = require(path.join(ROOT, 'public', 'terrain-sig.js'));
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const ZID = 'hanbando', Z = ZONES[ZID];
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KB = (n) => (n / 1024).toFixed(1);

// 클라와 같은 길: 파일(central `/terrain.json` 이 내는 그 글자)을 JSON.parse → 그 존 절 서명
const FILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8'));
const HF = TS.terrainSig(FILE[ZID]);

function postJSON(port, pth, body) {
  return new Promise((res) => { const d = JSON.stringify(body);
    const rq = http.request({ host: '127.0.0.1', port, path: pth, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (r) => { let s = ''; r.on('data', (b) => { s += b; }); r.on('end', () => res({ st: r.statusCode, s })); });
    rq.on('error', (e) => res({ st: 0, s: String(e.message) })); rq.end(d); });
}
function openWs(q) {
  const ws = new WebSocket(`ws://127.0.0.1:${Z.port}/?${q}`, { perMessageDeflate: false });
  const st = { ws, list: [], wait: null };
  ws.on('message', (d) => { const s = String(d); let m = null; try { m = JSON.parse(s); } catch (e) {}
    if (!m) return; const e = { type: m.type, bytes: Buffer.byteLength(s), m: m.type === 'welcome' ? m : null };
    st.list.push(e); if (st.wait && st.wait.fn(e)) { const w = st.wait; st.wait = null; w.res(e); } });
  ws.on('error', () => {});
  return st;
}
function waitFor(st, fn, ms, from) {
  const hit = st.list.slice(from || 0).find(fn);
  if (hit) return Promise.resolve(hit);
  return new Promise((res) => { const t = setTimeout(() => { st.wait = null; res(null); }, ms || 90000); st.wait = { fn, res: (x) => { clearTimeout(t); res(x); } }; });
}
const isWel = (pred) => (e) => !!(e && e.type === 'welcome' && e.m && pred(e.m));
const keysOf = (m) => Object.keys(m).filter((k) => k !== 'hardcodedTerrain' && k !== 'hfHit');
async function first(q) { const st = openWs(q); const w = await waitFor(st, isWel((m) => !m.observer)); try { st.ws.close(); } catch (e) {} return w; }

async function boot(env) {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 't1163-'));
  const procs = [];
  const sp = (name, file, e) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'pipe'] });
    p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };
  const c = sp('central', 'central.js', { PORT: '3010', DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZID });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = sp(ZID, 'zone.js', Object.assign({ PORT: String(Z.port), ZONE_ID: ZID, DB_PATH: `${D}/w.db`, CENTRAL_URL: 'http://localhost:3010', PUBLIC_HOST: 'localhost',
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' }, env));
  const zu = await FB.waitUp(z, /zone server up on/, { name: ZID, capMs: 600000 });
  return { ok: cu.ok && zu.ok, stop: async () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } await sleep(1200); try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {} } };
}

// 두 값의 다른 칸 길(런타임 칸 찾기) — 최대 n 개
function diffPaths(a, b, p, out, n) {
  if (out.length >= n) return out;
  if (a === b) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) { if (JSON.stringify(a) !== JSON.stringify(b)) out.push(p); return out; }
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of ks) { if (out.length >= n) break; if (!(k in a) || !(k in b)) { out.push(`${p}.${k}`); continue; } diffPaths(a[k], b[k], `${p}.${k}`, out, n); }
  return out;
}

(async () => {
  console.log(`[T1163] 한반도 파일 절 서명 ${HF}`);
  // ⓢ 소스
  { const zs = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const net = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8');
    const mn = fs.readFileSync(path.join(ROOT, 'public', 'client', '99-main.js'), 'utf8');
    const ih = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    ok(/process\.env\.T1163_WELCOME_SIG === '1'/.test(zs) && /require\('\.\.\/public\/terrain-sig\.js'\)/.test(zs) && (zs.match(/_t1163Skip\(url\) \? \{ hfHit: 1 \} : \{ hardcodedTerrain: getHardcodedTerrainForZone\(\) \}/g) || []).length === 2,
      'ⓢ 서버: 손잡이 `=== \'1\'`(끔 기본) · 정본 같은 파일 require · 첫 접속 · 관측 두 자리');
    const iSig = mn.indexOf('TerrainSig.terrainSig(data)'), iSet = mn.indexOf('window.Terrain.setHardcoded(zid, data)');
    ok(iSig > 0 && iSet > iSig && /Object\.assign\(_t1163Hf, _hf\)/.test(mn), 'ⓢ 클라 99-main: 서명은 setHardcoded **앞**(런타임 칸 붙기 전)에 센다');
    ok(/params\.set\('hf', _t1163Hf\[zoneId\]\)/.test(net) && /if \(msg\.hfHit\)/.test(net) && /_terrainAppliedZones\.add\(_hz\)/.test(net), 'ⓢ 클라 30-n-net: 주소 `hf` · hfHit 갈래(적용 존 · 승격 서명)');
    const iM = ih.indexOf('src="terrain-sig.js'), iC = ih.indexOf('src="client/00-const.js');
    ok(iM > 0 && iC > iM, 'ⓢ index.html 이 terrain-sig.js 를 클라 조각 앞에 싣는다');
    // 브라우저 꼴로 싣기(module 없음 · window 에 걸림) — 같은 파일이 같은 서명을 낸다(실브라우저 판 = scripts/e2e-t1163-welcome-sig.js)
    const vm = require('vm'), ctx = { window: {} }; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'terrain-sig.js'), 'utf8'), ctx);
    const bHf = ctx.window.TerrainSig && ctx.window.TerrainSig.terrainSig(JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando);
    ok(bHf === HF, 'ⓢ 브라우저 꼴 싣기(window.TerrainSig) 서명 = 서버 require 서명', `${bHf}`);
    ok(TS.sigOfString('a') !== TS.sigOfString('b') && TS.terrainSig(null) === null && TS.sigOfString('가나') === TS.sigOfString('가나'), 'ⓢ 서명: 글자가 다르면 다르다 · null 은 null · 한글(UTF-16) 같은 글자 같은 서명'); }

  // ⓐ 끔
  let ref = null;
  { const B = await boot({}); ok(B.ok, 'ⓐ 전제: central · 한반도(손잡이 끔 기본) 기동');
    try {
      const w0 = await first('name=t1163a&color=%23aa5533'), w1 = await first(`name=t1163b&color=%23aa5533&hf=${HF}`);
      ref = w0;
      ok(!!w0 && !!w1 && !!w1.m.hardcodedTerrain && !w1.m.hfHit && Object.keys(w0.m).join(',') === Object.keys(w1.m).join(','), 'ⓐ 끔 — `hf` 를 실어도 지형이 온다 · hfHit 0 · 칸 차례 같음',
        w1 ? `${KB(w1.bytes)} KB · ${Object.keys(w1.m).length}칸` : '-');
      // ⓕ 같은 절인가(종전이 실은 지형 ↔ 파일 절)
      if (w0 && w0.m.hardcodedTerrain) {
        const d = diffPaths(w0.m.hardcodedTerrain, FILE[ZID], '', [], 50);
        const nonRt = d.filter((p) => !p.split('.').some((s) => s.startsWith('_')));
        ok(nonRt.length === 0, 'ⓕ 종전 welcome 지형 ↔ 파일 절 — 다른 칸은 런타임 칸(`_…`)뿐', `다름 ${d.length}${d.length ? ' 예 ' + d.slice(0, 3).join(' ') : ''}${nonRt.length ? ' · 런타임 아님 ' + nonRt.slice(0, 3).join(' ') : ''}`);
      }
    } finally { await B.stop(); } }

  // ⓑ ~ ⓔ 켬
  { const B = await boot({ T1163_WELCOME_SIG: '1' }); ok(B.ok, 'ⓑ 전제: central · 한반도(T1163_WELCOME_SIG=1) 기동');
    try {
      const wOff = await first('name=t1163c&color=%23aa5533'), wOn = await first(`name=t1163d&color=%23aa5533&hf=${HF}`);
      ok(!!wOff && !!wOff.m.hardcodedTerrain && !wOff.m.hfHit, 'ⓒ 켬 · `hf` 없음 — 종전대로 지형이 온다', wOff ? `${KB(wOff.bytes)} KB` : '-');
      ok(!!wOn && !wOn.m.hardcodedTerrain && wOn.m.hfHit === 1, 'ⓑ ★켬 · 맞는 `hf` — 첫 접속 welcome 지형 0 · hfHit 1', wOn ? `${KB(wOff ? wOff.bytes : 0)} → ${KB(wOn.bytes)} KB` : '-');
      ok(!!wOn && !!wOff && keysOf(wOn.m).join(',') === keysOf(wOff.m).join(',') && Object.keys(wOn.m).indexOf('hfHit') === Object.keys(wOff.m).indexOf('hardcodedTerrain'), 'ⓑ 나머지 칸 · 차례 종전 그대로(지형 자리에 hfHit 하나)');
      ok(!!wOn && !!wOn.m.sig && /^[0-9a-f]{40}$/.test(wOn.m.sig.ht || ''), 'ⓑ 판 서명(T1125 sig)은 그대로 실린다');
      const wBad = await first(`name=t1163e&color=%23aa5533&hf=${HF.replace(/.$/, (c) => (c === '0' ? '1' : '0'))}`);
      ok(!!wBad && !!wBad.m.hardcodedTerrain && !wBad.m.hfHit, 'ⓒ 켬 · 틀린 `hf` — 종전대로 지형이 온다');
      // ⓓ 관측 → 승격
      const vx = Math.round(Z.zoneWidth / 2), vy = Math.round(Z.zoneHeight / 2);
      const ob = openWs(`observer=1&vx=${vx}&vy=${vy}&hf=${HF}`);
      const wo = await waitFor(ob, isWel((m) => !!m.observer));
      ok(!!wo && !wo.m.hardcodedTerrain && wo.m.hfHit === 1, 'ⓓ ★켬 · 관측 welcome(맞는 `hf`) 지형 0', wo ? `${KB(wo.bytes)} KB` : '-');
      const token = `t1163-${Date.now()}`;
      const pr = await postJSON(Z.port, '/handoff_prepare', { token, source_zone: null, player_id: 'anon_t1163p', name: 't1163p', x: vx, y: vy, inventory: { wood: 0, stone: 0 }, proto: 1 });
      const n0 = ob.list.length; ob.ws.send(JSON.stringify({ type: 'promote_to_primary', token }));
      const wp = await waitFor(ob, isWel((m) => !!m.promoted), 60000, n0);
      ok(pr.st === 200 && !!wp && !wp.m.hardcodedTerrain, 'ⓓ 그 소켓 승격 welcome 도 지형 0(T1125 ⑥ — 가진 것으로 적힘)', wp ? `${KB(wp.bytes)} KB` : `${pr.st}`);
      try { ob.ws.close(); } catch (e) {}
      // ⓔ 재접속(게스트 열쇠)
      const gt = wOn && wOn.m.guestToken;
      await sleep(800);
      const wRe = gt ? await first(`name=t1163d&color=%23aa5533&guest_token=${encodeURIComponent(gt)}&hf=${HF}`) : null;
      ok(!!gt && !!wRe && !wRe.m.hardcodedTerrain && wRe.m.hfHit === 1 && wRe.m.playerId === wOn.m.playerId, 'ⓔ ★켬 · 재접속(게스트 열쇠 + `hf`) 지형 0 · 같은 신원', wRe ? `${KB(wRe.bytes)} KB` : '-');
    } finally { await B.stop(); } }

  console.log(`\n=== T1163 welcome 지형 서명: 통과 ${pass} · 실패 ${fail} ===`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('실패:', e); process.exit(1); });
