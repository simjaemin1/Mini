// (@regress 없음 — 하네스 돕는 모듈 · 제품 무변)
// === scripts/lib-hp-door.js — 존의 HP 문(`setHp`)을 **존 소스 글자 그대로** 세운다(존 없이 · 목 세계 하네스용 · 사본 0) ===
//   ★[T942 2026-10-27] 마을 몸(NPC) HP 도 존의 그 문을 지난다(마을 deps `setHp`). 목 세계(deps 를 흉내 내는) 하네스가 그 문을 따로 베끼지 않게
//     존 소스에서 네 글자를 떼어 그대로 세운다: `const PLAYER_MAX_HP = …;` · `const HP_PEER = new Set([…]);` · `const HP_QUIET = new Set([…]);` ·
//     `function setHp(p, v, why) { … return next; }`. 방송 · 보냄은 부르는 쪽이 준다(목 세계의 그것). 글자를 못 찾으면 던진다(조용히 다른 문을 세우지 않는다).
//   쓰는 법: const { makeSetHp } = require('./lib-hp-door'); deps.setHp = makeSetHp((m) => bcast.push(m), (ws, m) => {});
//   ★[T954 2026-10-27] 짐승(존 몹) HP 문 `setMobHp` 도 같은 꼴로 — `makeSetMobHp(broadcast)`(떼는 글자 셋: `MOB_HP_KEEP` · `MOB_HP_LOUD` · `function setMobHp(m, v, why) {…}`).
//     야생 생태를 최소 host 로 돌리는 하네스(`test-hunt-vis` · `test-zone-fauna`)가 host 에 넣는다.
'use strict';
const fs = require('fs');
const path = require('path');
const ZONE = path.join(__dirname, '..', 'server', 'zone.js');
function cut(src, head, tail) {
  const a = src.indexOf(head); if (a < 0) throw new Error(`lib-hp-door: 존 소스에 없음 — ${head}`);
  const b = src.indexOf(tail, a); if (b < 0) throw new Error(`lib-hp-door: 끝 없음 — ${head}`);
  return src.slice(a, b + tail.length);
}
function doorText(src) {
  const s = src || fs.readFileSync(ZONE, 'utf8');
  return [cut(s, 'const PLAYER_MAX_HP = ', ';'), cut(s, 'const HP_PEER = new Set([', ']);'), cut(s, 'const HP_QUIET = new Set([', ']);'),
    cut(s, 'function setHp(p, v, why) {', '\n  return next;\n}')].join('\n');
}
function makeSetHp(broadcast, send, src) {
  return new Function('broadcast', 'send', `${doorText(src)}\nreturn setHp;`)(broadcast || (() => {}), send || (() => {}));
}
function mobDoorText(src) {
  const s = src || fs.readFileSync(ZONE, 'utf8');
  return [cut(s, 'const MOB_HP_KEEP = new Set([', ']);'), cut(s, 'const MOB_HP_LOUD = new Set([', ']);'), cut(s, 'function setMobHp(m, v, why) {', '\n  return v;\n}')].join('\n');
}
function makeSetMobHp(broadcast, src) {
  return new Function('broadcast', `${mobDoorText(src)}\nreturn setMobHp;`)(broadcast || (() => {}));
}
module.exports = { doorText, makeSetHp, mobDoorText, makeSetMobHp };
