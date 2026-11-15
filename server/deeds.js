'use strict';
// === server/deeds.js — 사유지 돌봄(T1305 · 재민 11-13 확정) =====================================
//
// ★무엇: 개인 사유지는 **마을과 무관**하다(영토 밖 빈 들은 누구나 · 영토 안은 그 마을 인정 구성원만 — 문은 `zone.tryClaim`).
//   셀 수는 겉으로 무제한이고, 실제 상한은 **돌봄**이 만든다 — 셀마다 낡음이 쌓이고, 주인 몸이 그 칸에 서서 손봐야(재료 0 · 몸 시간만)
//   새것이 된다. 오래 안 돌본 칸부터 경계가 흐려지고(`fade`) 결국 풀린다(`free` — 부재 상태기의 그 개방 · 승계 규약 그대로).
//   한 사람이 걸어 다니며 손볼 수 있는 만큼이 저절로 상한이다(캐논 797 — 땅을 쥐는 힘 = 몸이 들인 시간).
//
// ★★낡는 축 = **주인이 접속한 날 수**(실시간 달력 날 · 그날 한 번이라도 들어왔으면 하루). 보고 T1305 §2 표의 결론:
//   ⓐ 세계 시간(게임일) — 실시간 하루 = 게임 60날이라 값이 시간 축과 안 맞고, 서버가 멈춘 동안은 안 흐른다. 부재 시계(T45 제3 규약 · 실시간)와 다른 축.
//   ⓑ 실시간(접속 무관) — 휴가 일주일이면 돌볼 수 없는 동안 땅이 풀린다 ⇒ 부재 상태기의 "보관은 몰수가 아니다"(held 14일)를 무력화.
//   ⓒ 주인 접속 시간(분) — 상한이 하루 접속 시간과 무관해진다(30분 · 3시간이 같은 넓이) ⇒ "몸이 들인 시간" 이 아니다.
//   ⓓ ★주인이 접속한 날 — 실시간 달력(부재 시계와 같은 실시간 축) · 접속 안 한 날은 안 낡는다(부재는 부재 상태기가 맡는다 — 두 층이 안 겹친다) ·
//      접속한 날은 30분이든 3시간이든 하루치 낡고, 그날 손볼 수 있는 칸 수가 접속 시간에 비례 ⇒ 상한 ∝ 하루 접속 시간(판 표).
//   "접속해도 안 돌보면 낡는다"(카드) — 그대로: 들어온 날마다 하루 낡는다.
//
// ★규약: 이 파일은 **수식 · 상태만** 쥔다(존 · DB · 방송은 부르는 쪽 `zone.js`). 판(`scripts/t1305-care-sim.js`)이 같은 함수를 부른다(사본 0).
//   손잡이 `T1305_DEEDS`(끔 기본 · `=1` 켬) — 끔이면 아무 데서도 안 불린다(바이트 같음).
//   ⚠속도 값(흐림 · 풀림 날 · 손보는 초)은 판으로 고를 **제안**이다 — 정본은 재민(보고 T1305 §5 표). 기본 = 표의 가운데 줄(B).

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const ON = process.env.T1305_DEEDS === '1';
const CFG = {
  FADE_D: Math.max(1, _num('T1305_FADE_D', 3)),    // 이 날 수(주인이 접속한 날)만큼 안 돌보면 경계가 흐려진다
  FREE_D: Math.max(2, _num('T1305_FREE_D', 7)),    // 이 날 수면 풀린다(빈 땅 — 부재 상태기의 `free`)
  CARE_MS: Math.max(1000, _num('T1305_CARE_S', 20) * 1000),   // 한 칸 손보는 몸 시간(재료 0)
  // 숨은 안전판 — 한 사람의 살아 있는(풀리지 않은) 개인 셀 수. 새 수가 아니라 위 셋에서 유도한다(아래 줄):
  //   "몸이 접속한 날마다 24시간 손보기만 해도" 붙들 수 있는 칸 = 24h × 풀림 날 ÷ 손보는 시간 — 몸으로는 **닿을 수 없는** 크기(B 기본 30,240 = 판 3시간 줄의 9.5배 · 보고 §4).
  //   DB · 성능용이다 — 사유지 순회(`countMyClaims` · `Claims.mySet` · 겹침 검사)가 전부 존 사유지 전체를 한 번씩 훑는다.
  SAFETY: 0,
  TICK_MS: Math.max(10 * 1000, _num('T1305_TICK_MS', 60 * 1000)),   // 접속 중인 사람의 날 바뀜을 보는 주기(존 틱에 안 얹는다)
  // 하루 길이 — 기본 = 실시간 달력 하루(UTC 날짜). 시험 판(`scripts/t1305-screen.js`)만 줄인다(`T1305_DAY_MS` · 값 무변 손잡이 — 운영은 안 준다).
  DAY_MS: Math.max(1000, _num('T1305_DAY_MS', 24 * 60 * 60 * 1000)),
};
if (CFG.FADE_D >= CFG.FREE_D) CFG.FADE_D = CFG.FREE_D - 1;
CFG.SAFETY = Math.max(1, _num('T1305_SAFETY', Math.ceil(24 * 3600 * 1000 * CFG.FREE_D / CFG.CARE_MS)) | 0);

// 실시간 달력 날 — UTC 날짜(부재 시계와 같은 실시간 축 · 게임일 아님 — T45 제3 규약).
const dayKey = (ms) => (CFG.DAY_MS === 24 * 60 * 60 * 1000 ? new Date(ms).toISOString().slice(0, 10) : 'd' + Math.floor(ms / CFG.DAY_MS));

// 낡음 단계 — 새것 · 흐림 · 풀림. `w` = 마지막 손본 뒤 주인이 접속한 날 수.
function stageOf(w) { w = w | 0; return w >= CFG.FREE_D ? 'free' : (w >= CFG.FADE_D ? 'fade' : 'new'); }

// 몸 칸 `deeds` = { n: 접속한 날 수(누계), day: 마지막으로 센 달력 날 } — `serializeBody` 끝 칸(있을 때만 · 켬 판에서만 선다).
function bodyOf(player) {
  const d = player && player.deeds;
  return (d && typeof d === 'object' && Number.isFinite(d.n)) ? d : null;
}
// 오늘 처음 보면 하루를 센다 — 반환 = 날이 바뀌었나. 처음 켠 몸은 n = 1(오늘이 첫날).
function touchDay(player, now) {
  if (!player) return false;
  const k = dayKey(now || Date.now());
  const d = bodyOf(player);
  if (!d) { player.deeds = { n: 1, day: k }; return true; }
  if (d.day === k) return false;
  d.n = (d.n | 0) + 1; d.day = k;
  return true;
}
// 셀의 낡음을 주인 날 수로 다시 센다 — 반환 { w, stage, changed }.
//   ★이행(켜는 순간 줄지 않게): `careN` 이 없는 셀(켜기 앞의 옛 셀 · 이 손잡이 밖에서 선 셀)은 **지금 날**을 손본 날로 잡는다(첫 낡음 = 켠 날부터).
function rewear(c, n) {
  if (!c) return { w: 0, stage: 'new', changed: false };
  if (!Number.isFinite(c.careN)) c.careN = n | 0;
  const w = Math.max(0, (n | 0) - (c.careN | 0));
  const changed = (c.careW | 0) !== w || c.careW == null;
  c.careW = w;
  return { w, stage: stageOf(w), changed };
}
// 손보기 — 낡음 0(재료 0 · 몸 시간은 부르는 쪽이 잰다).
function careDone(c, n) { if (!c) return false; c.careN = n | 0; c.careW = 0; return true; }

module.exports = { ON, CFG, dayKey, stageOf, bodyOf, touchDay, rewear, careDone };
