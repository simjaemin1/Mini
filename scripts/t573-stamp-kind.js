// === scripts/t573-stamp-kind.js — [T573 ① 자 · 적재 순간 덧붙임] 답압 도장을 **누가** 찍었나 세는 계수기 ===================
//   쓰는 법: `NODE_OPTIONS="--require <이 파일>" T573_STAMP_OUT=/tmp/x.json` 로 존을 띄운다(자에만 · 제품 코드 0).
//   `server/roads.js` 의 내보낸 `stampEntityPx` 를 감싼다 — 부르는 쪽(존 `Roads.stampEntityPx` · 생활층 `state.roads.stampEntityPx`)은
//   둘 다 **부를 때 속성을 읽으므로** 감싼 것이 그대로 불린다. 셀이 바뀐 걸음만 센다(원본의 `ent._rdK` 가드와 같은 자리).
//   종류 = 부른 함수(캐러밴 `tickCaravanBodies` · 호위 `_escortMarch` · 행군 `_warPaceCommander`·`_warPaceReturn`)와
//          몸(`!isNpc` = 사람 · 주민 `simVillageId` 중 사냥꾼 `simJob === 'hunter'` · 그 밖 NPC).
//   5초마다 {종류 → 도장 수 · 셀 집합 크기 · 셀 표본} 을 파일로 쓴다(셀 키 = roads 정수 키 · 종류별 집합은 끝에 셀 목록으로).
'use strict';
const OUT = process.env.T573_STAMP_OUT;
if (OUT) {
  const Module = require('module');
  const path = require('path');
  const orig = Module._load;
  let wrapped = false;
  const C = {};      // kind → { n, cells:Set }
  const add = (kind, k) => { const c = C[kind] || (C[kind] = { n: 0, cells: new Set() }); c.n++; c.cells.add(k); };
  const kindOf = (ent) => {
    const L = Error.stackTraceLimit; Error.stackTraceLimit = 4;
    const st = new Error().stack || ''; Error.stackTraceLimit = L;
    if (st.includes('_escortMarch')) return 'escort';
    if (st.includes('tickCaravanBodies')) return 'caravan';
    if (st.includes('_warPaceCommander') || st.includes('_warPaceReturn')) return 'war';
    if (!ent || !ent.isNpc) return 'player';
    if (ent.simVillageId != null) return ent.simJob === 'hunter' ? 'hunter' : 'resident';
    return 'npc_other';
  };
  Module._load = function (req, parent, isMain) {
    const m = orig.apply(this, arguments);
    if (!wrapped && /(^|[\\/])roads(\.js)?$/.test(req) && m && typeof m.stampEntityPx === 'function' && m._S) {
      wrapped = true;
      const S = m._S, base = m.stampEntityPx;
      m.stampEntityPx = function (ent, x, y) {
        if (S.ready && ent) {
          const k = ((y / 32) | 0) * S.cellsW + ((x / 32) | 0);
          if (ent._rdK !== k) add(kindOf(ent), k);
        }
        return base.apply(this, arguments);
      };
      const dump = () => {
        const o = { at: Date.now(), kinds: {} };
        for (const [kind, c] of Object.entries(C)) o.kinds[kind] = { stamps: c.n, cells: c.cells.size };
        try { require('fs').writeFileSync(OUT, JSON.stringify(o)); } catch (e) {}
        try { require('fs').writeFileSync(OUT.replace(/\.json$/, '') + '.cells.json', JSON.stringify(Object.fromEntries(Object.entries(C).map(([kd, c]) => [kd, [...c.cells]])))); } catch (e) {}
      };
      setInterval(dump, 5000).unref();
      process.on('SIGTERM', () => { dump(); process.exit(0); });
    }
    return m;
  };
}
