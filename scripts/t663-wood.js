// (@regress 없음 — 러너 밖 · T663 관찰기 · 제품 무변 · 판정 0)
// === scripts/t663-wood.js — 서버 판 자(`t577-server-run.js`)의 아이 존에 얹는 **날마다 통나무 줄** ====================
//   쓰는 법(아이 존이 env 를 물려받는다 — T650 `t650-print.js` 와 같은 문):
//     NODE_OPTIONS="--require $PWD/scripts/t663-wood.js" VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T577_DIR=<dir> T577_TAG=<판> \
//       [T652_WOOD_EARLY=1|2] node scripts/t577-server-run.js 400 1020
//     ⇒ `<T577_OUT>.t663.json` — 날마다 마을마다 [인구 · 곳간 통나무(1e-6) · 나무꾼 수] + 그날 줄의 해시
//   ★재는 자리 = 서버 장부 `scanDay`(econ 하루 끝 · t577 훅 · t634 · t650 과 같은 문) — 원래 함수를 부르기 **전에** 읽기만 한다.
//   통나무 0 마을 = 곳간 통나무 < 1(T581 `wood0` · T644 · T652 표와 같은 문).
'use strict';
const OUT0 = process.env.T577_OUT || '';
if (OUT0) {
  const path = require('path');
  const fs = require('fs');
  const crypto = require('crypto');
  const ROOT = path.join(__dirname, '..');
  const OUT = OUT0 + '.t663.json';
  const R6 = (x) => Math.round((x || 0) * 1e6) / 1e6;
  const days = [];
  let last = -1;
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
          const vil = (world.villages || []).map((v) => {
            let lj = 0; for (const n of (v.npcs || [])) if (n && n.currentJob === 'lumberjack') lj++;
            return [v.name, (v.npcs || []).length, R6(v.storage && v.storage.wood), lj, v._banditized ? 1 : 0];
          });
          days.push({ d, wd: world.day, h: crypto.createHash('sha1').update(JSON.stringify(vil)).digest('hex').slice(0, 12), vil });
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify({ days })); } catch (e) {} });
}
