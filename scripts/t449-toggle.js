#!/usr/bin/env node
// === scripts/t449-toggle.js — 청크 켬 사람당 µs 를 **한 판 안에서** 옛 격자 ↔ 새 격자로 가른다(T449 ③ · ABBA · 같은 순간 A/B) ============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//   자 = `scripts/t410-zone-awake.js load` 의 그 판(같은 틀 · 실제 날 · 첫 경계 뒤 · 60초 조각 · GC 뒤 들여다보기 · 분모 = 마을 명부)에
//   예비 적재 `scripts/t449-toggle-probe.js` 하나를 더 실었다 — 조각마다 존의 격자 몸을 **옛(베이스 글자) ↔ 새(제품)** 로 바꾼다.
//   차례 ABBA(옛 · 새 · 새 · 옛 …) ⇒ 한 묶음 네 조각에서 짝 둘(옛₀·새₁ · 옛₃·새₂) — 곧은 흐름(시각·국면)이 짝 안에서 지워진다.
//   벽 질의 답은 두 몸에서 비트 동일이라(`test-coll-grid` · 실서버 1.2억 질의 다름 0) 몸을 바꿔도 **세계는 같은 길**을 간다 — 값만 바뀐다.
//   ⇒ 규약(Z-자) ⓐ 첫 경계 뒤 ✓ · ⓑ GC 뒤 ✓ · ⓒ 실제 날 ✓ · ⓓ 같은 판 · 이웃한 분 · 빼기 0(짝마다 차) ✓ · ⓔ 분모 = 마을 명부 ✓ · T444(판 사이 p50 금지) ✓.
//
// 실행: T449_TPL=<틀 DB> T449_ARM=chunksi|chunks node scripts/t449-toggle.js
//   T449_TMP · T449_SLICES(기본 20) · T449_SLICE_S(기본 60) · T449_SETTLE_S(전환 뒤 기다림 · 기본 3) · T449_PORT(기본 4700) · T449_OUT
//   T449_WAITDAY=0 — 경계를 안 기다린다(전환 기계 점검 전용 · 규약 ⓐ 위반이라 값은 읽지 않는다)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TMP = process.env.T449_TMP || '/tmp/t449t';
const TPL = process.env.T449_TPL || '';
const ARM = process.env.T449_ARM || 'chunksi';
const NSL = parseInt(process.env.T449_SLICES || '20', 10);
const SLICE_S = parseInt(process.env.T449_SLICE_S || '60', 10);
const SETTLE_S = parseInt(process.env.T449_SETTLE_S || '3', 10);
const PORT = parseInt(process.env.T449_PORT || '4700', 10);
const OUT = process.env.T449_OUT || `${TMP}/toggle-${ARM}.json`;
const REAL_DAY_MS = 1440000;   // = `zone-config.js` WORLD.dayLengthMs(T410 · T432 의 그 수)
const ENVS = { chunks: { T432_BODY_CHUNKS: '1', T421_SPATIAL_INC: '0' }, chunksi: { T432_BODY_CHUNKS: '1', T421_SPATIAL_INC: '1' } };   // T432 팔 그대로
const ORDER = ['old', 'new', 'new', 'old'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
const cpdb = (a, b) => { rmdb(b); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(a + s, b + s); } catch (e) {} } };
const CLK = 100;
const cpuTicks = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const f = s.slice(s.lastIndexOf(')') + 2).split(' '); return (+f[11]) + (+f[12]); } catch (e) { return null; } };
if (!ENVS[ARM]) { console.error('모르는 팔', ARM); process.exit(2); }
if (!TPL || !fs.existsSync(TPL)) { console.error('틀이 없다 —', TPL); process.exit(3); }
fs.mkdirSync(TMP, { recursive: true });

(async () => {
  const tag = 'tg-' + ARM, SECRET = 't449tg-' + ARM, CP = PORT, ZP = PORT + 1;
  const cdb = `${TMP}/c-${tag}.db`, zdb = `${TMP}/z-${tag}.db`; rmdb(cdb); cpdb(TPL, zdb);
  const MODE_FILE = `${TMP}/${tag}.mode`, probeOut = `${TMP}/${tag}.probe.json`;
  fs.writeFileSync(MODE_FILE, 'new');
  const logf = fs.openSync(`${TMP}/${tag}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, ['--expose-gc', '-r', path.join(ROOT, 'scripts/t449-toggle-probe.js'), path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(REAL_DAY_MS), VILLAGE_WAR_LOG: '0', T432_PROBE_OUT: probeOut, T449_MODE_FILE: MODE_FILE }, ENVS[ARM]) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(5000) })).ok; } catch (e) { return false; } };
  const probe = async () => { try { fs.unlinkSync(probeOut); } catch (e) {} try { process.kill(z.pid, 'SIGUSR2'); } catch (e) { return null; }
    for (let i = 0; i < 100; i++) { await sleep(100); try { return JSON.parse(fs.readFileSync(probeOut, 'utf8')); } catch (e) {} } return null; };
  const setMode = async (m) => {
    try { fs.unlinkSync(MODE_FILE + '.ack'); } catch (e) {}
    fs.writeFileSync(MODE_FILE, m); try { process.kill(z.pid, 'SIGWINCH'); } catch (e) { return null; }
    for (let i = 0; i < 100; i++) { await sleep(50); try { const a = JSON.parse(fs.readFileSync(MODE_FILE + '.ack', 'utf8')); return a; } catch (e) {} }
    return null;
  };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} };
  const tb = Date.now();
  for (let i = 0; i < 600 && !(await health()); i++) await sleep(1000);
  say(`부팅 ${((Date.now() - tb) / 1000).toFixed(0)}초 · 팔 ${ARM} ${JSON.stringify(ENVS[ARM])} · 틀 ${path.basename(TPL)} · 예비 적재 t449-toggle-probe(베이스 ${process.env.T449_TOGGLE_BASE || '8121ccb4'})`);
  //   ★규약 ⓐ — 부팅 뒤 첫 하루 경계를 넘긴다(국면이 되돌아가는 순간 · t410 `T410_WAITDAY` 와 같은 판정)
  if (process.env.T449_WAITDAY !== '0') { let ph0 = null; const tw = Date.now();   // (`T449_WAITDAY=0` = 기계 점검 전용 — 값을 읽지 마라)
    for (;;) { const L = await getj('/lifedbg'); const ph = L && typeof L.phase === 'number' ? L.phase : null;
      if (ph != null && ph0 != null && ph + 0.5 < ph0) break; if (ph != null) ph0 = Math.max(ph0 == null ? 0 : ph0, ph);
      if (Date.now() - tw > REAL_DAY_MS + 120000) break; await sleep(5000); }
    say(`새 하루 — 기다림 ${((Date.now() - tw) / 1000).toFixed(0)}초`); }
  const res = { at: new Date().toISOString(), arm: ARM, env: ENVS[ARM], tpl: TPL, base: process.env.T449_TOGGLE_BASE || '8121ccb4', sliceS: SLICE_S, settleS: SETTLE_S, order: ORDER, slices: [] };
  for (let k = 0; k < NSL; k++) {
    const m = ORDER[k % 4];
    const ack = await setMode(m);
    await sleep(SETTLE_S * 1000);
    await getj('/perf?reset=1'); const t0 = Date.now(), c0 = cpuTicks(z.pid);
    await sleep(SLICE_S * 1000);
    const p = await getj('/perf?reset=1'), L = await getj('/lifedbg');
    const t1 = Date.now(), c1 = cpuTicks(z.pid);
    const pr = await probe();
    const t = p && p.tick && p.tick.ms;
    let bodies = 0; for (const v of (L && L.villages) || []) bodies += v.pop || 0;
    const s = { k, mode: m, ack: ack && ack.mode, phase: L ? L.phase : null, night: L ? L.phase > (L.dayR != null ? L.dayR : 0.7) : null,
      p50: t ? t.p50 : null, p95: t ? t.p95 : null, max: t ? t.max : null, n: t ? t.n : null,
      cut: p && p.walk ? p.walk.cutTicks : null, steps: p && p.walk ? p.walk.steps : null, bodies,
      usPer: (t && bodies > 0) ? +(t.p50 * 1000 / bodies).toFixed(4) : null,
      cpu: (c0 != null && c1 != null) ? +(((c1 - c0) / CLK) / ((t1 - t0) / 1000) * 100).toFixed(2) : null,
      act: pr && pr.s ? pr.s.act : null, bld: pr && pr.s ? pr.s.bld : null, seed: pr && pr.s ? pr.s.seed : null, heap: pr && pr.mem ? +(pr.mem.heapUsed / 1048576).toFixed(1) : null };
    res.slices.push(s);
    say(`조각 ${k} [${m}${s.ack === m ? '' : ' ⚠ack ' + s.ack}] phase ${s.phase != null ? s.phase.toFixed(3) : '?'}${s.night ? '(밤)' : '(낮)'} · p50 ${s.p50}ms · p95 ${s.p95} · n ${s.n} · 예산 찬 ${s.cut} · CPU ${s.cpu}% · 사람당 ${s.usPer}µs(마을 명부 ${bodies}) · 청크 ${s.act} · 건물 ${s.bld}`);
    try { fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); } catch (e) {}
  }
  //   짝 — ABBA 한 묶음에서 (옛₀ · 새₁) · (옛₃ · 새₂)
  const S = res.slices, pairs = [];
  for (let b = 0; b + 3 < S.length; b += 4) { pairs.push([S[b], S[b + 1]]); pairs.push([S[b + 3], S[b + 2]]); }
  res.pairs = pairs.map(([o, n]) => ({ ko: o.k, kn: n.k, night: !!(o.night || n.night), dP50: +(n.p50 - o.p50).toFixed(3), dUs: +(n.usPer - o.usPer).toFixed(4), dCut: n.cut - o.cut, dAct: (n.act || 0) - (o.act || 0), old: o.usPer, new: n.usPer }));
  const day = res.pairs.filter((q) => !q.night);
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  res.day = { n: day.length, neg: day.filter((q) => q.dUs < 0).length, medDUs: med(day.map((q) => q.dUs)), avgDUs: avg(day.map((q) => q.dUs)),
    oldUs: avg(day.map((q) => q.old)), newUs: avg(day.map((q) => q.new)), medDP50: med(day.map((q) => q.dP50)), avgDCut: avg(day.map((q) => q.dCut)) };
  say(`짝(낮) ${res.day.n} · 새<옛 ${res.day.neg}/${res.day.n} · 사람당 옛 ${res.day.oldUs && res.day.oldUs.toFixed(3)} → 새 ${res.day.newUs && res.day.newUs.toFixed(3)}µs · 차 중앙 ${res.day.medDUs} · p50 차 중앙 ${res.day.medDP50}ms · 예산 찬 틱 차 평균 ${res.day.avgDCut && res.day.avgDCut.toFixed(0)}`);
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  await kill();
  say(`→ ${OUT}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
