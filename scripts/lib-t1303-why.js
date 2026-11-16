'use strict';
// (@regress 없음 — 러너 밖 · T1303 몸 죽음 꼬리표 자 · 제품 무변 · 읽기만)
// === scripts/lib-t1303-why.js — 몸 죽음 꼬리표(까닭 줄 `vil._bxQ` 에 적힌 것) ↔ econ 이 그 죽음에 붙인 까닭 — 맞대는 자 한 벌 ===
//   쓰는 곳: 하네스 `test-t1303-death-tag.js` · 관찰기 `t1303-observe.js`(같은 자 · 사본 0).
//   econ 까닭(읽기만 · 누계 셋 — `sim/economy-sim.js`):
//     굶음 = `_fdDeadTot` 증분(T1074 식량 빚 죽음 · T1197 몸 게이지 HP 0 — 같은 칸)
//     늙음 = `_natDeadTot` 증분(T1206 나이 생명표) + 나머지(`_deadTot` − 둘 — 인구식 음수 고리: 빚 판에선 자리 · 연료 · 병 몫 · T590 의 '늙음·병·추위·붐빔')
//       ⚠빚 판이 아닌 세계(`T1074_FOOD_DEBT=0`)의 나머지는 기근 날(`_dpDebug.hunger < 0`)이면 굶음 — 그 세계의 굶주림 길이 그 고리다(T590 그대로).
//   몸 꼬리표: 까닭 줄에 들어간 `died` 갈래(`starve` · `old`)를 그 자리에서 센다(줄을 적는 배열로 바꿔 끼운다 — 내용 · 차례 · 길이는 그대로 ·
//     줄이 몸으로 다 안 내려가도(하루 상한 · 출생 상쇄) 적힌 꼬리표는 센다 — 몸이 받는 꼬리표는 이 줄의 앞부분이다).
const DIED = new Set(['starve', 'old']);
const _sink = new WeakMap();
class TapQ extends Array {
  push(...xs) { const f = _sink.get(this); if (f) { try { f(xs); } catch (e) { /* 자 실패는 세계에 0 */ } } return super.push(...xs); }
}
// 까닭 줄을 엿본다 — 없으면 빈 줄을 미리 세운다(빈 줄 = 없는 줄과 같은 뜻 · 몸 층은 `_bxQ` 길이만 본다)
function tapQueue(vil, sink) {
  if (!vil) return false;
  let q = vil._bxQ;
  if (!q) q = vil._bxQ = new TapQ();
  else if (!(q instanceof TapQ)) Object.setPrototypeOf(q, TapQ.prototype);
  _sink.set(q, sink);
  return true;
}
const econCounts = (e) => ({ dead: +(e && e._deadTot) || 0, fd: +(e && e._fdDeadTot) || 0, nat: +(e && e._natDeadTot) || 0 });
const famineOf = (e) => !!(e && e._dpDebug && Number.isFinite(e._dpDebug.hunger) && e._dpDebug.hunger < 0);
// 마을 하나의 맞대기 장부 — econ 누계 차를 기다리는 몫(pS 굶음 · pO 늙음)에 쌓고 · 적힌 꼬리표가 그 몫을 먹는다(같은 까닭 = 맞음)
function tally(vil, debtWorld) {
  const T = { vil, seen: econCounts(vil.econ), pS: 0, pO: 0, noted: { starve: 0, old: 0 }, econ: { starve: 0, old: 0, nat: 0, rest: 0 }, agree: 0, miss: 0, missBy: { starveAsOld: 0, oldAsStarve: 0 }, famineNotes: 0 };
  T.pull = function () {   // econ 누계 차 → 기다리는 몫
    const c = econCounts(vil.econ), dd = c.dead - T.seen.dead, df = c.fd - T.seen.fd, dn = c.nat - T.seen.nat;
    T.seen = c;
    if (!(dd > 0)) return;
    const rest = Math.max(0, dd - df - dn);
    const restStarve = (!debtWorld && famineOf(vil.econ)) ? rest : 0;
    T.pS += df + restStarve; T.pO += dn + rest - restStarve;
    T.econ.starve += df + restStarve; T.econ.old += dn + rest - restStarve; T.econ.nat += dn; T.econ.rest += rest;
  };
  T.note = function (k, n) {
    if (!DIED.has(k) || !(n > 0)) return;
    T.pull();
    T.noted[k] += n;
    if (famineOf(vil.econ)) T.famineNotes += n;
    const mine = k === 'starve' ? 'pS' : 'pO', other = k === 'starve' ? 'pO' : 'pS';
    const m = Math.min(n, T[mine]); T[mine] -= m; T.agree += m;
    const r = n - m; if (r > 0) { T.miss += r; T[other] = Math.max(0, T[other] - r); if (k === 'old') T.missBy.starveAsOld += r; else T.missBy.oldAsStarve += r; }
  };
  tapQueue(vil, (xs) => { for (const h of xs) if (h) T.note(h.k, h.n | 0); });
  return T;
}
function sumTally(list) {
  const S = { noted: { starve: 0, old: 0 }, econ: { starve: 0, old: 0, nat: 0, rest: 0 }, agree: 0, miss: 0, missBy: { starveAsOld: 0, oldAsStarve: 0 }, famineNotes: 0, pend: { starve: 0, old: 0 } };
  for (const T of list) {
    S.noted.starve += T.noted.starve; S.noted.old += T.noted.old;
    for (const k of Object.keys(S.econ)) S.econ[k] += T.econ[k];
    S.agree += T.agree; S.miss += T.miss; S.missBy.starveAsOld += T.missBy.starveAsOld; S.missBy.oldAsStarve += T.missBy.oldAsStarve;
    S.famineNotes += T.famineNotes; S.pend.starve += T.pS; S.pend.old += T.pO;
  }
  const n = S.agree + S.miss;
  S.pct = n ? +(100 * S.agree / n).toFixed(2) : null;
  return S;
}
module.exports = { TapQ, tapQueue, econCounts, famineOf, tally, sumTally, DIED };
