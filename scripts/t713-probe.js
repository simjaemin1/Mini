'use strict';
// === scripts/t713-probe.js — T713 탐침(`t686-spike.js` 의 `T686_PATCH` · 사본에만 · 제품 무접촉) ==========
//   ① 길 · 존 풀림 · WAL · 체크포인트/GC 사건 줄은 `t696-probe.js` 그대로
//   ② 플러시 끝 틱 — 끔(종전 글자): `[k, v]` 짝 만들기 · `_flushEnd`(견줌 루프 + 방송 + 로그) · 그 안 방송(JSON + 보냄)
//      켬(`T713_FLUSH_END=1`): 묶음마다 견줌(`_t713Diff`) 합 · 최대 · 끝 틱(`_t713End` = 방송 + 로그) · 그 안 방송 · 뒤 틱들의 `S.sent` 고침(`_t713Apply`)
//   쓰기: `T688_PROBE_OUT.fe`(jsonl · 플러시 끝마다 한 줄 · 60초마다 · SIGUSR2 · exit)
const fs = require('fs'), path = require('path');
const zonePatch = require('./t696-probe.js');
module.exports = function patch(dir) {
  zonePatch(dir);
  const rp = path.join(dir, 'server', 'roads.js'); let s = fs.readFileSync(rp, 'utf8');
  const rep = (a, b, opt) => { const n = s.split(a).length - 1; if (n !== 1) { if (opt && n === 0) return false; throw new Error(`[t713-probe] 앵커 ${n}개: ${a.slice(0, 60)}`); } s = s.replace(a, () => b); return true; };
  const H = 'Number(process.hrtime.bigint() - _q) / 1e6';
  // 방송 — 길 방송(`road_cells`)만 잰다(JSON.stringify + 보냄 · 존의 broadcast 그대로)
  rep('S.broadcast = deps.broadcast || null;', "{ const _b = deps.broadcast || null; S.broadcast = _b ? (m) => { const _q = process.hrtime.bigint(); try { return _b(m); } finally { if (m && m.type === 'road_cells') { globalThis.__T713BC = " + H + "; globalThis.__T713BN = m.cells.length / 3; } } } : null; }");
  // 끔 갈래(종전 글자 · 켬 판에도 else 갈래로 남아 있다)
  rep('  const kv = []; for (let j = 0; j < F.out.length; j += 2) kv.push([F.out[j], F.out[j + 1]]);\n  _flushEnd(F, kv);',
    '  let _q = process.hrtime.bigint(); globalThis.__T713BC = 0; globalThis.__T713BN = 0;\n  const kv = []; for (let j = 0; j < F.out.length; j += 2) kv.push([F.out[j], F.out[j + 1]]);\n  const _kvMs = ' + H + '; _q = process.hrtime.bigint();\n  _flushEnd(F, kv);\n  globalThis.__T713E && __T713E({ arm: "off", day: F.day, keys: F.total, batches: F.n, kvMs: +_kvMs.toFixed(3), endMs: +(' + H + ').toFixed(3), bcMs: +(globalThis.__T713BC || 0).toFixed(3), bcCells: globalThis.__T713BN || 0 });');
  // 켬 갈래
  rep('  if (T713) _t713Diff(F, batch);', '  if (T713) { const _q = process.hrtime.bigint(); _t713Diff(F, batch); const _d = ' + H + '; F._dS = (F._dS || 0) + _d; if (_d > (F._dM || 0)) F._dM = _d; }', true);
  rep('  if (T713) { _t713End(F); return; }', '  if (T713) { const _q = process.hrtime.bigint(); globalThis.__T713BC = 0; globalThis.__T713BN = 0; _t713End(F); globalThis.__T713E && __T713E({ arm: "on", day: F.day, keys: F.total, batches: F.n, diffSumMs: +(F._dS || 0).toFixed(3), diffMaxMs: +(F._dM || 0).toFixed(3), endMs: +(' + H + ').toFixed(3), bcMs: +(globalThis.__T713BC || 0).toFixed(3), bcCells: globalThis.__T713BN || 0, chg: F.chg ? F.chg.k.length : 0 }); return; }', true);
  // 켬 · `S.sent` 고침 남은 몫(방송 뒤 틱들) — 다 끝난 때 한 줄(틱 수 · 합 · 한 틱 최대)
  rep('  const Q = _t713Q; if (!Q) return;\n  const t0 = _i688Now();', '  const Q = _t713Q; if (!Q) return;\n  const t0 = _i688Now(); const _q = process.hrtime.bigint();', true);
  rep('  if (Q.i >= Q.k.length) _t713Q = null;\n}', '  { const _d = ' + H + '; Q._n = (Q._n || 0) + 1; Q._s = (Q._s || 0) + _d; if (_d > (Q._m || 0)) Q._m = _d; }\n  if (Q.i >= Q.k.length) { _t713Q = null; globalThis.__T713E && __T713E({ arm: "apply", n: Q.k.length, ticks: Q._n, sumMs: +Q._s.toFixed(3), maxMs: +Q._m.toFixed(3) }); }\n}', true);
  s += `
;(function () {   // [T713 탐침 · 사본에만]
  const OUT = process.env.T688_PROBE_OUT; if (!OUT) return;
  const fs = require('fs'); let E = [];
  globalThis.__T713E = (r) => { r.at = Date.now(); E.push(r); };
  const flush = () => { try { if (E.length) fs.appendFileSync(OUT + '.fe', E.map((x) => JSON.stringify(x)).join('\\n') + '\\n'); E = []; } catch (e) {} };
  setInterval(flush, 60000).unref(); process.on('SIGUSR2', flush); process.on('exit', flush);
})();
`;
  fs.writeFileSync(rp, s);
  require('child_process').execFileSync(process.execPath, ['--check', rp]);
};
