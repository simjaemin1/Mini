// === server/stand-skip.js — 서 있는 몸 첫 거름 열 (T1322 · 2026-11-15) ======================================================
//
// ★손잡이 `T1322_PREFILTER` — ★[T1323 · 재민 11-15 "켜"] **켬 기본** · `'0'` 끔(되돌림) · `'verify'` 켬 + 거를 때마다 몸을 열어 견줌.
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
const ON = MODE !== '0', VERIFY = MODE === 'verify';   // ★[T1323] 켬 기본(`'0'` 만 끔 · 종전 `'1'` 도 켬)
// ★[T1337] 잠 깨움 거름 손잡이 `T1337_WAKE` — **켬 기본**(판 같음 증거: 30날 × 3 시드 30/30 · 400날 1020 같음 · verify 어긋남 0) · `'0'` 끔(되돌림) · `'verify'` 켬 + 건너려는 결정을 실제로 돌려 견줌
const WMODE = (typeof process !== 'undefined' && process.env && process.env.T1337_WAKE || '').trim();
const WAKE_ON = WMODE !== '0', WAKE_VERIFY = WMODE === 'verify';
// ★[T1348 ⓐ] 결정 순회 고리 거울 손잡이 `T1348_LOOP` — 켬 기본 · `'0'` 끔. 켬이면 존의 `npcs`(pid Set)가 `OrdSet`(같은 Set + 넣은 차례 거울 배열)이고
//   `players`(pid → 몸 Map)가 `PMap`(같은 Map + 쓰기 앞뒤에 "칸 몸 = players 몸" 표 `GN` 을 고친다)이다. 고리는 Set 대신 거울 배열을 돈다(같은 차례 · 살아 있는 순회 그 뜻).
const LMODE = (typeof process !== 'undefined' && process.env && process.env.T1348_LOOP || '').trim();
const LOOP = ON && LMODE !== '0';
// ★[T1348 ⓑ] 걷는 몸 열 커널 손잡이 `T1348_WALK` — 켬 기본 · `'0'` 끔 · `'verify'` 켬 + 커널이 낼 값을 셈한 뒤 진짜 걸음을 돌려 견줌
const KMODE = (typeof process !== 'undefined' && process.env && process.env.T1348_WALK || '').trim();
const WALK_ON = ON && KMODE !== '0', WALK_VERIFY = KMODE === 'verify';
// ★[T1348 ⓒ] 일터 깨움 손잡이 `T1348_WORK` — 켬 기본 · `'0'` 끔 · `'verify'` 켬 + 건너려는 결정을 실제로 돌려 견줌(잠 깨움 `T1337_WAKE` 그 꼴 · 농부 일터 머묾)
const FMODE = (typeof process !== 'undefined' && process.env && process.env.T1348_WORK || '').trim();
const WORK_ON = ON && FMODE !== '0', WORK_VERIFY = FMODE === 'verify';
// ★[T1365 ⓐ] 일터 깨움 나머지 손잡이 `T1365_WORK` — 켬 기본 · `'0'` 끔 · `'verify'` 켬 + 건너려는 결정을 실제로 돌려 견줌 + 직업마다 덮음 셈(무동작 결정 중 판정이 잡은 몫)
const XMODE = (typeof process !== 'undefined' && process.env && process.env.T1365_WORK || '').trim();
const WORK2_ON = ON && XMODE !== '0', WORK2_VERIFY = XMODE === 'verify';
const A = { TK: new Uint8Array(0), W95: new Uint8Array(0), VT: new Int32Array(0), NDA: new Float64Array(0), LON: new Float64Array(0), SK: new Float64Array(0), SX: new Float64Array(0), SY: new Float64Array(0),
  // ★[T1337] 잠 깨움 표(결정 문까지 건넌다) — DS 표 · SH 신원 해시 · CX/CY 셀 · T95 판 시계 배율 · VID 마을 · SEG 창 쪽(1 저녁 · 2 새벽) · DOF `_dOff` · BDY 몸 날 · DAY 장부 날 · DK 미룬 결정 도장(`_t540DecAt`)
  // ★[T1348 ⓑ] 걷는 몸 표(표 종류 3) — PI 길 번호 · PN 길 길이(거울) · PX0/PY0 첫 점(거울) · PAT `_pathAt` · ST 길 만료 · SPX/SPY/SPA 막힘 자리(`_stuckPos`) · SPD 걸음 빠르기 · WD 해 질 녘에 깨움
  PI: new Int32Array(0), PN: new Int32Array(0), PX0: new Float64Array(0), PY0: new Float64Array(0), PAT: new Float64Array(0), ST: new Float64Array(0),
  SPX: new Float64Array(0), SPY: new Float64Array(0), SPA: new Float64Array(0), SPD: new Float64Array(0), WD: new Uint8Array(0),
  GN: new Uint8Array(0),   // ★[T1348 ⓐ] 1 = players 의 그 pid 몸이 이 칸 몸이 아니다(지웠다 · 다른 몸) — 종전 `players.get(pid) !== own[s]` 의 표
  DS: new Uint8Array(0), SH: new Float64Array(0), CX: new Float64Array(0), CY: new Float64Array(0), T95: new Float64Array(0), VID: new Float64Array(0), SEG: new Uint8Array(0), DOF: new Float64Array(0), BDY: new Float64Array(0), DAY: new Float64Array(0), GD: new Float64Array(0), DK: new Float64Array(0) };
const own = [];          // 칸 → 몸(빈 칸 = null)
const WPA = [];          // ★[T1348 ⓑ] 칸 → 걷는 몸의 길 배열(표 종류 3 · 짓고 나면 안 바뀌는 배열)
const slotOf = new Map();   // pid → 칸
let cap = 0, n = 0;
const stat = { installed: 0, grant: 0, skip: 0, wake: 0, stamp: 0, touch: 0, flushAll: 0, gap: 0, due: 0, dusk: 0, gone: 0, vchecks: 0, bad: 0, why: {}, ex: [],
  compact: 0, gnbad: 0,   // ★[T1348 ⓐ]
  wgrant: 0, wstep: 0, wvi: 0, wvq: 0, wcmp: 0, wbad: 0, wwhy: {}, wex: [], clock: 0, stuck: 0, stale: 0, arrive: 0, verify: 0,   // ★[T1348 ⓑ] 걷는 몸 표 셈
  fgrant: 0, fskip: 0, fwolf: 0, fstill: 0, fvq: 0, fcmp: 0, fbad: 0, fwhy: {}, fex: [], fk1: 0, fk2: 0,   // ★[T1348 ⓒ] 일터 깨움 셈
  xskip: 0, xk1: 0, xk2: 0, xvq: 0, xcmp: 0, xbad: 0, xwhy: {}, xex: [], fjob: {},   // ★[T1365 ⓐ] 일터 깨움 나머지 셈 · 직업마다 [판정 0 무동작 · 판정 0 바뀜 · 판정 참 무동작 · 판정 참 바뀜(어긋남)] (verify)
  dgrant: 0, dskip: 0, dstamp: 0, dwolf: 0, dstill: 0, dvq: 0, dcmp: 0, dbad: 0, dwhy: {}, dex: [] };   // ★[T1337] 잠 깨움 표 셈
function _grow(need) {
  let c = cap || 1024; while (c < need) c *= 2;
  for (const k of Object.keys(A)) { const B = new A[k].constructor(c); B.set(A[k]); A[k] = B; }
  cap = c;
}
// 몸이 칸을 받는다(같은 pid 로 다시 낳으면 새 칸 — 옛 칸은 비운다)
function install(p) {
  const old = slotOf.get(p.pid); if (old !== undefined) { own[old] = null; A.TK[old] = 0; A.DS[old] = 0; WPA[old] = null; }
  const s = n++; if (s >= cap) _grow(s + 1);
  own[s] = p; WPA[s] = null; slotOf.set(p.pid, s); A.TK[s] = 0; A.SK[s] = NaN; A.VT[s] = -1; A.DS[s] = 0; A.DK[s] = NaN;
  A.GN[s] = _players && _players.get(p.pid) === p ? 0 : 1;   // ★[T1348 ⓐ] 낳는 몸은 보통 아직 players 밖(곧 `set` 이 0 으로)
  stat.installed++;
  return s;
}
// ★[T1348 ⓐ] 고리 거울 — 넣은 차례(Set 의 차례 그대로: 새 pid 는 끝 · 지웠다 다시 넣으면 끝)의 pid 배열 `P` · 그 칸 캐시 `S`(−2 = 모름) · 지운 자리는 구멍(`undefined`).
//   구멍 메우기(`compact`)는 고리 밖에서만(고리 머리) — 고리 안에서 넣은 pid 는 끝에 붙어 같은 바퀴에 돈다(Set 살아 있는 순회와 같다).
class OrdSet extends Set {
  constructor() { super(); this.P = []; this.S = []; this.pos = new Map(); this.dead = 0; }
  add(pid) { if (!super.has(pid)) { super.add(pid); this.pos.set(pid, this.P.length); this.P.push(pid); this.S.push(-2); } return this; }
  delete(pid) { const r = super.delete(pid); if (r) { const i = this.pos.get(pid); this.pos.delete(pid); this.P[i] = undefined; this.S[i] = -2; this.dead++; } return r; }
  clear() { super.clear(); this.P.length = 0; this.S.length = 0; this.pos.clear(); this.dead = 0; }
  compact(force) {
    if (!this.dead || (!force && (this.dead < 64 || this.dead * 4 < this.P.length))) return false;
    const P = [], S = []; this.pos.clear();
    for (let i = 0; i < this.P.length; i++) { const pid = this.P[i]; if (pid === undefined) continue; this.pos.set(pid, P.length); P.push(pid); S.push(this.S[i]); }
    this.P = P; this.S = S; this.dead = 0; stat.compact++;
    return true;
  }
}
// ★[T1348 ⓐ] players — 쓰기(`set` · `delete` · `clear`)마다 그 pid 칸의 `GN` 을 고친다(읽기 `get` · 순회는 Map 그대로)
let _players = null;
class PMap extends Map {
  set(k, v) { super.set(k, v); const s = slotOf.get(k); if (s !== undefined) A.GN[s] = v === own[s] ? 0 : 1; return this; }
  delete(k) { const r = super.delete(k); const s = slotOf.get(k); if (s !== undefined) A.GN[s] = 1; return r; }
  clear() { super.clear(); A.GN.fill(1); }
}
function newPlayers() { const m = LOOP ? new PMap() : new Map(); _players = m; return m; }
function newNpcs() { return LOOP ? new OrdSet() : new Set(); }
function slot(pid) { const s = slotOf.get(pid); return s === undefined ? -1 : s; }
function count() { return n; }
// 판 셈 — `T1322_STAT=<파일>`(`%p` = 프로세스 번호 — 판 여럿이 같이 돌 때) 이면 끝날 때(와 30초마다) 표 셈을 적는다(켬일 때만)
if (ON && process.env.T1322_STAT) {
  const fs = require('fs'), _f = process.env.T1322_STAT.replace('%p', String(process.pid)), put = () => { try { fs.writeFileSync(_f, JSON.stringify(Object.assign({ mode: MODE, wmode: WMODE, lmode: LMODE, kmode: KMODE, fmode: FMODE, xmode: XMODE, slots: n }, stat))); } catch (e) {} };
  setInterval(put, 30000).unref(); process.on('exit', put);
}
module.exports = { ON, VERIFY, MODE, WAKE_ON, WAKE_VERIFY, WMODE, LOOP, LMODE, WALK_ON, WALK_VERIFY, KMODE, WORK_ON, WORK_VERIFY, FMODE, WORK2_ON, WORK2_VERIFY, XMODE, A, own, WPA, install, slot, count, stat, OrdSet, PMap, newPlayers, newNpcs };
