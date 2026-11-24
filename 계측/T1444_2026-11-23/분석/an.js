// node an.js <arm-seed>... — T1444 표: 행복 사분위 · 인구 · 굶음 · 떠난 사람 · 태어남 · 여가 · 몸 쉼 · 남는 시간 사람-날
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); if (!b.length) return NaN; const i = (b.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return b[lo] + (b[hi] - b[lo]) * (i - lo); };
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '-');
const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sx * sy); };
const out = {};
for (const n of process.argv.slice(2)) { const D = '/tmp/t1444/srv/' + n + '/' + n; let r, o, f, t8;
  try { r = require(D + '.t1422.json'); o = require(D + '.json'); f = require(D + '.fd-deaths.json'); t8 = require(D + '.t1408.json'); } catch (e) { console.log(n, '없음'); continue; }
  const w = r.w, at = (d) => { let b = null; for (const x of w) if (x[0] - w[0][0] <= d) b = x; return b; }, a = at(364), L = w[w.length - 1];
  const R = f.rows, fa = (d) => { let b = 0; for (const x of R) if (x[0] <= d) b = x[1]; return b; };
  const VL = r.vl || {}, vh = [], vl = [], vr = [], names = [];
  for (const [k, x] of Object.entries(VL)) { if (!(x[1] > 0)) continue; names.push(k); vh.push(x[4] / x[1]); vl.push(x[0] / x[1]); vr.push(x[3] > 0 ? x[2] / x[3] : 0); }
  const C = t8.cols, I = (c) => C.indexOf(c); let born = 0; for (const x of t8.rows) born += x[I('born')] || 0;
  const bx = o.bodyExit || {}, wk = bx.walk || {}, left = (wk.desert || 0) + (wk.move || 0) + (wk.bandit || 0);
  const s44 = r.s44 || {}; let lastH = []; for (const x of w) if (x[8]) lastH = x[8];
  out[n] = { names, vh, vl, vr };
  console.log(n, '| 인구 한 해', a && a[1], '· 두 해', o.eight.pop, '(빈', o.empty + ')', '| 굶음', fa(365) + '/' + (fa(730) - fa(365)), '| 떠남', left, '(이탈', wk.desert, '이주', wk.move, '도적', wk.bandit + ')', '| 태어남', Math.round(born),
    '| 행복(마을 두 해 평균) 최소·1/4·가운데·3/4·최대', [0, .25, .5, .75, 1].map((p) => f3(q(vh, p))).join(' · '),
    '| 끝날 행복 가운데', f3(q(lastH, .5)), '| 여가(econ) 가운데', f3(q(vl, .5)), '| 몸 휴식 몫 가운데', f3(q(vr, .5)), '| 여가↔몸 쉼 상관', f3(corr(vl, vr)),
    '| 남는 시간 사람-날 현장', Math.round(s44.site || 0), '걸음', Math.round(s44.walk || 0), '마을-날', s44.days);
}
module.exports = out;
if (process.env.CMP) { const [A, B] = process.env.CMP.split(','); const x = out[A], y = out[B]; if (x && y) { const d = []; for (let i = 0; i < x.names.length; i++) { const j = y.names.indexOf(x.names[i]); if (j >= 0) d.push([x.names[i], y.vh[j] - x.vh[i], y.vl[j] - x.vl[i], x.vl[i]]); } d.sort((p, q2) => p[1] - q2[1]); console.log('가장 많이 깎인 마을(행복 ' + B + ' − ' + A + '):', d.slice(0, 5).map((v) => v[0] + ' ' + v[1].toFixed(3) + '(여가 ' + v[2].toFixed(3) + ')').join(' · ')); } }
