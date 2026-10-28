// (@regress 없음 — 관찰기 곁 정본 · 읽기만 · 제품 0 · T963)
// === scripts/lib-day-deaths.js — 마을 "그날 죽음" 정본 읽기(관찰기 · 표 기계가 같은 한 벌을 부른다 · 사본 0) ===
//
// ★왜 [T963 · T943 회부 2] econ `tickVillage` 의 그날 굶어 죽음 칸 `v._deathsToday` 는 틱이 기근 고리 앞 `v._deathsToday = 0`
//   (`sim/economy-sim.js` 4173행)에 **닿은 날만** 다시 선다. 그 앞에서 틱이 끝나는 길 —
//     ⓐ 빈 마을(틱 첫 줄 `if (v.npcs.length === 0) return;`) · ⓑ `T932_SMELT_CONT=0` 판(열셋째 판까지 = 그 끔 갈래)의 제련 날 `return` —
//   에선 **전날 값이 그대로 남아** 틱 뒤 · 하루 끝에 읽는 관찰기가 없는 죽음을 날마다 다시 셌다(T943 §5: 서버 판 24 · 옛 셈 52,728 · 정본 48,939).
//   같은 고리가 같은 자리에서 누계 `v._deadTot` 도 센다(4196 · 4204행 — 끄고 켠 두 갈래 다 `_deathsToday++` 와 한 줄) ⇒
//   **그날 죽음 = `_deadTot` 의 틱 앞뒤 차**다(T943 이 `t931-observe` 를 고친 꼴). 틱이 일찍 끝난 날은 고리를 안 돌았으니 차가 0 — 정본과 같다.
//
// 쓰는 법:
//   ① 노드 관찰기(`-r` 프리로드 · 서버 존 · 랩 자 t17 / t176 / t525):
//        const DD = require('./lib-day-deaths'); DD.install(V1);   // V1 = require(<ROOT>/sim/economy-sim) — econ 이 부르는 바로 그 모듈
//        … 틱 뒤 · 하루 끝(장부 `scanDay` · `tickWorldV2` 뒤):   DD.deathsToday(v)
//      `install` 은 `V1.tickVillage` 를 한 번만 감싼다(여러 관찰기가 불러도 한 겹 · 이미 감싼 다른 관찰기 위에 얹혀도 된다).
//      마을 객체에 아무 칸도 안 쓴다(WeakMap) — 판 JSON · 저장 바이트 무변.
//   ② 틱을 못 감싸는 판(브라우저 랩 판 `t924-lab` — 쪽 안에서 엔진이 돈다): 하루마다 한 번 읽을 때
//        `DD.dayDelta(last, key, v)` — 지난번 읽은 누계와의 차(첫 읽기 = 시작 누계와의 차 · `last` 는 부르는 쪽이 가진 Map).
//      쪽 안으로는 `DD.dayDelta.toString()` 을 넘겨 같은 함수를 세운다(사본 0).
//   ③ 이미 쌓인 표(판 JSON `rows` 의 `_deadTot` · 관찰기 줄의 `deadTot` 칸): `DD.fromDeadTot(seq)` — 누계 열 → 날마다 차.
'use strict';

const _deadTot = (v) => +(v && v._deadTot) || 0;
const _today = new WeakMap();   // 마을 → 그 마을의 가장 최근 틱에서 늘어난 `_deadTot`
const INSTALLED = Symbol.for('t963.dayDeaths.installed');

function install(V1) {
  if (!V1 || typeof V1.tickVillage !== 'function') throw new Error('lib-day-deaths: V1.tickVillage 가 없다');
  if (V1[INSTALLED]) return V1;
  const tv = V1.tickVillage;
  V1.tickVillage = function (v) {
    const d0 = _deadTot(v);
    try { return tv.apply(this, arguments); } finally { try { _today.set(v, _deadTot(v) - d0); } catch (e) {} }
  };
  Object.defineProperty(V1, INSTALLED, { value: true });
  return V1;
}
// 그날(그 마을의 가장 최근 틱) 죽음 — `install` 뒤에 한 번도 안 돈 마을은 0
function deathsToday(v) { const x = v ? _today.get(v) : undefined; return x == null ? 0 : x; }
// 틱을 못 감쌀 때 — 하루 한 번 읽는 자리에서 지난 읽기와의 누계 차(`last`: Map key → 누계 · 첫 읽기는 `start` 누계 또는 0 과의 차)
function dayDelta(last, key, v, start) {
  const cur = +(v && v._deadTot) || 0;
  const prev = last.has(key) ? last.get(key) : (start != null ? start : 0);
  last.set(key, cur);
  return cur - prev;
}
// 누계 열 → 날마다 차(첫 칸은 그 칸 그대로 — 판 머리 누계가 0 인 판 · 아니면 `base` 를 준다)
function fromDeadTot(seq, base) {
  const out = []; let p = base != null ? base : 0;
  for (const x of seq) { const c = +x || 0; out.push(c - p); p = c; }
  return out;
}

module.exports = { install, deathsToday, dayDelta, fromDeadTot, deadTot: _deadTot };
