#!/usr/bin/env node
// === scripts/t640-perf.js — 새 세계 첫 부팅: `zone server up` 까지 · 표본이 끝나는 때 · 그동안 틱·루프 p95 [T640 ② · 2026-10-04] ===
//
// ★central + 존 하나를 새 DB 로 띄운다(존 env 는 기본값 = 라이브 문법 · 하루 24분 정본 시계). 부모 env 가 그대로 간다(★[T655] 켬이 기본 · `T640_BOOT_SLICE=0` 이면 끔 팔).
//   잰다: 존을 띄운 순간 → `zone server up` 줄(초) · `도적 시뮬 준비` 줄(초 · 끔이면 up 앞) · 그 뒤 `--secs` 동안 10초마다 `/perf?reset=1`
//   (틱 본문 p95·max · 이벤트 루프 지연 p95·p99) — 표본이 도는 창과 끝난 뒤 창을 가른다.
// ★재기만 한다 — 제품 코드 0 · 러너 밖.
// 실행: node scripts/t640-perf.js [--zone hanbando] [--secs 420] [--cport 3871] [--out /tmp/t640/perf-off.json]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando'), SECS = +val('--secs', '420'), CPORT = +val('--cport', '3871'), ZPORT = CPORT + 10;
const OUT = val('--out', `/tmp/t640-perf-${ZID}.json`);
const ZDB = `/tmp/t640p-zone-${process.pid}.db`, CDB = `/tmp/t640p-central-${process.pid}.db`;
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [ZDB, CDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } });
function boot(file, env) {
  const p = spawn(process.execPath, ['--max-old-space-size=1500', path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._buf = ''; p.stdout.on('data', (b) => { p._buf += String(b); if (p._buf.length > 2e6) p._buf = p._buf.slice(-1e6); }); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZID });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok) { console.log('central 실패'); process.exit(1); }
  const t0 = Date.now();
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: ZID, DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}` });
  const marks = {};
  const watch = setInterval(() => {
    if (marks.ready == null && /도적 시뮬 준비/.test(z._buf)) marks.ready = (Date.now() - t0) / 1000;
    if (marks.sliceEnd == null) { const m = z._buf.match(/부팅 표본 끝\(T640\)[^\n]*/); if (m) marks.sliceEnd = m[0]; }
  }, 200);
  const u = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 900000 });
  if (!u.ok) { console.log('존 실패 ' + u.why); process.exit(1); }
  const upS = (Date.now() - t0) / 1000;
  const rows = [];
  try { await fetch(`http://localhost:${ZPORT}/perf?reset=1`); } catch (e) {}
  const tEnd = Date.now() + SECS * 1000;
  while (Date.now() < tEnd) {
    await sleep(10000);
    let j = null; try { j = await (await fetch(`http://localhost:${ZPORT}/perf?reset=1`, { signal: AbortSignal.timeout(20000) })).json(); } catch (e) {}
    const tk = j && j.tick && j.tick.ms, lp = j && j.loop;
    rows.push({ t: +((Date.now() - t0) / 1000).toFixed(1), sampling: marks.ready == null, tickP95: tk ? tk.p95 : null, tickMax: tk ? tk.max : null, tickN: tk ? tk.n : null,
      loopP95: lp ? lp.p95 : null, loopP99: lp ? lp.p99 : null, loopMax: lp ? lp.max : null });
  }
  clearInterval(watch);
  const agg = (sel) => { const r = rows.filter(sel); if (!r.length) return null; const m = (k) => +(r.reduce((a, x) => a + (x[k] || 0), 0) / r.length).toFixed(2);
    return { windows: r.length, tickP95: m('tickP95'), tickMax: Math.max(...r.map((x) => x.tickMax || 0)), loopP95: m('loopP95'), loopP99: m('loopP99') }; };
  const out = { zone: ZID, arm: process.env.T640_BOOT_SLICE === '0' ? 'off' : 'on', upS, readyS: marks.ready, sliceEnd: marks.sliceEnd || null,
    during: agg((x) => x.sampling), after: agg((x) => !x.sampling), rows };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(Object.assign({}, out, { rows: undefined })));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
