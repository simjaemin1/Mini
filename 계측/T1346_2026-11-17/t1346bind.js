'use strict';
// (@regress 없음 — 러너 밖 · T1346 가름 판 훅 · 제품 파일 무변 · 존 프로세스가 읽는 econ 원문에 한 줄씩 묶는다)
// === 계측/T1346_2026-11-17/t1346bind.js — 2년째 봄 굶음 후보 갈래를 하나씩 묶는 프리로드(T1346 ① 가름 판) ===
//   NODE_OPTIONS="--require <이 파일> …" T1346_BIND=<갈래[,갈래]> — 판 자 아이 존(server/zone.js · T577_SEED)에서만 선다(판 자 어버이 · 랩 · 하네스 무동작).
//   묶는 법(T1342 bind 그 꼴): 존이 econ(`sim/economy-sim.js`)을 처음 읽을 때 원문의 정해진 한 줄(닻 · 꼭 한 번 나와야 한다)을 바꿔 컴파일한다 —
//   제품 파일은 한 글자도 안 바뀐다 · 닻이 없거나 둘이면 판이 멈춘다(조용히 안 묶인 판 0).
//   갈래:
//     birth — 출생 곳간 문만 뺀다: T1297 출생 문 줄(그날 늘림을 곳간 문턱으로 막는 줄)이 서지 않는다. `T1297_BIRTH_FOOD` 글자는 켠 채라
//             이주 문(T1306 · T1312 · T1319 K · T1342 — 모두 `T1297_BIRTH_FOOD` 켬 안에서만 선다)은 그대로 선다(손잡이로 끄면 이주 문도 같이 꺼진다).
//     flow — 출생에 흐름 문을 더한다(후보): 그날 식량 흐름(`surplusEMA.food` = 생산 − 하루 수요 · `_importEMA` = 들여온 식량 100날 평균 — 둘 다 econ 이 이미 쥔 장부)이
//             한 사람 하루치(`DAILY_FOOD_CONSUMPTION`)에 못 미치면 그날 늘림 0(표지 `_t1297Gate` = 2). 곳간 문(T1297)은 그대로 · 이 문은 그 뒤에 선다.
//     flowaut — flow 와 같은 문을 가을(달력 정본 9 · 10 · 11월 — `_t1319InAutumn`)에만 세운다(후보 — 봄 · 여름 · 겨울은 곳간 문만).
//     flowown — flow 와 같되 들여온 식량을 안 센다(제 생산 흐름 `surplusEMA.food` 만 ≥ 하루치 · 후보 · 표지 2).
//     gradeaut — 가을엔 곳간 문(30날 · 그대로) 뒤에 단계 몫을 곱한다(후보): 그날 늘림 × min(1, 곳간 ÷ (사람 + 1) × 하루치 × 다가오는 겨울 끝까지 남은 날)
//             (T1306 단계 식 `t1306Ratio` · T1319 가을 날 수 `t1319AutumnLeft` 그대로 · 표지 3).
//     ownaut — 가을엔 제 밭(흐름 장부 `surplusEMA.food` — 들여온 것 빼고)이 한 사람 더 먹이지 못하면 곳간이 겨울 끝까지(T1319 가을 날 수)를 쥘 때만(후보 · 표지 4).
//     keepaut — 가을엔 곳간이 제 몫(v2 수출 문턱의 `keep` — 식량 `target × 1.2` = 하루 생존량 × 30 × 1.2 = 36일치 · 그 아래는 안 판다)을 쥘 때만(후보 · 표지 5).
//   주사위 0 · 새 수 0(36 = v2 `_exportCandidatesV2` 식량 keep 의 날 수 — 가름 판에서만 글자로).
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const MODES = new Set(String(process.env.T1346_BIND || '').split(',').map((s) => s.trim()).filter(Boolean));
if (!MODES.size) return;
const path = require('path'), fs = require('fs'), Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
const F_E = path.join(ROOT, 'sim', 'economy-sim.js');
const P = { [F_E]: [] };
if (MODES.has('birth')) P[F_E].push(['  if (T1297_BIRTH_FOOD) { v._t1297Gate = 0; if (T1306_BIRTH_GRADE) dP = t1306GradeDP(v, dP, _homeN, day);',
  () => '  if (false) { v._t1297Gate = 0; if (T1306_BIRTH_GRADE) dP = t1306GradeDP(v, dP, _homeN, day);']);   // ★[T1346 bind birth] 출생 곳간 문 줄만 끈다
if (MODES.has('flow')) P[F_E].push(['  v._dpDebug = { K: +K.toFixed(1), logi:',
  (a) => '  if (dP > 0 && v.surplusEMA.food + (v._importEMA || 0) < DAILY_FOOD_CONSUMPTION) { dP = 0; v._t1297Gate = 2; }   // ★[T1346 bind flow]\n' + a]);
if (MODES.has('flowaut')) P[F_E].push(['  v._dpDebug = { K: +K.toFixed(1), logi:',
  (a) => '  if (dP > 0 && _t1319InAutumn(day) && v.surplusEMA.food + (v._importEMA || 0) < DAILY_FOOD_CONSUMPTION) { dP = 0; v._t1297Gate = 2; }   // ★[T1346 bind flowaut]\n' + a]);
if (MODES.has('flowown')) P[F_E].push(['  v._dpDebug = { K: +K.toFixed(1), logi:',
  (a) => '  if (dP > 0 && v.surplusEMA.food < DAILY_FOOD_CONSUMPTION) { dP = 0; v._t1297Gate = 2; }   // ★[T1346 bind flowown]\n' + a]);
if (MODES.has('gradeaut')) P[F_E].push(['  v._dpDebug = { K: +K.toFixed(1), logi:',
  (a) => '  if (dP > 0 && _t1319InAutumn(day)) { const _r46 = t1306Ratio(totalFoodEquivalent(v), (_homeN + 1) * DAILY_FOOD_CONSUMPTION * t1319AutumnLeft(day)); if (_r46 < 1) { dP *= _r46; v._t1297Gate = 3; } }   // ★[T1346 bind gradeaut]\n' + a]);
if (MODES.has('ownaut')) P[F_E].push(['  v._dpDebug = { K: +K.toFixed(1), logi:',
  (a) => '  if (dP > 0 && _t1319InAutumn(day) && v.surplusEMA.food < DAILY_FOOD_CONSUMPTION && totalFoodEquivalent(v) < (_homeN + 1) * DAILY_FOOD_CONSUMPTION * t1319AutumnLeft(day)) { dP = 0; v._t1297Gate = 4; }   // ★[T1346 bind ownaut]\n' + a]);
if (MODES.has('keepaut')) P[F_E].push(['  v._dpDebug = { K: +K.toFixed(1), logi:',
  (a) => '  if (dP > 0 && _t1319InAutumn(day) && totalFoodEquivalent(v) < (_homeN + 1) * DAILY_FOOD_CONSUMPTION * 36) { dP = 0; v._t1297Gate = 5; }   // ★[T1346 bind keepaut]\n' + a]);
if ([...MODES].filter((m) => m !== 'birth' && m !== 'flow' && m !== 'flowown').length > 1) throw new Error('[T1346 bind] 후보 갈래는 하나씩(flow 는 함께 가능)');
for (const m of MODES) if (!['birth', 'flow', 'flowown', 'flowaut', 'gradeaut', 'ownaut', 'keepaut'].includes(m)) throw new Error(`[T1346 bind] 모르는 갈래 ${m}`);
const orig = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  const L = P[filename];
  if (!L || !L.length) return orig(m, filename);
  let src = fs.readFileSync(filename, 'utf8');
  for (const [a, f] of L) {
    const n = src.split(a).length - 1;
    if (n !== 1) throw new Error(`[T1346 bind] 닻이 ${n}번 — ${path.basename(filename)} :: ${a.slice(0, 60)}`);
    const i = src.indexOf(a);
    src = src.slice(0, i) + f(a) + src.slice(i + a.length);
  }
  console.log(`[T1346 bind] ${path.basename(filename)} 묶음 ${L.length}줄 — ${[...MODES].join(',')}`);
  m._compile(src, filename);
};
