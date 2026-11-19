'use strict';
// (@regress 없음 — 러너 밖 · T1371 관찰기 · 제품 무변 · 읽기만 · 주사위 0 · 세계에 0)
// === scripts/t1371-observe.js — 끔 세계 해마다 칸(T1371)의 **날 줄** — 서버 장부 `scanDay` 앞에서 마을마다 누계 넷 ===
//   쓰는 법(서버 판 자 · 아이 존 안에서만 선다 — `T577_OUT` 이 있고 argv 가 server/zone.js 일 때):
//     NODE_OPTIONS="--require $PWD/scripts/t1371-observe.js" node scripts/server-baseline-check.js --make <판.json> --days 1200 --seeds 1020 --vclock --par 1
//   쓰는 것: `<T577_OUT>.t1371.jsonl` — 첫 줄 {names} · 그 뒤 날마다 한 줄(그날 scanDay 직전 = econ 하루 끝 · 날마다 append — 판이 멈추거나 죽어도 그날까지 남는다):
//     [날, econ world.day, 사람[], 굶어 죽음 누계 `_fdDeadTot`[], 자연사 누계 `_natDeadTot`[], 죽음 누계 `_deadTot`[], 도구Q, 무기Q]
//     (K 위 죽음 = 죽음 누계 − 굶음 − 자연사 = 인구 식 음수 고리 — `server/villages.js` 몸 까닭 주석과 같은 가름)
//     도구Q · 무기Q = t577 훅 끝 줄(여덟 수)과 같은 식(곳간 tool · weapon × `_toolQ` · `_weapQ`).
const path = require('path');
const fs = require('fs');
if (!(process.env.T577_OUT && /server[\/\\]zone\.js$/.test(process.argv[1] || ''))) return;
const OUT = process.env.T577_OUT + '.t1371.jsonl';
const ROOT = path.join(__dirname, '..');
try { fs.unlinkSync(OUT); } catch (e) {}
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
let last = -1, namesKey = null;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      const d = day | 0;
      if (d !== last) {
        last = d;
        const V = world.villages || [];
        const nk = V.map((v) => v.name).join('\u0001');
        if (nk !== namesKey) { namesKey = nk; fs.appendFileSync(OUT, JSON.stringify({ day: d, names: V.map((v) => v.name) }) + '\n'); }
        let toolQ = 0, weapQ = 0;
        for (const v of V) {
          toolQ += ((v.storage && v.storage.tool) || 0) * (v._toolQ != null ? v._toolQ : 1);
          weapQ += ((v.storage && v.storage.weapon) || 0) * (v._weapQ != null ? v._weapQ : 1);
        }
        fs.appendFileSync(OUT, JSON.stringify([d, world.day, V.map((v) => (v.npcs || []).length), V.map((v) => v._fdDeadTot || 0),
          V.map((v) => v._natDeadTot || 0), V.map((v) => v._deadTot || 0), +toolQ.toFixed(1), +weapQ.toFixed(0)]) + '\n');
      }
    } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
    return sd.apply(this, arguments);
  };
  return L;
};
