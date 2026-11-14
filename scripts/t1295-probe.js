'use strict';
// (@regress 없음 — 러너 밖 · T1295 탐침 · 제품 무변 · 읽기만)
// === scripts/t1295-probe.js — 밭 세계 판 시계 판: 몸이 한 밭 일 · 일괄 밭 일 셈을 판 끝에 한 줄 JSON 으로 =====================
//   쓰는 법(아이 존만): T1295_PROBE_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1295-probe.js" node scripts/t577-server-run.js <날> <시드>
//   `T1295_PROBE_BAIT=batch` = 미끼 — 존 소스가 아니라 villages.js 를 **메모리에서만** 고쳐 밭 길 일괄 걷음(`_cut`)을 끈다(몸 없이 밭 일 · 하네스 미끼 전용).
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T1295_PROBE_OUT || ''; if (!OUT) return;
const ROOT = path.join(__dirname, '..');
if (process.env.T1295_PROBE_BAIT === 'batch') {
  const Module = require('module'), _comp = Module.prototype._compile, VS = path.join(ROOT, 'server', 'villages.js');
  Module.prototype._compile = function (c, f) { if (f === VS) c = c.replace('const _cut = _t1243On() && _t1243Live();', 'const _cut = false;'); return _comp.call(this, c, f); };
}
function dump() {
  try {
    const V = require(path.join(ROOT, 'server', 'villages')), B = V.__p3Bind({});
    let harvN = 0, pop = 0, vils = 0, empty = 0;
    for (const v of (B.state.villages || [])) { const e = v.econ; if (!e) continue; harvN += e._t100HarvestN || 0; const n = (e.npcs || []).length; pop += n; if (n) vils++; else empty++; }
    const o = { day: B.state.world && B.state.world.day, harvN, pop, vils, empty, pick: (B._t1243PStat || {}).pick || 0, reaped: (B._t1243PStat || {}).reaped || 0,
      batchTasks: (B._t1212Rest || {}).batchTasks || 0, batchClear: (B._t1212Rest || {}).batchClear || 0, ghostBatch: (B._t1224Stat || {}).batch || 0,
      cutDays: (B._t1243Stat || {}).cutDays || 0, bodyCells: (B._t1243CStat || {}).bodyCells || 0, walks: (V._t1295Stat || {}).walks || 0, walkPx: Math.round((V._t1295Stat || {}).walkPx || 0) };
    fs.writeFileSync(OUT, JSON.stringify(o));
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.stack || e).slice(0, 400) })); } catch (_) {} }
}
process.on('exit', dump);
setInterval(dump, 15000).unref();
