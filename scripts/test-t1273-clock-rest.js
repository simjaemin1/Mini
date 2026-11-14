#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1273-clock-rest.js — 켬 갈래에 남은 벽시계 칸 셋 · 단위 판 밖 `_t1253Now()` 자리 여섯 (T1273 · T1268 회부 2 · 4 · 2026-11-11) ==========
//
// ★왜 [T1268 회부 2] 캐러밴 `departAt` · `arriveAt` · `nomPxMs` 는 켬(`T1253_CLOCK_FIX` 기본)에서도 벽시계(인수 `now`)로 적힌다
//   (`spawnCaravanBody` · 귀환 출발 `startReturnLeg` · `_xzMakeBody` · 경계 걷기 `_xzWalkToBorder` …) · `_t1034Pack` 이 저장에 싣는다.
//   결과(곳간 · 몸 자리 · 저장 바이트 · 클라 그림)에 닿는지 재는 자가 없었다.
//   [T1268 회부 4] `_t1253Now()` 읽는 자리 11곳 중 여섯(`spawnCaravanBody` 셋 · `_caravanSyncOne` 도착 머묾 끝 · `_xzMakeBody` · `marketVillages` 그림)은
//   내보낸 문이 없어 단위 판 밖이었다 — 이 카드가 문을 내보냈다(`__labProbe._caravanBodyProbe` 의 `spawn` · `syncOne` · `xzMakeBody` · 값 무변 ·
//   `marketVillages` 는 이미 모듈 내보내기).
//
// ★증명 꼴 = T1268 그대로 — 판정 사본 0(운영 함수를 그대로 부른다). 한 판을 두 번: A = 벽시계가 곧게 · B = 걸음마다 `Date.now()` 에 엉뚱한 덧셈
//   (1970년 첫 몇 초 ~ 3000년 근처 · 13가지 · 차례 고정)과 econ 날 원점(`state.epoch`)을 같은 만큼 옮긴다. econ 상태(world.day · dayMs · 그날 몫)는 A 와 같다.
//   존 틱 꼴: 하루 끝 → econ 밀림(1.5초) → 마감(1.5초 · 이때 몸 틱은 쉰다 — 운영 `onGameTick` 그대로 · 장마당 그림은 돈다) → 마감 끝 경계 틱(`_t1253Edge`) → 다음 날.
//   판 셋: car(몸 세우기 · 장 마당 몸 · 늦은 장 · 도착 동기 · 다시 뜬 판 복원) · xz(이웃 존 몸 · 경계 칸까지 걷고 민다) · mk(장마당 그림 `marketVillages`).
//
// 지키는 것:
//   ⓪ 글자 — 내보낸 문 셋 · 미끼 자리가 소스에 꼭 한 번 · `_t1253Now()` 읽는 여섯 자리가 그 함수에 있다
//   ① 켬(기본) — 판 셋이 벽시계 흔들림에 바이트 같음 + 전제(몸이 실제로 걸었다 · 머묾이 끝나 귀환 · 늦은 장 몸은 선 자리에서 귀환 · 경계 칸에 닿아 밀었다 · 장마당이 섰다 졌다)
//   ② 끔(`T1253_CLOCK_FIX=0`) — 같은 흔들림에 판 셋이 갈린다(자명 통과 금지)
//   ③ ★남은 벽시계 칸 셋(+ T772 `_t661.t0`)이 결과에 닿나 —
//      글자: 세 칸을 읽는 함수 표(고정 · 새로 읽는 이가 생기면 빨강) · 몸 틱의 읽기는 T1182 몸 줄 뒤(종전 페이싱)뿐 · 경계 기다림 상한(`until`)은 `!body._t1182` 뒤에서만 · 다른 파일(server · sim · public) 0
//      움직임: 켬 판에서 세 칸을 실제로 읽은 함수(접근자 셈) ⊆ {저장 `_t1034Pack` · 세 칸끼리 셈하는 쓰기 · 경계 기다림 상한} ·
//             세 칸(+ `_t661.t0`)에 걸음마다 독(NaN · ±1e300 · 0 · …)을 넣어도 판 셋 결과(몸 자리 · 단계 · 머묾 끝 · 걸음 시계 · 경계 넘김 · 장마당) 바이트 같음 ·
//             저장 바이트(`_t1034Pack` → JSON)가 흔들림에 갈리는 칸 = 세 칸 + `at`(+ `T.t0`) 뿐(정보 — 되살린 뒤 결과는 위 독 판이 잰다)
//   ④ ★미끼 — `server/villages.js` 사본(아이 프로세스 안 · 실을 때 글자 한 자리만 바꿈 · 파일 무변):
//      자리 여섯 각각 `_t1253Now()` → 벽시계(인수 `now` · `Date.now()`) ⇒ 그 판이 흔들림에 갈린다 ·
//      세 칸 읽기 미끼 둘(몸 틱이 T1182 몸 줄을 건너 종전 페이싱으로 · 몸 걸음이 명목 상한 `nomPxMs` 를 읽음) ⇒ 독 판이 갈린다 — 잡은 수 ○/○ 를 끝 줄에 적는다.
//   ⑤ ★[T1282 · T1273 회부 2 · 3 · 4] 켬 갈래에 남은 두 시계 축 섞임 셋 — 고친 뒤 0:
//      mg 판(장마당 마감 틈): 마감을 운영 차례 그대로 연다(경계에서 `lastGameDay` ↑ · `tickJobs` · 닫는 날 적기 `closeOpen` → econ 머리 앞 틈 0.7초 → econ 머리 `world.day` ↑ → 마감 끝 경계 틱) ·
//         그날 진 장이 그림(`marketVillages`)에 다시 든 틱 수 = 0 · 이튿날 새 장은 선다(대조) · 흔들림 A ↔ B 바이트 같음
//      lg 판(`_xzMakeBody` 걸음 날 수): 같은 econ 상태(econ 밀림 · 머리 앞 마감 · 머리 뒤 마감 · 마감 끝 경계 틱)에서 벽시계만 econ 보다 0 ~ 0.97일 앞선 몸 60 —
//         `legDays`(= 길 ÷ `pxPerDay`)가 벽시계 앞섬에 갈린 몸 수 = 0 · 다 econ 날 수(받을 경계 − 닫는 날 끝)와 같다
//      t0 판(`startReturnLeg` T772 `_t661.t0`): 머묾 끝 귀환 몸 26 — 흔들림 A ↔ B 에서 `t0` 가 갈린 몸 수 = 0 · `t0` = 머묾 끝(econ 날 시계 축)
//   ⑥ ★[T1282] 미끼 넷 — 고친 줄 하나씩 종전 글자로 되돌린 사본(마감 중 시계 `D × 하루` · `legDays` 벽시계 `now` · `t0` 벽시계 `now` · 닫는 날 적기 없음) ⇒ 그 판이 빨강.
//      종전 셋을 한꺼번에 되돌린 사본이 "고치기 전" 수다(보고 T1282 첫 줄 ○ → 0 의 ○).
//   ⑦ ★[T1289 · T1282 회부 3] 마감 틈의 `econDayToMs` 앵커 — gp 판: 마감을 운영 차례로 열고(경계 → 닫는 날 적기 → econ 머리 앞 틈) 틈 틱마다
//      틈에 불리는 경계 읽기 다섯(`econDayToMs(D)` · `econDayToMs(D + 1)` · 기온 시계 `econDayT` · 달력 경계 `t728CalNext` · 걸음 날 수의 '지금' `_t1282Wall`)이
//      econ 머리 뒤 정렬(= 닫는 날의 끝 · 지난 경계)과 다른 (틱 × 자리) 수 = 0 · 기온 시계가 거꾸로 간 틱 = 0 · 흔들림 A ↔ B 바이트 같음
//   ⑧ ★[T1289 · T1273 회부 1] 캐러밴 세 칸(`departAt` · `arriveAt` · `nomPxMs`) = econ 날 시계 축 — car · xz 판 걸음마다 세 칸이 흔들림 A ↔ B 에 갈린 몸-걸음 = 0 ·
//      몸 세우기 도착 = econ 날 경계(d × 하루) · 저장 바이트가 흔들림에 갈리는 칸 = `at` 하나(③ 마지막 줄 — T1289 가 고친 단언)
//   ⑨ ★[T1289 · T1282 회부 5] 저장 축 표지 — 판 둘(sv 저장 · ld 되살림 · 다른 프로세스 · 다른 손잡이)로 머묾 끝 · 귀환 보간이 되살린 판에서 축을 섞나:
//      켬 저장 → 켬 · `T762_CARAVAN_BODY=0` · 끔 / 표지 없는 옛 켬 저장 → 켬 / 끔 저장 → 켬 · 끔 — 머묾이 저장한 econ 순간에 끝나지 않은 몸 · 귀환 보간 몫이 갈린 몸 = 0
//   ⑩ ★[T1289] 미끼 — 틈 갈래 하나를 종전 축으로(G1) · 세 칸 자리 하나를 종전 벽시계로(F1 · F2 · F3) · 저장 축 표지를 지움(X1) · 되살림 축 옮김 없음(X2) ⇒ 그 판이 빨강.
//      X2 사본이 ⑨ 의 "고치기 전" 수다(되살림이 축을 안 옮기던 종전 · 표지도 무의미).
//
// 실행: node scripts/test-t1273-clock-rest.js   (존 안 띄움 · 아이 프로세스 열 · 몇 초)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
// ── 미끼 표 — [이름 · 판(갈려야 할 것) · 바꿀 글자(소스에 꼭 한 번) · 바꾼 글자] ───────────────────
//   판 'car' · 'xz' · 'mk' = 흔들림 A ↔ B 갈림 · 'tf' = 독 판(독 없음 ↔ 독) 갈림
const BAITS = [
  ['S1 몸 세우기 걸음 원점 econ → 인수 now', 'car', '_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? _t1253Now() : now, pinHunger: p.hunger', '_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? now : now, pinHunger: p.hunger'],
  ['S2 장 마당 몸 머묾 끝 econ → 인수 now', 'car', ': (T1253_CLOCK_FIX ? _t1253Now() : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC; if (T1145_XY_COLS) BC.w(p, pts[0].x', ': (T1253_CLOCK_FIX ? now : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC; if (T1145_XY_COLS) BC.w(p, pts[0].x'],
  ['S3 늦은 장 견줌(T775) econ → 인수 now', 'car', 'body.lingerUntil <= (T1253_CLOCK_FIX ? _t1253Now() : now)) { startReturnLeg(body, now);', 'body.lingerUntil <= (T1253_CLOCK_FIX ? now : now)) { startReturnLeg(body, now);'],
  ['S4 도착 동기 머묾 끝 econ → 인수 now', 'car', 'body.lingerUntil = ((T1253_CLOCK_FIX && body._t1182) ? _t1253Now() : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC;', 'body.lingerUntil = ((T1253_CLOCK_FIX && body._t1182) ? now : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC;'],
  ['S5 이웃 존 몸 걸음 원점 econ → 인수 now', 'xz', '_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? _t1253Now() : now, pinHunger: N.p.hunger', '_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? now : now, pinHunger: N.p.hunger'],
  ['S6 장마당 그림 econ → Date.now()', 'mk', 'const now = (T1253_CLOCK_FIX && T762_CARAVAN_BODY) ? _t1253Now() : Date.now();', 'const now = (T1253_CLOCK_FIX && T762_CARAVAN_BODY) ? Date.now() : Date.now();'],
  ['F1 몸 틱이 T1182 몸 줄을 건넘(종전 페이싱이 세 칸을 읽는다)', 'tf', 'if (body._t1182) { _t1182Move(body,p,now,dtMs); continue; }', 'if (false) { _t1182Move(body,p,now,dtMs); continue; }'],
  ['F2 몸 걸음이 명목 상한(`nomPxMs`)을 읽음', 'tf', 'const blocked=_t1182Walk(body,p,Math.min(body.len,body.prog+_t1182Step(dtMs)),dtMs);', 'const blocked=_t1182Walk(body,p,Math.min(body.len,body.prog+Math.min(_t1182Step(dtMs),body.nomPxMs*4*dtMs)),dtMs);'],
];
//   세 칸을 읽는 함수 표(글자 · 주석 뺀 소스) — 갈래 = 왜 결과에 안 닿나(③ 글자 · 정보). 새로 읽는 함수가 생기거나 수가 바뀌면 빨강(분류를 다시 한다).
const READERS = {
  _t1034Pack: [3, '저장 — 메타 행 곁 칸(되살린 몸은 `_t1034Apply` 가 세 칸에 되쓰기만)'],
  _t1034Apply: [1, '되살림 T1182 아닌 갈래 상한(`at ≤ 실은 자리` 라 T1182 몸엔 안 걸린다)'],
  spawnCaravanBody: [1, '세 칸끼리(`nomPxMs = len ÷ (arriveAt − now)`)'], startReturnLeg: [2, '세 칸끼리'], isolateCaravanReturn: [1, '세 칸끼리'], _t1136Isolate: [1, '세 칸끼리'],
  _caravanSyncOne: [1, '세 칸끼리(재라우팅)'], _xzMakeBody: [1, '세 칸끼리'], _xzStartReturnLeg: [1, '세 칸끼리'], _xzIsolate: [1, '세 칸끼리'], _xzAfterSend: [3, '세 칸끼리(되돌림)'],
  _xzWalkToBorder: [4, '세 칸끼리(경계 칸까지 명목 빠르기)'], _xzSend: [1, '경계 기다림 상한 `until`(`!body._t1182` 몸만 읽는다)'],
  _t661Vis: [1, '종전 보간(T1182 몸은 안 부른다)'], tickCaravanBodies: [6, '종전 페이싱(T1182 몸 줄 뒤)'],
  xzonePerf: [5, '`/perf` 안 문(관측)'], t1034Peek: [3, '`/perf` 안 문(관측)'],   // ★[T1300] 3 → 5 · 1 → 3 — 관측 칸 축 표지 · 벽시계 ms(`_t1300Obs` 인수 `departAt` · `arriveAt` — 읽기만 · 켬만)
  _t1289Leg: [1, '세 칸끼리(★[T1289] 켬 · T1182 몸 = econ 날 시계 축 `nomPxMs = len ÷ (arriveAt − 출발)`)'],   // ★[T1289] 새 줄 — 세 칸을 적는 자리(읽기 = 같은 줄의 `arriveAt`)
  _warEnsureBody: [2, '전쟁 몸(캐러밴 아님)'], _warPaceCommander: [2, '전쟁 몸'], _warSetupReturn: [1, '전쟁 몸'], _warPaceReturn: [2, '전쟁 몸'],
};
//   켬 판에서 실제로 읽어도 되는 함수(접근자 셈) — 저장 · 세 칸끼리 · 경계 기다림 상한
const READ_OK = new Set(['_t1034Pack', 'spawnCaravanBody', 'startReturnLeg', '_caravanSyncOne', '_xzMakeBody', '_xzWalkToBorder', '_xzSend', '_xzAfterSend', '_xzStartReturnLeg', '_t1289Leg']);   // ★[T1289] `_t1289Leg` = 세 칸끼리 셈(위 표)
const F3 = ['departAt', 'arriveAt', 'nomPxMs'];
//   ★[T1282] 미끼 — 고친 줄을 종전 글자로(판 'mg' · 'lg' · 't0' = ⑤ 의 그 판이 빨강 · 0 이 아니게 된다)
const MIX_BAITS = [
  ['K1 마감 중 econ 날 시계 = 그날 머리(종전 `D × 하루`)', 'mg', 'if (state.tickJobs || state._t731 || state._t1253Edge) return (state._t1282D === D ? D + 1 : D) * M;', 'if (state.tickJobs || state._t731 || state._t1253Edge) return D * M;'],
  ['K2 `_xzMakeBody` 걸음 날 수 econ → 벽시계 `now`(종전)', 'lg', 'Math.round((arriveAt - (T1253_CLOCK_FIX ? _t1282Wall() : now)) / state.dayMs)', 'Math.round((arriveAt - (T1253_CLOCK_FIX ? now : now)) / state.dayMs)'],
  ['K3 `startReturnLeg` 귀환 보간 t0 econ → 벽시계 `now`(종전)', 't0', 'const _t0n = (T1253_CLOCK_FIX && body._t1182) ? _t1253Now() : now;', 'const _t0n = (T1253_CLOCK_FIX && body._t1182) ? now : now;'],
  ['K4 닫는 날 적기 없음(`_t1282Open` 무동작)', 'mg', 'function _t1282Open() { state._t1282D = state.world ? (state.world.day | 0) : 0; }', 'function _t1282Open() { }'],
];
//   ★[T1289] 미끼 — 판 'gp' · '3f' · 'ax' = ⑦ ⑧ ⑨ 의 그 판이 빨강
const AXIS_BAITS = [
  ['G1 마감 틈 `econDayToMs` 정렬 → 종전 `world.day`(틈 갈래 하나를 종전 축으로)', 'gp', 'state._t1253Edge)) ? state.world.day + 1 : state.world.day;', 'state._t1253Edge)) ? state.world.day : state.world.day;'],
  ['F1 몸 세우기 세 칸 econ → 벽시계(종전)', '3f', 'if (T1253_CLOCK_FIX && body._t1182) _t1289Leg(body, (outbound ? c.arriveDay : c.returnArriveDay) * state.dayMs);', 'if (false) _t1289Leg(body, (outbound ? c.arriveDay : c.returnArriveDay) * state.dayMs);'],
  ['F2 이웃 존 몸 세 칸 econ → 벽시계(종전)', '3f', 'if (T1253_CLOCK_FIX && body._t1182) _t1289Leg(body, _t1289ToE(arriveAt));', 'if (false) _t1289Leg(body, _t1289ToE(arriveAt));'],
  ['F3 경계 칸 걷기 econ → 인수 벽시계(종전)', '3f', 'if (T1253_CLOCK_FIX && body._t1182) now = _t1253Now();', 'if (false) now = _t1253Now();'],
  ['X1 저장 축 표지 지움', 'ax', "...(T1253_CLOCK_FIX ? { ax: body._t1182 ? 'e' : 'w' } : {}),", '...({}),'],
  ['X2 되살림 축 옮김 없음(종전)', 'ax', '  if (!S || (!S.ax && !T1253_CLOCK_FIX && !T1300_OLD_AX)) return S;', '  return S;'],   // ★[T1300] 첫 줄 글자가 바뀌었다(손잡이 `T1300_OLD_AX` 하나 더) — 미끼 뜻 그대로(되살림 축 옮김 없음)
  //   (판 셈 전용 · 미끼 표 ⑩ 밖) G1 과 같이 실어 "T1289 앞 글자"를 만든다 — `_t1282Wall` 이 틈에 하루를 빼던 T1282 보정
  ['G0 `_t1282Wall` 종전 보정(T1282 글자)', '-', '  return econDayToMs(D) + (_t1253Now() - D * M);', '  return econDayToMs(D) - ((!!(state.tickJobs || state._t731 || state._t1253Edge) && state._t1282D === D) ? M : 0) + (_t1253Now() - D * M);'],
];
//   ★[T1300] 미끼 — 판 'ax' = ⑨ 행렬 · 'xa' = ⑪ 아이 판(가리기 · 관측 칸) — 그 판이 빨강
const T1300_BAITS = [
  ['Y1 표지 없는 칸 가리기 = T1289 거리 규칙(저장 순간 `at` 에 더 가까우면 벽시계)', 'xa', "const f = S.ax || (T1300_OLD_AX ? (v <= eMax ? 'e' : 'w') :", "const f = S.ax || (false ? (v <= eMax ? 'e' : 'w') :"],
  ['Y2 끔 판 가리기 없음(T1289 글자 — 끔 · 표지 없음 = 무동작)', 'ax', '  if (!S || (!S.ax && !T1253_CLOCK_FIX && !T1300_OLD_AX)) return S;', '  if (!S || (!S.ax && !T1253_CLOCK_FIX)) return S;'],
  ['Y3 관측 칸이 축 표지를 안 본다(econ 칸을 벽시계 ms 로 그대로)', 'xa', "w = Number.isFinite(v) ? (ax === 'e' ? _t1289ToB(v) : v) : null;", "w = Number.isFinite(v) ? (false ? _t1289ToB(v) : v) : null;"],
];
const ROLE = process.argv[2];

// ══ 아이: 판 셋(A · B · 독) 돌고 결과 한 줄 ═══════════════════════════════════════════════
if (ROLE === '--child') {
  //   미끼 — 숫자 = `BAITS` 하나 · 'm0,m1,…' = ★[T1282] `MIX_BAITS` 여럿(한꺼번에)
  const spec = process.argv[3] != null && process.argv[3] !== '-' ? String(process.argv[3]) : '';
  const want = process.argv[4] || 'shake';   // 'shake' = A · B 흔들림 · 'tf' = 접근자 셈 + 독 판 · 'tfp' = 독 판만(미끼) · 'mix' = ★[T1282] ⑤ 판 셋 · ★[T1289] 'gp' ⑦ · '3f' ⑧ · 'sv' · 'ld' ⑨(저장 · 되살림 — 파일 = argv[5])
  const swaps = spec ? spec.split(',').map((t) => (t[0] === 'm' ? MIX_BAITS[+t.slice(1)] : t[0] === 'a' ? AXIS_BAITS[+t.slice(1)] : t[0] === 'y' ? T1300_BAITS[+t.slice(1)] : BAITS[+t])) : [];   // ★[T1289] 'a…' = `AXIS_BAITS` · ★[T1300] 'y…' = `T1300_BAITS`
  if (swaps.length) {   // 미끼 — 이 아이가 실을 때만 villages.js 글자 한 자리를 바꾼다(파일은 안 만진다)
    const old = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      if (f !== VFILE) return old(m, f);
      let src = fs.readFileSync(f, 'utf8');
      for (const [, , from, to] of swaps) {
        const n = src.split(from).length - 1;
        if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ err: `미끼 자리 ${n}곳` }) + '\n'); process.exit(3); }
        src = src.replace(from, to);
      }
      m._compile(src, f);
    };
  }
  const mute = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
  //   접근자 셈(tf 판만) — 세 칸을 Object.prototype 의 접근자로 두어 몸에 처음 쓸 때부터 읽고 쓴 함수를 센다(값은 숨은 칸 · 행동 무변)
  const census = { r: {}, w: {} }, HID = new WeakMap();
  const who = () => { const lim = Error.stackTraceLimit; Error.stackTraceLimit = 4; const L = new Error().stack.split('\n'); Error.stackTraceLimit = lim; for (let i = 1; i < L.length; i++) { if (L[i].indexOf(VFILE) < 0) continue; const m = L[i].match(/at (?:Object\.|new )?([\w$]+)(?: \[as [\w$]+\])? \(/); return m ? m[1] : '?'; } return '(밖)'; };
  if (want === 'tf') for (const k of F3) Object.defineProperty(Object.prototype, k, { configurable: true,
    get() { const f = who(); census.r[f] = (census.r[f] || 0) + 1; const o = HID.get(this); return o ? o[k] : undefined; },
    set(v) { const f = who(); census.w[f] = (census.w[f] || 0) + 1; let o = HID.get(this); if (!o) HID.set(this, o = Object.create(null)); o[k] = v; } });
  const V = require(VFILE), E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const P = V.__labProbe._caravanBodyProbe, H = V.__p3Bind({}), S = H.state;
  const realNow = Date.now;
  let CLK = 0; Date.now = () => CLK;
  const sha = (x) => require('crypto').createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  const R9 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toPrecision(15) : v);
  //   판 시계 — 하루 4분(M) · 벽시계 좌표 `wall` 0 = 하루 끝 60초 전(DAY_END = 60초) · 판은 그날 30초째(wall −150초)에서 시작
  const E0 = 1.6e12, M = 240000, G0 = 4800, D0 = 100, LEFT = 60000, BASE = E0 + G0 * M + (M - LEFT), DAY_END = LEFT, W0 = -150000;
  const OFF = [3.1e11, -7.7e11, 9.9e12, -1.2e9, 4.4e13, 2.5e10, -1.6e12, 7e12, 1.3e9, -9e11, 5e6 - BASE, 3.6e6 - BASE, -BASE + 1];
  const gaps = [33, 34, 33, 50, 17, 80, 33, 21, 66, 33];
  const POISON = [NaN, -1e300, 1e300, 0, -7.5e12, 3.3e15, 1e-300, -1];
  let F3LOG = null;   // ★[T1289] ⑧ — 켜면 몸 걸음마다 세 칸을 모은다
  function world(mode, poison, pend) {   // ★[T1282] pend = 마감을 운영 차례로 연다(경계 → 닫는 날 적기 → econ 머리 앞 틈 0.7초 → econ 머리) · 없으면 종전 꼴(경계에서 날을 올린 뒤 마감)
    const w = mute(() => E2.createWorldV2({ seed: 7, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0 }));
    const [a, b] = w.villages; w.day = D0; w.caravans = [];
    const vA = { dbId: 1, name: '가', ccx: 10, ccy: 10, npcPids: [], econ: a }, vB = { dbId: 2, name: '나', ccx: 40, ccy: 22, npcPids: [], econ: b };
    const coarse = [{ x: 336, y: 336 }, { x: 2400, y: 336 }, { x: 2400, y: 1500 }, { x: 4200, y: 1500 }, { x: 1296, y: 720 }];
    let nid = 0;
    const players = new Map(), npcs = new Map();
    Object.assign(S, { world: w, ready: false, dayMs: M, lastGameDay: G0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, roads: null, xzone: null, villages: [vA, vB],
      byEcon: new Map([[a, vA], [b, vB]]), routeCache: new Map([['1_2', coarse]]), walkCache: new Map([['1_2', { coarse, pts: coarse }]]), _t1034Saved: null, _t775: null,
      deps: { players, npcs, moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; }, broadcast: () => {},
        spawnNpc: (o) => { const p = { pid: 'n' + (++nid), x: o.x, y: o.y, hp: 100, hunger: 100, thirst: 100, name: o.name }; players.set(p.pid, p); npcs.set(p.pid, p); return p; },
        xzonePost: () => new Promise(() => {}) },
      caravanBodies: new Map(), _carTickAt: undefined });
    let k = 0, wall = W0, phase = 'day';
    const setClock = () => { const o = mode === 'B' ? OFF[(k * 5 + 3) % OFF.length] : 0; CLK = BASE + wall + o; S.epoch = E0 + o; };
    setClock();
    const body = (id) => S.caravanBodies.get(id);
    const ent = (pid) => { const q = players.get(pid); return q ? [R9(q.x), R9(q.y)] : null; };
    const snapBodies = (tag, out) => {
      if (F3LOG) for (const [id, bd] of [...S.caravanBodies].sort((x, y) => String(x[0]).localeCompare(String(y[0])))) F3LOG.push([tag, k, id, R9(bd.departAt), R9(bd.arriveAt), R9(bd.nomPxMs)]);   // ★[T1289] ⑧ 세 칸(따로 모은다 — 결과 줄 `tr` 은 그대로)
      for (const [id, bd] of [...S.caravanBodies].sort((x, y) => String(x[0]).localeCompare(String(y[0])))) {
        out.push([tag, k, id, bd.phase, R9(bd.prog), R9(bd.len), ent(bd.pid), (bd.escorts || []).map((e) => ent(e.pid)), R9(bd.lingerUntil), R9(bd._t1182At), bd._t1253N | 0,
          bd._xzWalked || null, !!bd._xzSendWait, !!bd._xzHanding]);
      }
    };
    const doPoison = () => {
      if (!poison) return;
      let j = k;
      for (const bd of S.caravanBodies.values()) { for (const f of F3) bd[f] = POISON[(j++) % POISON.length]; if (bd._t661 && bd._t661.t0 != null) bd._t661.t0 = POISON[(j++) % POISON.length]; }
    };
    //   한 걸음 — 벽시계를 민다 · 하루 끝 뒤 econ 밀림 · 마감(몸 틱 쉼 · 경계에서 날 넘김) · 마감 끝 경계 틱 · 그 밖엔 몸 틱(존 틱 머리의 `now`)
    const step = (bodies) => {
      wall += gaps[k % gaps.length]; k++; setClock();
      if (pend && phase === 'day' && wall >= DAY_END + 1500) { phase = 'pend'; S.lastGameDay++; S.tickJobs = [{}]; P.closeOpen(); }   // ★[T1282] `onGameTick` → `_openDayJobs` 머리(닫는 날 적기) — world.day 는 아직 닫는 날
      else if (pend && phase === 'pend' && wall >= DAY_END + 2200) { phase = 'close'; w.day++; }   // econ 머리(`world.day += 1`)
      else if (phase === 'day' && wall >= DAY_END + 1500) { phase = 'close'; w.day++; S.lastGameDay++; S.tickJobs = [{}]; }
      else if (phase === 'close' && wall >= DAY_END + 3000) { phase = 'next'; S.tickJobs = null; if (bodies) { S._t1253Edge = true; try { mute(() => P.tick(Date.now())); } finally { S._t1253Edge = false; } } return 'edge'; }
      if (bodies && !S.tickJobs) mute(() => P.tick(Date.now()));
      doPoison();
      return phase;
    };
    return { w, a, b, vA, vB, S, step, snapBodies, body, get k() { return k; }, get wall() { return wall; }, get phase() { return phase; } };
  }
  const packJson = () => { const pk = mute(() => P.pack()); return pk ? JSON.stringify(pk) : null; };
  const restoreAll = (G) => {   // 다시 뜬 판 — 메타 행 JSON(저장 바이트 그대로)에서 몸마다 되돌린다(`_t1034Apply`)
    const js = packJson(), b = JSON.parse(js).b;
    G.S._t1034Saved = new Map(Object.entries(b));
    for (const [id, bd] of G.S.caravanBodies) if (G.S._t1034Saved.has(String(id))) mute(() => P.restore(bd, Date.now()));
    return js;
  };
  const car = (id, from, to, st, x) => Object.assign({ id, from, to, trader: from.npcs[0], state: st, departDay: D0, arriveDay: D0 + (st === 'inbound' ? 0 : 2), returnArriveDay: D0 + 3, escort: 1, giveRes: 'wood', giveAmt: 5 }, x || {});

  // ── car 판: 몸 세우기(S1 · S2 · S3) · 도착 동기(S4) · 다시 뜬 판 복원 ─────────────────────
  function carRun(mode, poison) {
    const G = world(mode, poison), { a, b } = G, tr = [], ev = {};
    const spawn = (c) => { G.w.caravans.push(c); const r = mute(() => P.spawn(c, Date.now(), 16)); tr.push(['spawn', G.k, c.id, r]); G.snapBodies('s', tr); return r; };
    spawn(car(11, a, b, 'outbound'));                                   // S1 가는 길 몸(걸음 원점)
    spawn(car(40, a, b, 'outbound'));                                   // S4 도착 동기 몸(먼저 걸어 종점에 선다)
    G.step(true); G.step(true);
    spawn(car(12, b, a, 'inbound', { _mktD: D0 }));                     // S2 장 마당 몸 — 가 마을엔 장 기록이 없다(머묾 끝 = 지금 + 1게임시간)
    G.step(true);
    const c13 = car(13, a, b, 'inbound', { _mktD: D0 }); const rec = mute(() => P.openMarket(c13)); ev.mktEnd = rec && R9(rec.end); ev.mktOpenWall = G.wall;
    spawn(c13);                                                          // S3 장 끝 전에 선 장 마당 몸(머묾 = 장 끝)
    for (let j = 0; j < 4; j++) { G.step(true); const c = car(14 + j, a, b, 'inbound', { _mktD: D0 }); mute(() => P.openMarket(c)); spawn(c); }
    const early = [11, 12, 13].map((id) => G.body(id) && G.body(id).phase);
    let late = 0, syncAt = null, synced = false, restored = null, s12Back = false, s4Back = false, s4LingerEndPhase = null;
    while (G.phase !== 'next' || G.wall < DAY_END + 60000) {
      const ph = G.step(true);
      //   S3 늦은 장 — 장 끝(econ 날 시계)이 지난 뒤 선 장 마당 몸 13대(걸음 열세 칸 = 흔들림 13가지 다)
      if (late < 13 && ph === 'day' && G.wall > ev.mktOpenWall + 45000) { const c = car(20 + late, a, b, 'inbound', { _mktD: D0 }); mute(() => P.openMarket(c)); spawn(c); late++; }
      //   S4 — 하루 끝 5초 전에 econ 도착(장부가 inbound) · 동기가 머묾을 연다 · 머묾이 하루 경계를 넘는다
      if (!synced && ph === 'day' && G.wall >= DAY_END - 5000) { const c = G.body(40).c; c.state = 'inbound'; const S0 = { seen: new Set(), spawned: 0, arrived: 0, removed: 0 }; mute(() => P.syncOne(Date.now(), c, S0, 16)); synced = true; syncAt = [G.k, G.body(40).phase]; tr.push(['sync', G.k, S0.arrived]); }
      if (synced && s4LingerEndPhase == null && G.body(40).phase === 'inbound') s4LingerEndPhase = G.phase;
      if (G.body(12).phase === 'inbound') s12Back = true;
      if (G.body(40).phase === 'inbound' && G.body(40).prog > 500) s4Back = true;
      if (restored == null && G.phase === 'next' && G.wall >= DAY_END + 20000) { restored = restoreAll(G); G.snapBodies('restore', tr); }
      G.snapBodies(ph, tr);
    }
    const lateBack = [...Array(13)].filter((_, i) => { const bd = G.body(20 + i); return bd && bd.phase === 'inbound'; }).length;
    const earlyLinger = [13, 14, 15, 16, 17].filter((id) => G.body(id).lingerUntil === ev.mktEnd).length;
    return { h: sha(tr), n: tr.length, trace: tr, early, lateBack, earlyLinger, syncAt, s12Back, s4Back, s4LingerEndPhase, s1prog: R9(G.body(11).prog), s1len: R9(G.body(11).len), mktEnd: ev.mktEnd,
      pack: restored, bodies: G.S.caravanBodies.size };
  }
  // ── xz 판: 이웃 존 몸(S5) · 경계 칸까지 걷고 민다(세 칸을 읽는 `_xzWalkToBorder`) ───────────
  function xzRun(mode, poison) {
    const G = world(mode, poison), { a, b } = G, tr = [];
    const X = G.S.xzone = { st: { walkWait: 0, walkWaitLate: 0, sent: 0, sentOk: 0, crossArrive: 0, bodyOut: 0 }, track: new Map(), trace: [], retry: [], core: { splitNames: () => null } };
    const inPts = [{ x: 40, y: 700 }, { x: 900, y: 700 }, { x: 1296, y: 720 }];
    const px = { id: 'xz:nip:31', _xzPending: true, _push: 0, giveRes: 'wood', giveAmt: 3, escort: 1, state: 'outbound', from: { name: '저쪽', zone: 'nip', _xz: true }, to: b };
    mute(() => P.xzMakeBody('xz:nip:31', px, inPts.slice(), 'outbound', Date.now(), G.S.epoch + (G0 + 2) * M, b, { tribeId: 'xz_nip', tribeName: '저쪽' }));
    G.snapBodies('s', tr);
    for (let j = 0; j < 3; j++) G.step(true);
    const c32 = car(32, a, b, 'inbound', { _xzHome: { zone: 'nip' }, _xzBack: { ptLocal: { x: 50, y: 50 } } });
    mute(() => P.xzMakeBody('xz:nip:32', c32, [{ x: 1296, y: 720 }, { x: 1800, y: 900 }], 'inbound', Date.now(), G.S.epoch + (G0 + 3) * M, b, { tribeId: 'simvil_2', tribeName: '나', simVid: 2 }));
    G.snapBodies('s', tr);
    let sentAt = null, sends = [];
    while (G.phase !== 'next' || G.wall < DAY_END + 30000) {
      const ph = G.step(true);
      const b32 = G.body('xz:nip:32');
      //   경계 기록('return')이 나간다 — 몸이 경계 칸에 없으니 그 칸까지 걷게 하고 닿은 틱에 민다(T578 추신)
      if (sentAt == null && b32 && b32.prog >= b32.len - 0.5 && G.wall > -120000) { sentAt = G.k; mute(() => P.sendXz({ id: 32, kind: 'return', toZone: 'nip' }, G.S.lastGameDay, 0)); tr.push(['send', G.k, X.st.walkWait, X.st.sent]); }
      if (sends.length === 0 && X.st.sent > 0) sends.push(G.k);
      G.snapBodies(ph, tr); tr.push(['x', G.k, X.st.sent, X.st.walkWait]);
    }
    const b31 = G.body('xz:nip:31'), b32 = G.body('xz:nip:32');
    return { h: sha(tr), n: tr.length, trace: tr, sentAt, sentK: sends[0] == null ? null : sends[0], sent: X.st.sent, walked: b32 && b32._xzWalked, b31prog: R9(b31.prog), b31len: R9(b31.len), pack: packJson() };
  }
  // ── mk 판: 장마당 그림(S6 · `marketVillages` — 존이 틱마다 부르는 `_mktBroadcast` 의 그 줄) ───
  function mkRun(mode) {
    const G = world(mode, false), { a, b } = G, tr = [];
    G.S.ready = true;
    let seenA = 0, seenB = 0, seenClose = 0, flips = 0, last = '', opened = 0;
    const open = (c) => { mute(() => P.openMarket(c)); opened++; };
    while (G.phase !== 'next' || G.wall < DAY_END + 70000) {
      const ph = G.step(false);
      if (opened === 0 && G.k >= 3) open(car(51, a, b, 'inbound'));                          // 나 마을 장(그날 이른 때)
      if (opened === 1 && ph === 'day' && G.wall >= 30000) open(car(52, b, a, 'inbound'));     // 가 마을 장 — 하루 끝을 넘겨 선다(밀림 · 마감 동안 그대로)
      if (opened === 2 && ph === 'next' && G.wall >= DAY_END + 30000) open(car(53, a, b, 'inbound'));   // 이튿날 나 마을 새 장
      const m = V.marketVillages().join(',');
      if (m !== last) flips++; last = m;
      if (m.indexOf('10,10') >= 0) { seenA++; if (ph === 'close') seenClose++; }
      if (m.indexOf('40,22') >= 0) seenB++;
      tr.push([G.k, ph, m]);
    }
    return { h: sha(tr), n: tr.length, trace: tr, seenA, seenB, seenClose, flips, opened };
  }
  // ── ★[T1282] ⑤ 판 셋 ─────────────────────────────────────────────────────────────────
  //   mg 판 — 장마당 그림 마감 틈: 그날 진 장이 마감(econ 머리 앞) 틱에 다시 그려지나
  function mgRun(mode) {
    const G = world(mode, false, true), { a, b } = G, tr = [];
    G.S.ready = true;
    const shown = new Map(), gone = new Map();
    let redraw = 0, pendTicks = 0, opened = 0, seenNew = 0, closedBefore = 0;
    const open = (c) => { mute(() => P.openMarket(c)); opened++; };
    while (G.phase !== 'next' || G.wall < DAY_END + 70000) {
      const ph = G.step(false);
      if (opened === 0 && G.k >= 3) open(car(61, a, b, 'inbound'));                              // 나 마을 장 — 그날 이른 때 · 그날 안에 진다
      if (opened === 1 && ph === 'day' && G.wall >= -20000) open(car(62, b, a, 'inbound'));         // 가 마을 장 — 하루 끝 40초 전 · 하루 끝 20초 전에 진다
      if (opened === 2 && ph === 'next' && G.wall >= DAY_END + 5000) open(car(63, a, b, 'inbound'));   // 이튿날 나 마을 새 장(대조 — 선다)
      if (ph === 'pend') pendTicks++;
      const m = mute(() => V.marketVillages()), set = new Set();
      for (let i = 0; i + 1 < m.length; i += 2) set.add(m[i] + ',' + m[i + 1]);
      for (const vil of G.S.villages) {
        const key = vil.ccx + ',' + vil.ccy, rec = vil._mkt;
        if (set.has(key)) { if (gone.get(key) === rec) redraw++; shown.set(key, rec); if (ph === 'next' && rec && rec.d === D0 + 1) seenNew++; }
        else if (shown.get(key) === rec && rec) { if (gone.get(key) !== rec && ph === 'day') closedBefore++; gone.set(key, rec); }
      }
      tr.push([G.k, ph, m.join(',')]);
    }
    return { h: sha(tr), n: tr.length, trace: tr, redraw, pendTicks, opened, seenNew, closedBefore };
  }
  //   lg 판 — `_xzMakeBody` 걸음 날 수: econ 상태는 같고 벽시계만 앞선 몸들
  function lgRun() {
    const G = world('A', false, true), S = G.S, { b } = G, rows = [];
    const end = E0 + (G0 + 1) * M;   // econ 날 D0 의 끝(벽시계 경계 축 · 게임일 G0 + 1 머리)
    const px = (id) => ({ id, _xzPending: true, _push: 0, giveRes: 'wood', giveAmt: 3, escort: 0, state: 'outbound', from: { name: '저쪽', zone: 'nip', _xz: true }, to: b });
    const LEAD = [0, 0.3, 0.55, 0.8, 0.97].map((f) => Math.round(f * M));
    let n = 0;
    for (const ph of ['delay', 'pend', 'head', 'edge']) for (const lead of LEAD) for (const j of [1, 2, 3]) {
      S.world.day = D0; S.lastGameDay = G0; S.tickJobs = null; S._t1253Edge = false; S._t731 = null; S._t1282D = undefined; S.epoch = E0;
      if (ph !== 'delay') { S.lastGameDay = G0 + 1; S.tickJobs = [{}]; P.closeOpen(); }              // 마감을 연다(경계 · 닫는 날 적기)
      if (ph === 'head' || ph === 'edge') S.world.day = D0 + 1;                                        // econ 머리 뒤
      if (ph === 'edge') { S.tickJobs = null; S._t1253Edge = true; }                                   // 마감 끝 경계 틱
      CLK = end + lead;                                                                                 // 벽시계 = econ 날 끝 + 앞섬(econ 은 그 자리에 선다)
      const key = 'xz:nip:' + (++n), arr = end + j * M;                                                 // 받은 몸 꼴(`_xzBodyIn` — epoch + (보낸 경계 + 남은 날) × 하루)
      const bd = mute(() => P.xzMakeBody(key, px(key), [{ x: 40, y: 700 }, { x: 900, y: 700 }, { x: 1296, y: 720 }], 'outbound', Date.now(), arr, b, { tribeId: 'xz_nip', tribeName: '저쪽' }));
      rows.push([ph, lead, j, Math.round(bd.len / bd.pxPerDay), R9(mute(() => P.econNow()))]);
      S.caravanBodies.delete(key);
    }
    S._t1253Edge = false; S.tickJobs = null;
    const split = rows.filter((r) => r[3] !== r[2]).length, bad = rows.filter((r) => r[4] !== (D0 + 1) * M).length;
    return { rows, n: rows.length, split, econAtEnd: rows.length - bad };
  }
  //   t0 판 — `startReturnLeg` 귀환 보간 시작(T772 `_t661.t0`): 머묾 끝 귀환 몸이 흔들림에 갈리나
  function t0Run(mode) {
    const G = world(mode, false), { a, b } = G, t0 = {};
    let made = 0;
    while (G.phase !== 'next' || G.wall < DAY_END + 30000) {
      const ph = G.step(true);
      //   장 기록 없는 장 마당 몸(S2 꼴 — 머묾 끝 = 지금 + 1게임시간) 스물여섯 — 걸음마다 한 대(흔들림 13가지를 두 바퀴) · 마지막 몇은 머묾이 하루 끝 · 마감을 넘는다
      if (made < 26 && ph === 'day' && G.wall >= -100000 + made * 6000) { const c = car(70 + made, b, a, 'inbound', { _mktD: D0 }); G.w.caravans.push(c); mute(() => P.spawn(c, Date.now(), 16)); made++; }
      for (const [id, bd] of G.S.caravanBodies) if (bd._t661 && bd._t661.t0 != null && !(id in t0)) t0[id] = [R9(bd._t661.t0), R9(bd.lingerUntil), ph];
    }
    return { t0, made, n: Object.keys(t0).length, eqLinger: Object.values(t0).filter((r) => r[0] === r[1]).length };
  }
  // ── ★[T1289] ⑦ gp 판 — 마감 틈의 경계 읽기(틈에 불리는 자리 다섯)가 econ 머리 뒤 정렬과 같나 ─────────────
  function gpRun(mode) {
    const G = world(mode, false, true), S = G.S, tr = [];
    let bad = 0, pendTicks = 0, back = 0, lastT = null;
    const by = {};
    while (G.phase !== 'next' || G.wall < DAY_END + 10000) {
      const ph = G.step(false), e0 = S.epoch;
      const T = mute(() => V.econDayT(Date.now())), cal = mute(() => V.t728CalNext());
      const row = [G.k, ph, R9(P.econDay(D0) - e0), R9(P.econDay(D0 + 1) - e0), R9(T), cal ? R9(cal.calendarAt - e0) : null, R9(P.wall() - e0)];
      if (lastT != null && T < lastT - 1e-9) back++;
      lastT = T;
      if (ph === 'pend') {   // 틈 — 앵커는 G0 + 1(새 날) · world.day = D0(닫는 날): 머리 뒤 정렬 = 닫는 날의 끝 = 게임일 G0 + 1 머리(지난 경계)
        pendTicks++;
        const want = [G0 * M, (G0 + 1) * M, D0 + 1, (G0 + 1) * M, (G0 + 1) * M];
        const got = [row[2], row[3], row[4], row[5], row[6]], names = ['econDayToMs(D)', 'econDayToMs(D+1)', 'econDayT', 't728CalNext', '_t1282Wall'];
        for (let i = 0; i < want.length; i++) if (!(Math.abs(got[i] - want[i]) < 1e-6)) { bad++; by[names[i]] = (by[names[i]] || 0) + 1; }
      }
      tr.push(row);
    }
    return { h: sha(tr), n: tr.length, trace: tr, bad, by, pendTicks, back };
  }
  // ── ★[T1289] ⑧ 3f 판 — 세 칸이 흔들림에 갈리나(car · xz 판 그대로 · 세 칸만 따로 모은다) ─────────────
  function f3Run(mode) {
    F3LOG = []; const c = carRun(mode, false); const fc = F3LOG;
    F3LOG = []; const x = xzRun(mode, false); const fx = F3LOG; F3LOG = null;
    return { car: fc, xz: fx, h: sha([fc, fx]), n: fc.length + fx.length };
  }
  // ── ★[T1289] ⑨ sv · ld 판 — 저장(이 손잡이로) → 되살림(다른 프로세스 · 다른 손잡이) ─────────────────
  //   몸 둘: 82 = 먼저 닿아 머물다 귀환을 걷는 몸(`_t661.t0` · `arriveAt`) · 81 = 저장 순간 머무는 몸(남은 머묾 ≈ 6초 · `lingerUntil`)
  function svRun() {
    const G = world('A', false), S = G.S, { a, b } = G;
    const c1 = car(81, a, b, 'outbound'), c2 = car(82, a, b, 'outbound');
    for (const c of [c1, c2]) { G.w.caravans.push(c); mute(() => P.spawn(c, Date.now(), 16)); }
    const arrive = (c) => { c.state = 'inbound'; const S0 = { seen: new Set(), spawned: 0, arrived: 0, removed: 0 }; mute(() => P.syncOne(Date.now(), c, S0, 16)); };
    let k2 = false, k1 = false, saved = null;
    while (!saved && G.k < 8000) {
      G.step(true);
      if (!k2 && G.wall >= -140000) { arrive(c2); k2 = true; }
      if (!k1 && G.wall >= -132000) { arrive(c1); k1 = true; }
      const b1 = G.body(81), b2 = G.body(82);
      if (k1 && b1.phase === 'linger' && b2.phase === 'inbound' && G.wall >= -127000) {
        const knob = process.env.T1253_CLOCK_FIX !== '0', en = mute(() => P.econNow()), wn = Date.now();
        const pk = JSON.parse(packJson()), B1 = pk.b['81'], B2 = pk.b['82'];
        //   기대 — 머묾 끝의 econ 순간 · 귀환 보간 몫(저장한 판의 제 축으로 셈)
        const lgE = knob ? B1.lg : en + (B1.lg - wn);
        const fExp = knob ? (en - B2.T.t0) / (B2.aa - B2.T.t0) : (wn - B2.T.t0) / (B2.aa - B2.T.t0);
        //   표지 없는 옛 켬 저장(T1289 앞 꼴) — 표지를 지우고 출발 · 도착을 벽시계 경계 축으로(머묾 끝 · t0 는 그때도 econ 날 시계)
        const old = JSON.parse(JSON.stringify(pk)); for (const id in old.b) { const o = old.b[id]; delete o.ax; if (knob) { o.da = P.toB(o.da); o.aa = P.toB(o.aa); } }
        //   ★[T1300] T1258 ~ T1281 시대 꼴 — 위 옛 꼴에서 귀환 보간 시작 `T.t0` 도 벽시계(T1282 가 econ 날 시계로 옮기기 전) · 머묾 끝만 econ 날 시계
        const old58 = JSON.parse(JSON.stringify(old)); for (const id in old58.b) { const o = old58.b[id]; if (knob && o.T && o.T.t0 != null) o.T.t0 = P.toB(o.T.t0); }
        saved = { knob, wall: G.wall, k: G.k, clk: Date.now(), econ: en, pack: pk, packOld: old, packOld58: old58, lgE, fExp,
          cars: G.w.caravans.map((c) => ({ id: c.id, state: c.state, departDay: c.departDay, arriveDay: c.arriveDay, returnArriveDay: c.returnArriveDay })), ax: [B1.ax || null, B2.ax || null] };
      }
    }
    return saved || { err: '저장 순간 못 섬' };
  }
  // ── ★[T1300] ⑪ xa 판 — 표지 없는 칸 가리기(econ 날이 큰 판 · 보통 판) · 관측 칸(축 표지 · 벽시계 ms · ISO) ─────────────
  function xaRun() {
    const G = world('A', false), S = G.S, { a, b } = G, knob = process.env.T1253_CLOCK_FIX !== '0';
    //   (i) 표지 없는 옛 켬 저장 칸 넷(머묾 끝 · t0 = econ 날 시계 · 출발 · 도착 = 벽시계 경계 축) — 되살린 판 축에서 같은 econ 순간인가(벽시계 축 = `toE`)
    const cls = (Dx) => {
      const D0x = S.world.day; S.world.day = Dx;   // 앵커(lastGameDay)는 그대로 — 경계 벽시계는 그대로 · econ 날 시계 값만 커진다
      try {
        const en = mute(() => P.econNow()), at = Date.now();
        const want = { lg: en + 5000, da: en - 1000, aa: (Dx + 1) * M, t0: en - 1000 };
        const rec = { lg: want.lg, da: mute(() => P.toB(want.da)), aa: mute(() => P.toB(want.aa)), T: { t0: want.t0 }, at };
        const r = mute(() => P.axIn(JSON.parse(JSON.stringify(rec)), true));
        const back = (v) => (knob ? v : mute(() => P.toE(v)));
        const d = { lg: R9(back(r.lg) - want.lg), da: R9(back(r.da) - want.da), aa: R9(back(r.aa) - want.aa), t0: R9(back(r.T.t0) - want.t0) };
        return { D: Dx, ratio: +(en / at).toFixed(4), ax: r.ax, d, bad: Object.values(d).filter((x) => !(Math.abs(x) <= 2)).length };
      } finally { S.world.day = D0x; }
    };
    const at0 = Date.now(), small = cls(D0), big = cls(Math.ceil(0.6 * at0 / M));   // 보통 판(econ 값 ≪ 벽시계) · 큰 판(econ 값 > 저장 순간 벽시계의 반 — T1289 거리 규칙이 틀리는 판)
    //   (ii) 관측 칸 — 장부 몸(`t1034Peek`)이 축 표지 · 벽시계 ms · ISO 를 낸다(켬만) · 벽시계 ms 는 지금 앞뒤 며칠 안(사람이 읽는 시각)
    const c = car(91, a, b, 'outbound'); G.w.caravans.push(c); mute(() => P.spawn(c, Date.now(), 16));
    for (let i = 0; i < 30; i++) G.step(true);
    const pk = mute(() => P.peek()), cb = pk.cars.find((x) => x.id === 91), bd = cb && cb.body;
    const ob = { has: !!(bd && 'ax' in bd), ax: bd ? bd.ax : null, raw: bd ? R9(bd.arriveAt) : null, wt: bd && bd.wt ? R9(bd.wt.arriveAt) : null, iso: bd && bd.iso ? bd.iso.arriveAt : null, now: Date.now(),
      wantW: bd ? R9((bd.ax === 'e') ? mute(() => P.toB(bd.arriveAt)) : bd.arriveAt) : null };
    ob.days = ob.wt != null ? +((ob.wt - ob.now) / M).toFixed(3) : null;
    ob.isoOk = ob.iso != null && Date.parse(ob.iso) === Math.floor(ob.wt);
    const fake = mute(() => P.obs({ _t1182: true }, { x: (D0 + 1) * M, n: null }));
    return { knob, small, big, ob, fake: { ax: fake.ax, wt: R9(fake.wt.x), want: R9(knob ? mute(() => P.toB((D0 + 1) * M)) : (D0 + 1) * M), iso: fake.iso.x, n: fake.wt.n } };
  }
  function ldRun(file, which) {
    const SV = JSON.parse(fs.readFileSync(file, 'utf8')), pk = which === 'old' ? SV.packOld : which === 'old58' ? SV.packOld58 : SV.pack;   // ★[T1300] 'old58' = T1258 시대 꼴
    const G = world('A', false), S = G.S, { a, b } = G;
    while (G.wall < SV.wall) G.step(false);   // 같은 벽시계 · 같은 econ 순간(바로 다시 뜬 판)
    G.w.caravans = SV.cars.map((x) => car(x.id, a, b, x.state, { departDay: x.departDay, arriveDay: x.arriveDay, returnArriveDay: x.returnArriveDay }));
    S._t1034Saved = new Map(Object.entries(JSON.parse(JSON.stringify(pk.b))));
    for (const c of G.w.caravans) { const r = mute(() => P.spawn(c, Date.now(), 16)); if (r === true && S._t1034Saved) { const bd = G.body(c.id); if (bd) mute(() => P.restore(bd, Date.now())); } }   // 운영 `_t775Resume` 차례(몸 세우기 → 덮기)
    const b1 = G.body(81), b2 = G.body(82), t1182 = !!(b1 && b1._t1182);
    const R = { t1182, knob: process.env.T1253_CLOCK_FIX !== '0', ph: [b1 && b1.phase, b2 && b2.phase], lg: b1 && R9(b1.lingerUntil), flipE: null, flipK: null, dE: null, fGot: null, fExp: SV.fExp, dF: null };
    //   ② 귀환 보간(T1182 아닌 몸만 읽는다 — `_t661Vis`) — 되살린 그 순간의 몫
    if (b2 && !t1182 && b2._t661 && b2._t661.t0 != null) { R.fGot = mute(() => P.vis(b2, Date.now())) / b2._t661.path.len; R.dF = R9(R.fGot - SV.fExp); }
    //   ① 머묾 끝 — 몸 틱을 돌려 머묾이 끝난 걸음의 econ 순간(저장한 econ 순간과 견준다 · 30초 안에 안 끝나면 null)
    for (let i = 0; i < 900 && b1 && b1.phase === 'linger'; i++) { G.step(true); if (b1.phase !== 'linger') { R.flipE = mute(() => P.econNow()); R.flipK = i; } }
    //   ③ ★[T1300] 도착 — 걷는 몸(82)의 도착 칸이 되살린 판의 축에서 저장한 econ 도착 순간(귀환 도착 날 × 하루)과 같은가(econ 축 = 그대로 · 벽시계 축 = `toE`)
    const c82 = SV.cars.find((x) => x.id === 82);
    if (b2 && c82 && Number.isFinite(b2.arriveAt)) { const aE = (R.knob && t1182) ? b2.arriveAt : mute(() => P.toE(b2.arriveAt)); R.dA = R9(aE - c82.returnArriveDay * M); }
    R.aaMixed = !(R.dA != null && Math.abs(R.dA) <= 150);
    if (R.flipE != null) R.dE = R9(R.flipE - SV.lgE);
    R.linMixed = !(R.flipE != null && Math.abs(R.dE) <= 150);
    R.visMixed = R.dF != null && Math.abs(R.dF) > 0.01;
    return R;
  }
  let out;
  try {
    const firstDiff = (x, y) => { for (let i = 0; i < Math.max(x.length, y.length); i++) if (JSON.stringify(x[i]) !== JSON.stringify(y[i])) return [i, x[i], y[i]]; return null; };
    const pick = (r) => { const o = Object.assign({}, r); delete o.trace; delete o.pack; return o; };
    const cmp = (A, B) => ({ A: pick(A), B: pick(B), same: A.h === B.h, diff: firstDiff(A.trace, B.trace) });
    //   저장 바이트 견줌 — 갈린 칸의 길(몸 id 는 '*')
    const keyDiff = (x, y, pre, acc) => {
      if (JSON.stringify(x) === JSON.stringify(y)) return acc;
      if (x && y && typeof x === 'object' && typeof y === 'object') { const arr = Array.isArray(x); for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) keyDiff(x[k], y[k], arr ? pre : pre.concat([k]), acc); return acc; }
      acc.add(pre.join('.')); return acc;
    };
    const saveDiff = (A, B) => { if (!A.pack || !B.pack) return null; const a = JSON.parse(A.pack).b, b = JSON.parse(B.pack).b, acc = new Set(); for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) keyDiff(a[id], b[id], ['*'], acc); return [...acc].sort(); };
    if (want === 'gp') { const A = gpRun('A'), B = gpRun('B'); out = { knob: process.env.T1253_CLOCK_FIX !== '0', gp: cmp(A, B) }; }   // ★[T1289] ⑦
    else if (want === '3f') {   // ★[T1289] ⑧
      const A = f3Run('A'), B = f3Run('B');
      const split = (x, y) => { let n = 0; for (let i = 0; i < Math.max(x.length, y.length); i++) if (JSON.stringify(x[i]) !== JSON.stringify(y[i])) n++; return n; };
      const s1 = A.car.filter((r) => r[0] === 's' && r[2] === 11)[0];
      out = { knob: process.env.T1253_CLOCK_FIX !== '0', n: [A.car.length, A.xz.length], split: { car: split(A.car, B.car), xz: split(A.xz, B.xz) }, s11: s1 || null, s11want: (D0 + 2) * M, diff: firstDiff(A.car.concat(A.xz), B.car.concat(B.xz)) };
    }
    else if (want === 'xa') out = xaRun();   // ★[T1300] ⑪
    else if (want === 'sv') out = svRun();   // ★[T1289] ⑨
    else if (want === 'ld') out = ldRun(process.argv[5], process.argv[6]);
    else if (want === 'mix') {   // ★[T1282]
      const gA = mgRun('A'), gB = mgRun('B'), L = lgRun(), tA = t0Run('A'), tB = t0Run('B');
      const ids = [...new Set([...Object.keys(tA.t0), ...Object.keys(tB.t0)])].sort();
      const t0split = ids.filter((id) => JSON.stringify((tA.t0[id] || [])[0]) !== JSON.stringify((tB.t0[id] || [])[0]));
      out = { knob: process.env.T1253_CLOCK_FIX !== '0', mg: cmp(gA, gB), lg: L, t0: { A: tA, B: tB, ids: ids.length, split: t0split.length, ex: t0split.slice(0, 3).map((id) => [id, tA.t0[id], tB.t0[id]]) } };
    } else if (want === 'tf' || want === 'tfp') {
      const c0 = carRun('A', false), x0 = xzRun('A', false), r0 = JSON.parse(JSON.stringify(census));
      const c1 = carRun('A', true), x1 = xzRun('A', true);
      out = { knob: process.env.T1253_CLOCK_FIX !== '0', census: r0, censusPoison: census, car: cmp(c0, c1), xz: cmp(x0, x1) };
    } else {
      const cA = carRun('A', false), cB = carRun('B', false), xA = xzRun('A', false), xB = xzRun('B', false), mA = mkRun('A'), mB = mkRun('B');
      out = { knob: process.env.T1253_CLOCK_FIX !== '0', car: cmp(cA, cB), xz: cmp(xA, xB), mk: cmp(mA, mB), save: { car: saveDiff(cA, cB), xz: saveDiff(xA, xB) },
        clk: [BASE + W0 + Math.min(...OFF), BASE + Math.max(...OFF)] };
    }
  } catch (e) { out = { err: String(e && e.stack || e).slice(0, 900) }; }
  Date.now = realNow;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ══ 부모 ══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const child = (bait, env, want) => {
  const E = Object.assign({}, process.env); delete E.T1253_CLOCK_FIX; Object.assign(E, env || {});
  const r = spawnSync(process.execPath, [__filename, '--child', bait == null || bait === '' ? '-' : String(bait), want || 'shake'], { encoding: 'utf8', env: E, timeout: 180000, maxBuffer: 1 << 27 });
  const line = ((r.stdout || '') + '').split('\n').find((l) => l.startsWith('@@'));
  return line ? JSON.parse(line.slice(2)) : { err: ((r.stderr || '') + (r.stdout || '')).slice(-900) };
};
const dtxt = (d) => (d ? `첫 갈림 #${d[0]} ${JSON.stringify(d[1]).slice(0, 110)} ↔ ${JSON.stringify(d[2]).slice(0, 110)}` : '');
const GN = { car: '몸 세우기 · 장 마당 몸 · 늦은 장 · 도착 동기 · 복원', xz: '이웃 존 몸 · 경계 칸까지 걷고 밂', mk: '장마당 그림' };
console.log('\n=== T1273 남은 벽시계 칸 셋 · 단위 판 밖 `_t1253Now()` 자리 여섯 — 켬 갈래 ===');

console.log('\n⓪ 글자');
const codeOnly = require('./code-only.js');
const VSRC = fs.readFileSync(VFILE, 'utf8'), VC = codeOnly(VSRC);
const fnOf = (i) => { const j = VC.lastIndexOf('\nfunction ', i); return j < 0 ? '?' : VC.slice(j + 10, VC.indexOf('(', j + 10)); };
{
  ok(/_caravanBodyProbe: \{[^\n]*\n\s*spawn: spawnCaravanBody, syncOne: _caravanSyncOne, xzMakeBody: _xzMakeBody \}/.test(VC) && /^\s*marketVillages,\s*$/m.test(VC), '⓪ 문 넷 — `_caravanBodyProbe` 의 `spawn` · `syncOne` · `xzMakeBody`(T1273 내보내기) · `marketVillages`(모듈 내보내기)');
  const once = BAITS.map(([, , from]) => VSRC.split(from).length - 1);
  ok(once.every((x) => x === 1), `⓪ 미끼 ${BAITS.length}자리가 제품 소스에 꼭 한 번씩(미끼가 실제 줄을 바꾼다)`, once.join(' · '));
  const fns = [...VC.matchAll(/(?<!function )_t1253Now\(\)/g)].map((m) => fnOf(m.index)), cnt = {};
  for (const f of fns) cnt[f] = (cnt[f] || 0) + 1;
  //   ★[T1282] 11 → 13곳 — 고침 둘이 읽는 자리를 더했다(`startReturnLeg` 귀환 보간 t0 · `_t1282Wall` = `_xzMakeBody` 걸음 날 수의 econ 날 시계 · 보고 T1282 자리 표)
  //   ★[T1289] 13 → 17곳 — 고침이 읽는 자리 넷을 더했다(`_caravanSyncOne` T1136 바구니 머묾 끝 · `_t1289Leg` 세 칸 · `_t1289In` 되살림 축 · `_xzWalkToBorder` 경계 걷기의 '지금' · 보고 T1289 전수 표).
  //     종전 조건(이 판 여섯 · T1282 둘 · 함수마다 수)은 그대로 두고 동기만 1 → 2(같은 함수에 바구니 줄) · 새 넷을 더 묶었다(느슨하게 한 것 0).
  ok(fns.length === 17 && cnt.spawnCaravanBody === 3 && cnt._caravanSyncOne === 2 && cnt._xzMakeBody === 1 && cnt.marketVillages === 1 && cnt.startReturnLeg === 1 && cnt._t1282Wall === 1
    && cnt._t1289Leg === 1 && cnt._t1289In === 1 && cnt._xzWalkToBorder === 1,
    '⓪ [전제] `_t1253Now()` 읽는 자리 17곳 중 이 판의 여섯(몸 세우기 셋 · 도착 동기 · 이웃 존 몸 · 장마당 그림) + T1282 둘(귀환 t0 · 걸음 날 수) + T1289 넷(바구니 머묾 끝 · 세 칸 · 되살림 축 · 경계 걷기) — 나머지 다섯은 T1268 판',
    `${fns.length}곳 · 몸 세우기 ${cnt.spawnCaravanBody} · 동기 ${cnt._caravanSyncOne} · 이웃 ${cnt._xzMakeBody} · 장마당 ${cnt.marketVillages} · 귀환 ${cnt.startReturnLeg} · 날 수 ${cnt._t1282Wall} · 세 칸 ${cnt._t1289Leg} · 되살림 ${cnt._t1289In} · 경계 ${cnt._xzWalkToBorder}`);
  const site = BAITS.slice(0, 6).map(([, , from]) => fnOf(VC.indexOf(from)));
  ok(site.join() === 'spawnCaravanBody,spawnCaravanBody,spawnCaravanBody,_caravanSyncOne,_xzMakeBody,marketVillages', '⓪ 미끼 여섯이 그 여섯 자리(함수)를 바꾼다', site.join(' · '));
  //   ★[T1282] 닫는 날 적기 — 운영 마감 문(`_openDayJobs` 머리 · 하루 마감 또는 창 머리)에서만 · 켬 뒤 · 하네스 mg 판은 같은 함수를 부른다
  const oj = VC.indexOf('\nfunction _openDayJobs('), ojl = VC.slice(VC.indexOf('{', oj) + 1).split('\n')[1] || '';
  const opens = [...VC.matchAll(/(?<!function )_t1282Open\(\)/g)].map((m) => fnOf(m.index));
  ok(/^\s*if \(T1253_CLOCK_FIX && \(!T \|\| T\.head\)\) _t1282Open\(\);/.test(ojl) && opens.join() === '_openDayJobs' && (VC.match(/state\._t1282D = /g) || []).length === 1,
    '⓪ ★[T1282] 닫는 날 적기 — `_openDayJobs` 첫 줄 · 켬 뒤 · 하루 마감 또는 창 머리에서만(창 가운데 · 꼬리 조각은 안 적는다) · 적는 자리 하나', `부르는 곳 ${opens.join(' · ')}`);
  const monce = MIX_BAITS.map(([, , from]) => VSRC.split(from).length - 1), msite = MIX_BAITS.map(([, , from]) => fnOf(VC.indexOf(from)));
  ok(monce.every((x) => x === 1) && msite.join() === '_t1253Now,_xzMakeBody,startReturnLeg,_t1282Open', `⓪ ★[T1282] 미끼 ${MIX_BAITS.length}자리가 제품 소스에 꼭 한 번씩 · 그 함수를 바꾼다`, `${monce.join(' · ')} · ${msite.join(' · ')}`);
  //   ★[T1289] 미끼 여섯 자리 · 세 칸 econ 축 줄은 다 켬 · T1182 몸 뒤 · 되살림 축 옮김은 덮기 문 둘(`_t1034Apply` · 이웃 존 되살림)에서만 · 저장 표지는 켬만
  const aonce = AXIS_BAITS.map(([, , from]) => VSRC.split(from).length - 1), asite = AXIS_BAITS.map(([, , from]) => fnOf(VC.indexOf(from)));
  ok(aonce.every((x) => x === 1) && asite.join() === 'econDayToMs,spawnCaravanBody,_xzMakeBody,_xzWalkToBorder,_t1034Pack,_t1289In,_t1282Wall', `⓪ ★[T1289] 미끼 ${AXIS_BAITS.length}자리(판 셈 전용 G0 포함)가 제품 소스에 꼭 한 번씩 · 그 함수를 바꾼다`, `${aonce.join(' · ')} · ${asite.join(' · ')}`);
  const legs = [...VC.matchAll(/(?<!function )_t1289Leg\(/g)].map((m) => [fnOf(m.index), VC.slice(VC.lastIndexOf('\n', m.index) + 1, m.index)]);
  //   ★[T1300] 전쟁 몸 두 자리(`_warEnsureBody` · `_warSetupReturn` — `if (T1253_CLOCK_FIX && body._t681)` 뒤)가 더해졌다 — 캐러밴 10자리는 종전 단언 그대로(그 줄들만 골라 같은 조건) · 전쟁 둘은 따로 · 그 밖 0
  const legsW = legs.filter((x) => x[0] === '_warEnsureBody' || x[0] === '_warSetupReturn'), legsC = legs.filter((x) => !legsW.includes(x));
  const legFns = legsC.map((x) => x[0]).sort().join();
  ok(legsC.length === 10 && legsC.every((x) => /if \(T1253_CLOCK_FIX && body\._t1182\) $/.test(x[1])) && legFns === '_caravanSyncOne,_t1136Isolate,_xzAfterSend,_xzIsolate,_xzMakeBody,_xzStartReturnLeg,isolateCaravanReturn,spawnCaravanBody,startReturnLeg,startReturnLeg',
    '⓪ ★[T1289] 세 칸 econ 축 줄 10자리(세 칸을 적는 함수 전부 · 경계 걷기는 따로) — 다 `if (T1253_CLOCK_FIX && body._t1182)` 뒤(끔 · T1182 아닌 몸 = 종전 줄 그대로)', legFns);
  ok(legs.length === 12 && legsW.length === 2 && legsW.every((x) => /if \(T1253_CLOCK_FIX && body\._t681\) $/.test(x[1])) && legsW.map((x) => x[0]).sort().join() === '_warEnsureBody,_warSetupReturn',
    '⓪ ★[T1300] 전쟁 몸 세 칸 econ 축 줄 2자리(행군 · 귀환) — 다 `if (T1253_CLOCK_FIX && body._t681)` 뒤(끔 · T681 끔 판 = 종전 벽시계 줄 · 그 판의 페이싱만 세 칸을 읽는다)', `${legs.length}자리 · 전쟁 ${legsW.map((x) => x[0]).join(' · ')}`);
  const ins = [...VC.matchAll(/(?<!function )_t1289In\(/g)].map((m) => fnOf(m.index)).sort().join();
  ok(ins === '_t1034Apply,spawnCaravanBody' && /\.\.\.\(T1253_CLOCK_FIX \? \{ ax: body\._t1182 \? 'e' : 'w' \} : \{\}\)/.test(VC), '⓪ ★[T1289] 되살림 축 옮김 = 덮기 문 둘(`_t1034Apply` · 이웃 존 되살림) · 저장 표지 = 켬만(끔 = 칸 없음)', ins);
}

const on = child(null, {}), off = child(null, { T1253_CLOCK_FIX: '0' });
console.log('\n① 켬(기본) — 벽시계 흔들림에 바이트 같음');
if (on.err) ok(false, '① 켬 판이 돌았다', on.err);
else {
  ok(on.knob, '① [전제] 아이 판 손잡이 = 켬(env 없음 = 운영 기본)');
  ok(on.clk[0] < 1e8 && on.clk[1] > 1e13, '① [전제] B 판 벽시계가 엉뚱하다(1970년 1월 1일 앞뒤 몇 분 ~ 3000년 근처)', `${on.clk[0]} ~ ${on.clk[1]}`);
  for (const g of ['car', 'xz', 'mk']) ok(on[g].same, `★① ${g} 판(${GN[g]}) — 흔들림에 바이트 같음`, on[g].same ? `${on[g].A.n}줄 · ${on[g].A.h}` : dtxt(on[g].diff));
  const c = on.car.A;
  ok(c.s1prog > 1000 && c.early[0] === 'outbound' && c.early[1] === 'linger' && c.early[2] === 'linger' && c.earlyLinger === 5 && c.s12Back,
    '① [전제] S1 가는 몸이 걸었다 · S2 장 마당 몸(장 기록 없음)이 머물다 귀환 · S3 장 끝 전에 선 몸 다섯은 머묾 = 장 끝', `S1 ${c.s1prog}/${c.s1len}px · 처음 단계 ${c.early.join('·')} · 장 끝 머묾 ${c.earlyLinger}/5 · S2 귀환 ${c.s12Back}`);
  ok(c.lateBack === 13, '① [전제] S3 늦은 장 — 장 끝이 지난 뒤 선 장 마당 몸 13대(흔들림 13가지)는 선 자리에서 바로 귀환(T775 견줌 참)', `${c.lateBack}/13`);
  ok(c.syncAt && c.syncAt[1] === 'linger' && c.s4LingerEndPhase === 'next' && c.s4Back, '① [전제] S4 — 하루 끝 5초 전 econ 도착 동기가 머묾을 열고 · 머묾이 밀림 · 마감을 지나 이튿날 econ 시계로 끝나 · 귀환해 걸었다',
    `동기 #${c.syncAt && c.syncAt[0]} · 머묾 끝 갈래 ${c.s4LingerEndPhase} · 귀환 걸음 ${c.s4Back}`);
  const x = on.xz.A;
  ok(x.b31prog > 500 && x.sentAt != null && x.sentK != null && x.sentK > x.sentAt && x.walked === 'walked' && x.sent === 1, '① [전제] S5 이웃 존 몸이 걸었다 · 경계 기록이 나간 뒤 몸이 경계 칸까지 걸어 닿은 틱에 밀었다(한 번)',
    `몸 ${x.b31prog}/${x.b31len}px · 기록 #${x.sentAt} → 밂 #${x.sentK} · ${x.walked}`);
  const m = on.mk.A;
  ok(m.opened === 3 && m.seenA > 0 && m.seenB > 0 && m.seenClose > 0 && m.flips >= 4, '① [전제] S6 장마당이 섰다 졌다 — 두 마을 · 하루 끝을 넘긴 장은 밀림 · 마감 동안에도 그려진다',
    `장 ${m.opened} · 가 ${m.seenA}틱 · 나 ${m.seenB}틱 · 마감 중 ${m.seenClose}틱 · 바뀜 ${m.flips}`);
}
console.log('\n② 끔(`T1253_CLOCK_FIX=0`) — 같은 흔들림에 갈린다(자명 통과 금지)');
if (off.err) ok(false, '② 끔 판이 돌았다', off.err);
else {
  ok(!off.knob, '② [전제] 아이 판 손잡이 = 끔');
  for (const g of ['car', 'xz', 'mk']) ok(!off[g].same, `★② ${g} 판 — 끔이면 벽시계 흔들림이 결과를 바꾼다`, dtxt(off[g].diff));
}

console.log('\n③ ★남은 벽시계 칸 셋(`departAt` · `arriveAt` · `nomPxMs`)이 결과에 닿나');
{
  //   글자 — 세 칸을 읽는 함수 표(쓰기 `=` · `+=` 는 뺌)
  const got = {};
  for (const m of VC.matchAll(/\b\w+\.(departAt|arriveAt|nomPxMs)\b(?!\s*(?:=(?!=)|\+=))/g)) { const f = fnOf(m.index); got[f] = (got[f] || 0) + 1; }
  const want = Object.fromEntries(Object.entries(READERS).map(([f, [n]]) => [f, n]));
  const same = JSON.stringify(Object.keys(got).sort().map((f) => [f, got[f]])) === JSON.stringify(Object.keys(want).sort().map((f) => [f, want[f]]));
  ok(same, '③ 글자 — 세 칸을 읽는 함수 표가 고정 표와 같다(새로 읽는 이 · 수가 바뀌면 분류를 다시 한다)', same ? `${Object.keys(got).length}함수 · ${Object.values(got).reduce((s, x) => s + x, 0)}자리` : JSON.stringify(got).slice(0, 400));
  const t0 = VC.indexOf('\nfunction tickCaravanBodies('), t1 = VC.indexOf('\nfunction ', t0 + 10), gate = VC.indexOf(BAITS[6][2], t0);
  const tReads = [...VC.slice(t0, t1).matchAll(/\bbody\.(departAt|arriveAt|nomPxMs)\b(?!\s*(?:=(?!=)|\+=))/g)].map((m) => t0 + m.index);
  ok(gate > t0 && gate < t1 && tReads.length === 6 && tReads.every((i) => i > gate), '③ 글자 — 몸 틱(`tickCaravanBodies`)의 세 칸 읽기 여섯은 다 T1182 몸 줄(`if (body._t1182) { _t1182Move … continue; }`) 뒤 = 종전 페이싱 몸만', `${tReads.length}자리`);
  const until = [...VC.matchAll(/_xzSendWait\.until/g)];
  ok(until.length === 1 && /!body\._t1182 && now > body\._xzSendWait\.until/.test(VC), '③ 글자 — 경계 기다림 상한(`until` = `arriveAt` + 하루)을 읽는 곳은 하나 · `!body._t1182` 뒤(T1182 몸은 닿아야 민다)', `${until.length}곳`);
  const others = [];
  const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) { if (n.name !== 'node_modules' && n.name !== 'vendor') walk(p); } else if (/\.(js|mjs|html)$/.test(n.name) && p !== VFILE && /\b(departAt|nomPxMs|arriveAt)\b/.test(fs.readFileSync(p, 'utf8'))) others.push(path.relative(ROOT, p)); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  ok(others.length === 0, '③ 글자 — 세 칸 이름이 다른 파일(server · sim · public — econ 곳간 · 클라 그림)에 0', others.join(' · '));
  //   움직임 — 접근자 셈 · 독
  const tf = child(null, {}, 'tf');
  if (tf.err) ok(false, '③ 독 판이 돌았다', tf.err);
  else {
    const R = tf.census.r, Wr = tf.census.w, bad = Object.keys(R).filter((f) => !READ_OK.has(f));
    console.log(`    [표] 켬 판에서 세 칸을 읽은 함수 — ${Object.entries(R).map(([f, n]) => `${f} ${n}`).join(' · ')} · 쓴 함수 — ${Object.entries(Wr).map(([f, n]) => `${f} ${n}`).join(' · ')}`);
    ok((Wr.spawnCaravanBody | 0) > 0 && (Wr.startReturnLeg | 0) > 0 && (Wr._xzMakeBody | 0) > 0 && (Wr._xzWalkToBorder | 0) > 0 && (Wr._t1034Apply | 0) > 0 && (R._t1034Pack | 0) > 0 && (R._xzWalkToBorder | 0) > 0,
      '③ [전제] 접근자가 실제로 셌다 — 세 칸을 쓴 함수(몸 세우기 · 귀환 출발 · 이웃 존 몸 · 경계 걷기 · 되살림) · 읽은 함수(저장 · 경계 걷기)');
    ok(bad.length === 0, '★③ 켬 판에서 세 칸을 읽은 함수 ⊆ {저장 · 세 칸끼리 셈 · 경계 기다림 상한} — 몸 틱 · 걸음 · 머묾 · 동기 · 되살림은 안 읽는다(정산 문 · 장 · 그림은 위 글자 표에 없다)', bad.length ? bad.join(' · ') : `${Object.keys(R).length}함수`);
    ok(tf.car.same, '★③ 독 — car 판: 세 칸(+ `_t661.t0`)에 걸음마다 NaN · ±1e300 · 0 … 을 넣고 저장 → 되살려도 결과 바이트 같음(몸 자리 · 단계 · 머묾 끝 · 걸음 시계)', tf.car.same ? `${tf.car.A.n}줄` : dtxt(tf.car.diff));
    ok(tf.xz.same, '★③ 독 — xz 판: 경계 칸까지 걷기(세 칸을 읽는 `_xzWalkToBorder`) · 밂이 같음', tf.xz.same ? `${tf.xz.A.n}줄` : dtxt(tf.xz.diff));
  }
  if (!on.err) {
    const sv = on.save.car || [], sx = on.save.xz || [];
    console.log(`    [표·정보] 저장 바이트(메타 행 곁 칸 \`t1034.b\`)가 흔들림에 갈린 칸 — car ${sv.join(' · ')} · xz ${sx.join(' · ')} (메타 행 \`anchor.epoch\` · \`anchor.at\` 도 벽시계)`);
    //   ★[T1289] 종전 단언은 "갈리는 칸 ⊆ {세 칸 · at · T.t0} 이고 da · aa 가 실제로 갈린다"(벽시계 칸이 저장에 실린다는 기록)였다 — T1289 가 세 칸을 econ 날 시계 축으로 옮겨
    //     da · aa 는 더 안 갈린다(T1273 회부 1 ⓑ). 단언을 더 좁혔다: 갈리는 칸 = 저장 순간 벽시계 `at` 하나뿐(car · xz 둘 다 · 허용 칸 다섯 → 하나 · 느슨하게 한 것 0).
    ok(sv.join() === '*.at' && sx.join() === '*.at', '③ ★[T1289] 저장 바이트 — 흔들림에 갈리는 칸은 저장 순간 벽시계 `at` 하나뿐(세 칸 · `T.t0` · 머묾 끝은 econ 날 시계 축 — 안 갈린다 · `at` 은 T1034 되살림 상한이 벽시계로 읽는다)', `car ${sv.join(' · ')} · xz ${sx.join(' · ')}`);
  }
}

console.log('\n④ ★미끼 — 사본에서 글자 한 자리를 바꾸면 빨강');
let caught = 0;
for (let i = 0; i < BAITS.length; i++) {
  const [name, kind] = BAITS[i], r = child(i, {}, kind === 'tf' ? 'tfp' : 'shake');
  const red = !r.err && (kind === 'tf' ? (!r.car.same || !r.xz.same) : (r[kind] && !r[kind].same));
  if (red) caught++;
  const d = r.err ? r.err.slice(0, 200) : kind === 'tf' ? `car ${r.car.same ? '같음' : '갈림'} · xz ${r.xz.same ? '같음' : '갈림'} · ${dtxt(r.car.diff || r.xz.diff)}` : (r[kind] ? dtxt(r[kind].diff) : '');
  ok(red, `④ 미끼 ${name} — ${kind === 'tf' ? '독 판' : kind + ' 판'}이 갈린다(잡음)`, d);
}
console.log(`\n  미끼 ${caught}/${BAITS.length}`);

// ══ ★[T1282] ⑤ ⑥ — 켬 갈래에 남은 두 시계 축 섞임 셋(T1273 회부 2 · 3 · 4) ═════════════════════════════
const MIXN = (r) => r.err ? null : { mg: r.mg.A.redraw + r.mg.B.redraw, lg: r.lg.split, t0: r.t0.split };
console.log('\n⑤ ★[T1282] 축 섞임 셋 — 마감 틈 진 장 다시 듦 · `legDays` 갈림 · `t0` 갈림(켬 = 고친 판)');
const mx = child(null, {}, 'mix'), mxOld = child(MIX_BAITS.slice(0, 3).map((_, i) => 'm' + i).join(','), {}, 'mix'), mxOff = child(null, { T1253_CLOCK_FIX: '0' }, 'mix');
if (mx.err) ok(false, '⑤ 켬 판이 돌았다', mx.err);
else {
  const g = mx.mg.A, L = mx.lg, T0 = mx.t0;
  ok(mx.knob && g.pendTicks >= 10 && g.opened === 3 && g.closedBefore === 2 && g.seenNew > 0,
    '⑤ [전제] mg 판 — 마감을 운영 차례로 열었다(econ 머리 앞 틈 틱이 있다) · 그날 장 둘이 하루 안에 졌다 · 이튿날 새 장은 선다(대조)', `틈 ${g.pendTicks}틱 · 장 ${g.opened} · 진 장 ${g.closedBefore} · 새 장 ${g.seenNew}틱`);
  ok(mx.mg.A.redraw === 0 && mx.mg.B.redraw === 0, '★⑤ mg — 마감 틈에 그날 진 장이 그림(`marketVillages`)에 다시 든 틱 = 0(A · B)', `A ${mx.mg.A.redraw} · B ${mx.mg.B.redraw}`);
  ok(mx.mg.same, '⑤ mg — 흔들림 A ↔ B 바이트 같음(마감 틈도 econ 날 시계 하나)', mx.mg.same ? `${g.n}틱` : dtxt(mx.mg.diff));
  ok(L.n === 60 && L.split === 0 && L.econAtEnd === 60, '★⑤ lg — 같은 econ 상태(밀림 · 머리 앞 · 머리 뒤 · 경계 틱) · 벽시계만 0 ~ 0.97일 앞선 몸 60 — `legDays` 갈림 0 · 다 econ 날 수(받을 경계 − 닫는 날 끝)',
    `몸 ${L.n} · 갈림 ${L.split} · econ 날 시계 = 닫는 날 끝 ${L.econAtEnd}/${L.n}`);
  ok(T0.A.made === 26 && T0.ids >= 20 && T0.A.n === T0.B.n, '⑤ [전제] t0 판 — 머묾 끝 귀환 몸이 `t0` 를 적었다(T772 귀환 보간 · T1182 몸)', `몸 ${T0.A.made} · t0 ${T0.A.n} · ${T0.B.n}`);
  ok(T0.split === 0 && T0.A.eqLinger === T0.A.n && T0.B.eqLinger === T0.B.n, '★⑤ t0 — 흔들림 A ↔ B 에서 `t0` 갈림 0 · `t0` = 머묾 끝(econ 날 시계 축)', `갈림 ${T0.split} · = 머묾 끝 A ${T0.A.eqLinger}/${T0.A.n} · B ${T0.B.eqLinger}/${T0.B.n}`);
}
if (mxOld.err) ok(false, '⑤ 고치기 전(종전 셋 되돌린 사본) 판이 돌았다', mxOld.err);
else {
  const b = MIXN(mxOld), a = MIXN(mx) || {};
  console.log(`    [표] 고치기 전(K1 · K2 · K3 종전 글자 사본) → 지금: 마감 틈 진 장 다시 듦 ${b.mg} → ${a.mg}틱 · legDays 갈림 ${b.lg} → ${a.lg}몸 · t0 갈림 ${b.t0} → ${a.t0}몸`);
  ok(b.mg > 0 && b.lg > 0 && b.t0 > 0, '⑤ 고치기 전 사본은 셋 다 0 이 아니다(자명 통과 금지 — 판이 그 갈림을 실제로 낸다)', `${b.mg} · ${b.lg} · ${b.t0}`);
}
if (mxOff.err) ok(false, '⑤ 끔 판이 돌았다', mxOff.err);
else { const o = MIXN(mxOff); console.log(`    [표·정보] 끔(\`T1253_CLOCK_FIX=0\` — 종전 벽시계 갈래 · 이 카드 손 밖): 마감 틈 진 장 다시 듦 A ${mxOff.mg.A.redraw} · B ${mxOff.mg.B.redraw}틱(끔 장 끝은 벽시계라 B 흔들림이 장을 여닫는다) · legDays 갈림 ${o.lg}몸 · t0 갈림 ${o.t0}몸`); ok(!mxOff.knob, '⑤ [전제] 끔 판 손잡이 = 끔'); }

console.log('\n⑥ ★[T1282] 미끼 — 고친 줄 하나씩 종전 글자로 되돌린 사본이 빨강');
let mcaught = 0;
for (let i = 0; i < MIX_BAITS.length; i++) {
  const [name, kind] = MIX_BAITS[i], r = child('m' + i, {}, 'mix'), n = MIXN(r);
  const red = !!n && n[kind] > 0;
  if (red) mcaught++;
  ok(red, `⑥ 미끼 ${name} — ${kind} 판 갈림 > 0(잡음)`, r.err ? r.err.slice(0, 200) : `마감 틈 ${n.mg} · legDays ${n.lg} · t0 ${n.t0}`);
}
console.log(`\n  T1282 미끼 ${mcaught}/${MIX_BAITS.length}`);

// ══ ★[T1289] ⑦ ⑧ ⑨ ⑩ — 마감 틈 `econDayToMs` · 캐러밴 세 칸 · 저장 축 표지 ══════════════════════════════════════
const os = require('os');
const GPN = (r) => (r.err ? null : r.gp.A.bad + r.gp.B.bad);
console.log('\n⑦ ★[T1289] 마감 틈의 경계 읽기(`econDayToMs` 앵커 틈) — 틈에 불리는 자리 다섯이 econ 머리 뒤 정렬과 같다');
const gp = child(null, {}, 'gp'), gpOld = child('a0,a6', {}, 'gp'), gpOff = child(null, { T1253_CLOCK_FIX: '0' }, 'gp');
if (gp.err) ok(false, '⑦ 켬 판이 돌았다', gp.err);
else {
  ok(gp.knob && gp.gp.A.pendTicks >= 10, '⑦ [전제] gp 판 — 마감을 운영 차례로 열었다(econ 머리 앞 틈 틱이 있다)', `틈 ${gp.gp.A.pendTicks}틱`);
  ok(gp.gp.A.bad === 0 && gp.gp.B.bad === 0, '★⑦ 틈 (틱 × 자리) 가운데 econ 머리 뒤 정렬과 다른 것 = 0 — `econDayToMs(D)` · `(D+1)` · 기온 `econDayT` · 달력 `t728CalNext` · 걸음 날 수 `_t1282Wall`', `A ${gp.gp.A.bad} · B ${gp.gp.B.bad}`);
  ok(gp.gp.A.back === 0, '★⑦ 기온 시계(`econDayT` — econ 날 + 그날 몫)가 틈에서 거꾸로 간 틱 = 0', `${gp.gp.A.back}`);
  ok(gp.gp.same, '⑦ 흔들림 A ↔ B 바이트 같음(경계 읽기는 econ 앵커 축 · 벽시계 무관)', gp.gp.same ? `${gp.gp.A.n}틱` : dtxt(gp.gp.diff));
}
if (!gpOld.err) { console.log(`    [표] 고치기 전(T1289 앞 글자 — G1 + \`_t1282Wall\` 종전 보정) → 지금: 틈 경계 읽기 갈림 ${GPN(gpOld)} → ${GPN(gp)} (A + B · 자리별 A ${JSON.stringify(gpOld.gp.A.by)}) · 기온 거꾸로 ${gpOld.gp.A.back} → ${gp.err ? '?' : gp.gp.A.back}`);
  ok(GPN(gpOld) > 0, '⑦ 고치기 전 사본은 틈 갈림이 0 이 아니다(자명 통과 금지)', `${GPN(gpOld)}`); }
else ok(false, '⑦ 고치기 전 사본 판이 돌았다', gpOld.err);
if (!gpOff.err) { console.log(`    [표·정보] 끔(\`T1253_CLOCK_FIX=0\` — 종전 · 이 카드 손 밖): 틈 경계 읽기 갈림 A ${gpOff.gp.A.bad} · 기온 거꾸로 ${gpOff.gp.A.back}`); ok(!gpOff.knob, '⑦ [전제] 끔 판 손잡이 = 끔'); }

console.log('\n⑧ ★[T1289] 캐러밴 세 칸(`departAt` · `arriveAt` · `nomPxMs`) = econ 날 시계 축');
const f3 = child(null, {}, '3f'), f3Off = child(null, { T1253_CLOCK_FIX: '0' }, '3f');
if (f3.err) ok(false, '⑧ 켬 판이 돌았다', f3.err);
else {
  ok(f3.n[0] > 1000 && f3.n[1] > 1000, '⑧ [전제] car · xz 판 몸 걸음마다 세 칸을 모았다', `car ${f3.n[0]} · xz ${f3.n[1]}`);
  ok(f3.split.car === 0 && f3.split.xz === 0, '★⑧ 세 칸이 흔들림 A ↔ B 에 갈린 몸-걸음 = 0(car · xz — 출발 · 도착 · 명목이 다 econ 날 시계 축)', `car ${f3.split.car} · xz ${f3.split.xz}` + (f3.diff ? ' · ' + dtxt(f3.diff) : ''));
  ok(f3.s11 && f3.s11[4] === f3.s11want, '⑧ 몸 세우기 도착 = econ 날 경계(도착 날 × 하루 — 벽시계 경계 `econDayToMs` 의 econ 축 짝)', f3.s11 ? `${f3.s11[4]} = ${f3.s11want}` : '없음');
}
if (!f3Off.err) console.log(`    [표·정보] 끔(종전): 세 칸 갈림 car ${f3Off.split.car}/${f3Off.n[0]} · xz ${f3Off.split.xz}/${f3Off.n[1]}(벽시계 축 — 흔들림 그대로)`);

console.log('\n⑨ ★[T1289] 저장 축 표지 — 저장(sv) → 되살림(ld · 다른 프로세스 · 다른 손잡이)에서 머묾 끝 · 귀환 보간이 축을 섞나');
const LOADS = [['L1 켬 → 켬', 'on', 'new', {}], ['L2 켬 → `T762_CARAVAN_BODY=0`', 'on', 'new', { T762_CARAVAN_BODY: '0' }], ['L3 켬 → 끔', 'on', 'new', { T1253_CLOCK_FIX: '0' }],
  ['L4 표지 없는 옛 켬 저장 → 켬', 'on', 'old', {}], ['L5 끔 저장 → 켬', 'off', 'new', {}], ['L6 끔 저장 → 끔(대조 · 종전 바이트)', 'off', 'new', { T1253_CLOCK_FIX: '0' }],
  //   ★[T1300 · T1289 회부 4] 옛 저장(표지 없음) 판 다섯 — 끔 판 · 종전 몸 판 · T1258 시대 꼴(귀환 보간 시작도 벽시계)
  ['L7 표지 없는 옛 켬 저장 → 끔', 'on', 'old', { T1253_CLOCK_FIX: '0' }], ['L8 표지 없는 옛 켬 저장 → `T762_CARAVAN_BODY=0`', 'on', 'old', { T762_CARAVAN_BODY: '0' }],
  ['L9 T1258 시대 옛 켬 저장 → 켬', 'on', 'old58', {}], ['L10 T1258 시대 옛 켬 저장 → 끔', 'on', 'old58', { T1253_CLOCK_FIX: '0' }], ['L11 T1258 시대 옛 켬 저장 → `T762_CARAVAN_BODY=0`', 'on', 'old58', { T762_CARAVAN_BODY: '0' }]];
const matrix = (bait) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't1289-sv-')), rows = [];
  try {
    const sv = { on: child(bait, {}, 'sv'), off: child(bait, { T1253_CLOCK_FIX: '0' }, 'sv') };
    for (const k of ['on', 'off']) { if (sv[k].err) return { err: sv[k].err }; fs.writeFileSync(path.join(dir, k + '.json'), JSON.stringify(sv[k])); }
    for (const [name, src, which, env] of LOADS) {
      const E = Object.assign({}, env), r0 = spawnSync(process.execPath, [__filename, '--child', bait == null ? '-' : bait, 'ld', path.join(dir, src + '.json'), which], { encoding: 'utf8', env: Object.assign((() => { const e = Object.assign({}, process.env); delete e.T1253_CLOCK_FIX; delete e.T762_CARAVAN_BODY; return e; })(), E), timeout: 180000, maxBuffer: 1 << 26 });
      const line = ((r0.stdout || '') + '').split('\n').find((l) => l.startsWith('@@'));
      rows.push([name, line ? JSON.parse(line.slice(2)) : { err: ((r0.stderr || '') + '').slice(-400) }]);
    }
    return { sv, rows, mixed: rows.reduce((n, [, r]) => n + (r.err ? 99 : (r.linMixed ? 1 : 0) + (r.visMixed ? 1 : 0)), 0), aaMix: rows.reduce((n, [, r]) => n + (r.err ? 99 : (r.aaMixed ? 1 : 0)), 0) };   // ★[T1300] aaMix = 도착 칸이 축을 섞은 몸(③ · 따로 센다 — `mixed` 는 T1289 셈 그대로)
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
};
const mtx = matrix(null), mtxOld = matrix('a5');
if (mtx.err) ok(false, '⑨ 저장 판이 돌았다', mtx.err);
else {
  ok(mtx.sv.on.knob && !mtx.sv.off.knob && mtx.sv.on.ax.join() === 'e,e' && mtx.sv.off.ax.join() === ',', '⑨ [전제] 저장 둘 — 켬 저장은 몸마다 축 표지 `ax: \'e\'` · 끔 저장은 표지 칸이 없다(종전 바이트)', `켬 ${mtx.sv.on.ax.join('·')} · 끔 ${mtx.sv.off.ax.join('·') || '없음'}`);
  for (const [name, r] of mtx.rows) {
    if (r.err) { ok(false, `⑨ ${name} 판이 돌았다`, r.err); continue; }
    ok(!r.linMixed && !r.visMixed && r.ph[0] === 'linger' && r.ph[1] === 'inbound', `★⑨ ${name} — 머묾이 저장한 econ 순간에 끝난다(±150ms) · 귀환 보간 몫이 저장 몫과 같다(T1182 아닌 몸만 읽는다)`,
      `몸 ${r.t1182 ? 'T1182' : '종전'} · 머묾 끝 차 ${r.dE == null ? '안 끝남' : r.dE + 'ms'}(${r.flipK == null ? '—' : r.flipK + '걸음'}) · 보간 몫 차 ${r.dF == null ? '—' : r.dF}`);
    ok(!r.aaMixed, `★⑨ [T1300] ${name} — 걷는 몸의 도착 칸 = 저장한 econ 도착 순간(±150ms · 되살린 판 축)`, `도착 차 ${r.dA == null ? '없음' : r.dA + 'ms'}`);
  }
}
const mtx89 = matrix('y1');   // ★[T1300] T1289 글자(끔 판 가리기 없음 — Y2)로 같은 행렬 — 옛 저장 → 끔 판의 "고치기 전" 수
if (!mtx89.err) { console.log(`    [표] ★[T1300] T1289 글자(끔 · 표지 없음 = 무동작) → 지금: 축 섞인 몸 ${mtx89.mixed} + 도착 ${mtx89.aaMix} → ${mtx.mixed || 0} + ${mtx.aaMix || 0} — ${mtx89.rows.filter(([, r]) => r.err || r.linMixed || r.visMixed || r.aaMixed).map(([n, r]) => `${n.split(' ')[0]} ${r.err ? '오류' : (r.linMixed ? '머묾 ' + (r.dE == null ? '안 끝남' : r.dE + 'ms') : '') + (r.visMixed ? ' 보간 ' + r.dF.toFixed(3) : '') + (r.aaMixed ? ' 도착 ' + r.dA : '')}`).join(' · ') || '없음'}`);
  ok(mtx89.mixed + mtx89.aaMix > 0, '⑨ [T1300] T1289 글자 사본은 옛 저장 → 끔 판에서 축 섞인 몸이 0 이 아니다(자명 통과 금지 · 회부 4)', `${mtx89.mixed} + ${mtx89.aaMix}`); }
else ok(false, '⑨ [T1300] T1289 글자 판이 돌았다', mtx89.err);
if (mtxOld.err) ok(false, '⑨ 고치기 전(X2) 판이 돌았다', mtxOld.err);
else { console.log(`    [표] 고치기 전(X2 — 되살림이 축을 안 옮긴다 · 종전) → 지금: 축 섞인 몸 ${mtxOld.mixed} → ${mtx.mixed || 0} — ${mtxOld.rows.map(([n, r]) => `${n.split(' ')[0]} ${r.err ? '오류' : (r.linMixed ? '머묾 ' + (r.dE == null ? '안 끝남' : r.dE + 'ms') : '') + (r.visMixed ? ' 보간 ' + r.dF.toFixed(3) : '') || '같음'}`).join(' · ')}`);
  ok(mtxOld.mixed > 0, '⑨ 고치기 전 사본은 축 섞인 몸이 0 이 아니다(자명 통과 금지)', `${mtxOld.mixed}`); }

console.log('\n⑩ ★[T1289] 미끼 — 틈 갈래 · 세 칸 자리 · 저장 축 표지 · 되살림 축 옮김을 하나씩 종전으로 되돌린 사본이 빨강');
let acaught = 0;
for (let i = 0; i < AXIS_BAITS.length; i++) {
  const [name, kind] = AXIS_BAITS[i];
  if (kind === '-') continue;   // 판 셈 전용(G0)
  let red = false, d = '';
  if (kind === 'gp') { const r = child('a' + i, {}, 'gp'); red = !r.err && GPN(r) > 0; d = r.err ? r.err.slice(0, 200) : `틈 갈림 ${GPN(r)}`; }
  else if (kind === '3f') { const r = child('a' + i, {}, '3f'); red = !r.err && (r.split.car + r.split.xz) > 0; d = r.err ? r.err.slice(0, 200) : `세 칸 갈림 car ${r.split.car} · xz ${r.split.xz}`; }
  else { const m = matrix('a' + i); red = !m.err && m.mixed + m.aaMix > 0; d = m.err ? String(m.err).slice(0, 200) : `축 섞인 몸 ${m.mixed} · 도착 ${m.aaMix} — ${m.rows.filter(([, r]) => r.linMixed || r.visMixed || r.aaMixed || r.err).map(([n]) => n.split(' ')[0]).join(' · ')}`; }   // ★[T1300] 도착 칸 셈(③)도 빨강에 든다
  if (red) acaught++;
  ok(red, `⑩ 미끼 ${name} — ${kind} 판 빨강(잡음)`, d);
}
console.log(`\n  T1289 미끼 ${acaught}/${AXIS_BAITS.filter((x) => x[1] !== '-').length}`);

// ══ ★[T1300] ⑪ ⑫ — 표지 없는 옛 저장 가리기(경계 = econ 날 시계 최대값) · 관측 칸 축 · 미끼 ══════════════════════════════════════
console.log('\n⑪ ★[T1300] 표지 없는 칸 가리기(값 ≤ econ 날 시계 최대값 (D + 2) × 하루 = econ 날 시계) · 관측 칸(축 표지 · 벽시계 ms · ISO)');
{
  const ronce = T1300_BAITS.map(([, , from]) => VSRC.split(from).length - 1), rsite = T1300_BAITS.map(([, , from]) => fnOf(VC.indexOf(from)));
  ok(ronce.every((x) => x === 1) && rsite.join() === '_t1289In,_t1289In,_t1300Obs', `⓪ ★[T1300] 미끼 ${T1300_BAITS.length}자리가 제품 소스에 꼭 한 번씩 · 그 함수를 바꾼다`, `${ronce.join(' · ')} · ${rsite.join(' · ')}`);
  ok(/^const T1300_OLD_AX = process\.env\.T1300_OLD_AX !== '0';$/m.test(VC) && /\.\.\.\(T1253_CLOCK_FIX \? _t1300Obs\(b, \{ bodyAt: b\._t1182At, departAt: b\.departAt, arriveAt: b\.arriveAt, lu: b\.lingerUntil, t952End: [^\n]*\) : \{\}\)/.test(VC)
    && /\.\.\.\(T1253_CLOCK_FIX \? _t1300Obs\(b, \{ linger: b\.lingerUntil \|\| null, departAt: b\.departAt, arriveAt: b\.arriveAt, t0: [^\n]*\) : \{\}\)/.test(VC),
    '⓪ ★[T1300] 손잡이 `T1300_OLD_AX` 한 줄(켬 기본 · `=0` = T1289 글자) · 관측 칸 둘(`/perf` `xzone.bodies` · `t1034car`)은 켬만 `_t1300Obs`(끔 = 종전 칸)');
}
const xa = child(null, {}, 'xa'), xaOff = child(null, { T1253_CLOCK_FIX: '0' }, 'xa'), xa89 = child(null, { T1300_OLD_AX: '0' }, 'xa');
for (const [tag, r] of [['켬', xa], ['끔', xaOff]]) {
  if (r.err) { ok(false, `⑪ ${tag} 판이 돌았다`, r.err); continue; }
  ok(r.small.bad === 0 && r.big.bad === 0, `★⑪ ${tag} — 표지 없는 옛 켬 저장 칸 넷(머묾 끝 · t0 econ · 출발 · 도착 벽시계)이 되살린 판 축에서 같은 econ 순간(±2ms) — 보통 판 · 큰 판(econ 값 = 벽시계의 ${r.big.ratio} 배)`,
    `보통 ${JSON.stringify(r.small.d)} · 큰 ${JSON.stringify(r.big.d)} · 표지 ${r.small.ax}/${r.big.ax}`);
}
if (!xa89.err) { console.log(`    [표] T1289 거리 규칙(\`T1300_OLD_AX=0\`) — 보통 판 어긋난 칸 ${xa89.small.bad} · 큰 판(econ 값 = 벽시계의 ${xa89.big.ratio} 배) ${xa89.big.bad} → 지금 ${xa.err ? '?' : xa.small.bad + ' · ' + xa.big.bad}`);
  ok(xa89.small.bad === 0 && xa89.big.bad > 0, '⑪ [자명 통과 금지] T1289 거리 규칙은 보통 판은 맞고 큰 판에서 틀린다(econ 값 > 저장 순간 벽시계의 반) — 새 경계가 그 판을 맞춘다', `보통 ${xa89.small.bad} · 큰 ${xa89.big.bad}`); }
else ok(false, '⑪ T1289 거리 규칙 판이 돌았다', xa89.err);
if (!xa.err) {
  const o = xa.ob;
  ok(o.has && o.ax === 'e' && o.raw < 1e11 && o.wt === o.wantW && o.days > 0 && o.days < 5 && o.isoOk, '★⑪ 켬 — `t1034car` 몸 칸에 축 표지 `ax: e` · 벽시계 ms(`wt` = 같은 econ 순간의 벽시계 경계 축) · ISO — 원래 칸은 econ 날 시계 값 그대로(1970년 근처 수)',
    `원래 ${o.raw} · wt ${o.wt}(지금 + ${o.days}날) · ${o.iso}`);
  ok(xa.fake.ax === 'e' && xa.fake.wt === xa.fake.want && xa.fake.n === null && typeof xa.fake.iso === 'string', '⑪ 켬 — `_t1300Obs`(T1182 몸 · econ 칸) = `_t1289ToB` · 빈 칸 = null', `${xa.fake.wt} = ${xa.fake.want} · ${xa.fake.iso}`);
}
if (!xaOff.err) ok(!xaOff.ob.has && xaOff.ob.ax == null, '⑪ 끔 — `t1034car` 몸 칸에 새 칸이 안 선다(종전 칸 그대로)', `ax 칸 ${xaOff.ob.has}`);

console.log('\n⑫ ★[T1300] 미끼 — 가리기를 T1289 거리 규칙으로 · 끔 판 가리기 없음 · 관측 칸이 축 표지를 안 봄 ⇒ 그 판이 빨강');
let ycaught = 0;
for (let i = 0; i < T1300_BAITS.length; i++) {
  const [name, kind] = T1300_BAITS[i];
  let red = false, d = '';
  if (kind === 'xa') { const r = child('y' + i, {}, 'xa'); red = !r.err && (r.big.bad > 0 || r.small.bad > 0 || r.ob.wt !== r.ob.wantW || r.fake.wt !== r.fake.want); d = r.err ? r.err.slice(0, 200) : `가리기 어긋남 보통 ${r.small.bad} · 큰 ${r.big.bad} · 관측 wt ${r.ob.wt === r.ob.wantW ? '맞음' : '틀림(' + r.ob.wt + ')'}`; }
  else { const m = i === 1 ? mtx89 : matrix('y' + i); red = !m.err && m.mixed + m.aaMix > 0; d = m.err ? String(m.err).slice(0, 200) : `축 섞인 몸 ${m.mixed} · 도착 ${m.aaMix} — ${m.rows.filter(([, r]) => r.linMixed || r.visMixed || r.aaMixed || r.err).map(([n]) => n.split(' ')[0]).join(' · ')}`; }
  if (red) ycaught++;
  ok(red, `⑫ 미끼 ${name} — ${kind} 판 빨강(잡음)`, d);
}
console.log(`\n  T1300 미끼 ${ycaught}/${T1300_BAITS.length}`);
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
