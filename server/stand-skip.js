// === server/stand-skip.js — 서 있는 몸 첫 거름 열 (T1322 · 2026-11-15) ======================================================
//
// ★손잡이 `T1322_PREFILTER` — `'1'` 켬 · `'verify'` 켬 + 거를 때마다 몸을 열어 견줌 · 그 밖(없음 포함) 끔.
//   끔이면 이 모듈은 아무것도 안 만든다(`ON` 거짓 — 존이 부르는 자리가 전부 `T1322_PF` 뒤 = 종전 글자 · 종전 값).
// ★무엇 — 결정 문 고리(`_decOne`)가 몸 객체를 **열기 전에** 열만 보고 "이번 틱 걸음 문이 도장만 찍는 몸"을 건넌다.
//   ⓐ 몸 번호 = 칸 — 존 `spawnNpc` 가 낳을 때 받는다(`install` · pid → 칸 `Map` · 몸 칸은 안 붙인다 = 몸 모양 · 키 차례 그대로).
//   ⓑ 표(`TK`) — 진짜 걸음을 마친 몸이 "서 있는 몸"(길 끝 한 점 · 목표 10px 안 · 속도 +0 · 결정 시각 전 …)이면 존이 표를 준다(`grant` 쪽은 존 글자).
//      표 종류 1 = 밤 귀가 갈래가 어느 시각에도 무동작(침대 목표 그대로 · 갈래 밖) · 2 = 해 질 녘(현지 해 몫 > 낮 몫)이 되면 깨운다.
//   ⓒ 열 — 결정 시각(`NDA`) · 경도 몫(`LON`) · 판 시계 몸(`W95`) · 마지막으로 본 틱(`VT` — 한 틱이라도 안 본 몸은 깨운다) · 미룬 도장 시각(`SK`) · 표를 준 자리(`SX` · `SY`).
//   ⓓ 미룬 도장 — 건넌 틱의 걸음 문이 썼을 값(`_t540StepAt` · `_pathAt` · `_stuckPos` = 그 자리 · 그 시각)은 몸을 다시 열 때 한 번에 쓴다(마지막 건넌 시각).
// ★열은 몸 칸의 거울이 아니다 — 표를 준 그 순간의 사본이고, 표가 산 동안 몸 칸이 안 바뀐다는 것이 이 거름의 전제다.
//   전제를 깨는 쓰기(밀기 · 걸음 뒷일 · 체력 문 · 생활층 대피 · 직업 바꿈)는 쓰기 **앞에서** 표를 내린다(존 `_t1322Touch` · 생활층은 deps `t1322Touch`). 나머지는 `verify` 가 센다(거를 때마다 몸을 열어 걸음 문 머리 글자 그대로 다시 판정).
'use strict';
const MODE = (typeof process !== 'undefined' && process.env && process.env.T1322_PREFILTER || '').trim();
const ON = MODE === '1' || MODE === 'verify', VERIFY = MODE === 'verify';
const A = { TK: new Uint8Array(0), W95: new Uint8Array(0), VT: new Int32Array(0), NDA: new Float64Array(0), LON: new Float64Array(0), SK: new Float64Array(0), SX: new Float64Array(0), SY: new Float64Array(0) };
const own = [];          // 칸 → 몸(빈 칸 = null)
const slotOf = new Map();   // pid → 칸
let cap = 0, n = 0;
const stat = { installed: 0, grant: 0, skip: 0, wake: 0, stamp: 0, touch: 0, flushAll: 0, gap: 0, due: 0, dusk: 0, gone: 0, vchecks: 0, bad: 0, why: {}, ex: [] };
function _grow(need) {
  let c = cap || 1024; while (c < need) c *= 2;
  for (const k of Object.keys(A)) { const B = new A[k].constructor(c); B.set(A[k]); A[k] = B; }
  cap = c;
}
// 몸이 칸을 받는다(같은 pid 로 다시 낳으면 새 칸 — 옛 칸은 비운다)
function install(p) {
  const old = slotOf.get(p.pid); if (old !== undefined) { own[old] = null; A.TK[old] = 0; }
  const s = n++; if (s >= cap) _grow(s + 1);
  own[s] = p; slotOf.set(p.pid, s); A.TK[s] = 0; A.SK[s] = NaN; A.VT[s] = -1;
  stat.installed++;
  return s;
}
function slot(pid) { const s = slotOf.get(pid); return s === undefined ? -1 : s; }
function count() { return n; }
// 판 셈 — `T1322_STAT=<파일>` 이면 끝날 때(와 30초마다) 표 셈을 적는다(켬일 때만)
if (ON && process.env.T1322_STAT) {
  const fs = require('fs'), put = () => { try { fs.writeFileSync(process.env.T1322_STAT, JSON.stringify(Object.assign({ mode: MODE, slots: n }, stat))); } catch (e) {} };
  setInterval(put, 30000).unref(); process.on('exit', put);
}
module.exports = { ON, VERIFY, MODE, A, own, install, slot, count, stat };
