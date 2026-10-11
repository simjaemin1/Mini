'use strict';
// === scripts/t688-probe.js — T688 길 하루 훅 탐침(`t686-spike.js` 의 `T686_PATCH` · 사본 `server/roads.js` 에만 박는다 · 제품 무접촉) ==========
//   ① 날 경계 첫 틱: 코스 재구축(`_t688Rebuild` — 끔이면 종전 `_rebuildCoarse`) ms · 그때 밟힌 셀 수 · dirty 수 · 행 얼리기+첫 묶음(`flushDaily`) ms
//   ② 플러시 묶음마다: 행 수 · 행 쓰기 ms · COMMIT ms · 묶음 전체 ms
//   쓰기: `T688_PROBE_OUT`(jsonl · 60초마다 · SIGUSR2 · exit)
const fs = require('fs'), path = require('path');
module.exports = function patch(dir) {
  const rp = path.join(dir, 'server', 'roads.js'); let s = fs.readFileSync(rp, 'utf8');
  const rep = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`[t688-probe] 앵커 ${n}개: ${a.slice(0, 60)}`); s = s.replace(a, () => b); };
  rep('    _t688Rebuild(day);', "    { const _a = process.hrtime.bigint(), _dn = S.dirty.size; _t688Rebuild(day); globalThis.__T688R && __T688R('rebuild', day, Number(process.hrtime.bigint() - _a) / 1e6, S.cells.size, _dn); }");
  rep('    S.onPaved = deps.onPaved || null; S.onUnpaved = deps.onUnpaved || null;', "    S.onPaved = deps.onPaved || null; { const _f = deps.onUnpaved || null; S.onUnpaved = _f ? (x, y) => { const a = process.hrtime.bigint(); _f(x, y); globalThis.__T688U && __T688U(Number(process.hrtime.bigint() - a) / 1e6); } : null; }");
  rep('    flushDaily(day);', "    { const _a = process.hrtime.bigint(); flushDaily(day); globalThis.__T688R && __T688R('flushOpen', day, Number(process.hrtime.bigint() - _a) / 1e6, 0, 0); }");
  rep('  const i0 = F.i;', '  const i0 = F.i; const _b0 = process.hrtime.bigint(); let _w1 = 0n; const _rows = () => F.i - i0;');
  if (s.includes('  const batch = [];')) rep('  const batch = [];', '  const batch = []; const _b0 = process.hrtime.bigint(); let _w1 = 0n; const _rows = () => batch.length / 2;');   // [T688 켬] 쓰기 전 복사 묶음
  s = s.split("    db.db.exec('COMMIT');").join("    _w1 = process.hrtime.bigint(); db.db.exec('COMMIT'); { const _e = process.hrtime.bigint(); globalThis.__T688B && __T688B(F.day, _rows(), Number(_w1 - _b0) / 1e6, Number(_e - _w1) / 1e6, Number(_e - _b0) / 1e6); }");
  s += `
;(function () {   // [T688 탐침 · 사본에만]
  const OUT = process.env.T688_PROBE_OUT; if (!OUT) return;
  const fs = require('fs'); let R = [], B = [];
  let U = { n: 0, ms: 0 };
  globalThis.__T688U = (ms) => { U.n++; U.ms += ms; };
  globalThis.__T688R = (k, day, ms, cells, dirty) => { R.push({ k, day, ms: +ms.toFixed(3), cells, dirty, at: Date.now(), unpavedN: U.n, unpavedMs: +U.ms.toFixed(2), inc: (module.exports.roadDayPerf && module.exports.roadDayPerf() || {}).last || null }); U = { n: 0, ms: 0 }; };
  globalThis.__T688B = (day, rows, wms, cms, ms) => B.push([day, rows, +wms.toFixed(3), +cms.toFixed(3), +ms.toFixed(3), Date.now()]);
  const flush = () => { try { if (R.length || B.length) fs.appendFileSync(OUT, JSON.stringify({ R, B, perf: (module.exports.roadDayPerf && module.exports.roadDayPerf()) || null }) + '\\n'); R = []; B = []; } catch (e) {} };
  setInterval(flush, 60000).unref(); process.on('SIGUSR2', flush); process.on('exit', flush);
})();
`;
  fs.writeFileSync(rp, s);
  require('child_process').execFileSync(process.execPath, ['--check', rp]);
};
