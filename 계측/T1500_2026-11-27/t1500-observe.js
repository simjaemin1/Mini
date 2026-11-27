'use strict';
// (@regress 없음 — 러너 밖 · T1500 곁 관찰기 · 읽기만 · 제품 무변)
// === 계측/T1500_2026-11-27/t1500-observe.js — 긴 서버 판 힙 곁 관찰기(T1434 관찰기 + 스냅숏 · 살아 있는 힙) ===
//   쓰는 법: T1500_OBS=<폴더> NODE_OPTIONS="-r <이 파일>" node scripts/t1308-long-run.js <날> <시드> --every <날> --dir <판 폴더>
//   날마다 `day-<시드>.jsonl` 한 줄: 날 · RSS MB · 힙 쓴 MB · 하루 벽시계 초(/proc/uptime — 가상 시계가 Date · hrtime 을 V 에 묶는다)
//   T1500_GC_EVERY=N(기본 10) — N날마다 온 GC(v8 플래그 `--expose-gc` 를 프로세스 안에서 켠다) 뒤 산 힙(live MB)을 같은 줄에 싣는다.
//     온 GC 는 계산을 안 바꾼다(WeakRef · FinalizationRegistry 0 — server · sim grep) — 끈 판 · 켠 판 둘 다 같은 관찰기로 돈다.
//   T1500_SNAP_DAYS=a,b,… — 그 날(그날 첫 tickVillage 직전 = 앞날 마감 뒤)에 `snap-<시드>-d<날>.heapsnapshot` 을 쓴다.
//   majMaxMB = 그날 큰 GC 뒤 힙의 최대(하루 안 꼭대기) · majN = 그날 큰 GC 수.
//   T1500_SNAP_FIRST=1 — 다시 뜬 마디의 첫 날에도 스냅숏(저장본에서 띄운 프로세스와 견줌).
const path = require('path'), fs = require('fs'), v8 = require('v8'), vm = require('vm');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1500_OBS; if (!DIR) return;
fs.mkdirSync(DIR, { recursive: true });
const ROOT = path.resolve(path.dirname(A1), '..');
const SEED = process.env.T577_SEED;
const LINES = path.join(DIR, `day-${SEED}.jsonl`);
const SNAP = new Set(String(process.env.T1500_SNAP_DAYS || '').split(',').filter(Boolean).map(Number));
const SNAP_FIRST = process.env.T1500_SNAP_FIRST === '1';
const GCN = parseInt(process.env.T1500_GC_EVERY || '10', 10);
let gc = null; try { v8.setFlagsFromString('--expose-gc'); gc = vm.runInNewContext('gc'); } catch (e) { gc = null; }
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const up = () => { try { return parseFloat(fs.readFileSync('/proc/uptime', 'utf8')); } catch (e) { return NaN; } };
const MB = (b) => Math.round(b / 1048576);
let last = -1, first = true, tDay = up();
// 큰 GC(mark-sweep-compact) 뒤 힙의 그날 최대 — 하루 안 꼭대기(넘침 직전 몰림)를 본다(관측만 · GC 를 부르지 않는다)
let majMax = 0, majN = 0;
try { const { PerformanceObserver, constants } = require('perf_hooks'); const MAJ = constants.NODE_PERFORMANCE_GC_MAJOR;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { const k = e.detail ? e.detail.kind : e.kind; if (k === MAJ) { majN++; const h = process.memoryUsage().heapUsed; if (h > majMax) majMax = h; } } }).observe({ entryTypes: ['gc'] });
} catch (e) {}
function onDay(day) {   // day = 막 마친 날
  const now = up(), dt = now - tDay; tDay = now;
  const m = process.memoryUsage();
  const row = { day, rssMB: MB(m.rss), heapMB: MB(m.heapUsed), sec: +dt.toFixed(2), majMaxMB: MB(majMax), majN };
  majMax = 0; majN = 0;
  if (gc && GCN > 0 && day % GCN === 0) { const t = up(); gc(); row.liveMB = MB(process.memoryUsage().heapUsed); row.gcSec = +(up() - t).toFixed(2); }
  try { fs.appendFileSync(LINES, JSON.stringify(row) + '\n'); } catch (e) {}
}
// T1500_CENSUS=N — N날마다 존 안 그릇 셈(읽기만 — `__testBind` 가 내주는 그 그릇 · villages 공식 읽기 `__t740`): `census-<시드>.jsonl`
const CEN = parseInt(process.env.T1500_CENSUS || '0', 10);
function census(day) {
  const o = { day };
  try {
    const zm = require.cache[path.join(ROOT, 'server', 'zone.js')] || require.main; const zx = zm && zm.exports;
    const Z = zx && zx.__testBind ? zx.__testBind() : null; if (!Z) o.noZ = Object.keys(require.cache).filter((k) => /zone\.js$/.test(k)).length;
    if (Z) {
      let st = 0, cells = 0; for (const h of Z._ringCache.values()) { if (h.day !== day + 1 && h.day !== day) st++; cells += h.cells.size; }
      o.ring = Z._ringCache.size; o.ringStale = st; o.ringCells = cells;
      let rc = 0; for (const t of Z._ringCacheRaw.values()) rc += t.size; o.raw = Z._ringCacheRaw.size; o.rawCells = rc;
      const CM = Z.chunkManager; if (CM) { let e = 0, r = 0; for (const c of CM.chunks.values()) { if (c.isEmpty()) e++; r += c.resources.size; } o.chunks = CM.chunks.size; o.chunkEmpty = e; o.chunkRes = r; }
      if (Z.harvestedSeeds) o.harv = Z.harvestedSeeds.size;
      if (Z.seedHp) o.seedHp = Z.seedHp.size;
      if (Z.resources) o.res = Z.resources.size;
      if (Z._t1500 && Z.T1500_HEAP_TRIM) { const T = Z._t1500; o.trim = { sweeps: T.sweeps, ringDrop: T.ringDrop, rawDrop: T.rawDrop, rawBuild: T.rawBuild, rawRebuild: T.rawRebuild, rawRebuildMs: +(T.rawRebuildUs / 1000).toFixed(1), sweepMs: +(T.sweepUs / 1000).toFixed(1), use: T.use.size, gone: T.gone.size, ssRel: T.ssRel }; }
    }
    try { const SS = require(path.join(ROOT, 'server', 'stand-skip')); let k = 0; for (let i = 0; i < SS.count(); i++) if (SS.own[i]) k++; o.ssN = SS.count(); o.ssOwn = k; } catch (e) {}
    try { const P = Z && Z.players; if (P) { let np = 0; for (const p of P.values()) if (p && p.isNpc) np++; o.bodies = np; } } catch (e) {}
    const VL = require(path.join(ROOT, 'server', 'villages')); const S = VL.__t740 ? VL.__t740() : null;
    if (S) { o.route = S.routeCache ? S.routeCache.size : null; o.walk = S.walkCache ? S.walkCache.size : null; o.walkJobs = S._walkJobs ? S._walkJobs.size : null; }
  } catch (e) { o.err = String(e && e.message).slice(0, 120); }
  try { fs.appendFileSync(path.join(DIR, `census-${SEED}.jsonl`), JSON.stringify(o) + '\n'); } catch (e) {}
}
function snap(tag) {
  const t = up(); const f = path.join(DIR, `snap-${SEED}-${tag}.heapsnapshot`);
  try { v8.writeHeapSnapshot(f); } catch (e) { fs.appendFileSync(LINES, JSON.stringify({ snapErr: String(e && e.message), tag }) + '\n'); return; }
  try { fs.appendFileSync(LINES, JSON.stringify({ snap: tag, file: path.basename(f), sec: +(up() - t).toFixed(1), heapMB: MB(process.memoryUsage().heapUsed) }) + '\n'); } catch (e) {}
  tDay = up();   // 스냅숏 시간은 하루 초에서 뺀다
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) {
    if (last > 0) {
      onDay(last);
      if (CEN > 0 && last % CEN === 0) census(last);
      if (SNAP.has(last)) snap(`d${last}`);
      else if (SNAP_FIRST && first) snap(`first${last}`);
      first = false;
    }
    last = day;
  }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0) onDay(last); });
