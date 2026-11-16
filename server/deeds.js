'use strict';
// === server/deeds.js — 사유지 돌봄(T1305 · ★T1332 청크 다시 — 재민 11-15) ============================================
//
// ★무엇: 개인 사유지는 **마을과 무관**하다(영토 밖 빈 들은 누구나 · 영토 안은 그 마을 인정 구성원만 — 문은 `zone.tryClaim`).
//   셀 수는 겉으로 무제한이고, 실제 상한은 **돌봄**이 만든다(캐논 797 — 땅을 쥐는 힘 = 몸이 들인 시간).
//
// ★★[T1332 · 재민 11-15 "숙제처럼 변한다 · 넓을수록 선형보다 크게 · 칸마다는 어색 · 청크로"] T1305(칸마다 서서 손보기)를 셋으로 바꾼다:
//   ① **청크 단위** — 세계 격자 청크(`CHUNK`×`CHUNK` 칸). 낡음 · 새것은 "내 칸이 든 청크"마다 하나 — 그 청크의 내 칸은 함께 흐리고 함께 풀린다
//      (집 안쪽 · 마당 · 비워 둔 칸을 따로 돌볼 일이 없다).
//   ② **쓰면 저절로** — 그 청크에서 주인이 실제로 한 일(수확 · 심기 · 제작 · 보관함 · 짓기 · 고치기 · 시설 — 짐이 바뀐 것만 · 표는 `zone.js`
//      `T1332_USE`)이 있으면 그 청크 = 새것. 쓸 것 없는 장식 청크는 그 안에 **머묾**(연속 `DWELL_MS` — 걸어 지나가기는 안 든다)으로 돌본다.
//      손보기 단추 · 서서 기다리기는 없다.
//   ③ **클수록 빨리 낡음(초선형)** — 접속한 날마다 청크가 낡는 양 = 1 × max(1, 내 청크 수 ÷ `BASE`). 풀림까지 접속일 = `FREE_D` ÷ 그 배수
//      ⇒ 하루 돌봄 방문 ∝ 청크² · `BASE` 청크 밑(작은 땅)은 기준 속도 그대로(일주일에 한 번 들르면 남는다).
//      ⚠닫힌 꼴: 청크 수 ≥ `FREE_D × BASE` 면 하루에 풀림 몫이 다 차서 **아무리 돌봐도 못 쥔다**(보고 T1332 §3 — 숨은 숫자 상한이 생긴다 · 회부).
//
// ★★낡는 축 = **주인이 접속한 날 수**(T1305 §2 표 그대로 — 실시간 달력 날 · 접속 안 한 날은 안 낡는다 · 부재는 부재 상태기가 맡는다).
//
// ★규약: 이 파일은 **수식 · 상태만** 쥔다(존 · DB · 방송은 부르는 쪽 `zone.js`). 판(`scripts/t1305-care-sim.js`)이 같은 함수를 부른다(사본 0).
//   손잡이 `T1305_DEEDS`(끔 기본 · `=1` 켬) — 끔이면 아무 데서도 안 불린다(바이트 같음).
//   ⚠속도 값(흐림 · 풀림 날 · 청크 크기 · 기준 청크 수 · 머묾 초)은 판으로 고를 **제안**이다 — 정본은 재민(보고 T1332 고를 표).

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const ON = process.env.T1305_DEEDS === '1';
const CFG = {
  FADE_D: Math.max(1, _num('T1305_FADE_D', 3)),    // 이 낡음(기준 날 단위)이면 경계가 흐려진다
  FREE_D: Math.max(2, _num('T1305_FREE_D', 7)),    // 이 낡음이면 풀린다(빈 땅 — 부재 상태기의 `free`)
  // ★[T1332] 청크 한 변(칸) · 기준 청크 수(이 밑은 기준 속도) — 판 표의 제안(재민이 고른다)
  CHUNK: Math.max(1, _num('T1332_CHUNK', 8) | 0),
  BASE: Math.max(1, _num('T1332_BASE', 2)),
  // ★[T1332] 머묾 — 쓸 것 없는 청크를 돌보는 연속 몸 시간. 수는 T1305 손보는 시간(`T1305_CARE_S` 20초)을 그대로 쓴다(새 수 0).
  DWELL_MS: Math.max(1000, _num('T1305_CARE_S', 20) * 1000),
  SAFETY: 0,   // 숨은 안전판(칸) — 아래 유도
  TICK_MS: Math.max(10 * 1000, _num('T1305_TICK_MS', 60 * 1000)),   // 접속 중인 사람의 날 바뀜을 보는 주기(존 틱에 안 얹는다)
  // 하루 길이 — 기본 = 실시간 달력 하루(UTC 날짜). 시험 판(`scripts/t1305-screen.js`)만 줄인다(`T1305_DAY_MS` · 운영은 안 준다).
  DAY_MS: Math.max(1000, _num('T1305_DAY_MS', 24 * 60 * 60 * 1000)),
};
if (CFG.FADE_D >= CFG.FREE_D) CFG.FADE_D = CFG.FREE_D - 1;
// 숨은 안전판(칸) — 새 수가 아니라 위 식에서 유도한다: 청크 수가 `FREE_D × BASE` 에 닿으면 하루에 다 풀리므로(③ 닫힌 꼴)
//   그보다 많은 칸은 **누구도 하루를 넘겨 쥘 수 없다** ⇒ 그 넓이(청크 수 × 청크 칸)를 DB · 성능 문으로 둔다(사유지 순회가 존 전체를 훑는다).
CFG.SAFETY = Math.max(1, _num('T1305_SAFETY', Math.ceil(CFG.FREE_D * CFG.BASE) * CFG.CHUNK * CFG.CHUNK) | 0);

// 실시간 달력 날 — UTC 날짜(부재 시계와 같은 실시간 축 · 게임일 아님 — T45 제3 규약).
const dayKey = (ms) => (CFG.DAY_MS === 24 * 60 * 60 * 1000 ? new Date(ms).toISOString().slice(0, 10) : 'd' + Math.floor(ms / CFG.DAY_MS));

// 낡음 단계 — 새것 · 흐림 · 풀림. `w` = 마지막 돌본 뒤 쌓인 낡음(기준 날 단위 · 소수).
function stageOf(w) { w = +w || 0; return w >= CFG.FREE_D ? 'free' : (w >= CFG.FADE_D ? 'fade' : 'new'); }

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

// ── 청크(T1332) ───────────────────────────────────────────────────────────────────────────────
// 칸 좌표(칸 단위 정수) → 청크 좌표. 음수 칸도 바닥 나눗셈(격자는 세계에 붙박이).
function chunkOf(cellX, cellY) { const K = CFG.CHUNK; return [Math.floor(cellX / K), Math.floor(cellY / K)]; }
// 하루 낡는 배수 — 내 청크 수 C 가 기준 밑이면 1 · 넘으면 C ÷ BASE(초선형: 하루 돌봄 방문 = C × 배수 ÷ FREE_D ∝ C²)
function rate(C) { return Math.max(1, (C | 0) / CFG.BASE); }
// 안 돌보면 풀림까지 남은 접속일(지금 청크 수로 · 화면 안내 · 판 점검) — 1 이면 내일 풀린다
function daysToFree(C) { return Math.max(1, Math.ceil(CFG.FREE_D / rate(C) - 1e-9)); }
// 그날의 낡음 — 청크 줄 `ch = { w, n0 }`(n0 = 마지막으로 잰 접속일). 접속일 n 까지 (n − n0) × 배수(C)를 쌓는다. 반환 = 단계.
//   ★이행(켜는 순간 줄지 않게): `n0` 가 없는 청크(켜기 앞의 옛 칸 · 처음 보는 청크)는 **지금 날**을 돌본 날로 잡는다.
//   다른 존에서 센 날도 `n` 에 들어 있으므로 여기서 한꺼번에 쌓인다(존 넘어옴 — T1305 ⑬-b 그대로).
function wear(ch, n, C) {
  if (!ch) return 'new';
  if (!Number.isFinite(ch.n0)) { ch.n0 = n | 0; ch.w = 0; }
  const k = Math.max(0, (n | 0) - (ch.n0 | 0));
  if (k) { ch.w = (+ch.w || 0) + k * rate(C); ch.n0 = n | 0; }
  return stageOf(ch.w);
}
// 썼다(또는 머물렀다) — 그 청크 새것.
function used(ch, n) { if (!ch) return false; ch.w = 0; ch.n0 = n | 0; return true; }

module.exports = { ON, CFG, dayKey, stageOf, bodyOf, touchDay, chunkOf, rate, daysToFree, wear, used };
