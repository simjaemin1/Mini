// (@regress 없음 — 러너 밖 · T1438 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1438-decay-probe.js — 구조물이 낡는 세계(T1438_DECAY)를 날마다 잰다 ==========================================
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1438-decay-probe.js" T1438_PROBE_OUT=<파일.json> node scripts/t577-server-run.js <날> <시드>`
//            (판 자가 아이 존에 env 를 그대로 준다 · 존 아이에서만 돈다 — central 아이는 그냥 지나간다)
//   날마다(econ 하루가 바뀐 틱) 한 줄: 인구 · 집 칸 · 침상 · econ 주거 · 곳간 통나무 · 나무꾼 · 마을 쪽 낡음 셈(`t1438Stat` — 지붕 · 뼈대 가운데 · 가장 낮은 ·
//   손질 수 · 쓴 풀 · 통나무 · 돌 · 품 · 무너짐) · 존 쪽 낡음 셈(`_t1438Stat` — 끔이면 null). 끝 = 마지막 줄 · 판 요약(첫 날 ↔ 끝 날).
//   ⚠읽기만 — 마을 · 존 상태를 한 칸도 안 바꾼다(손잡이 끔 판에서도 같은 줄을 적는다 · 낡음 칸은 null).
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1438_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T1438_PROBE_OUT;
const rec = { knobs: { DECAY: process.env.T1438_DECAY || '', SET: process.env.T1438_DECAY_SET || '' }, days: [], err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1438v') < 0) src += '\n;module.exports.__t1438v = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try {
        const st = m.exports.__t1438v(), d = (st.world && st.world.day) | 0;
        if (d !== lastDay) { lastDay = d; day(st, m.exports, d); }
      } catch (e) { rec.err = String(e && e.stack).slice(0, 600); save(); }
      return out;
    };
  }
  return r;
};
let H = null;
const Hz = () => H || (H = require.cache[ZF] && require.cache[ZF].exports && require.cache[ZF].exports.__testBind ? require.cache[ZF].exports.__testBind() : null);
function day(st, SV, d) {
  let pop = 0, houses = 0, beds = 0, housing = 0, wood = 0, stone = 0, lj = 0, vils = 0;
  for (const vil of (st.villages || [])) {
    const v = vil.econ; if (!v) continue; vils++;
    pop += (v.npcs && v.npcs.length) || 0;
    houses += (vil._houseCells && vil._houseCells.length) || 0;
    beds += v._mapBeds || 0; housing += v.housing || 0;
    wood += (v.storage && v.storage.wood) || 0; stone += (v.storage && v.storage.stone) || 0;
    lj += (v.counts && v.counts.lumberjack) || 0;
  }
  let vs = null, zs = null;
  try { vs = SV.t1438Stat ? SV.t1438Stat() : null; } catch (e) { vs = { err: e.message }; }
  try { const h = Hz(); zs = h && h._t1438Stat ? h._t1438Stat() : null; } catch (e) { zs = null; }
  rec.days.push({ d, vils, pop, houses, beds: Math.round(beds), housing: +housing.toFixed(2), wood: +wood.toFixed(1), stone: +stone.toFixed(1), lj, v: vs,
    z: zs ? { eval: zs.eval, open: zs.open, collapse: zs.collapse, repair: zs.repair, buildings: zs.buildings, laps: zs.laps, lapT: zs.lapT || null, lapO: zs.lapO || null, byType: zs.byType } : null });
  if (rec.days.length % 10 === 0) save();
}
process.on('exit', save);
