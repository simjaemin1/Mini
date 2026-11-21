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
// ★[T1365 ⓐ] 일터 깨움 나머지 손잡이 `T1365_WORK` — **끔 기본**(같은 자에서 이득이 안 섰다 — 판정 셈이 결정 문 셈과 거의 같다 · 보고 T1365 §5) · `'1'` 켬 · `'verify'` 켬 + 건너려는 결정을 실제로 돌려 견줌 + 직업마다 덮음 셈(무동작 결정 중 판정이 잡은 몫)
const XMODE = (typeof process !== 'undefined' && process.env && process.env.T1365_WORK || '').trim();
const WORK2_ON = ON && (XMODE === '1' || XMODE === 'verify'), WORK2_VERIFY = XMODE === 'verify';
// ★[T1399 ⓐ] 일터 깨움 표 한 번 판정 손잡이 `T1399_TOK` — **끔 기본** · `'1'` 켬 · `'verify'` 켬 판의 표를 적되 결정마다 판정을 실제로 다시 해 견줌(행동은 판정 답 = 종전)
//   켬 = 일터 깨움 판정(`t1348Farm` · `t1365Work`)이 참이면 그 판정이 산 조건을 열에 적고(생활층 `t1399Take`), 다음 결정은 그 조건이 아직 사는가(`t1399Still`)만 본다 — 판정을 다시 안 한다.
const TMODE = (typeof process !== 'undefined' && process.env && process.env.T1399_TOK || '').trim();
const TOK_ON = ON && (TMODE === '1' || TMODE === 'verify'), TOK_VERIFY = TMODE === 'verify';
// ★★[T1415 ② 2026-11-21] 깨움 시각 줄 손잡이 `T1415_WAKEQ` — **끔 기본** · `'1'` 켬 · `'verify'` 줄은 쌓고 꺼내되 몸은 종전처럼 틱마다 보며 견줌(행동 = 종전).
//   켬 = 서 있는 몸(표 1 · 2)이 틱마다 첫 거름(`_t1322Skip`)을 받는 대신, 거른 틱 끝에 다음에 볼 시각(결정 시각 · 해 질 녘 아래 끝)을 힙에 넣고 고리에서 뺀다(주차).
//     때가 된 몸만 틱 머리에서 꺼내(`qPop`) 종전 첫 거름에 다시 넣는다. 그 사이 틱마다 쓰였을 칸(`VT` 거른 틱 · `SK` 거른 시각 · 거름 셈)은 꺼낼 때 한 번에 쓴다(`qMat`).
//   밖에서 깨우는 쓰기(밀기 · 체력 문 · 대피 · 종료 저장 · players 쓰기 · 고리 거울 지움 · 칸 다시 받기)는 모두 쓰기 앞에서 꺼낸다(`qWake` — 존 `_t1322Wake` 머리 · 아래 PMap · OrdSet · install).
//   고리 예산 끊김 · 고리가 안 돈 틱(빠짐) · 표 행 뜨기(T1372) = 주차 몸 전부 꺼냄(`qAll` — 종전이 '빠짐'으로 깨울 몸을 같은 틱에 깨운다).
//   걷는 몸(표 3)은 넣지 않는다 — 커널이 틱마다 속도 · 막힘 표본을 쓴다(건너뛸 틱이 없다 · 보고 §2).
const QMODE = (typeof process !== 'undefined' && process.env && process.env.T1415_WAKEQ || '').trim();
const WQ_ON = LOOP && (QMODE === '1' || QMODE === 'verify'), WQ_VERIFY = QMODE === 'verify';
const A = { TK: new Uint8Array(0), W95: new Uint8Array(0), VT: new Int32Array(0), NDA: new Float64Array(0), LON: new Float64Array(0), SK: new Float64Array(0), SX: new Float64Array(0), SY: new Float64Array(0),
  // ★[T1337] 잠 깨움 표(결정 문까지 건넌다) — DS 표 · SH 신원 해시 · CX/CY 셀 · T95 판 시계 배율 · VID 마을 · SEG 창 쪽(1 저녁 · 2 새벽) · DOF `_dOff` · BDY 몸 날 · DAY 장부 날 · DK 미룬 결정 도장(`_t540DecAt`)
  // ★[T1348 ⓑ] 걷는 몸 표(표 종류 3) — PI 길 번호 · PN 길 길이(거울) · PX0/PY0 첫 점(거울) · PAT `_pathAt` · ST 길 만료 · SPX/SPY/SPA 막힘 자리(`_stuckPos`) · SPD 걸음 빠르기 · WD 해 질 녘에 깨움
  PI: new Int32Array(0), PN: new Int32Array(0), PX0: new Float64Array(0), PY0: new Float64Array(0), PAT: new Float64Array(0), ST: new Float64Array(0),
  SPX: new Float64Array(0), SPY: new Float64Array(0), SPA: new Float64Array(0), SPD: new Float64Array(0), WD: new Uint8Array(0),
  GN: new Uint8Array(0),   // ★[T1348 ⓐ] 1 = players 의 그 pid 몸이 이 칸 몸이 아니다(지웠다 · 다른 몸) — 종전 `players.get(pid) !== own[s]` 의 표
  DS: new Uint8Array(0), SH: new Float64Array(0), CX: new Float64Array(0), CY: new Float64Array(0), T95: new Float64Array(0), VID: new Float64Array(0), SEG: new Uint8Array(0), DOF: new Float64Array(0), BDY: new Float64Array(0), DAY: new Float64Array(0), GD: new Float64Array(0), DK: new Float64Array(0),
  // ★[T1399 ⓐ] 일터 깨움 표(판정 한 번) — WK 판정 답(0 = 표 없음) · WT 시각 문턱 · WFP 해 몫 쪽 · WDY 장부 날 · WBD 몸 날 · WWD 세계 날 · WGD 존 게임일 · WG 마을 도장 · WSC 판 시계 배율 ·
  //   WPN 자리 문턱 수 · WPX/WPY/WPR 자리 문턱 · WPO 그 쪽(1 = 밖) · WVW 뷰 다시 봄
  WK: new Uint8Array(0), WT: new Float64Array(0), WFP: new Uint8Array(0), WDY: new Float64Array(0), WBD: new Float64Array(0), WWD: new Float64Array(0), WGD: new Float64Array(0), WG: new Float64Array(0), WSC: new Float64Array(0),
  WPN: new Uint8Array(0), WPX: new Float64Array(0), WPY: new Float64Array(0), WPR: new Float64Array(0), WPO: new Uint8Array(0), WVW: new Uint8Array(0),
  // ★[T1399 ⓒ] WQ/WQX/WQY 드리운 칸(물인가 다시 봄) · LAT 미룬 라벨 시각 도장(`_lifeActAt` — 던짐 대본 기다림 결정이 썼을 그 결정의 `Date.now()` · 없으면 NaN)
  WQ: new Uint8Array(0), WQX: new Float64Array(0), WQY: new Float64Array(0), LAT: new Float64Array(0),
  WT2: new Float64Array(0) };   // ★[T1415 ③] 장인 시계 축 시각 문턱(없으면 Infinity)
const own = [];          // 칸 → 몸(빈 칸 = null)
const WPA = [];
const WQS = [];         // ★[T1415 ③] 칸 → 장인 일감 줄 지문(표가 그 줄을 읽었으면 글자 · 아니면 null)          // ★[T1348 ⓑ] 칸 → 걷는 몸의 길 배열(표 종류 3 · 짓고 나면 안 바뀌는 배열)
const slotOf = new Map();   // pid → 칸
let cap = 0, n = 0;
const stat = { installed: 0, grant: 0, skip: 0, wake: 0, stamp: 0, touch: 0, flushAll: 0, gap: 0, due: 0, dusk: 0, gone: 0, vchecks: 0, bad: 0, why: {}, ex: [],
  compact: 0, gnbad: 0,   // ★[T1348 ⓐ]
  wgrant: 0, wstep: 0, wvi: 0, wvq: 0, wcmp: 0, wbad: 0, wwhy: {}, wex: [], clock: 0, stuck: 0, stale: 0, arrive: 0, verify: 0,   // ★[T1348 ⓑ] 걷는 몸 표 셈
  fgrant: 0, fskip: 0, fwolf: 0, fstill: 0, fvq: 0, fcmp: 0, fbad: 0, fwhy: {}, fex: [], fk1: 0, fk2: 0,   // ★[T1348 ⓒ] 일터 깨움 셈
  xskip: 0, xk1: 0, xk2: 0, xvq: 0, xcmp: 0, xbad: 0, xwhy: {}, xex: [], fjob: {}, fmiss: {},   // ★[T1365 ⓐ] 일터 깨움 나머지 셈 · 직업마다 [판정 0 무동작 · 판정 0 바뀜 · 판정 참 무동작 · 판정 참 바뀜(어긋남)] (verify)
  dgrant: 0, dskip: 0, dstamp: 0, dwolf: 0, dstill: 0, dvq: 0, dcmp: 0, dbad: 0, dwhy: {}, dex: [],   // ★[T1337] 잠 깨움 표 셈
  ttake: 0, thit: 0, tdead: 0, tnone: {}, tvq: 0, tbad: 0, twhy: {}, tex: [], tjob: {} };   // ★[T1399 ⓐ] 표 적음 · 표로 건넘 · 표가 죽음(다시 판정) · 표 없는 까닭 · 견줌 · 어긋남 · 직업마다 [적음 · 건넘 · 죽음]
function _grow(need) {
  let c = cap || 1024; while (c < need) c *= 2;
  for (const k of Object.keys(A)) { const B = new A[k].constructor(c); B.set(A[k]); A[k] = B; }
  cap = c;
}
// 몸이 칸을 받는다(같은 pid 로 다시 낳으면 새 칸 — 옛 칸은 비운다)
function install(p) {
  const old = slotOf.get(p.pid); if (old !== undefined) { if (WQ_ON) qWake(old); own[old] = null; A.TK[old] = 0; A.DS[old] = 0; WPA[old] = null; }
  const s = n++; if (s >= cap) _grow(s + 1);
  own[s] = p; WPA[s] = null; slotOf.set(p.pid, s); A.TK[s] = 0; A.SK[s] = NaN; A.VT[s] = -1; A.DS[s] = 0; A.DK[s] = NaN; A.WK[s] = 0; A.LAT[s] = NaN;
  A.GN[s] = _players && _players.get(p.pid) === p ? 0 : 1;   // ★[T1348 ⓐ] 낳는 몸은 보통 아직 players 밖(곧 `set` 이 0 으로)
  stat.installed++;
  return s;
}
// ★[T1348 ⓐ] 고리 거울 — 넣은 차례(Set 의 차례 그대로: 새 pid 는 끝 · 지웠다 다시 넣으면 끝)의 pid 배열 `P` · 그 칸 캐시 `S`(−2 = 모름) · 지운 자리는 구멍(`undefined`).
//   구멍 메우기(`compact`)는 고리 밖에서만(고리 머리) — 고리 안에서 넣은 pid 는 끝에 붙어 같은 바퀴에 돈다(Set 살아 있는 순회와 같다).
class OrdSet extends Set {
  constructor() { super(); this.P = []; this.S = []; this.pos = new Map(); this.dead = 0; }
  add(pid) { if (!super.has(pid)) { super.add(pid); this.pos.set(pid, this.P.length); this.P.push(pid); this.S.push(-2); } return this; }
  delete(pid) { if (WQ_ON && super.has(pid)) { const s0 = slotOf.get(pid); if (s0 !== undefined) qWake(s0); }   // ★[T1415 ②] 거울에서 빠지기 앞 — 주차 몸 꺼냄
    const r = super.delete(pid); if (r) { const i = this.pos.get(pid); this.pos.delete(pid); this.P[i] = undefined; this.S[i] = -2; this.dead++; } return r; }
  clear() { if (WQ_ON) qAll('clr'); super.clear(); this.P.length = 0; this.S.length = 0; this.pos.clear(); this.dead = 0; }
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
  set(k, v) { const s = slotOf.get(k); if (WQ_ON && s !== undefined) qWake(s); super.set(k, v); if (s !== undefined) A.GN[s] = v === own[s] ? 0 : 1; return this; }   // ★[T1415 ②] 쓰기 앞 — 주차 몸 꺼냄
  delete(k) { const s0 = slotOf.get(k); if (WQ_ON && s0 !== undefined) qWake(s0); const r = super.delete(k); const s = slotOf.get(k); if (s !== undefined) A.GN[s] = 1; return r; }
  clear() { if (WQ_ON) qAll('clr'); super.clear(); A.GN.fill(1); }
}
function newPlayers() { const m = LOOP ? new PMap() : new Map(); _players = m; return m; }
function newNpcs() { return LOOP ? new OrdSet() : new Set(); }
function slot(pid) { const s = slotOf.get(pid); return s === undefined ? -1 : s; }
function count() { return n; }
// 판 셈 — `T1322_STAT=<파일>`(`%p` = 프로세스 번호 — 판 여럿이 같이 돌 때) 이면 끝날 때(와 30초마다) 표 셈을 적는다(켬일 때만)
if (ON && process.env.T1322_STAT) {
  const fs = require('fs'), _f = process.env.T1322_STAT.replace('%p', String(process.pid)), put = () => { try { fs.writeFileSync(_f, JSON.stringify(Object.assign({ mode: MODE, wmode: WMODE, lmode: LMODE, kmode: KMODE, fmode: FMODE, xmode: XMODE, tmode: TMODE, slots: n }, stat, WQ_ON ? { qmode: QMODE, q: Q.st } : {}))); } catch (e) {} };
  setInterval(put, 30000).unref(); process.on('exit', put);
}
// ★[T1415 ②] 깨움 시각 줄 — 칸마다 주차 표(`P`) · 고리 거울 자리(`I`) · 세대(`G` · 힙의 묵은 칸 거름) · 주차한 틱(`V`) · 거울 자리마다 주차 표(`K`) · 힙(시각 · 칸 · 세대)
//   고리 기록: `lastN` · `lastNow` = 마지막으로 끝난 고리의 틱 · 시각 · `curN` · `curNow` · `at` = 지금 고리가 보는 거울 자리(고리 밖 −1)
const Q = { P: new Uint8Array(0), I: new Int32Array(0), G: new Uint32Array(0), V: new Float64Array(0), cap: 0, K: new Uint8Array(1024),
  hT: [], hS: [], hG: [], parked: 0, lastN: -9, lastNow: NaN, curN: -9, curNow: NaN, at: -1,
  st: { park: 0, pop: 0, stale: 0, ext: 0, all: 0, allN: 0, brk: 0, gap: 0, snap: 0, cpt: 0, lost: 0, vskip: 0, vis: 0, vbad: 0, vwhy: {}, vex: [], heapMax: 0, parkedMax: 0 } };
function _qGrow(need) {
  let c = Q.cap || 1024; while (c < need) c *= 2;
  const g = (o) => { const B = new o.constructor(c); B.set(o); return B; };
  Q.P = g(Q.P); Q.I = g(Q.I); Q.G = g(Q.G); Q.V = g(Q.V); Q.cap = c;
}
function _qK(i) { if (i >= Q.K.length) { let c = Q.K.length; while (c <= i) c *= 2; const B = new Uint8Array(c); B.set(Q.K); Q.K = B; } }
function _qBad(w, s) { const st = Q.st; st.vbad++; st.vwhy[w] = (st.vwhy[w] || 0) + 1; if (st.vex.length < 8) st.vex.push(`${own[s] ? own[s].pid : '?'} ${w} n=${Q.curN}`); }
// 주차 동안 쓰였을 칸 — 고리 안이면 지금 자리보다 앞 = 이번 틱에 거른 몸 · 아니면 마지막 끝난 고리의 틱. 주차한 틱 뒤로 거른 틱이 없으면 손대지 않는다(표를 준 틱 = `SK` NaN 그대로).
function qMat(s) {
  const inLoop = Q.at >= 0, vis = inLoop && Q.I[s] < Q.at, n = vis ? Q.curN : Q.lastN, t = vis ? Q.curNow : Q.lastNow;
  if (!(n > Q.V[s])) return;
  if (WQ_VERIFY) { if (A.VT[s] !== n || !Object.is(A.SK[s], t)) _qBad('mat', s); return; }   // verify = 종전 길이 이미 썼다 — 같은 값인가만
  stat.skip += n - Q.V[s]; Q.st.vskip += n - Q.V[s]; A.VT[s] = n; A.SK[s] = t;
}
function _qOff(s) { Q.P[s] = 0; const i = Q.I[s]; if (i >= 0 && i < Q.K.length) Q.K[i] = 0; Q.parked--; }
// 밖에서 깨움(쓰기 앞) — 주차 몸이면 칸을 쓰고 고리에 되돌린다
function qWake(s) { if (s >= 0 && s < Q.cap && Q.P[s]) { qMat(s); _qOff(s); Q.st.ext++; } }
function qDrop(s, w) { if (Q.P[s]) { _qBad(w, s); _qOff(s); } }   // verify — 줄이 놓친 깨움(칸은 종전 길이 이미 썼다)
function qAll(why) { if (!Q.parked) return; Q.st.all++; Q.st[why] = (Q.st[why] || 0) + 1; for (let s = 0; s < n && Q.parked; s++) if (Q.P[s]) { qMat(s); _qOff(s); Q.st.allN++; } Q.parked = 0; }
function _hUp(j) { const T = Q.hT, S = Q.hS, G = Q.hG, t = T[j], a = S[j], g = G[j]; while (j > 0) { const p = (j - 1) >> 1; if (!(t < T[p])) break; T[j] = T[p]; S[j] = S[p]; G[j] = G[p]; j = p; } T[j] = t; S[j] = a; G[j] = g; }
function _hDown(j) { const T = Q.hT, S = Q.hS, G = Q.hG, L = T.length, t = T[j], a = S[j], g = G[j];
  for (;;) { let c = 2 * j + 1; if (c >= L) break; if (c + 1 < L && T[c + 1] < T[c]) c++; if (!(T[c] < t)) break; T[j] = T[c]; S[j] = S[c]; G[j] = G[c]; j = c; }
  T[j] = t; S[j] = a; G[j] = g; }
function _hPop() { const T = Q.hT, S = Q.hS, G = Q.hG, lt = T.pop(), ls = S.pop(), lg = G.pop(); if (T.length) { T[0] = lt; S[0] = ls; G[0] = lg; _hDown(0); } }
// 주차 — 이번 틱에 거른(또는 표를 받은) 몸 · 거울 자리 `i` · 다음에 볼 시각 `T`(이 시각이 된 틱 머리에 꺼낸다 · 이르면 이를수록 안전 = 종전 첫 거름이 다시 본다)
function qPark(s, i, T, tn) {
  if (s >= Q.cap) _qGrow(s + 1); _qK(i);
  Q.P[s] = 1; Q.I[s] = i; Q.V[s] = tn; const g = (Q.G[s] = (Q.G[s] + 1) >>> 0); Q.K[i] = 1; Q.parked++; Q.st.park++;
  Q.hT.push(T); Q.hS.push(s); Q.hG.push(g); _hUp(Q.hT.length - 1);
  if (Q.hT.length > Q.st.heapMax) Q.st.heapMax = Q.hT.length; if (Q.parked > Q.st.parkedMax) Q.st.parkedMax = Q.parked;
}
// 고리 머리 — 빠진 틱(앞 고리가 바로 앞 틱이 아님)이면 전부 꺼냄 · 거울을 메웠으면 자리 다시 셈 · 때가 된 몸 꺼냄 · 힙 청소
function qBegin(tn, now, cpt, P, S) {
  Q.curN = tn; Q.curNow = now; Q.at = -1;
  if (Q.parked && Q.lastN !== tn - 1) qAll('gap');
  if (cpt && Q.parked) { Q.st.cpt++; Q.K.fill(0); _qK(P.length); let c = 0;
    for (let i = 0; i < P.length; i++) { const s = S[i]; if (P[i] !== undefined && s >= 0 && s < Q.cap && Q.P[s] && own[s] && own[s].pid === P[i]) { Q.I[s] = i; Q.K[i] = 1; c++; } }
    if (c !== Q.parked) { Q.st.lost++; for (let s = 0; s < n; s++) if (Q.P[s] && !Q.K[Q.I[s]]) { Q.I[s] = -1; qMat(s); _qOff(s); } } }
  const T = Q.hT;
  while (T.length && !(now < T[0])) { const s = Q.hS[0], g = Q.hG[0]; _hPop(); if (Q.P[s] && Q.G[s] === g) { qMat(s); _qOff(s); Q.st.pop++; } else Q.st.stale++; }
  if (T.length > 4 * Q.parked + 4096) { const t = [], a = [], gg = []; for (let j = 0; j < T.length; j++) { const s = Q.hS[j]; if (Q.P[s] && Q.G[s] === Q.hG[j]) { t.push(T[j]); a.push(s); gg.push(Q.hG[j]); } }
    Q.hT = t; Q.hS = a; Q.hG = gg; for (let j = (t.length >> 1) - 1; j >= 0; j--) _hDown(j); }
}
// 고리 끝 — 끊겼으면(예산) 주차 몸 전부 꺼냄(끊긴 자리 앞 = 이번 틱 거름 · 뒤 = 못 거름 → 다음 첫 거름이 '빠짐'으로 깨운다 = 종전)
function qEnd(tn, now, cutAt) { if (cutAt >= 0 && Q.parked) { Q.at = cutAt; qAll('brk'); } Q.at = -1; Q.lastN = tn; Q.lastNow = now; }
module.exports = { ON, VERIFY, MODE, WAKE_ON, WAKE_VERIFY, WMODE, LOOP, LMODE, WALK_ON, WALK_VERIFY, KMODE, WORK_ON, WORK_VERIFY, FMODE, WORK2_ON, WORK2_VERIFY, XMODE, TOK_ON, TOK_VERIFY, TMODE, QMODE, WQ_ON, WQ_VERIFY, Q, qPark, qWake, qAll, qBegin, qEnd, qMat, qDrop, A, own, WPA, WQS, install, slot, count, stat, OrdSet, PMap, newPlayers, newNpcs };
