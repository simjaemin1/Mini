'use strict';
// (@regress 없음 — 러너 밖 · T1349 계측기 · 제품 무변 · 읽기만)
// === scripts/t1349-mem-hook.js — 긴 판 날마다 힙 · RSS 한 줄(`<T577_OUT>.t1349-mem.jsonl`) — 장부 날 문(`scanDay`)에서 ===
//   칸: 날 · heapUsed · heapTotal · rss · external(MB) · 몸(players) · 몹 · 전쟁 몸 · 길 캐시 크기(있으면).
const path = require('path'), fs = require('fs');
if (!process.env.T577_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.dirname(path.dirname(process.argv[1]));
const OUT = process.env.T577_OUT + '.t1349-mem.jsonl';
const MB = (x) => +(x / 1048576).toFixed(1);
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
let last = -1;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments), sd = L.scanDay;
  L.scanDay = function (world, day) {
    const r = sd.apply(this, arguments);
    try {
      if ((day | 0) !== last) {
        last = day | 0;
        const m = process.memoryUsage();
        let st = null; try { const V = require(path.join(ROOT, 'server', 'villages')); st = V.__t740 ? V.__t740() : null; } catch (e) {}
        const o = { d: last, heap: MB(m.heapUsed), tot: MB(m.heapTotal), rss: MB(m.rss), ext: MB(m.external) };
        if (st) { o.players = st.deps && st.deps.players ? st.deps.players.size : null; o.routeCache = st.routeCache ? st.routeCache.size : null; o.walkCache = st.walkCache ? st.walkCache.size : null;
          o.war = st.war ? (Array.isArray(st.war) ? st.war.length : Object.keys(st.war).length) : 0; o.caravans = st.world && st.world.caravans ? st.world.caravans.length : null; }
        fs.appendFileSync(OUT, JSON.stringify(o) + '\n');
      }
    } catch (e) {}
    return r;
  };
  return L;
};
