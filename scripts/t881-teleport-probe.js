#!/usr/bin/env node
// === scripts/t881-teleport-probe.js — e2e-verbs 첫머리 텔레포트 알림이 왜 늦나(T881 · T870 회부 2 · 러너 밖 계측 자) ==========
//
//   `e2e-verbs.js` 를 **사본으로 들고 있지 않는다** — 돌 때마다 그 파일을 읽어 첫머리 좌표계 실측 한 덩이에만 계측을 끼운
//   임시 파일(`scripts/.t881-probe.tmp.js`)을 만들고, 그 덩이에서 멈춘다(뒤 절은 안 돈다). 끼운 계측:
//     · 존 stdout 의 텔레포트 줄에 하네스 벽시계를 찍는다(서버가 처리한 때)
//     · R 페이지 CDP — ws 보낸/받은 프레임 시각 · 1ms 샘플 프로파일(보내기 전 ~ 알림 처리 뒤)
//     · 페이지 안 표시 — 보내는 부르기 몸통이 실제로 돈 때 · 알림이 `__notices` 에 들어간 때(performance.timeOrigin + now = 벽시계)
//   `e2e-verbs.js` 의 그 덩이가 바뀌면(예: T880 ③) 끼울 자리를 못 찾았다고 말하고 끝난다(2).
// 실행: node scripts/t881-teleport-probe.js run [--out /tmp/x.json]   (존 손잡이는 env 그대로 — 예: T870_MT_BAND=1)
//       node scripts/t881-teleport-probe.js table a.json b.json …     (판마다 한 줄 + 느린 판의 주 스레드 함수)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const PAIRS = [["  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\\n`); });", "  p.stdout.on('data', (b) => { const s = String(b); const t = Date.now(); for (const ln of s.split('\\n')) if (/teleport|WS CONN|welcome/i.test(ln)) ZLOG.push([t, name, ln.slice(0, 200)]); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\\n`); });"], ["const procs = [];", "const procs = []; const ZLOG = [];"], ["    await clearNotices(R);\n    await R.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [vx, vy]);\n    await sleep(1500);\n    const nz = (await R.evaluate(() => (window.__notices || []).slice(-8))).filter((t) => /텔레포트/.test(t));", "    await clearNotices(R);\n    // ★[T881 탐침] CDP — ws 프레임 시각 · 1ms 프로파일 · 페이지 안 표시(보냄 · 알림 처리)\n    const cdp = await R.context().newCDPSession(R);\n    const FR = [];\n    await cdp.send('Network.enable');\n    cdp.on('Network.webSocketFrameSent', (e) => { const d = String(e.response && e.response.payloadData || ''); if (/teleport_debug/.test(d)) FR.push(['sent', e.timestamp, d.slice(0, 80)]); });\n    cdp.on('Network.webSocketFrameReceived', (e) => { const d = String(e.response && e.response.payloadData || ''); if (/텔레포트|teleport/.test(d)) FR.push(['recv', e.timestamp, d.slice(0, 100)]); else FR.push(['recvAny', e.timestamp, d.length]); });\n    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');\n    await R.evaluate(() => { window.__t881 = { mk: [] }; const sn = window.__notices; const push0 = Array.prototype.push; window.__notices = window.__notices || []; const arr = window.__notices; arr.push = function (...a) { if (a.some((t) => /텔레포트/.test(String(t)))) window.__t881.mk.push(['notice', performance.now(), performance.timeOrigin]); return push0.apply(this, a); }; });\n    const H0 = Date.now();\n    await R.evaluate(([a, b]) => { window.__t881.mk.push(['callIn', performance.now(), performance.timeOrigin]); window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); }, [vx, vy]);\n    const H1 = Date.now();\n    await sleep(1500);\n    const H2 = Date.now();\n    const nz = (await R.evaluate(() => (window.__notices || []).slice(-8))).filter((t) => /텔레포트/.test(t));\n    const H3 = Date.now();\n    for (let i = 0; i < 160 && !(await R.evaluate(() => (window.__t881.mk || []).some((m) => m[0] === 'notice'))); i++) await sleep(50);\n    const H4 = Date.now();\n    const prof = (await cdp.send('Profiler.stop')).profile;\n    const mk = await R.evaluate(() => window.__t881.mk);\n    const st = await R.evaluate(() => ({ mgl: (typeof _mgl !== 'undefined' && _mgl) ? _mgl.ok : 'x', jobs: (typeof _mt3Jobs !== 'undefined' && _mt3Jobs) ? _mt3Jobs.size : 'x', band: !!(uiCfg && uiCfg.mtBand) }));\n    fs.writeFileSync(process.env.T881_OUT || '/tmp/t881/out.json', JSON.stringify({ H0, H1, H2, H3, H4, ZLOG, FR, mk, st, prof, nzFound: nz.length }));\n    console.log(`  · [T881] 보냄부르기 ${H1 - H0}ms · 1.5초 읽음 알림 ${nz.length} · 알림 처리까지 ${H4 - H0}ms · ${JSON.stringify(st)}`);\n    await browser.close(); shutdown(); process.exit(0);"]];
const mode = process.argv[2];
if (mode === 'run') {
  const i = process.argv.indexOf('--out'); const out = i > 0 ? process.argv[i + 1] : '/tmp/t881-probe.json';
  let src = fs.readFileSync(path.join(__dirname, 'e2e-verbs.js'), 'utf8');
  for (const [a, b] of PAIRS) { if (src.split(a).length !== 2) { console.log('끼울 자리를 못 찾았다(e2e-verbs 가 바뀌었다):', a.slice(0, 60)); process.exit(2); } src = src.replace(a, () => b); }
  const tmp = path.join(__dirname, '.t881-probe.tmp.js');
  fs.writeFileSync(tmp, src);
  const r = spawnSync(process.execPath, [tmp], { stdio: 'inherit', env: Object.assign({}, process.env, { T881_OUT: out }) });
  try { fs.unlinkSync(tmp); } catch (e) {}
  process.exit(r.status == null ? 1 : r.status);
} else if (mode === 'table') {
  for (const f of process.argv.slice(3)) {
    const o = JSON.parse(fs.readFileSync(f, 'utf8')); const P = o.prof;
    const by = new Map(P.nodes.map((n) => [n.id, n])); const par = new Map();
    for (const n of P.nodes) for (const c of (n.children || [])) par.set(c, n.id);
    const chainHas = (s, fn) => { let id = s; for (let k = 0; k < 4 && id != null; k++) { const m = by.get(id); if (m.callFrame.functionName === fn) return true; id = par.get(id); } return false; };
    let water = 0, mt = 0; for (const s of P.samples) { if (chainHas(s, '_drawWaterLayer')) water++; if (chainHas(s, '_mt3Bake')) mt++; }
    const sent = o.FR.find((x) => x[0] === 'sent'), recv = o.FR.find((x) => x[0] === 'recv');
    const tl = o.ZLOG.find((z) => /teleport/.test(z[2]) && !/WS/.test(z[2]));
    const call = o.mk.find((m) => m[0] === 'callIn'), not = o.mk.find((m) => m[0] === 'notice');
    const w = (m) => (m ? Math.round(m[2] + m[1] - o.H0) : '?');
    console.log(`${path.basename(f)} · 보내는 부르기 ${o.H1 - o.H0}ms · 몸통 시작 ${w(call)} · 존이 처리 ${tl ? tl[0] - o.H0 : '?'} · 페이지가 알림 처리 ${w(not)} · ws 보냄→받음 ${sent && recv ? Math.round((recv[1] - sent[1]) * 1000) : '?'}ms · 샘플 ${P.samples.length}(물 층 ${water} · 산 굽기 ${mt}) · 1.5초 읽음 알림 ${o.nzFound} · 산 ${JSON.stringify(o.st)}`);
  }
} else { console.log('쓰기: run [--out f] | table f…'); process.exit(1); }
