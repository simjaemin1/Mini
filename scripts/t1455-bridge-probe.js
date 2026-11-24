// (@regress 없음 — 러너 밖 · T1455 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1455-bridge-probe.js — 마을이 놓은 다리가 낡는 세계(T1455_BRIDGE_DECAY)를 날마다 잰다 ==========================================
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1455-bridge-probe.js" T1455_PROBE_OUT=<파일.json> node scripts/t577-server-run.js <날> <시드>`
//   날마다(econ 하루가 바뀐 틱) 한 줄: 인구 · 빈 마을 · 다 지은 마을 다리 · 끊김 · 되살림 · 손질 · 든 나무 · 다리 값(가운데 · 가장 낮은) · 고립 마을 · 교역 줄(그날) ·
//   존 쪽(끊김 · 되살림 · 기다림 · 다시 서기 ms · 건넌 수). 끝 = 마지막 줄 · 다리마다(놓은 마을 · 값 · 끊긴 날 · 고칠 값).
//   `T1455_PROBE_CLOCK=<배>` — 다리 시계만 그 배로(15해 판 · `__t1455.clock` — 집 · 곳간 낡음 시계는 그대로) · 안 주면 그대로.
//   ⚠읽기만(시계 배 판 빼고) — 끔 판에서도 같은 줄(낡음 칸 null).
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1455_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T1455_PROBE_OUT, K = +process.env.T1455_PROBE_CLOCK || 0;
const rec = { forced: null, knobs: { BUILD: process.env.T1455_PROBE_BUILD || '', T1438: process.env.T1438_DECAY || '', T1455: process.env.T1455_BRIDGE_DECAY || '', SET: process.env.T1438_DECAY_SET || '', SC: process.env.T537_SHORTCUT || '', K }, days: [], sites: null, err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1455v') < 0) src += '\n;module.exports.__t1455v = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1, clk = false;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try {
        const st = m.exports.__t1455v(), d = (st.world && st.world.day) | 0;
        if (process.env.T1455_PROBE_BUILD === '1' && !rec.forced && st.ready && m.exports.__t1455) {   // 판 자 전용 — 지름길 후보를 판 첫날 다 선 것으로(판 자 몸 상한에선 다리 크루 몸이 0 이라 안 선다 · 다리가 선 세계를 재려고)
          const S = m.exports.__t1455.sites() || []; let n = 0; for (const s0 of S) if (!s0.done && m.exports.__t1455.complete(s0)) n++; rec.forced = { n, day: d };
        }
        if (K > 0 && !clk && m.exports.__t1455 && st.deps && st.deps.t1438Now) { clk = true; let b = null; m.exports.__t1455.clock((t) => { if (b == null) b = t; return b + (t - b) * K; }); }
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
  let pop = 0, vils = 0, empty = 0;
  for (const vil of (st.villages || [])) { const v = vil.econ; if (!v) continue; vils++; const n = (v.npcs && v.npcs.length) || 0; pop += n; if (!n) empty++; }
  const W = st.world || {}, TL = W.tradeLog || [];
  let trade = 0; for (let i = TL.length - 1; i >= 0 && TL[i].day >= d; i--) trade++;
  const S = (st._t527Sites || []);
  const done = S.filter((s) => s.done).length;
  let vs = null, zs = null;
  try { vs = SV.t1455Stat ? SV.t1455Stat() : null; } catch (e) { vs = { err: e.message }; }
  try { const h = Hz(); zs = h && h.t1455Stat ? h.t1455Stat() : null; } catch (e) { zs = null; }
  const xs = vs && vs.xs ? vs.xs.slice().sort((a, b) => a - b) : [];
  let iso = null; const M = W._distMatrix;
  if (M) { iso = 0; for (let i = 0; i < M.length; i++) { let ok = false; for (let j = 0; j < M.length; j++) if (j !== i && isFinite(M[i][j])) { ok = true; break; } if (!ok) iso++; } }
  let fin = 0; if (M) for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) if (isFinite(M[i][j])) fin++;
  rec.days.push({ d, vils, pop, empty, built: done, trade, iso, finPairs: fin,
    v: vs ? { cut: vs.cut, pend: vs.pend, cuts: vs.cuts, revives: vs.revives, repairs: vs.repairs, wood: vs.wood, labor: +(+vs.labor).toFixed(3), noWood: vs.noWood,
      yes: vs.worthYes, no: vs.worthNo, none: vs.worthNone, donate: vs.donate, xMed: xs.length ? xs[Math.floor(xs.length / 2)] : null, xMin: xs.length ? xs[0] : null,
      distJobs: vs.distJobs || 0, distMs: vs.distMs || 0, distCpuMs: vs.distCpuMs || 0, dayMs: +(+(vs.dayMs || 0)).toFixed(1), dayMax: vs.dayMax || 0, worthMs: vs.worthMs || 0, worthN: vs.worthBfs || 0, distSrc: vs.distSrc, distPairs: vs.distPairs, legsCut: vs.legsCut, trips: vs.trips, walkS: +(+vs.walkS).toFixed(1) } : null,
    z: zs ? { cuts: zs.cuts, revives: zs.revives, pend: zs.pend, pendNow: zs.pendNow, pendTicks: zs.pendTicks } : null });
  if (vs) rec.last = { rebuild: vs.rebuild, log: vs.log, zms: zs ? zs.ms : null, cross: zs ? zs.cross : null };
  rec.sites = S.filter((s) => s.done).map((s) => ({ i: s.i, v: s.v, span: s.span, n: s.cells.length / 2, own: s._own ? s._own.length / 2 : null, day: s.day, x: s._x == null ? null : +(+s._x).toFixed(4), cut: !!s.cut, cutDay: s.cutDay || null, worth: s._worth || null }));
  if (rec.days.length % 10 === 0) save();
}
process.on('exit', save);
