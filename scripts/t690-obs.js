// (@regress 없음 — 러너 밖 · T690 관찰기 · 제품 무변 · 판정 0)
// === scripts/t690-obs.js — 서버 판 자(`t577-server-run.js`)의 아이 존에 얹는 **날마다 교역 줄** ====================
//   쓰는 법: NODE_OPTIONS="--require $PWD/scripts/t663-wood.js --require $PWD/scripts/t690-obs.js" … node scripts/t577-server-run.js 400 1020
//     ⇒ `<T577_OUT>.t690.json` — 날마다 [econ 날 · 그날 도착해 맺은 교역(빈손 · 재routing 뺀 줄) · 빈손 귀환 · 재routing · 줄의 해시]
//   ★재는 자리 = 서버 장부 `scanDay`(T663 관찰기와 같은 문 · econ 하루 끝) — 원래 함수를 부르기 **전에** 읽기만 한다.
'use strict';
const OUT0 = process.env.T577_OUT || '';
if (OUT0) {
  const path = require('path');
  const fs = require('fs');
  const crypto = require('crypto');
  const OUT = OUT0 + '.t690.json';
  const days = [];
  let last = -1;
  const Ev = require(path.join(__dirname, '..', 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          const TL = world.tradeLog || [], wd = world.day;
          let tr = 0, ab = 0, rr = 0; const rows = [];
          for (let i = TL.length - 1; i >= 0 && TL[i].day === wd; i--) {
            const r = TL[i];
            if (r.rerouted) rr++; else if (r.abandoned) ab++; else { tr++; rows.push([r.from, r.to, r.sent && r.sent.res, r.sent && r.sent.amt]); }
          }
          days.push({ d, wd, tr, ab, rr, h: crypto.createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 12) });
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify({ days })); } catch (e) {} });
}
