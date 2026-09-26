#!/usr/bin/env node
// === scripts/t428-three-boot.js — 존 셋 동시 기동 실측 (T428 ①) ============================
//
// ★계측기다 — 러너 밖(첫 열 `@regress` 표 없음). 판정하지 않고 **수**를 낸다.
//   한 호스트에서 central 하나 + 존 셋(hanbando·nippon·jungwon_n)을 **동시에** 띄운다(배포 스크립트가 쓰는
//   zone-config 포트 그대로 — 3020 · 3021 · 3016 · central 3010). 존 env 는 **기본값**(ENABLE_* 안 줌 = 라이브 문법).
//
// 재는 것(존마다):
//   · 기동 — 띄운 순간부터 아이가 제 입으로 `zone server up on` 을 찍을 때까지(fixture-boot 정본 · 사본 0)
//   · 준비 — `마을 시뮬 준비` 줄까지(시딩·거리행렬까지 끝난 = 사람이 들어와 볼 세계가 선 때)
//   · RSS — /proc/<pid>/status VmRSS · 준비 직후 · 쉼 창 끝
//   · 쉼 CPU — 사람 0 · 관측자 0 으로 IDLE_S 초 동안 /proc/<pid>/stat utime+stime 증분 ÷ 벽시계
//   · central 왕복 — central `/zones` 가 세 존의 인구(`population`)를 **받아 왔나**(central 이 각 존 /health 를 두드린 증거)
//   · 오류 — 존 로그의 Error/TypeError/ReferenceError · stderr 스택 프레임
//
// 실행: node scripts/t428-three-boot.js [IDLE_S=60] [--json out.json]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const argv = process.argv.slice(2);
const IDLE_S = parseInt(argv.find((a) => /^\d+$/.test(a)) || '60', 10);
const JOUT = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
const ZIDS = (process.env.T428_ZONES || 'hanbando,nippon,jungwon_n').split(',');
const CPORT = 3010;
const DDIR = `/tmp/t428-3z-${process.pid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._out = ''; p._err = ''; p._t0 = Date.now();
  // ★때는 **줄이 들어온 그 순간**에 찍는다 — 기다리는 쪽이 순서대로 await 하면 앞 존을 기다리는 동안 뒤 존의 때가 뭉개진다(1판이 그랬다: 셋 다 115.4s)
  p.stdout.on('data', (b) => { p._out += String(b);
    if (p._tUp == null && /zone server up on/.test(p._out)) p._tUp = Date.now() - p._t0;
    if (p._tReady == null && /마을 시뮬 준비|시뮬 비활성/.test(p._out)) { p._tReady = Date.now() - p._t0; p._rssReady = rssMB(p.pid); } });
  p.stderr.on('data', (b) => { p._err += String(b); });
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
const rssMB = (pid) => { try { const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/); return m ? +(+m[1] / 1024).toFixed(1) : null; } catch (e) { return null; } };
const HZ = 100;   // USER_HZ — /proc 틱 단위(리눅스 기본)
const cpuS = (pid) => { try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (+f[11] + +f[12]) / HZ; } catch (e) { return null; } };

(async () => {
  for (const port of [CPORT].concat(ZIDS.map((z) => ZONES[z].port))) {
    if (!await portFree(port)) { console.log(`★포트 ${port} 가 이미 쓰인다 — 남의 서버를 잴 수 없다. 끝.`); process.exit(2); }
  }
  fs.mkdirSync(DDIR, { recursive: true });
  const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  console.log(`central 기동 ${cu.ok ? cu.ms + 'ms' : '실패 ' + cu.why}`);
  const Zs = {};
  const T0 = Date.now();
  for (const z of ZIDS) {
    const p = boot(z, 'zone.js', { PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${DDIR}/world-${z}.db`, CENTRAL_URL: `http://localhost:${CPORT}` });
    Zs[z] = { p, up: FB.waitUp(p, /zone server up on/, { name: z, capMs: 900000 }) };
  }
  for (const z of ZIDS) { const r = await Zs[z].up; Zs[z].upWhy = r.ok ? '' : r.why; }
  for (const z of ZIDS) { Zs[z].upMs = Zs[z].p._tUp; console.log(`  ${z} 기동 ${Zs[z].upMs != null ? (Zs[z].upMs / 1000).toFixed(1) + 's' : '실패 ' + Zs[z].upWhy}`); }
  // 준비(마을 시뮬 준비 · 시뮬 비활성) — 존마다
  for (let i = 0; i < 1200; i++) {
    let all = true;
    for (const z of ZIDS) {
      const s = Zs[z];
      if (s.readyMs == null && s.p._tReady != null) { s.readyMs = s.p._tReady; s.rssReady = s.p._rssReady; console.log(`  ${z} 준비 ${(s.readyMs / 1000).toFixed(1)}s · RSS ${s.rssReady}MB`); }
      if (s.readyMs == null) all = false;
    }
    if (all) break;
    await sleep(500);
  }
  const wallAll = Date.now() - T0;
  // central 왕복 — central 이 각 존 /health 를 두드려 인구를 받아 왔나
  let zj = null;
  for (let i = 0; i < 60; i++) {
    try { zj = (await (await fetch(`http://localhost:${CPORT}/zones`)).json()).zones; } catch (e) { zj = null; }
    if (zj && ZIDS.every((z) => zj[z] && zj[z].population != null)) break;
    await sleep(1000);
  }
  const health = {};
  for (const z of ZIDS) { try { health[z] = await (await fetch(`http://localhost:${ZONES[z].port}/health`)).json(); } catch (e) { health[z] = null; } }
  // 쉼 창 — 사람 0 · 관측자 0
  const c0 = {}; for (const z of ZIDS) c0[z] = cpuS(Zs[z].p.pid);
  const cc0 = cpuS(c.pid);
  const t0 = Date.now();
  await sleep(IDLE_S * 1000);
  const dt = (Date.now() - t0) / 1000;
  const rows = [];
  for (const z of ZIDS) {
    const s = Zs[z], pid = s.p.pid;
    const errs = s.p._out.split('\n').filter((l) => /(^|\s)(Error|TypeError|ReferenceError)\b|Cannot read|is not a function/.test(l));
    const stack = s.p._err.split('\n').filter((l) => /^\s+at\s+\S/.test(l));
    const seed = (s.p._out.match(/마을 시딩 완료 — [^\n]*/) || [''])[0];
    const dist = (s.p._out.match(/교역 BFS 거리행렬: [^\n]*?도달불능 \d+쌍/) || [''])[0];
    rows.push({ zone: z, port: ZONES[z].port, upS: s.upMs != null ? +(s.upMs / 1000).toFixed(1) : null, readyS: s.readyMs != null ? +(s.readyMs / 1000).toFixed(1) : null,
      rssReady: s.rssReady, rssIdle: rssMB(pid), idleCpuPct: +(((cpuS(pid) - c0[z]) / dt) * 100).toFixed(2),
      centralPop: zj && zj[z] ? zj[z].population : null, healthVillages: health[z] ? health[z].villages : null,
      errs: errs.length, stack: stack.length, seed: seed.slice(0, 80), dist: dist.slice(0, 140), errSample: errs.slice(0, 2).join(' | ').slice(0, 200) });
  }
  const central = { rss: rssMB(c.pid), idleCpuPct: +(((cpuS(c.pid) - cc0) / dt) * 100).toFixed(2) };
  console.log(`\n=== 존 셋 동시 기동 — 벽시계 ${(wallAll / 1000).toFixed(1)}s · 쉼 창 ${dt.toFixed(0)}s ===`);
  console.log('| 존 | 포트 | 기동 | 준비 | RSS 준비 | RSS 쉼 끝 | 쉼 CPU | central 이 받은 인구 | /health 마을 | 오류 · 스택 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const r of rows) console.log(`| ${r.zone} | ${r.port} | ${r.upS}s | ${r.readyS}s | ${r.rssReady}MB | ${r.rssIdle}MB | ${r.idleCpuPct}% | ${r.centralPop} | ${r.healthVillages} | ${r.errs} · ${r.stack} |`);
  console.log(`| central | ${CPORT} | — | — | — | ${central.rss}MB | ${central.idleCpuPct}% | — | — | — |`);
  for (const r of rows) console.log(`  ${r.zone}: ${r.seed} · ${r.dist}${r.errSample ? ' · ★' + r.errSample : ''}`);
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ wallAllS: +(wallAll / 1000).toFixed(1), idleS: +dt.toFixed(1), rows, central }, null, 1));
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  try { fs.rmSync(DDIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
