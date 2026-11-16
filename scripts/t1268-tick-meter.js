'use strict';
// (@regress 없음 — 러너 밖 · T1268 계측 프리로드 · 읽기만 · 제품 손잡이 0)
// === scripts/t1268-tick-meter.js — 판 자 아이 존의 **틱이 실제로 얼마나 느렸나**(게이트 `gate-house.js` 가 굽기 판에 싣는다) ==================
//
// ★[T1268 2026-11-11 · T1258 회부 6] 시계 갈림은 틱이 느린 판에서만 선다 — 게이트가 "느린 틱 판"을 돌렸다고 말하려면 틱이 정말 느렸는지를 재야 한다.
//   판 자(`t577-server-run.js`) 아이 존 안에서만(`T577_OUT` 이 선 프로세스 · 가상 시계 판은 안 잰다 — V 가 틱 사이를 0 으로 민다) 두 가지를 잰다:
//     ① 30Hz 존 틱(`setInterval(…, 1000/30)`) — 콜백 머리 사이 간격 · 콜백 본문 길이(ms · 가장 무거운 30Hz 고리 하나 — 존 본 틱)
//     ② econ 날 벽시계 길이 — 사건 장부 `scanDay`(econ 하루 끝 · 기준선 자가 지문을 뜨는 그 문) 사이 간격
//   끝에 `<T577_OUT>.t1268tick.json` 하나(틱 수 · 간격 평균 · p50 · p95 · 본문 평균 · p50 · econ 날 평균 · p50).
//   ⚠세계에 아무것도 안 쓴다(읽기만 · 타이머 차례 · 값 무변 — 콜백을 같은 자리에서 그대로 부른다).
//   ★느린 틱 판 갈래(`T1268_TICK_STALL_MS=N` — 게이트 `--slow` 가 준다) — 첫 econ 날(첫 `scanDay`) 뒤부터 존 본 틱(가장 무거운 30Hz 고리) 머리마다
//     N ms 를 바쁘게 쓰고 나서 틱 본문을 부른다(부하 고리를 틱 안에 넣은 꼴 · 부팅은 안 늦춘다 · 틱 본문 · 차례 · 값은 그대로 — *언제*만 늦어진다).
//     이 갈래가 쓴 ms 는 본문 길이에 안 든다(간격에는 든다 — 그것이 "느린 틱"이다).
//   ★[T1287 · T1280 회부 2] 머묾 멈춤 갈래(`T1287_DWELL_STALL_MS=N` — 게이트 `--slow` 가 준다) — 장인 몸이 사다리 머묾(인출 · 저장 · `_t1196W.at` 이 선 때)에
//     든 것을 보면 **econ 날마다 한 번**(그날 처음 본 머묾 · 마감 창 밖), 존 본 틱 머리에서 N ms 를 바쁘게 쓴다. 벽시계로 머묾을 재는 자리(고치기 전 `T1258_ARTISAN_CLOCK=0`)는 다음 틱에 머묾이 끝나
//     econ 날 안에 몸이 꺼낸다 — 가상 시계 판(같은 손잡이)은 머묾이 날을 넘겨 일괄이 꺼낸다 → 상자 빠르기와 무관하게 갈린다.
//     종전 미끼 ④ 는 마감 사이 창 길이(상자 부하에 따라 달라진다)가 머묾(5 ~ 6초)보다 기냐에 기대, 바쁜 상자에서 '같음'이 났다(T1280 6/1).
//     몸 칸은 읽기만(villages 공식 자리 `__t740` → `state.deps.players`) · 틱 본문 · 차례 · 값은 그대로(*언제*만).
// 쓰는 법: NODE_OPTIONS="--require $PWD/scripts/t1268-tick-meter.js" node scripts/server-baseline-check.js --make <out.json> --days 20 --seeds 42 --house
if (!process.env.T577_OUT || process.env.T745_VCLOCK === '1') return;
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const OUT = process.env.T577_OUT + '.t1268tick.json';
// ★[T1287 · T1280 회부 2 — 미끼 ④ 가 판마다 뒤집힌 진짜 까닭] 낮밤 위상 고정 갈래(`T1287_PHASE0=1` — 게이트 `gate-house.js` 가 굽기 판에 늘 준다 · `--phase real` = 종전).
//   몸의 일과(`villages.js` 스케줄 게이트 · `worldPhase(now)` ≥ `dayPhaseRatio` 0.7 = 밤 → 귀가 · 취침)는 **벽시계 시각**의 낮밤을 읽는다(`zone-config` WORLD
//   `worldEpoch` 0 · `dayLengthMs` 24분). 가상 시계 판(`t745-vclock` V0 = 2026-01-01T00:00Z)은 늘 게임 0시에서 출발하는데, 벽시계 굽기 판은 **띄운 실제 시각**의
//   게임 시각에서 출발했다 — 20날 굽기(≈ 2 ~ 4 게임 시간)가 게임 16 ~ 23시에 걸리면 장인 몸이 내내 자서 사다리 머묾이 0이고 미끼 ④ 가 갈릴 거리가 없었다
//   (T1287 바쁜 상자 10판 · 한가한 상자 10판: 굽기 게임 시각 16.1 ~ 22.9시에 걸린 6판 = 머묾 멈춤 0 · 미끼 ④ 같음 / 나머지 14판 = 머묾 멈춤 섬 · 갈림).
//   ⇒ 켜면 이 아이 존의 벽시계(`Date.now` · 인수 없는 `new Date()`)를 **상수 하나**만큼 당겨 프리로드 순간을 게임 0시(V0 와 같은 위상)에 둔다 —
//     흐름 · 간격 · 단조 시계(`performance.now`)는 그대로(상수 차만) · 세계 값 · 차례 무변 · 제품 0. 하루 길이는 아래 상수(끝에 `zone-config` 와 맞대 `phaseOk` 로 적는다).
const PHASE0 = process.env.T1287_PHASE0 === '1';
const LP = require('./lib-phase');   // ★[T1299] 0시 고정 함수는 공용 정본 한 자리(`lib-phase.pin` — 종전 이 파일 안 글자를 옮김 · 사본 0)
let hour0 = null;
if (PHASE0) LP.pin(0);
const T30 = (ms) => Math.abs(+ms - 1000 / 30) < 2;
const STALL = Math.max(0, parseFloat(process.env.T1268_TICK_STALL_MS || '0') || 0);
const DWELL = Math.max(0, parseFloat(process.env.T1287_DWELL_STALL_MS || '0') || 0);   // ★[T1287] 머묾마다 한 번
const VILL = path.join(__dirname, '..', 'server', 'villages.js');
let dwellN = 0; const dwellSeen = new Set();
const dwellNow = () => { try { const m = require.cache[VILL]; const st = m && m.exports && m.exports.__t740 ? m.exports.__t740() : null;
  const P = st && st.deps && st.deps.players; if (!P || !P.forEach) return false; let hit = false;
  const d = st.world ? (st.world.day | 0) : -1; if (dwellSeen.has(d) || st.tickJobs) return false;   // econ 날마다 한 번 · 마감 창 밖에서만
  P.forEach((p) => { const W = p && p._t1196W; if (!hit && W && W.at && (W.ph === 'draw' || W.ph === 'back')) hit = true; });
  if (hit) dwellSeen.add(d);
  return hit; } catch (e) { return false; } };
let stallOn = false, stallN = 0;
const loops = [];   // 30Hz 고리마다 { gaps, body, last, sum }
{
  const si = global.setInterval;
  global.setInterval = function (fn, ms, ...a) {
    if (typeof fn !== 'function' || !T30(ms)) return si.apply(this, arguments);
    const L = { gaps: [], body: [], last: 0, sum: 0, first: loops.length === 0 };
    loops.push(L);
    return si.call(this, function () {
      let t0 = performance.now();
      if (L.last) L.gaps.push(t0 - L.last);
      L.last = t0;
      if (STALL && stallOn && L.first) { const e = t0 + STALL; while (performance.now() < e) { /* 바쁜 고리 */ } stallN++; t0 = performance.now(); }
      if (DWELL && stallOn && L.first && dwellNow()) { const e = t0 + DWELL; while (performance.now() < e) { /* 머묾 멈춤 */ } dwellN++; t0 = performance.now(); }   // ★[T1287]
      try { return fn.apply(this, arguments); } finally { const d = performance.now() - t0; L.body.push(d); L.sum += d; }
    }, ms, ...a);
  };
}
const dayAt = [];
{
  const Ev = require(path.join(__dirname, '..', 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments); const sd = L.scanDay; let last = -1;
    L.scanDay = function (world, day) { try { if ((day | 0) !== last) { last = day | 0; dayAt.push(performance.now()); stallOn = true; if (hour0 == null) hour0 = LP.hourOf(Date.now()); } } catch (e) {} return sd.apply(this, arguments); };
    return L;
  };
}
const stat = (a) => {
  if (!a.length) return { n: 0, mean: null, p50: null, p95: null };
  const s = Float64Array.from(a).sort(), q = (p) => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2);
  let t = 0; for (const x of a) t += x;
  return { n: a.length, mean: +(t / a.length).toFixed(2), p50: q(0.5), p95: q(0.95) };
};
process.on('exit', () => {
  try {
    const main = loops.slice().sort((x, y) => y.sum - x.sum)[0] || { gaps: [], body: [] };
    const dg = []; for (let i = 1; i < dayAt.length; i++) dg.push(dayAt[i] - dayAt[i - 1]);
    fs.writeFileSync(OUT, JSON.stringify({ loops30: loops.length, stallMs: STALL, stalled: stallN, dwellMs: DWELL, dwellStalled: dwellN, phase0: PHASE0, hour0,
      phaseOk: LP.phaseOk(), gap: stat(main.gaps), body: stat(main.body), day: stat(dg) }));
  } catch (e) { /* 계측 실패는 세계에 0 */ }
});
