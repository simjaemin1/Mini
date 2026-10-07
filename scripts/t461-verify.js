#!/usr/bin/env node
// === scripts/t461-verify.js — T461 게이트: **제품 존**에서 걸음 커널과 JS 정본을 틱마다 비트로 견준다 ==================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 존을 `T461_WALK_WASM=verify` 로 띄운다 — 커널이 돌되 몸에 안 쓰고,
//   JS 정본이 원래대로 옮긴 뒤 **전원 x·y·vx·vy 를 `Object.is` 로** 견준다(`server/zone.js` `_wwCheck` · `/perf` `walk.ww`).
//   ⇒ 켬(`=1`)은 같은 입력에서 같은 비트를 몸에 쓴다 = 켬/끔 좌표가 틱마다 비트 동일(T352 게이트를 틱마다 · 두 N).
// 실행: node scripts/t461-verify.js [out.json]   · T461_V_TPLS="/tmp/t368/tpl-t100.db,/tmp/t444/tpl-inf.db" · T461_V_TICKS=1000 · T461_V_S=60
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t461-verify.json';
const TPLS = (process.env.T461_V_TPLS || '/tmp/t368/tpl-t100.db,/tmp/t444/tpl-inf.db').split(',');
const MIN_TICKS = parseInt(process.env.T461_V_TICKS || '1000', 10);
const SLICE_S = parseInt(process.env.T461_V_S || '60', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

async function one(tpl, idx) {
  const CP = 4700 + idx * 4, ZP = CP + 1, SECRET = 't461v-' + idx;
  const DB = `/tmp/t461v-z-${idx}.db`, CDB = `/tmp/t461v-c-${idx}.db`;
  rmdb(DB); rmdb(CDB); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(tpl + s, DB + s); } catch (e) {} }
  const cap = /inf/.test(tpl) ? { VILLAGE_NPC_CAP: '999999' } : {};
  const logf = fs.openSync(`/tmp/t461v-${idx}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, cap, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: '1440000', DB_PATH: DB, VILLAGE_WAR_LOG: '0', T312_FISH_ACT: process.env.T461_V_FISH || '1', T461_WALK_WASM: 'verify' }) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`)).ok; } catch (e) { return false; } };
  for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  await sleep(20000);
  await getj('/perf?reset=1');
  const res = { tpl, slices: [] }; let ticks = 0, steps = 0, bad = 0, gateBad = 0;
  const t7 = { on: false, treeHit: 0, treeMiss: 0, treeBad: 0, still: 0, stillBad: 0 };   // ★[T672] 깎기 켬(`T672_WALK_CUT=1`)이면 두 증인도 센다
  while (ticks < MIN_TICKS || res.slices.length < 2) {
    await sleep(SLICE_S * 1000);
    const p = await getj('/perf?reset=1'), L = await getj('/lifedbg');
    const w = p && p.walk && p.walk.ww;
    if (!w) { res.err = '견줌 칸 없음(walk.ww)'; break; }
    ticks += w.ticks; steps += w.steps; bad += w.bad; gateBad += w.gateBad || 0;
    if (w.t672) { t7.on = true; for (const k of ['treeHit', 'treeMiss', 'treeBad', 'still', 'stillBad']) t7[k] += w.t672[k] || 0; }
    res.slices.push({ ticks: w.ticks, steps: w.steps, bad: w.bad, badTicks: w.badTicks, sample: w.sample, phase: L && L.phase, p50: p.tick && p.tick.ms && p.tick.ms.p50, walkSteps: p.walk.steps, eject: p.walk.eject });
    console.log(`[${path.basename(tpl)}] 틱 ${w.ticks} · 커널 걸음 ${w.steps} · 어긋남 ${w.bad} · 갈래 틀린 틱 ${w.gateBad} · phase ${L && L.phase != null ? L.phase.toFixed(3) : '?'} · JS 걸음 ${p.walk.steps} · 탈출 ${p.walk.eject}`);
    if (res.slices.length > 60) break;
  }
  Object.assign(res, { ticks, steps, bad, gateBad, t672: t7.on ? t7 : null, gate: !res.err && ticks >= MIN_TICKS && bad === 0 && gateBad === 0 && (!t7.on || (t7.treeBad === 0 && t7.stillBad === 0)) });
  try { ws.close(); } catch (e) {} try { z.kill(); } catch (e) {} try { c.kill(); } catch (e) {}
  await sleep(1500); rmdb(DB); rmdb(CDB);
  return res;
}
(async () => {
  const out = [];
  for (let i = 0; i < TPLS.length; i++) { out.push(await one(TPLS[i], i)); fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); }
  for (const r of out) console.log(`게이트 ${r.gate ? '○' : '✗'} — ${path.basename(r.tpl)} · 틱 ${r.ticks} · 커널 걸음 ${r.steps} · 어긋남 ${r.bad} · 갈래 틀린 틱 ${r.gateBad}${r.t672 ? ` · [T672] 나무 열 지난 것 ${r.t672.treeHit}/다시 ${r.t672.treeMiss} · 어긋남 ${r.t672.treeBad} · 서 있는 몸 ${r.t672.still} · 어긋남 ${r.t672.stillBad}` : ''}${r.err ? ' · ' + r.err : ''}`);
  process.exit(out.every((r) => r.gate) ? 0 : 1);
})();
