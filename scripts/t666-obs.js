// (@regress 없음 — 러너 밖 · T666 관찰자 · 제품 무변)
// === scripts/t666-obs.js — 서버 판 자(`t577-server-run.js`) 아이 존에 얹는 **통나무 유통 하루 장부** ==========
//   쓰는 법(T650 결정론 판 — 캐러밴 몸 끔 = 400일 바이트 같음 · 보고/T650):
//     NODE_OPTIONS="--require $PWD/scripts/t666-obs.js" VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T577_DIR=<dir> T577_TAG=<판> \
//       node scripts/t577-server-run.js 400 1020,7,42
//     ⇒ `<T577_OUT>.t666.jsonl` — 날마다 한 줄:
//        z0 = 사람 있는 마을 중 곳간 통나무 0(`!(wood > 0)` — 팔이 보는 그 0) · z1 = 통나무 < 1(T644·T656 의 셈) · 마을 수 · 인구
//        forest = 임업 마을 통나무 합 · top = 통나무 최다 마을 [이름 · 양]
//        dep = 그날 새로 뜬 캐러밴(id 처음 본 것) 품목별 [대수 · 단위](첫째 + 둘째 화물) · woodZ = 통나무 수레 중 목적지 곳간 통나무가 0 인 것
//   ★읽기만 한다 — 장부 `scanDay` 문(econ 하루 끝 · T650 지문과 같은 자리)에서 원래 함수를 부르기 **전에** 적는다.
'use strict';
const OUT0 = process.env.T577_OUT || '';
if (OUT0) {
  const path = require('path');
  const fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const OUT = OUT0 + '.t666.jsonl';
  try { fs.unlinkSync(OUT); } catch (e) {}
  const seen = new Set();
  let last = -1;
  const r1 = (x) => Math.round(x * 10) / 10;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          const V = world.villages || [];
          let z0 = 0, z1 = 0, live = 0, pop = 0, forest = 0, top = null;
          for (const v of V) {
            const n = (v.npcs || []).length, w = (v.storage && v.storage.wood) || 0;
            pop += n; if (n > 0) { live++; if (!(w > 0)) z0++; if (w < 1) z1++; }
            if (/^임업/.test(v.name || '')) forest += w;
            if (!top || w > top[1]) top = [v.name, r1(w)];
          }
          const dep = {}; let woodZ = 0, woodN = 0;
          for (const c of (world.caravans || [])) {
            if (!c || c.id == null || seen.has(c.id)) continue;
            seen.add(c.id);
            const add = (r, q) => { if (!r || !(q > 0)) return; const x = dep[r] || (dep[r] = [0, 0]); x[0]++; x[1] = r1(x[1] + q); };
            add(c.giveRes, c.giveAmt); add(c.giveRes2, c.giveAmt2);
            if (c.giveRes === 'wood') { woodN++; if (c.to && c.to.storage && !(c.to.storage.wood > 0)) woodZ++; }
          }
          fs.appendFileSync(OUT, JSON.stringify({ d, wd: world.day, live, z0, z1, pop, forest: r1(forest), top, dep, woodN, woodZ }) + '\n');
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
}
