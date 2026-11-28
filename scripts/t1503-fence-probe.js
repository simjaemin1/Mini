'use strict';
// (@regress 없음 — 러너 밖 · T1503 덧붙임 판 귀 · 제품 파일 무변 · 읽어 들인 글자에만 셈 줄을 끼운다 · 값을 바꾸는 줄 0)
// =============================================================================
// scripts/t1503-fence-probe.js — 울타리 · 벽이 서거나 헐린 날(T1512 판 꼴)의 거리표 귀 [T1503 덧붙임 · S14]
//   쓰는 법: NODE_OPTIONS="… --require $PWD/scripts/t1512-bots.js --require $PWD/scripts/t1503-fence-probe.js" T1503_FP=<앞머리>
//            node scripts/t577-server-run.js <날> <시드>     (존 프로세스만 · `T1503_FP` 가 있을 때만)
//   끼우는 셈 셋(villages.js 메모리 사본만):
//     ① `invalidateTradeDistances(cx, cy)` 첫머리 — 부른 수(칸을 준 부름 · 안 준 부름)
//     ② `_distMatrixGen` — 이름을 바꾸고 겉 발생기로 감싸 `next()` 한 번마다 CPU 를 더한다(양보 · 값 그대로 넘김)
//     ③ `state.econ.setDistMatrix(world, mat);` 바로 뒤 — 주입 한 번(날 · 까닭 · 행렬 sha1) · 처음 보는 행렬은 통째로 `<앞머리>.mats.jsonl` 에(뒤에 끔 ↔ 켬 칸마다 맞댐)
//   날 줄(`<앞머리>.days.jsonl`): { d, wall(실제 초 · process.uptime), cpu(초), gen(그날 거리 발생기 CPU ms), invXY, inv0, inj:[{why, h}], h(날 머리 행렬 sha1), fence(T1503 셈 — 켬만) }
// =============================================================================
const path = require('path'), fs = require('fs'), Module = require('module'), crypto = require('crypto');
if (!process.env.T1503_FP || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const VF = path.join(ROOT, 'server', 'villages.js');
const PFX = process.env.T1503_FP;
const put = (f, o) => { try { fs.appendFileSync(PFX + '.' + f + '.jsonl', JSON.stringify(o) + '\n'); } catch (e) { /* 귀는 판을 건드리지 않는다 */ } };
const seen = new Set();
const hashOf = (mat) => crypto.createHash('sha1').update(mat.map((r) => r.join(',')).join(';')).digest('hex').slice(0, 16);
const cur = { gen: 0, invXY: 0, inv0: 0, inj: [] };
const G = globalThis.__t1503fp = {
  inv(cx, cy) { if (Number.isFinite(cx) && Number.isFinite(cy)) cur.invXY++; else cur.inv0++; },
  cpu(ms) { cur.gen += ms; },
  inj(world, mat, reason) {
    try {
      const h = hashOf(mat), d = (world && world.day) | 0;
      cur.inj.push({ d, why: String(reason || ''), h });
      if (!seen.has(h)) { seen.add(h); put('mats', { h, d, mat: mat.map((r) => r.map((x) => (isFinite(x) ? x : null))) }); }
    } catch (e) {}
  },
};
const PATCH = [
  ['function invalidateTradeDistances(cx, cy) { // eslint-disable-line no-unused-vars\n', 'function invalidateTradeDistances(cx, cy) { // eslint-disable-line no-unused-vars\n  try { globalThis.__t1503fp.inv(cx, cy); } catch (e__) {}\n'],
  ['function* _distMatrixGen(reason, opts) {', 'function* _distMatrixGen(reason, opts) { const g__ = _distMatrixGen__fp(reason, opts); for (;;) { const c0__ = process.cpuUsage(); const r__ = g__.next(); const u__ = process.cpuUsage(c0__); try { globalThis.__t1503fp.cpu((u__.user + u__.system) / 1000); } catch (e__) {} if (r__.done) return r__.value; yield r__.value; } }\nfunction* _distMatrixGen__fp(reason, opts) {'],
  ['  state.econ.setDistMatrix(world, mat);\n', '  state.econ.setDistMatrix(world, mat);\n  try { globalThis.__t1503fp.inj(world, mat, reason); } catch (e__) {}\n'],
];
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) {
      const miss = [];
      for (const [a, b] of PATCH) { const n = src.split(a).length - 1; if (n !== 1) miss.push(a.slice(0, 40) + ' ×' + n); else src = src.replace(a, b); }
      put('meta', { patched: PATCH.length - miss.length, miss, env: { KEEP: process.env.T1503_DIST_KEEP || '', SLICE: process.env.T1503_CLOSE_SLICE || '', ZONE: process.env.ZONE_ID || '' } });
      return _c.call(this, src, fn);
    };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1, w0 = process.uptime(), c0 = process.cpuUsage();
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try {
        const Q = m.exports.__t1503, st = Q && Q.setup ? Q.setup({}) : null, W = st && st.world, d = (W && W.day) | 0;
        if (W && d !== lastDay) {
          const u = process.cpuUsage(c0), now = process.uptime();
          if (lastDay >= 0) put('days', { d: lastDay, wall: +(now - w0).toFixed(3), cpu: +((u.user + u.system) / 1e6).toFixed(3), gen: Math.round(cur.gen), invXY: cur.invXY, inv0: cur.inv0, inj: cur.inj,
            h: W._distMatrix ? hashOf(W._distMatrix) : null, fence: Q.T1503_DIST_KEEP ? Q.st().s.fence : null });
          lastDay = d; w0 = now; c0 = process.cpuUsage(); cur.gen = 0; cur.invXY = 0; cur.inv0 = 0; cur.inj = [];
        }
      } catch (e) { put('err', { e: String(e && e.stack).slice(0, 400) }); }
      return out;
    };
  }
  return r;
};
void G;
