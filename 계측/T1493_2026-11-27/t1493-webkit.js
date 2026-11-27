#!/usr/bin/env node
// (@regress 없음 — T1493 계측 · 러너 밖) Safari 엔진(WebKitGTK · WebKitWebDriver · Xvfb) 한 판 — 길 둘레 보내기 끔 ↔ 켬
//   존(hanbando · 마을 켬 · 도적 끔 · `T1448_ROAD_GRID=1` · `T1493_ROAD_BOX` = 팔)을 재현 틀이 심은 DB(`_seed.db` — 라이브 사본 길)로 띄우고
//   진짜 클라(central 첫 화면 → 들어가기)를 WebKit 으로 연다: welcome(소켓 글자 · 길 칸) · 접속 → 첫 그림(`__loadReport`) ·
//   걷기(순간 이동 32 px 씩 · 0.1초마다 · 청크 넷) 동안 렉 보고(`__lagReport` — 프레임 · 초당 장 수) · 받은 짐(종류별 글자 · 길 몫).
//   쓰는 법: DISPLAY=:99 (Xvfb) · WebKitWebDriver --port=4444 가 떠 있어야 한다.
//     node 계측/T1493_2026-11-27/t1493-webkit.js --arm rb0|rb1 --seed <_seed.db> --out <json> [--sec 25] [--chunks 4]
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
if (require.main === module) require(path.join(ROOT, 'scripts', 'lib-port')).hold(3010, 3020);   // 제품 고정 포트 — 하네스와 나란히 돌면 줄 선다
const FB = require(path.join(ROOT, 'scripts', 'fixture-boot'));
const SY = require(path.join(ROOT, 'scripts', 't1446-synth'));
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const ARM = arg('--arm', 'rb1'), SEED = arg('--seed', ''), OUT = arg('--out', ''), SEC = +arg('--sec', 25), NCH = +arg('--chunks', 4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function sp(file, env) { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p._o = ''; p.stdout.on('data', (b) => { if (p._o.length < 4e6) p._o += b; }); p.stderr.on('data', (b) => { if (p._o.length < 4e6) p._o += b; }); procs.push(p); return p; }
function wd(method, p, body) { return new Promise((res, rej) => { const d = body ? JSON.stringify(body) : null; const r = http.request({ host: '127.0.0.1', port: 4444, path: p, method, headers: { 'content-type': 'application/json', ...(d ? { 'content-length': Buffer.byteLength(d) } : {}) } }, (s) => { let b = ''; s.on('data', (c) => { b += c; }); s.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res({ raw: b }); } }); }); r.on('error', rej); if (d) r.write(d); r.end(); }); }
const V = (() => { const l = console.log; console.log = () => {}; try { return SY.villageCenters(); } finally { console.log = l; } })();
const AT = V.vils.find((v) => v.name === '농촌22') || V.vils[0];
const WALK = { x0: AT.cx * 32 + 16 - 5500, y: AT.cy * 32 + 16 - 1312 };   // T1453 재현 틀과 같은 줄(뭍 · 마을 청크가 둘레에 든다)

(async () => {
  const out = { arm: ARM, at: new Date().toISOString() };
  try {
    const D = fs.mkdtempSync('/tmp/t1493wk-'); fs.copyFileSync(SEED, path.join(D, 'w.db'));
    const c = sp('central.js', { PORT: '3010', DB_PATH: path.join(D, 'c.db'), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok) throw new Error('central');
    const z = sp('zone.js', { PORT: '3020', ZONE_ID: 'hanbando', DB_PATH: path.join(D, 'w.db'), CENTRAL_URL: 'http://localhost:3010', PUBLIC_HOST: 'localhost', ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
      T1448_ROAD_GRID: '1', T1493_ROAD_BOX: ARM === 'rb1' ? '1' : '0' });
    if (!(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 })).ok) throw new Error('zone');
    await sleep(20000);   // 마을 시딩 · 몸 스폰이 가라앉을 때까지(재현 틀과 같은 쉼)
    const s = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary: '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', args: ['--automation'] } } } });
    const id = s.value && s.value.sessionId; if (!id) throw new Error('WebDriver 세션 ' + JSON.stringify(s).slice(0, 200));
    out.ua = (s.value.capabilities || {}).browserVersion;
    const ex = async (script, args) => (await wd('POST', `/session/${id}/execute/sync`, { script, args: args || [] })).value;
    const exA = async (script, args) => (await wd('POST', `/session/${id}/execute/async`, { script, args: args || [] })).value;
    await wd('POST', `/session/${id}/timeouts`, { script: 300000, pageLoad: 120000 });
    await wd('POST', `/session/${id}/window/rect`, { width: 1580, height: 790, x: 0, y: 0 });
    await wd('POST', `/session/${id}/url`, { url: 'http://localhost:3010/?T1453_NAT_QUERY=1' });
    for (let k = 0; k < 240; k++) { if (await ex("const b = document.getElementById('enter'); const s = document.getElementById('startZone'); return !!(b && b.onclick && !b.disabled && s && [...s.options].some((x) => x.value === 'hanbando' && !x.disabled));")) break; await sleep(250); }
    //   받은 짐 — 존 소켓 `onmessage` 를 감싸 종류 · 글자 수를 센다(재현 틀과 같은 꼴) · 소리 끔(헤드리스 소리 길 죽음 피함)
    await ex(`try { window.AudioContext = undefined; window.webkitAudioContext = undefined; } catch (e) {}
      window.__wkRx = []; const D = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
      Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return D.get.call(this); }, set(fn) {
        const url = this.url || '';
        D.set.call(this, typeof fn !== 'function' || url.indexOf(':3020') < 0 ? fn : function (ev) { try { const d = ev.data; if (typeof d === 'string' && window.__wkRx.length < 300000) { const m = /^\\{"type":"([a-z_0-9]+)"/.exec(d.slice(0, 48)); window.__wkRx.push([performance.now(), m ? m[1] : '?', d.length]); } } catch (e) {} return fn.call(this, ev); }); } });
      document.getElementById('startZone').value = 'hanbando'; return true;`);
    const tClick = Date.now();
    await ex("document.getElementById('enter').click(); return true;");
    let entered = false; for (let k = 0; k < 480 && !entered; k++) { entered = !!(await ex("return !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId() === 'hanbando');")); if (!entered) await sleep(250); }
    out.entered = entered; out.enterMs = Date.now() - tClick; if (!entered) throw new Error('입장 못 함');
    await sleep(6000);
    out.load = await exA("const cb = arguments[arguments.length - 1]; window.__loadReport().then((x) => cb(x ? { welcome: x.welcome, total: x.total, at: x.at } : null), () => cb(null));");
    const rx0 = await ex('return window.__wkRx.slice();');
    const wel = rx0.find((m) => m[1] === 'welcome');
    out.welcome = { bytes: wel ? wel[2] : null, roadsHeld: await ex("return conns.get('hanbando').roads.size;") };
    //   걷기 — 순간 이동 32 px 씩 · 0.1초마다(초당 320 px) · 그동안 렉 보고
    await ex(`window.__sendPrimary({ type: 'teleport_debug', x: ${WALK.x0}, y: ${WALK.y} }); return true;`); await sleep(8000);
    const n0 = (await ex('return window.__wkRx.length;'));
    await ex(`window.__wkLag = null; window.__lagReport(${SEC}).then((R) => { window.__wkLag = R ? { frame: R.frame && R.frame.frames, verdict: R.verdict, text: R.text } : { none: true }; }); return true;`);
    const steps = Math.round(NCH * 1024 / 32);
    for (let i = 1; i <= steps; i++) { await ex(`window.__sendPrimary({ type: 'teleport_debug', x: ${WALK.x0} + ${i * 32}, y: ${WALK.y} }); return true;`); await sleep(100); }
    for (let k = 0; k < (SEC + 30) * 4; k++) { if (await ex('return !!window.__wkLag;')) break; await sleep(250); }
    out.lag = await ex('return window.__wkLag;');
    const rx1 = (await ex('return window.__wkRx.slice();')).slice(n0);
    const kinds = {}; for (const [, t, n] of rx1) { const e = kinds[t] || (kinds[t] = { n: 0, kb: 0 }); e.n++; e.kb += n / 1024; }
    for (const k in kinds) kinds[k].kb = +kinds[k].kb.toFixed(1);
    out.walk = { chunks: NCH, kinds, roadsHeld: await ex("return conns.get('hanbando').roads.size;"), errs: await ex('return (window.__errs || []).length || 0;') };
    await wd('DELETE', `/session/${id}`);
  } catch (e) { out.err = String(e && e.stack || e).slice(0, 600); }
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out).slice(0, 1200));
  process.exit(0);
})();
