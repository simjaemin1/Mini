'use strict';
// (@regress 없음 — 러너 밖 · T753 계측기 · 제품 무변)
// === scripts/t753-empty-hook.js — 대조 판(멈춤 없음 · `__t740Cont`)에서 존 모듈 메모리를 **"다시 뜬 꼴"로 하나씩 비운다** ==================
//   `scripts/t745-run.js` 가 `T745_EXTRA_PRE=t753-empty-hook.js` 로 얹는다. 대조 판이 날을 뛴 바로 그 자리(멈춤 판이 다시 뜨는 자리)에서 비운다.
//   T753_EMPTY=fert,wf (쉼표)
//     fert — 비옥도 장 `_FF`(지형 어댑터 하나 · 시딩 루프 마지막 마을 상자). 다시 뜬 판은 시딩을 안 하니 장이 없다(중립 0.5)
//            ⇒ 다음 `prepareFert`(새 마을 · 창설) 전까지 `ta.fert` = 0.5 · `ta.fertField` = null 로 둔다(그 뒤는 원래 함수 그대로).
//     wf   — 물거리 EDT `vil._wf` · 미리 굽기 `vil._t620Wf`(마을마다). 다시 뜬 판은 비어 있어 다음 쓸 때 **지금 영토 상자**로 다시 만든다.
//   ⇒ 이 판 ↔ 다시 뜬 판(제품 그대로)이 같아지면 비운 칸이 주인이다.
//   T753_DROP=bandits.bTick,… (다시 뜬 판 쪽 · 거꾸로 하나씩) — 메타 행의 T742 이름표 칸에서 그 이름만 빼고 읽힌다(그 칸만 "안 실은 꼴" · 나머지는 켬 그대로).
const path = require('path');
const EMPTY = new Set(String(process.env.T753_EMPTY || '').split(',').filter(Boolean));
if (EMPTY.size) {
  const iv = setInterval(() => {
    if (!global.__t740Cont || global.__t740Cont.__t753) return;
    clearInterval(iv);
    const f0 = global.__t740Cont;
    const f = function (st) {
      f0.apply(this, arguments);
      const done = [];
      try {
        const ta = st.ta;
        if (EMPTY.has('fert') && ta && ta.prepareFert) {
          const o = { fert: ta.fert, fertField: ta.fertField, prepareFert: ta.prepareFert };
          ta.fert = () => 0.5; ta.fertField = () => null;
          ta.prepareFert = function () { ta.fert = o.fert; ta.fertField = o.fertField; ta.prepareFert = o.prepareFert; return o.prepareFert.apply(this, arguments); };
          done.push('fert');
        }
        if (EMPTY.has('wf')) { let n = 0; for (const v of st.villages || []) { if (v._wf || v._t620Wf) n++; v._wf = null; v._t620Wf = null; } done.push(`wf ${n}`); }
      } catch (e) { console.error('[t753] 비우기 실패', e.message); }
      console.log(`[t753] 대조 — 다시 뜬 꼴로 비움: ${done.join(' · ')} (econ 날 ${st.world && st.world.day})`);
    };
    f.__t753 = 1; global.__t740Cont = f;
  }, 50);
  iv.unref && iv.unref();
}
const DROP = String(process.env.T753_DROP || '').split(',').filter(Boolean);
if (DROP.length) {   // 존이 DB 모듈을 적재할 때 덧씌운다(미리 적재하지 않는다 — 적재 차례 무변)
  const DBF = path.join(__dirname, '..', 'server', 'zone-local-db.js');
  const Module = require('module'); const _ld = Module._load;
  Module._load = function (req, parent) {
    const m = _ld.apply(this, arguments);
    try {
      if (m && m.getWorldMeta && !m.getWorldMeta.__t753 && require.cache[DBF] && require.cache[DBF].exports === m) {
        const g0 = m.getWorldMeta;
        const g = function () {
          const r = g0.apply(this, arguments);
          try { if (r && r.data) { const M = JSON.parse(r.data); if (M.t742) { const gone = DROP.filter((n) => n in M.t742); for (const n of gone) delete M.t742[n]; console.log(`[t753] 다시 뜬 판 — T742 이름표에서 뺌: ${gone.join(' · ') || '(없음)'}`); return Object.assign({}, r, { data: JSON.stringify(M) }); } } } catch (e) { console.error('[t753] 빼기 실패', e.message); }
          return r;
        };
        g.__t753 = 1; m.getWorldMeta = g;
      }
    } catch (e) {}
    return m;
  };
}
