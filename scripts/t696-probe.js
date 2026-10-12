'use strict';
// === scripts/t696-probe.js — T696 탐침(`t686-spike.js` 의 `T686_PATCH` · 사본에만 · 제품 무접촉) ==========
//   ① 길 쪽은 `t688-probe.js` 그대로(재구축 · 얼리기 · 묶음 · 풀림 콜백 ms)
//   ② 존 `_t566Release` 속 — 장부 거르기 · 막힘 술어 · 원시 판 · 벤 날 적기(그 안 판 고침 · DB) ms · 횟수
//   ③ 존 DB 모든 COMMIT/자동 커밋은 따로 못 잰다 — 길 묶음 COMMIT 은 ① 이 잰다
//   쓰기: `T688_PROBE_OUT` 의 길 기록마다 `z`(직전 경계 뒤 존 풀림 몫)를 붙인다
const fs = require('fs'), path = require('path');
const roadsPatch = require('./t688-probe.js');
module.exports = function patch(dir) {
  roadsPatch(dir);
  const zp = path.join(dir, 'server', 'zone.js'); let s = fs.readFileSync(zp, 'utf8');
  const rep = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`[t696-probe] 앵커 ${n}개: ${a.slice(0, 60)}`); s = s.replace(a, () => b); };
  const T = (k, expr) => `(globalThis.__T696T ? __T696T(${JSON.stringify(k)}, () => (${expr})) : (${expr}))`;
  rep('    if (!_t566CellMayHaveLedger(x, y)) { _t566Stat.relEmpty++; continue; }', `    if (!${T('ledger', '_t566CellMayHaveLedger(x, y)')}) { _t566Stat.relEmpty++; continue; }`);
  if (s.includes('    if (T696 ? _t696Blocked(x, y) : regrowBlockedAt(x, y)) continue;'))
    rep('    if (T696 ? _t696Blocked(x, y) : regrowBlockedAt(x, y)) continue;', `    if (${T('block', 'T696 ? _t696Blocked(x, y) : regrowBlockedAt(x, y)')}) continue;`);
  else rep('    if (regrowBlockedAt(x, y)) continue;                     // 아직 막혔다', `    if (${T('block', 'regrowBlockedAt(x, y)')}) continue;                     // 아직 막혔다`);
  rep("    let raw = []; try { raw = _idxAtCell(x, y, true); } catch (e) { raw = []; _idxWarnOnce('T566 길 풀림'", `    let raw = []; try { raw = ${T('idx', '_idxAtCell(x, y, true)')}; } catch (e) { raw = []; _idxWarnOnce('T566 길 풀림'`);
  { const a = '      if (m === undefined) { m = !_t566CellMayHaveLedger(x, y) ? 0 : (_t696Blocked(x, y) ? 1 : 2); M.set(mk, m); }';
    if (s.includes(a)) rep(a, `      if (m === undefined) { m = ${T('memo', '!_t566CellMayHaveLedger(x, y) ? 0 : (_t696Blocked(x, y) ? 1 : 2)')}; M.set(mk, m); }`); }
  rep('      _markHarvested(e.seedKey, e.x, e.y);\n      _t566Stat.relSeeds++;', `      ${T('mark', '_markHarvested(e.seedKey, e.x, e.y)')};\n      _t566Stat.relSeeds++;`);
  rep('  _ringBump(seedKey, x, y);   // ★[T440]', `  ${T('ring', '_ringBump(seedKey, x, y)')};   // ★[T440]`);
  rep('  try { db.insertHarvestedSeed(seedKey, d); } catch (e) {}\n}', `  try { ${T('db', 'db.insertHarvestedSeed(seedKey, d)')}; } catch (e) {}\n}`);
  s += `
;(function () {   // [T696 탐침 · 사본에만]
  const pf = require('perf_hooks').performance;
  let Z = {};
  globalThis.__T696T = (k, f) => { const a = pf.now(); try { return f(); } finally { const z = Z[k] || (Z[k] = { n: 0, ms: 0, max: 0 }); const d = pf.now() - a; z.n++; z.ms += d; if (d > z.max) z.max = d; } };
  globalThis.__T696Take = () => { const o = {}; for (const k in Z) o[k] = { n: Z[k].n, ms: +Z[k].ms.toFixed(2), max: +Z[k].max.toFixed(2) }; Z = {};
    try { if (typeof _t696Pre !== 'undefined') o.pre = { built: _t696Pre.built, ms: _t696Pre.ms, maxMs: _t696Pre.maxMs, ticks: _t696Pre.ticks, skip: _t696Pre.skip, cells: _t696Pre.cells, raw: _ringCacheRaw.size }; } catch (e) {}
    try { o.wal = db.walPerf ? db.walPerf() : null; } catch (e) {}
    return o; };
})();
`;
  // ④ 사건 줄(재기 판 on3) — 체크포인트 맡김·끝 · 큰 GC(≥5 ms) 벽시각 → `T688_PROBE_OUT.ev`(튐 틱과 겹치는지 본다)
  s += `
;(function () {   // [T696 탐침 · 사건 줄]
  const OUT = process.env.T688_PROBE_OUT; if (!OUT) return;
  const fs = require('fs'), { performance: pf, PerformanceObserver: PO } = require('perf_hooks'); let E = [];
  globalThis.__T696W = (k, ms) => E.push(['w' + k, Date.now(), ms == null ? null : +(+ms).toFixed(2)]);
  try { new PO((l) => { const now = Date.now(), pn = pf.now(); for (const e of l.getEntries()) if (e.duration >= 5) E.push(['gc' + ((e.detail && e.detail.kind) || e.kind || 0), Math.round(now - (pn - e.startTime)), +e.duration.toFixed(2)]); }).observe({ entryTypes: ['gc'] }); } catch (e) {}
  const flush = () => { try { if (E.length) fs.appendFileSync(OUT + '.ev', E.map((x) => JSON.stringify(x)).join('\\n') + '\\n'); E = []; } catch (e) {} };
  setInterval(flush, 60000).unref(); process.on('SIGUSR2', flush); process.on('exit', flush);
})();
`;
  fs.writeFileSync(zp, s);
  require('child_process').execFileSync(process.execPath, ['--check', zp]);
  { const lp = path.join(dir, 'server', 'zone-local-db.js'); let l = fs.readFileSync(lp, 'utf8');
    const r1 = "  try { _wal.worker.postMessage('ckpt'); } catch (e) { _wal.busy = false; }", r2 = "    w.on('message', (m) => { _wal.busy = false;";
    if (l.split(r1).length === 2 && l.split(r2).length === 2) {
      l = l.replace(r1, () => "  globalThis.__T696W && __T696W('req', pend);\n" + r1).replace(r2, () => "    w.on('message', (m) => { globalThis.__T696W && __T696W('done', m.ms); _wal.busy = false;");
      fs.writeFileSync(lp, l); require('child_process').execFileSync(process.execPath, ['--check', lp]); } }
  // 길 기록에 존 몫을 붙인다
  const rp = path.join(dir, 'server', 'roads.js'); let r = fs.readFileSync(rp, 'utf8');
  const a = "inc: (module.exports.roadDayPerf && module.exports.roadDayPerf() || {}).last || null });";
  if (r.split(a).length !== 2) throw new Error('[t696-probe] 길 기록 앵커');
  r = r.replace(a, "inc: (module.exports.roadDayPerf && module.exports.roadDayPerf() || {}).last || null, z: (k === 'rebuild' && globalThis.__T696Take) ? __T696Take() : null });");
  fs.writeFileSync(rp, r);
  require('child_process').execFileSync(process.execPath, ['--check', rp]);
};
