'use strict';
// (@regress 없음 — 러너 밖 · T745 자 · 제품 무변)
// === scripts/t745-vclock.js — **가상 시계 자**: 서버 판(아이 존)의 벽시계 · 타이머를 한 가상 시각 V 에 묶는다 ==========================
//
// ★[T745 2026-10-14 · T740 회부 4] T650 자(빠른 시계 `VILLAGE_DAY_MS=250`)는 econ 만 바이트 결정론이다. 서버 마을 칸(작물 · 장 끝 시각 ·
//   결산 도장 …)은 벽시계 날(`gameDayOf(Date.now())`)을 읽는데, 빠른 시계에선 마감 조각 · 틱 차례가 실제 CPU 시간에 기대 econ 하루에
//   흐르는 벽시계가 판마다 다르다(T740 ③ 3-3 — 멈춤 없는 두 판도 둘째 날부터 갈린다).
//   ⇒ 이 자는 아이 존 프로세스 안에서 **시간을 하나로** 만든다. 제품 파일은 한 글자도 안 바뀐다(프리로드 · 이 프로세스의 전역만).
//     ① 벽시계 — `Date.now()` · 인수 없는 `new Date()` = V. V 는 콜백 하나가 도는 동안 멎어 있다(한 틱 = 한 순간).
//     ② 타이머 — 전역 `setTimeout` · `setInterval`(+ clear)을 가상 줄로 받는다. 줄은 (만기 V · 등록 차례)로만 돈다 —
//        실제 시간 0. 30Hz 존 틱도 이 줄의 한 간격이라 **틱 n 의 V = 시작 + n × 33.3 ms** 가 판마다 같다.
//     ③ 몫 문(`tick-budget` · 마감 조각 예산 · 길 미리 짓기)은 `Date.now` 차로 잰다 ⇒ 한 콜백 안에서 V 가 안 흐르니 **몫이 바닥나지 않는다** —
//        하루 마감은 경계 틱 한 번에 다 돈다(조각 차례 그대로). 그래서 econ 날 = 벽시계 날(마감이 다음 경계를 넘지 않는다).
//     ④ 시작 — 존 기동(모듈 평가 · `listen`) 동안 V = V0 로 멎어 있고 줄은 쌓이기만 한다. `zone server up on` 줄이 찍힌 뒤 줄을 돌기 시작한다
//        (기동 길이 · `listen` 콜백 시각이 V 에 안 닿는다). V0 = `T745_V0`(기본 상수 — 두 판이 같은 절대 시각에서 시작) ·
//        다시 뜬 판은 `T745_V0 = 멈춘 V + K × 하루` 를 준다(멈춘 시간은 버린다 — T728 ⑥).
//     ⑤ 자기에게 보내는 SIGTERM(t722 멈춤 팔) — 보내는 순간 줄을 세우고 신호 처리기 앞에서 다시 푼다(그 사이 V 0 흐름).
//     ⑦ 단조 시계(`process.hrtime` · `performance.now`)도 V 에서 — 몫을 그 시계로 정하는 자리가 있다(아래).
//   ⚠못 덮는 자리: `setImmediate` · 실제 I/O 콜백(DB 일꾼 · central 실패) · 일꾼 스레드 안의 시계 —
//     세계를 안 만지는 줄이라 그대로 둔다. 남는 흔들림이 있으면 그 줄들이 범인 후보다(보고 §2).
//     ⑥ 간격 위상 — 멈추는 순간 살아 있는 간격마다 "다음 만기 − V"를 `T745_PHASE_OUT` 에 적는다. 다시 뜬 판에 `T745_PHASE_IN` 으로 주면
//        같은 주기의 간격이 처음 등록될 때 첫 만기를 V0 + 그 위상으로 둔다 ⇒ 30Hz 틱 격자가 멈춤 없는 판(대조)과 같은 자리에 선다.
//   env: T745_VCLOCK=1(켬 · 러너가 준다) · T745_V0=<ms> · T745_CHUNK=<콜백 수>(실제 I/O 에 한 번 양보하는 간격 · 결과 무관 · 기본 400) ·
//        T745_PHASE_OUT=<파일> · T745_PHASE_IN=<파일>
if (process.env.T745_VCLOCK !== '1' || !process.env.T577_SEED) return;   // 아이 존만(부모 러너 · 다른 프로세스 무접촉)
const RT = { setTimeout: global.setTimeout, setInterval: global.setInterval, clearTimeout: global.clearTimeout, clearInterval: global.clearInterval,
  setImmediate: global.setImmediate, Date: global.Date };
let V = Number(process.env.T745_V0) || 1767225600000;   // 2026-01-01T00:00:00Z — 상수일 뿐(두 판이 같은 값이면 된다)
const V0 = V;
const CHUNK = Math.max(1, parseInt(process.env.T745_CHUNK || '', 10) || 400);
const ST = { fired: 0, timers: 0, intervals: 0, started: false, startAt: null, paused: false, yields: 0, maxQ: 0, errs: 0 };
global.__t745 = () => ({ V, V0, ...ST, q: heap.length });

// ── 벽시계 ────────────────────────────────────────────────────────────────────
const RD = RT.Date;
function VDate(...a) {
  if (!new.target) return new RD(V).toString();
  return a.length ? new RD(...a) : new RD(V);
}
VDate.prototype = RD.prototype;
Object.defineProperty(VDate, 'name', { value: 'Date' });
VDate.now = function () { return V; };
VDate.UTC = RD.UTC; VDate.parse = RD.parse;
global.Date = VDate;

// ── 단조 시계(길이 재기) — `process.hrtime` · `hrtime.bigint` · `performance.now` 도 V 에서 ─────────────────
//   계측만 읽는 줄이 대부분이지만 **몫을 이 시계로 정하는 자리**가 있다(존 틱 꼬리 `t719ReachPre` — `process.hrtime(틱 머리)` 가 10 ms 안이면 남은 몫만큼 넓힌다).
//   실제 시계면 넓히는 틱이 CPU 빠르기로 갈린다 ⇒ V 에 묶는다(한 콜백 안 길이 = 0 · 그 자리는 늘 돈다).
{
  const H0 = process.hrtime.bigint();
  const vns = () => H0 + BigInt(Math.round((V - V0) * 1e6));
  const hr = function (prev) { const n = vns(); let sec = n / 1000000000n, ns = n % 1000000000n;
    if (prev) { let s2 = BigInt(prev[0]), n2 = BigInt(prev[1]); let ds = sec - s2, dn = ns - n2; if (dn < 0n) { dn += 1000000000n; ds -= 1n; } return [Number(ds), Number(dn)]; }
    return [Number(sec), Number(ns)]; };
  hr.bigint = vns;
  process.hrtime = hr;
  try { const PH = require('perf_hooks'); const P0 = PH.performance.now(); const pn = () => P0 + (V - V0); PH.performance.now = pn; if (global.performance && global.performance !== PH.performance) global.performance.now = pn; } catch (e) {}
}

// ── 타이머 줄(최소 힙 · (만기, 차례)) ─────────────────────────────────────────
const heap = [];
const PHASE_IN = process.env.T745_PHASE_IN ? (() => { try { return JSON.parse(require('fs').readFileSync(process.env.T745_PHASE_IN, 'utf8')).phase; } catch (e) { return null; } })() : null;
function phaseDump(why) {   // 살아 있는 간격(주기 → 다음 만기 − V · 등록 차례)
  const o = {}; for (const e of heap.slice().sort((a, b) => a.t._id - b.t._id)) { const t = e.t; if (t._dead || t._cur !== e || !t._rep) continue; (o[String(+t._ms.toFixed(6))] || (o[String(+t._ms.toFixed(6))] = [])).push(e.due - V); }
  if (process.env.T745_PHASE_OUT) try { require('fs').writeFileSync(process.env.T745_PHASE_OUT, JSON.stringify({ why, V, phase: o })); } catch (e) {}
  return o;
}
global.__t745Phase = phaseDump;
let seq = 0;
const less = (a, b) => (a.due < b.due || (a.due === b.due && a.seq < b.seq));
function push(t) { heap.push(t); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } if (heap.length > ST.maxQ) ST.maxQ = heap.length; }
function pop() { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
  if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; }
class VTimer {
  constructor(fn, ms, args, rep) {
    let d = Number(ms); if (!(d >= 1 && d <= 2147483647)) d = 1;   // Node 와 같은 자르기
    this._fn = fn; this._args = args; this._ms = d; this._rep = rep; this._dead = false; this._id = ++seq; this._cur = null;
    let first = V + d;
    if (rep && PHASE_IN) { const k = String(+d.toFixed(6)); if (PHASE_IN[k] && PHASE_IN[k].length) first = V + PHASE_IN[k].shift(); }
    this._arm(first);
  }
  _arm(due) { const e = { due, seq: ++seq, t: this }; this._cur = e; push(e); }
  ref() { return this; } unref() { return this; } hasRef() { return true; }
  refresh() { if (!this._dead) this._arm(V + this._ms); return this; }
  close() { this._dead = true; return this; }
  [Symbol.toPrimitive]() { return this._id; }
}
global.setTimeout = function (fn, ms, ...args) { if (typeof fn !== 'function') throw new TypeError('callback must be a function'); ST.timers++; return new VTimer(fn, ms, args, false); };
global.setInterval = function (fn, ms, ...args) { if (typeof fn !== 'function') throw new TypeError('callback must be a function'); ST.intervals++; return new VTimer(fn, ms, args, true); };
global.clearTimeout = function (t) { if (t instanceof VTimer) t._dead = true; else if (t != null) RT.clearTimeout(t); };
global.clearInterval = function (t) { if (t instanceof VTimer) t._dead = true; else if (t != null) RT.clearInterval(t); };
try { const TM = require('timers'); TM.setTimeout = global.setTimeout; TM.setInterval = global.setInterval; TM.clearTimeout = global.clearTimeout; TM.clearInterval = global.clearInterval; } catch (e) {}

function pump() {
  if (ST.paused) return;
  let n = 0;
  while (heap.length && n < CHUNK) {
    const e = pop(), t = e.t;
    if (t._dead || t._cur !== e) continue;
    if (e.due > V) V = e.due;
    if (t._rep) t._arm(e.due + t._ms); else t._dead = true;
    ST.fired++; n++;
    try { t._fn.apply(null, t._args); }
    catch (e) { ST.errs++; if (process.listenerCount('uncaughtException')) process.emit('uncaughtException', e, 'uncaughtException'); else { RT.setImmediate(pump); throw e; } }
    if (ST.paused) return;
  }
  ST.yields++;
  if (heap.length) RT.setImmediate(pump);
}
function start(why) { if (ST.started) return; ST.started = true; ST.startAt = V; console.log(`[t745] 가상 시계 돈다 — V0 ${V0} (${new RD(V0).toISOString()}) · 줄 ${heap.length} · ${why}`); RT.setImmediate(pump); }
// 시작 문 — 기동 마지막 줄(`zone server up on`)이 찍힌 뒤
const _log = console.log;
console.log = function (...a) { const r = _log.apply(this, a); if (!ST.started && typeof a[0] === 'string' && a[0].indexOf('zone server up on') >= 0) RT.setImmediate(() => start('listen 뒤')); return r; };
// 자기에게 SIGTERM — 줄을 세우고(그 사이 V 0 흐름) 신호 처리기 앞에서 푼다
const _kill = process.kill;
process.kill = function (pid, sig) { if (pid === process.pid && (sig === 'SIGTERM' || sig === 'SIGINT')) { ST.paused = true; phaseDump('kill'); } return _kill.apply(this, arguments); };
for (const s of ['SIGTERM', 'SIGINT']) process.prependListener(s, () => { if (ST.paused) { ST.paused = false; RT.setImmediate(pump); } });
process.on('exit', () => { try { _log(`[t745] 끝 — V ${V} (+${((V - V0) / 1000).toFixed(1)}s) · 콜백 ${ST.fired} · 양보 ${ST.yields} · 줄 최대 ${ST.maxQ} · 오류 ${ST.errs}`); } catch (e) {} });
