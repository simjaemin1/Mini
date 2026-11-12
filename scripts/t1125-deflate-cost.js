#!/usr/bin/env node
// === scripts/t1125-deflate-cost.js — permessage-deflate 의 CPU · 틱 · GC 표(T1125 ②) ===================================
//
// ★왜 [T1125 ②] 존 WebSocket 압축(손잡이 `T1125_WS_DEFLATE` · 큰 메시지만 — `T1125_BIG` 64 KB)을 켜면 서버가 무엇을 더 내나.
//   라이브 존 서버는 vCPU 하나다 — 압축(큰 welcome)과 풀기(브라우저는 협상되면 **작은 줄까지** 압축해 보낸다 — 입력 30 Hz · ping)가 틱과 한 CPU 를 나눈다.
//
// ★재는 것 — 닛폰 존 하나(운영 꼴 · 마을 · 짐승 · 도적 · 길 켬)를 CPU 하나에 묶고(`taskset -c 0`) 같은 짐을 두 판(끔 ↔ 켬 · 판마다 새로 띄움):
//   · 붙어 있는 사람 `--n`(기본 8) — 게스트로 들어와 입력 30 Hz(클라 `PRED_STEP` 1/30 그 꼴) · ping 1초 · 압축 협상(켬이면 작은 줄도 압축해 보낸다 = 크롬 꼴)
//   · 들고 나는 사람 — `--every` ms(기본 2000)마다 새 게스트 접속 하나 → welcome 받고 닫기(번갈아 관측 접속) = 큰 welcome 이 쉬지 않고 나간다(라이브보다 훨씬 잦다 — 짐 위 끝)
//   · 창 `--win` 초(기본 60 · 앞 10초 데움 뒤 `/perf?reset=1`): 틱 본문 ms p50 · p95 · max(`/perf` tick.ms) · 루프 지연 p95 · p99 · max(`/perf` loop) ·
//     존 CPU %(/proc utime+stime ÷ 벽시계) · RSS(창 앞 → 뒤) · GC 멈춤(`--trace-gc` 줄 — 창 안 합 · 최대 · 수) ·
//     ping 왕복 p50 · p95(붙어 있는 사람 — 로컬 · 길 지연 0) · welcome 받는 시간 p50 · max(로컬) · 들고 난 접속 수
// 실행: node scripts/t1125-deflate-cost.js [--n 8] [--every 2000] [--win 60] [--json <파일>]   (판 둘 · 약 4분)
// 판정 0 — 표 기계. 이 상자 CPU 하나(라이브 vCPU 와 같은 칩이 아니다) — 끔 ↔ 켬 **차이**를 본다.
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('--n', 8), EVERY = +arg('--every', 2000), WIN = +arg('--win', 60), JOUT = arg('--json', null);
const PLAIN = process.argv.includes('--plain');   // 붙어 있는 사람이 작은 줄을 압축 없이 보낸다(`compress: false` — 서버 풀기 0 · 크롬 꼴 아님 — 까닭 가르기용)
const RUNS = String(arg('--runs', 'off,on')).split(',');   // off · on
const Z = ZONES.nippon;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (a, p) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(b.length * p))].toFixed(2); };
try { execFileSync('taskset', ['-cp', '1', String(process.pid)], { stdio: 'ignore' }); } catch (e) {}   // 이 하네스(클라 짐)는 CPU 1 — 존은 CPU 0

function getJSON(port, pth) {
  return new Promise((res) => { http.get({ host: '127.0.0.1', port, path: pth }, (r) => { let s = ''; r.on('data', (b) => { s += b; }); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { res(null); } }); }).on('error', () => res(null)); });
}
function cpuTicks(pid) { try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (+f[11]) + (+f[12]); } catch (e) { return null; } }
function rssKB(pid) { try { const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/); return m ? +m[1] : null; } catch (e) { return null; } }
const CLK = (() => { try { return +execFileSync('getconf', ['CLK_TCK']).toString().trim() || 100; } catch (e) { return 100; } })();

function guest(tag, onWelcome) {
  const ws = new WebSocket(`ws://127.0.0.1:${Z.port}/?name=${tag}&color=%23aa5533`, { perMessageDeflate: true });
  const st = { ws, t0: Date.now(), wel: 0, rtt: [], deflate: false };
  ws.on('open', () => { st.deflate = !!(ws.extensions && ws.extensions.indexOf('permessage-deflate') >= 0); });
  ws.on('message', (d) => { const s = String(d); if (!st.wel && s.indexOf('"type":"welcome"') >= 0 && s.indexOf('"observer":true') < 0) { st.wel = Date.now() - st.t0; if (onWelcome) onWelcome(st); }
    else if (s.length < 200 && s.indexOf('"type":"pong"') >= 0) { try { const m = JSON.parse(s); st.rtt.push(Date.now() - m.t); } catch (e) {} } });
  ws.on('error', () => {});
  return st;
}

async function run(tag, env) {
  const D = `/tmp/t1125-dc-${process.pid}-${tag}`; fs.mkdirSync(D, { recursive: true });
  const procs = [];
  const boot = (name, cmd, args, e) => { const p = spawn(cmd, args, { cwd: ROOT, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'pipe'] });
    p._name = name; p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };
  const r = { tag, env };
  try {
    const c = boot('central', 'taskset', ['-c', '1', process.execPath, path.join(ROOT, 'server', 'central.js')], { PORT: '3010', DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'nippon' });
    await FB.waitUp(c, /central server up on/, { name: 'central' });
    const zp = boot('nippon', 'taskset', ['-c', '0', process.execPath, '--trace-gc', path.join(ROOT, 'server', 'zone.js')], Object.assign({ PORT: String(Z.port), ZONE_ID: 'nippon', DB_PATH: `${D}/w.db`, CENTRAL_URL: 'http://localhost:3010', PUBLIC_HOST: 'localhost' }, env));
    const up = await FB.waitUp(zp, /zone server up on/, { name: 'nippon', capMs: 900000 });
    if (!up.ok) { r.err = up.why; return r; }
    await sleep(5000);
    // 붙어 있는 사람 N — 입력 30 Hz · ping 1초
    const steady = []; for (let i = 0; i < N; i++) { steady.push(guest(`t1125s${tag}${i}`)); await sleep(300); }
    for (let i = 0; i < 120 && steady.some((s) => !s.wel); i++) await sleep(500);
    const so = PLAIN ? { compress: false } : {};
    let seq = 0; const inT = setInterval(() => { seq++; for (const s of steady) if (s.ws.readyState === 1) s.ws.send(JSON.stringify({ type: 'input', seq, vx: Math.sin(seq / 40), vy: Math.cos(seq / 55), sprint: false, aim: false }), so); }, 1000 / 30);
    const pingT = setInterval(() => { for (const s of steady) if (s.ws.readyState === 1) s.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }), so); }, 1000);
    await sleep(10000);   // 데움
    for (const s of steady) s.rtt.length = 0;
    await getJSON(Z.port, '/perf?reset=1');
    const pid = zp.pid, cpu0 = cpuTicks(pid), rss0 = rssKB(pid), w0 = Date.now(), gcFrom = zp._out.length;
    // 들고 나는 사람 — every ms 마다 하나(번갈아 관측)
    const churn = []; let k = 0;
    const chT = setInterval(() => { k++; if (!EVERY) return;
      if (k % 2) { const g = guest(`t1125c${tag}${k}`, (st) => { churn.push(st.wel); try { st.ws.close(); } catch (e) {} }); setTimeout(() => { try { g.ws.close(); } catch (e) {} }, 30000); }
      else { const t0 = Date.now(); const ws = new WebSocket(`ws://127.0.0.1:${Z.port}/?observer=1&vx=${Math.round(Z.zoneWidth / 2)}&vy=${Math.round(Z.zoneHeight / 2)}`, { perMessageDeflate: true });
        ws.on('message', (d) => { if (String(d).indexOf('"observer":true') >= 0) { churn.push(Date.now() - t0); try { ws.close(); } catch (e) {} } }); ws.on('error', () => {}); setTimeout(() => { try { ws.close(); } catch (e) {} }, 30000); }
    }, EVERY || 1000);
    await sleep(WIN * 1000);
    clearInterval(chT);
    const perf = await getJSON(Z.port, '/perf');
    const wallMs = Date.now() - w0, cpu1 = cpuTicks(pid), rss1 = rssKB(pid);
    clearInterval(inT); clearInterval(pingT);
    const gcLines = zp._out.slice(gcFrom).split('\n').filter((l) => /ms: (Scavenge|Mark-Compact|Mark-sweep|Minor Mark-Sweep|Mark-Compact \(reduce\))/.test(l));
    const pauses = gcLines.map((l) => { const m = l.match(/MB, ([\d.]+) \/ ([\d.]+) ms/); return m ? +m[1] : null; }).filter((x) => x != null);
    const rtt = [].concat(...steady.map((s) => s.rtt));
    Object.assign(r, {
      deflateNegotiated: steady.filter((s) => s.deflate).length + '/' + steady.length,
      tickMs: perf && perf.tick ? perf.tick.ms : null, loop: perf ? perf.loop : null,
      cpuPct: (cpu0 != null && cpu1 != null) ? +(100 * (cpu1 - cpu0) / CLK * 1000 / wallMs).toFixed(1) : null,
      rssKB: [rss0, rss1], gc: { n: pauses.length, sumMs: +pauses.reduce((a, b) => a + b, 0).toFixed(1), maxMs: pauses.length ? Math.max(...pauses) : 0, p95: q(pauses, 0.95) },
      pingRtt: { n: rtt.length, p50: q(rtt, 0.5), p95: q(rtt, 0.95), max: rtt.length ? Math.max(...rtt) : null },
      welcomeMs: { n: churn.length, p50: q(churn, 0.5), max: churn.length ? Math.max(...churn) : null }, winS: +(wallMs / 1000).toFixed(1), steady: N, everyMs: EVERY,
    });
    for (const s of steady) { try { s.ws.close(); } catch (e) {} }
  } finally {
    for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
    await sleep(1500); try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {}
  }
  return r;
}

(async () => {
  const R = { card: 'T1125', made: new Date().toISOString().slice(0, 10), box: `CPU ${require('os').cpus().length} · 존 taskset -c 0`, runs: [] };
  for (const k of RUNS) R.runs.push(await run(k, { T1125_WS_DEFLATE: k === 'off' ? '0' : '1' }));
  R.plain = PLAIN;
  console.log(`\n=== permessage-deflate 비용(T1125 ②) — 닛폰 운영 꼴 · 존 CPU 하나 · 붙은 사람 ${N}(입력 30 Hz${PLAIN ? ' · 압축 없이 보냄' : ''}) · ${EVERY ? EVERY + ' ms 마다 접속 하나' : '들고 나는 접속 0'} · 창 ${WIN}초 ===`);
  for (const x of R.runs) {
    if (x.err) { console.log(`${x.tag}: 기동 실패 ${x.err}`); continue; }
    console.log(`${x.tag}: 협상 ${x.deflateNegotiated} · 틱 p50 ${x.tickMs && x.tickMs.p50} · p95 ${x.tickMs && x.tickMs.p95} · max ${x.tickMs && x.tickMs.max} ms · 루프 p95 ${x.loop && x.loop.p95} · p99 ${x.loop && x.loop.p99} · max ${x.loop && x.loop.max} ms · CPU ${x.cpuPct}% · RSS ${x.rssKB.map((v) => v && Math.round(v / 1024)).join(' → ')} MB · GC ${x.gc.n}번 합 ${x.gc.sumMs} · 최대 ${x.gc.maxMs} ms · ping p50 ${x.pingRtt.p50} · p95 ${x.pingRtt.p95} ms · welcome ${x.welcomeMs.n}번 p50 ${x.welcomeMs.p50} · max ${x.welcomeMs.max} ms`);
  }
  if (JOUT) { fs.mkdirSync(path.dirname(JOUT), { recursive: true }); fs.writeFileSync(JOUT, JSON.stringify(R, null, 1) + '\n'); console.log(`\n→ ${JOUT}`); }
})().catch((e) => { console.error('실패:', e); process.exit(1); });
