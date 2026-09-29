#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T513 ① 자)
// =============================================================================
// T513 ① — **하루 경계 해부**: econ 하루 마감의 어느 토막이 몇 ms 인가(`t356-tick-anatomy` 문법 — 존에 묻는다 · 새 계측 0).
//   존이 이미 내주는 칸만 읽는다: `/perf econTick.last`(그날의 조각 수 · 프레임 · 한 프레임 최대 · 가장 큰 조각과 그 이름 ·
//   단계별 합 `stages` — `econ` · `pop` · `terr` · `ore` · `caravan` · `events` · `life`(+`life:*` 생활층 속 토막 합 · `1마을:*` 한 마을 최대) · `dist`) ·
//   `/perf events`(그 창의 `save`(저장 큐 1마을/틱) · `econ_frame` · `tick ≥33ms`).
//   켬 팔(`T513_DAY_SLICE=1`)이면 `econ` 이 `econ:head`·`econ:vil`·`econ:trade`·`econ:caravan`·`econ:tail`(각 합 · `·max`)로 더 갈린다 —
//   끔 팔의 econ 한 조각이 **무엇으로 이뤄졌나**가 그 칸이다(조각은 같은 계산이다 · `tickWorldV2Parts`).
//
// 쓰는 법: node scripts/t513-day-anatomy.js <out.json> [팔…]      팔 = off | on (기본 둘 다 · 차례로)
//   env: T513_DAYS(6) · T513_DAY_MS(20000) · T513_FROM=<존 DB 틀>(없으면 새 세계) · T513_FROM_C=<central DB 틀> · T513_PORT(4600)
//        T513_SLICE_MS(16 — `VILLAGE_TICK_SLICE_MS` · 0 = 한 프레임에 몬다)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t513/anatomy.json';
const ARMS = process.argv.slice(3).length ? process.argv.slice(3) : ['off', 'on'];
const DAYS = parseInt(process.env.T513_DAYS || '6', 10);
const DAY_MS = parseInt(process.env.T513_DAY_MS || '20000', 10);
const FROM = process.env.T513_FROM || '', FROM_C = process.env.T513_FROM_C || '';
const PORT = parseInt(process.env.T513_PORT || '4600', 10);
const SLICE = process.env.T513_SLICE_MS || '16';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const cp = (a, b) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(b + s); } catch (e) {} try { fs.copyFileSync(a + s, b + s); } catch (e) {} } };
const rm = (b) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(b + s); } catch (e) {} } };

async function run(arm) {
  const TMP = path.dirname(OUT); fs.mkdirSync(TMP, { recursive: true });
  const zdb = `${TMP}/an-${arm}-z.db`, cdb = `${TMP}/an-${arm}-c.db`, SECRET = 't513-' + arm + '-' + process.pid;
  if (FROM) cp(FROM, zdb); else rm(zdb);
  if (FROM_C) cp(FROM_C, cdb); else rm(cdb);
  const CP = PORT, ZP = PORT + 10;
  const env = Object.assign({}, process.env); env.T513_DAY_SLICE = arm === 'on' ? '1' : '0';   // ★[T523] 기본 켬이 되어 끔 팔은 `=0` 을 적어서 준다
  const logf = fs.openSync(`${TMP}/an-${arm}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, env, { PORT: String(ZP), ZONE_ID: 'hanbando', DB_PATH: zdb, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), VILLAGE_WAR_LOG: '0', VILLAGE_TICK_SLICE_MS: SLICE }) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  const out = { arm, days: [], bootS: 0 };
  try {
    const tb = Date.now();
    for (let i = 0; i < 900; i++) { try { if ((await fetch(`http://localhost:${ZP}/health`)).ok) break; } catch (e) {} await sleep(1000); }
    out.bootS = Math.round((Date.now() - tb) / 1000);
    await getj('/perf?reset=1');
    let last = null, lastEv = Date.now();
    const t0 = Date.now();
    while (out.days.length < DAYS && Date.now() - t0 < (DAYS + 3) * DAY_MS + 600000) {
      await sleep(Math.max(500, DAY_MS / 8));
      const p = await getj('/perf'); const L = p && p.econTick && p.econTick.last;
      if (!L || L.at === last) continue;
      last = L.at;
      await sleep(Math.min(4000, DAY_MS / 4));   // 저장 큐가 흐르는 동안(`save` 사건) — 1마을/틱
      const p2 = (await getj('/perf?reset=1')) || p;
      const ev = (p2.events || []).filter((e) => e.t > lastEv); lastEv = Date.now();
      const evs = {}; for (const e of ev) { const o = evs[e.kind] || (evs[e.kind] = { n: 0, sum: 0, max: 0 }); o.n++; o.sum += e.ms; o.max = Math.max(o.max, e.ms); }
      for (const k in evs) evs[k].sum = +evs[k].sum.toFixed(1);
      out.days.push({ day: L.day, total: L.total, wall: L.wall, chunks: L.chunks, frames: L.frames, frameMax: L.frameMax, maxChunk: L.maxChunk, maxChunkAt: L.maxChunkAt,
        lifeMaxAt: L.lifeMaxAt, villages: L.villages, order: L.order, stages: L.stages, events: evs,
        loop: p2.loop, tick: p2.tick && p2.tick.ms });
      if (process.env.T513_PARTIAL) { try { fs.writeFileSync(process.env.T513_PARTIAL, JSON.stringify(out)); } catch (e) {} }   // 날마다 적는다(긴 판이 끊겨도 남게)
      say(`  [${arm}] day ${L.day} · 일 ${L.total}ms · 조각 ${L.chunks} · 프레임 ${L.frames} · 한 프레임 최대 ${L.frameMax}ms · 가장 큰 조각 ${L.maxChunk}ms(${L.maxChunkAt}${L.maxChunkAt === 'life' ? ' ' + L.lifeMaxAt : ''}) · econ ${L.stages.econ}ms · life ${L.stages.life}ms`);
    }
  } finally {
    try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500);
    rm(zdb); rm(cdb);
  }
  return out;
}

(async () => {
  const res = { at: new Date().toISOString(), DAYS, DAY_MS, FROM: FROM || '(새 세계)', SLICE, arms: {} };
  for (const a of ARMS) { say(`\n[T513 ①] 팔 ${a} — ${DAYS}일 × ${DAY_MS}ms · 틀 ${FROM || '새 세계'}`); res.arms[a] = await run(a); fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); }
  // 요약 — 날마다 가장 큰 조각의 이름 · econ 속(켬) · 생활층 속 한 마을 최대(`1마을:*`)
  for (const a of Object.keys(res.arms)) {
    const ds = res.arms[a].days;
    say(`\n[${a}] 날 ${ds.length} · 한 프레임 최대 ${ds.map((d) => d.frameMax).join('/')} ms · 가장 큰 조각 ${ds.map((d) => `${d.maxChunk}(${d.maxChunkAt})`).join(' ')}`);
    const keys = new Set(); for (const d of ds) for (const k in (d.stages || {})) keys.add(k);
    const med = (xs) => { const b = xs.filter((x) => x != null).sort((p, q) => p - q); return b.length ? b[b.length >> 1] : null; };
    const rows = [...keys].map((k) => [k, med(ds.map((d) => d.stages[k])), Math.max(...ds.map((d) => d.stages[k] || 0))]).sort((p, q) => q[2] - p[2]);
    for (const [k, m, mx] of rows.slice(0, 30)) say(`   ${k.padEnd(22)} 중앙 ${String(m).padStart(6)} · 최대 ${String(mx).padStart(6)} ms`);
  }
  say('\n→', OUT);
  process.exit(0);
})();
