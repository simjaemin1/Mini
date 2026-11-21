// (@regress 없음 — 러너 밖 · T1420 서버 평형 관측 프리로드 · 제품 무변 · 읽기만)
// === scripts/eq-srv-obs.js — 서버 장부 `scanDay(world, day)`(econ 하루 끝 · t577 훅과 같은 문)에서 랩과 같은 관측 줄을 한 줄씩 덧붙인다 ==========
//   `T1420_SRV_OBS=<파일>` — 줄마다 JSON 배열(`lib-eq-lab.obsDay` 그 꼴). 마디(t1308)가 프로세스를 갈아도 같은 파일에 잇는다(날 열쇠 — 읽는 쪽이 같은 날은 뒤 줄로).
'use strict';
const path = require('path');
const fs = require('fs');
const OUT = process.env.T1420_SRV_OBS || '';
if (OUT && /server[\\/]zone\.js$/.test(process.argv[1] || '')) {
  const ROOT = path.join(__dirname, '..');
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const Lq = require('./lib-eq-lab');
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try { fs.appendFileSync(OUT, JSON.stringify(Lq.obsDay(world)) + '\n'); } catch (e) {}
      return r;
    };
    return L;
  };
}
