// T1448 진단 — 판 안 길 장부 수(재는 판만 · 값 무접촉 · 세계 무접촉).
//   NODE_OPTIONS="--require <이 파일>" + T1448_RSTAT_OUT=<파일 앞머리> 로 싣는다(존 프로세스에서만 선다 — `server/roads.js` 가 실릴 때).
//   ① 걷는 몸: `stampEntityPx`(몸이 칸을 옮길 때 존이 부르는 문)를 감싸 **그날 그 문을 부른 다른 몸 수**를 센다(WeakMap — 몸 객체에 아무것도 안 붙인다).
//      `stampCell` 바깥 부름(캐러밴 · 행군)은 따로 센다.
//   ② 100날마다 · 끝(exit)에 장부를 훑어 센다: 밟힌 칸 · 다 닳은 칸(오늘 값 < 1 — 아직 지워지지 않은) · 등급 0/1/2 · 다져진 길 집합 ·
//      32 · 64칸 구역 수 · 그날 주민(기준선 훅이 쥔 세계가 있으면).
'use strict';
const OUT = process.env.T1448_RSTAT_OUT;
if (OUT) {
  const Module = require('module');
  const fs = require('fs');
  const DK = 0.995, T1 = 8, T2 = 28;
  const ST = { pid: process.pid, marks: [], walk: {}, ext: {}, end: null };
  let R = null, S = null, nextMark = 100;
  const seen = new WeakMap();
  const snap = (tag) => {
    if (!S || !S.ready) return null;
    const t = S.lastDay, W = S.cellsW;
    let dead = 0, g0 = 0, g1 = 0, g2 = 0;
    const c32 = new Set(), c64 = new Set();
    for (const [k, r] of Map.prototype.entries.call(S.cells)) {
      const v = (t > r.d) ? r.v * Math.pow(DK, t - r.d) : r.v;
      if (v < 1) dead++; else if (v >= T2) g2++; else if (v >= T1) g1++; else g0++;
      const cx = k % W, cy = (k / W) | 0;
      c32.add(((cy >> 5) << 16) | (cx >> 5)); c64.add(((cy >> 6) << 16) | (cx >> 6));
    }
    let pop = null, vil = null;
    try { const w = globalThis.__sbcLast && globalThis.__sbcLast.world; if (w && w.villages) { pop = 0; vil = 0; for (const v of w.villages) { pop += (v.npcs || []).length; vil++; } } } catch (e) { }
    const walk = ST.walk[t - 1] != null ? ST.walk[t - 1] : null;   // 앞날(다 센 날) 걷는 몸
    return { tag, day: t, cells: S.cells.size, dead, g0, g1, g2, graded: g1 + g2, paved: S.paved.size, coarse: S.coarse.size, ch32: c32.size, ch64: c64.size, walkPrevDay: walk, pop, vil };
  };
  const patch = (m) => {
    R = m; S = m._S;
    const oE = m.stampEntityPx, oC = m.stampCell;
    m.stampEntityPx = function (ent, x, y) {
      if (ent && typeof ent === 'object' && S.ready) { const d = S.lastDay; if (seen.get(ent) !== d) { seen.set(ent, d); ST.walk[d] = (ST.walk[d] || 0) + 1; } }
      return oE.apply(this, arguments);
    };
    m.stampCell = function () { if (S.ready) { const d = S.lastDay; ST.ext[d] = (ST.ext[d] || 0) + 1; } return oC.apply(this, arguments); };
    const iv = setInterval(() => {
      try { if (S.ready && S.lastDay >= nextMark) { const s = snap('mark'); if (s) ST.marks.push(s); nextMark = (Math.floor(S.lastDay / 100) + 1) * 100; } } catch (e) { ST.err = String(e && e.message || e); }
    }, 500);
    if (iv.unref) iv.unref();
  };
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    const m = orig.apply(this, arguments);
    try { if (!R && m && m._S && typeof m.clientRoads === 'function' && typeof m.stampEntityPx === 'function') patch(m); } catch (e) { ST.err = String(e && e.message || e); }
    return m;
  };
  process.on('exit', () => {
    if (!R) return;
    try { ST.end = snap('end'); } catch (e) { ST.err = String(e && e.message || e); }
    try { fs.writeFileSync(`${OUT}.${process.pid}.json`, JSON.stringify(ST)); } catch (e) { }
  });
}
