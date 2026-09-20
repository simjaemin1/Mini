#!/usr/bin/env node
// === scripts/t333-phase-curve.js — 국면(낮/밤)별 사람당 µs · 인원 곡선 (T333 ③) =================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜 — T324 는 180초 창 하나로 p50 을 냈는데, 그 수가 **국면에 따라 두 배 넘게** 흔들렸다
//   (밤엔 다들 자고 낮엔 다들 걷는다 — 같은 인원인데 걸음당 일이 다르다). 카드 T333 ③ 은
//   **낮/밤을 갈라서** 사람당 µs 를 묻는다. 그래서 창을 **조각내고 조각마다 영점 조정**한다:
//   `/perf?reset=1` 이 틱 히스토그램을 지우므로, 한 조각의 p50 은 그 조각만의 값이다.
//
// ★같이 내는 것 — 인원 곡선의 한 점: 그 세계의 **걷는 사람 수**(걸음/틱)와 사람당 µs.
//   상수 항은 끔 팔(걷는 사람 0)이 준다: `tick = C + N × s`.
//
// 실행: ARM=on TPL=/tmp/t333-tpl-d800.db SLICE_S=60 SLICES=26 node scripts/t333-phase-curve.js [out.json]
//   DAY_MS(기본 1440000 = 배포 정본) · PORT_BASE(기본 3700)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = (process.env.ARM || 'on').trim();
const PB = parseInt(process.env.PORT_BASE || '3700', 10);
const OUT = process.argv[2] || `/tmp/t333-phase-${ARM}.json`;
const DAY_MS = parseInt(process.env.DAY_MS || '1440000', 10);
const SLICE_S = parseInt(process.env.SLICE_S || '60', 10);
const SLICES = parseInt(process.env.SLICES || '26', 10);      // 26 × 60초 = 26분 ≈ 하루(24분) 한 바퀴 + 여유
const TPL = process.env.TPL || '/tmp/t316-tpl.db';
const LABEL = process.env.LABEL || path.basename(TPL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(`[${ARM}·${LABEL}]`, ...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

const SECRET = 't333-' + ARM;
const CP = PB, ZP = PB + 1;
const DB = `/tmp/t333-z-${ARM}.db`;
rmdb(DB); rmdb(`/tmp/t333-c-${ARM}.db`);
for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
const logf = fs.openSync(`/tmp/t333-${ARM}.log`, 'w');
const zenv = { DB_PATH: DB, VILLAGE_WAR_LOG: '0' };
if (ARM === 'on') zenv.T312_FISH_ACT = '1';
const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
  env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `/tmp/t333-c-${ARM}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
  env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS) }, zenv) });
const getj = async (p, h) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, h ? { headers: h } : undefined); return await r.json(); } catch (e) { return null; } };
const perf = (reset) => getj(`/perf${reset ? '?reset=1' : ''}`, { 'x-zone-secret': SECRET });
const life = () => getj('/lifedbg', { 'x-zone-secret': SECRET });
const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };

(async () => {
  const bootT0 = Date.now();
  for (let i = 0; i < 1200 && !(await health()); i++) await sleep(1000);
  const bootMs = Date.now() - bootT0;
  say('기동', bootMs, 'ms');
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const pinger = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  await sleep(20000);   // 마을이 깨어나 걷기 시작할 시간
  const L0 = await life();
  const pop = (L0 && L0.totals && L0.totals.pop) || 0;
  say('인구', pop);
  const slices = [];
  for (let k = 0; k < SLICES; k++) {
    await perf(true);                       // 조각 영점
    const w0 = (await perf(false)).walk;    // steps 누계 시작값(영점 직후)
    await sleep(SLICE_S * 1000);
    const p = await perf(false), L = await life();
    const w = p.walk, t = p.tick && p.tick.ms;
    const steps = w.steps - w0.steps;
    const ticks = t ? t.n : 0;
    const spt = ticks ? steps / ticks : 0;
    const acts = {}; let nonSleep = 0;
    for (const v of ((L && L.villages) || [])) for (const [kk, n] of Object.entries(v.acts || {})) { acts[kk] = (acts[kk] || 0) + n; if (kk !== '취침') nonSleep += n; }
    slices.push({ k, phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, ticks, steps, stepsPerTick: +spt.toFixed(1),
      usPerStep: (t && spt) ? +(t.p50 * 1000 / spt).toFixed(2) : null,
      pop: (L && L.totals && L.totals.pop) || pop, nonSleep, drop: p.tick.dropN, lag: p.tick.lagPct,
      terrPerStep: w.terrPerStep, cutTicks: w.cutTicks });
    say(`조각 ${k} phase ${L && L.phase != null ? L.phase.toFixed(3) : '?'} · p50 ${t ? t.p50 : '?'}ms · 걸음/틱 ${spt.toFixed(0)} · 사람당 ${(t && spt) ? (t.p50 * 1000 / spt).toFixed(2) : '?'}µs · 비취침 ${nonSleep}/${pop}`);
    fs.writeFileSync(OUT, JSON.stringify({ arm: ARM, tpl: TPL, label: LABEL, DAY_MS, bootMs, pop, slices }, null, 1));
  }
  clearInterval(pinger); try { ws.close(); } catch (e) {}
  try { z.kill('SIGINT'); } catch (e) {} await sleep(3000);
  try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {}
  await sleep(500); rmdb(DB); rmdb(`/tmp/t333-c-${ARM}.db`);
  say('끝 →', OUT);
  process.exit(0);
})();
